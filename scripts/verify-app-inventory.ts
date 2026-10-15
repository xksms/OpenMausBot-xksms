import { readFileSync } from "node:fs";
import { launchVerificationServer, runControlOmb } from "./control-omb.ts";
import { mountPreview, parkUntilSignal } from "./testing/preview-fixture.ts";

const sample = JSON.parse(readFileSync(new URL("./testing/app-catalog-copy-fixture.json", import.meta.url), "utf8"));
const cards = sample.cards.map((card: Record<string, unknown>) => ({ ...card, logo: null, domain: null }));
let delayMs = 20_000;
let services: Record<string, unknown> = { github: { connected: true, pending: false, status: "ACTIVE", accounts: [{ id: "ca_fixture", alias: "测试账号", status: "ACTIVE" }] } };
let requests = 0;
let active = 0;
const fixture = await launchVerificationServer();
let preview: Awaited<ReturnType<typeof mountPreview>> | undefined;
try {
  await runControlOmb(["doctor", "--url", fixture.info.url]);
  preview = await mountPreview(fixture, {
    entry: "/scripts/testing/app-categories-preview.tsx", route: "/__app-inventory.html", title: "应用连接状态隔离验证",
    extraRoutes: [
      { path: "/__inventory-fixture", method: "POST", handler: async (req, res) => {
        let text = "";
        for await (const chunk of req) text += String(chunk);
        const next = JSON.parse(text);
        if (typeof next.delayMs === "number" && next.delayMs >= 0 && next.delayMs <= 60_000) delayMs = next.delayMs;
        if (next.services && typeof next.services === "object" && !Array.isArray(next.services)) services = next.services;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ delayMs, requests, active }));
      } },
      { path: "/__inventory-fixture", method: "GET", handler: (_req, res) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ delayMs, requests, active }));
      } },
      { path: "/api/connectors/catalog", handler: (_req, res) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ configured: true, mode: "self-hosted", source: "api", cards }));
      } },
      { path: "/api/connectors/connected", handler: async (_req, res) => {
        requests += 1;
        active += 1;
        const responseServices = services;
        try {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, delayMs);
            res.once("close", () => { clearTimeout(timer); resolve(); });
          });
          if (!res.destroyed) {
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ credentialStore: "ok", services: responseServices }));
          }
        } finally {
          active -= 1;
        }
      } },
      { path: "/api/connectors", handler: (_req, res) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ services }));
      } },
    ],
  });
  console.log(JSON.stringify({ previewUrl: preview.previewUrl, fixture: fixture.info }));
  await parkUntilSignal();
} finally {
  await preview?.close();
  await fixture.close();
}
