import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { launchVerificationServer, runControlOmb } from "./control-omb.ts";
import { mountPreview, parkUntilSignal } from "./testing/preview-fixture.ts";

const { values } = parseArgs({ options: { catalog: { type: "string" } } });
const sample = JSON.parse(readFileSync(new URL("./testing/app-catalog-copy-fixture.json", import.meta.url), "utf8"));
const input = values.catalog ? JSON.parse(readFileSync(values.catalog, "utf8")) : sample;
const cards = input.cards.map((card: { slug: string; label: string; blurb: string; noAuth?: boolean; categories?: string[] }) => ({
  slug: card.slug, label: card.label, blurb: card.blurb, noAuth: card.noAuth,
  categories: card.categories, logo: null, domain: null,
}));
if (!values.catalog) {
  const present = new Set(cards.flatMap((card: { categories?: string[] }) => card.categories ?? []));
  cards.push(...sample.categories.filter((category: string) => !present.has(category)).map((category: string, index: number) => ({
    slug: `fixture-${index}`, label: `分类示例 ${index + 1}`, blurb: "隔离验证专用", logo: null, domain: null, categories: [category],
  })));
}

const fixture = await launchVerificationServer();
let preview: Awaited<ReturnType<typeof mountPreview>> | undefined;
try {
  await runControlOmb(["doctor", "--url", fixture.info.url]);
  preview = await mountPreview(fixture, {
    entry: "/scripts/testing/app-categories-preview.tsx", route: "/__app-categories.html", title: "应用分类隔离验证",
    extraRoutes: [
      { path: "/api/connectors/catalog", handler: (_req, res) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ configured: true, mode: "self-hosted", source: "api", cards }));
      } },
      { path: /^\/api\/connectors(?:\/connected)?$/, handler: (_req, res) => {
        res.setHeader("content-type", "application/json");
        res.end('{"services":{}}');
      } },
    ],
  });
  console.log(JSON.stringify({ previewUrl: preview.previewUrl, cards: cards.length, fixture: fixture.info }));
  await parkUntilSignal();
} finally {
  await preview?.close();
  await fixture.close();
}
