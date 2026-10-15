import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { setLocale, t } from "@/lib/i18n";
import { locales } from "@/locales";
import { connectedInventoryCopy, connectorActionLabel } from "@/lib/connector-status";
import { appBlurb, appCategoryLabel } from "@/lib/app-catalog-copy";
import { disconnectAccountConfirmation } from "./PluginsPanel";
import { parseMcpEnvironment } from "./McpServersPanel";
import { ConnectorCard } from "./ConnectorCard";

afterEach(() => {
  setLocale("en");
});

describe("plugins modal translation", () => {
  it("translates provider category spellings and preserves unknown categories", () => {
    setLocale("zh");
    for (const category of ["Developer tools", "developer tools", "DEVELOPER_TOOLS", " developer-tools "]) {
      expect(appCategoryLabel(category)).toBe("开发工具");
    }
    expect(appCategoryLabel("marketing automation")).toBe("营销自动化");
    expect(appCategoryLabel("model context protocol")).toBe("模型上下文协议（MCP）");
    expect(appCategoryLabel("artificial intelligence")).toBe("人工智能");
    expect(appCategoryLabel("images & design")).toBe("图像与设计");
    expect(appCategoryLabel("security and identity tools")).toBe("安全与身份认证");
    expect(appCategoryLabel("crm")).toBe("销售与客户管理");
    expect(appCategoryLabel("Provider's new category")).toBe("Provider's new category");
  });

  it("localizes known app descriptions and gives unknown apps a Chinese summary", () => {
    setLocale("zh");
    expect(appBlurb({ slug: "code_interpreter", blurb: "CodeInterpreter extends Python" })).toBe("运行 Python 代码并分析数据");
    expect(appBlurb({ slug: "serpapi", blurb: "Search API" })).toBe("搜索网页并获取结果");
    expect(appBlurb({ slug: "snowflake", blurb: "Cloud data" })).toBe("查询和分析云端数据");
    expect(appBlurb({ slug: "linkedin", blurb: "Professional network" })).toBe("职业档案与企业信息");
    expect(appBlurb({ slug: "klaviyo", blurb: "Email marketing" })).toBe("邮件营销与客户管理");
    expect(appBlurb({ slug: "unknown", blurb: "Provider description" })).toBe("使用此应用提供的工具");
    setLocale("en");
    expect(appCategoryLabel("developer tools")).toBe("Developer tools");
  });

  it("translates the account action label in every pack", () => {
    const state = {
      busy: false,
      included: false,
      canContinue: false,
      hasAccounts: true,
      failed: false,
    };
    for (const [code, pack] of Object.entries(locales)) {
      setLocale(code);
      expect(connectorActionLabel("ready", state), code).toBe(pack["connectors.action.addAccount"]);
      expect(connectedInventoryCopy("error").title, code).toBe(pack["connectors.empty.errorTitle"]);
    }
  });

  it("keeps the account identity verbatim inside the translated confirmation", () => {
    setLocale("pt-br");
    const confirmation = disconnectAccountConfirmation("Gmail", { id: "ca_work", alias: "work" });
    expect(confirmation).toContain("“work” (ca_work)");
    expect(confirmation).toBe(
      t("connectors.disconnectConfirm", { identity: "“work” (ca_work)", service: "Gmail" }),
    );
    expect(confirmation).not.toContain("Disconnect");
  });

  it("translates an MCP environment parse error without touching the offending line", () => {
    setLocale("de");
    expect(parseMcpEnvironment("NOT A KEY=value")).toEqual({
      ok: false,
      error: { key: "mcp.env.invalidName", params: { key: "NOT A KEY" } },
    });
  });

  it("translates the in-chat connector card", () => {
    setLocale("ja");
    const html = renderToStaticMarkup(createElement(ConnectorCard, {
      botId: "atlas",
      threadId: "thread",
      message: {
        id: "m1",
        role: "bot",
        kind: "connector",
        at: 1,
        connector: { slug: "gmail", label: "Gmail", description: "Read mail", status: "required", resumeKey: "resume1" },
      },
    }));
    expect(html).toContain(locales.ja!["connectors.card.connectSecurely"]);
    expect(html).toContain(locales.ja!["connectors.card.requested"]);
    expect(html).not.toContain("Connect securely");
  });
});
