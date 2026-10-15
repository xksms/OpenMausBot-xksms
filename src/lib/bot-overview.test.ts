import { afterEach, describe, expect, it } from "vitest";

import { overviewLine } from "./bot-overview";
import { setLocale } from "./i18n";
import { niceTime, scheduleSentence } from "./schedule-label";

afterEach(() => setLocale("en"));

describe("overviewLine", () => {
  it("keeps the server's English for a line whose code the catalog does not carry", () => {
    expect(overviewLine({ text: "Says something new.", code: "overview.does.unshipped" })).toBe("Says something new.");
  });

  it("words a plain line from the catalog in the reader's language", () => {
    setLocale("zh");
    expect(overviewLine({ text: "Has no connected apps.", code: "overview.wont.appsNone" })).toBe("没有已连接的应用。");
    expect(overviewLine({ text: "Works in its own folder.", code: "overview.reaches.folderPrivate" })).toBe("在它自己的文件夹中工作。");
  });

  it("refills a line's params from the values it carries", () => {
    setLocale("zh");
    expect(overviewLine({ text: "Works in /work.", code: "overview.reaches.folder", params: { cwd: "/work" } }))
      .toBe("在 /work 中工作。");
  });

  it("reads a numeric `at` param as a clock time and a schedule param as its own sentence", () => {
    setLocale("zh");
    const at = Date.UTC(2026, 0, 5, 12, 34);
    expect(overviewLine({ text: " Next run 12:34 PM.", code: "overview.does.nextRun", params: { at } }))
      .toBe(`下次运行 ${niceTime(at)}。`);

    const schedule = { type: "interval" as const, everyMinutes: 5, anchorAt: 1 };
    const rendered = overviewLine({
      text: "Every 5 minutes: Triage Discord.",
      code: "overview.does.routine",
      params: { schedule, name: "Triage Discord", nextRun: "", lastRun: "" },
    });
    expect(rendered).toBe(`${scheduleSentence(schedule)}：Triage Discord。`);
  });

  it("words a nested line and its status word", () => {
    setLocale("zh");
    const at = Date.UTC(2026, 0, 5, 12, 34);
    const rendered = overviewLine({
      text: " Last run completed at 12:34 PM.",
      code: "overview.does.lastRun",
      params: { status: { text: "completed", code: "overview.runStatus.completed" }, at },
    });
    expect(rendered).toBe(`上次运行：已完成，${niceTime(at)}。`);
  });
});
