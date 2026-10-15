import { afterEach, describe, expect, it } from "vitest";
import captured from "../../scripts/testing/app-catalog-copy-fixture.json";
import { setLocale } from "./i18n";
import { appBlurb, appCategoryLabel, appDescriptionTitle } from "./app-catalog-copy";

afterEach(() => setLocale("en"));

describe("Chinese app catalogue coverage", () => {
  it("covers every category from the captured provider catalogue", () => {
    setLocale("zh");
    const untranslated = captured.categories.filter((category) => !/\p{Script=Han}/u.test(appCategoryLabel(category)));
    expect(untranslated).toEqual([]);
  });

  it("gives common apps and the screenshot apps specific Chinese descriptions", () => {
    setLocale("zh");
    for (const card of captured.cards) {
      const description = appBlurb(card);
      expect(description, card.slug).toMatch(/\p{Script=Han}/u);
      expect(description, card.slug).not.toBe(card.blurb);
      expect(description, card.slug).not.toMatch(/^用途：/);
      expect(appDescriptionTitle(card), card.slug).toContain(`原文说明：\n${card.blurb}`);
    }
  });

  it("summarizes new apps by known categories while retaining the source in the tooltip", () => {
    const card = { slug: "new-provider", blurb: "A new provider for custom forms", categories: ["forms & surveys", "developer tools", "forms & surveys"] };
    setLocale("zh");
    expect(appBlurb(card)).toBe("用途：表单与问卷、开发工具");
    expect(appDescriptionTitle(card)).toBe("用途：表单与问卷、开发工具\n\n原文说明：\nA new provider for custom forms");
    expect(appDescriptionTitle(card, "连接已失效")).toBe("连接已失效");
    expect(appBlurb({ slug: "new-provider", blurb: "已有中文说明", categories: card.categories })).toBe("已有中文说明");
    expect(appBlurb({ slug: "new-provider", blurb: "New provider", categories: ["new category"] })).toBe("使用此应用提供的工具");
    setLocale("en");
    expect(appBlurb(card)).toBe(card.blurb);
    expect(appDescriptionTitle(card)).toBe(card.blurb);
  });

  it("preserves unknown category identities and ignores inherited object names", () => {
    setLocale("zh");
    expect(appCategoryLabel("Vendor category")).toBe("Vendor category");
    expect(appCategoryLabel("constructor")).toBe("constructor");
    expect(appBlurb({ slug: "constructor", blurb: "Provider description" })).toBe("使用此应用提供的工具");
  });
});
