import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { BotOverview } from "@/lib/bot-overview-types";
import type { PromptPreviewData } from "./PromptPreview";
import { OverviewSection } from "./OverviewSection";

// renderToStaticMarkup HTML-escapes apostrophes as &#x27;; decode before comparing.
function render(element: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(element).replace(/&#x27;/g, "'");
}

const sentences: BotOverview = {
  who: {
    name: "Scout",
    title: "Research specialist",
    blurb: "Digs into a claim and reports back with sources.",
    soulLead: "Always cite primary sources and separate fact from inference.",
  },
  does: [{
    text: "Daily at 9:00 AM: Morning brief. Next run 9:00 AM.",
    code: "overview.does.routine",
    params: {
      schedule: { type: "daily", time: "09:00", weekdays: [0, 1, 2, 3, 4, 5, 6] },
      name: "Morning brief",
      nextRun: { text: " Next run 9:00 AM.", code: "overview.does.nextRun", params: { at: 1700000000000 } },
      lastRun: "",
    },
  }],
  reaches: [
    { text: "Works in its own folder.", code: "overview.reaches.folderPrivate" },
    { text: "Has the built-in browser.", code: "overview.reaches.browser" },
  ],
  wont: [
    { text: "Won't run commands without asking you first.", code: "overview.wont.unshippedAsk" },
    { text: "Won't contact other bots without asking.", code: "overview.wont.unshippedPeers" },
    { text: "Has no connected apps.", code: "overview.wont.appsNone" },
    { text: "Can't use a computer.", code: "overview.wont.computerOff" },
    { text: "Won't act on a schedule.", code: "overview.wont.scheduleNone" },
    { text: "Won't change its own instructions without your approval.", code: "overview.wont.unshippedProfile" },
  ],
  recent: [{ at: 1700000000000, field: "title", summary: "Title changed" }],
};

const prompt: PromptPreviewData = {
  sections: [{ id: "persona", label: "Identity", text: "You are Scout.", bytes: 42 }],
  totalBytes: 42,
  approxTokens: 11,
  note: "Approximate.",
};

describe("OverviewSection", () => {
  it("offers optional setup ideas without declaring a usable bot unfinished", () => {
    const markup = render(createElement(OverviewSection, {
      overview: { ...sentences, setup: [
        { id: "identity", label: "Give it a name and a role", done: true, section: "identity" },
        { id: "folder", label: "Choose a working folder", done: false, section: "access" },
        { id: "schedule", label: "Add a schedule or a trigger", done: false, section: "routines" },
      ] }, prompt: null, onOpen: vi.fn(),
    }));
    expect(markup).toContain("Setup ideas");
    expect(markup).toContain("You can start chatting now.");
    expect(markup).toContain("Choose a working folder");
    expect(markup).not.toContain("Finish setting up");
    expect(markup).not.toContain("1 of 3 done");
    expect(markup).not.toContain(">Identity</span>");
  });

  it("shows Loading… before the overview arrives", () => {
    const markup = render(
      createElement(OverviewSection, { overview: null, prompt: null, onOpen: vi.fn() }),
    );
    expect(markup).toContain("Loading…");
  });

  it("renders the six wont lines, a does line, and a Read all link into Soul", () => {
    const markup = render(
      createElement(OverviewSection, { overview: sentences, prompt, onOpen: vi.fn() }),
    );

    for (const line of sentences.wont) {
      expect(markup).toContain(line.text);
    }
    expect(markup).toContain("Morning brief");
    expect(markup).toContain("every day at");
    expect(markup).toContain("Next run");
    expect(markup).toContain("Read all");
  });

  it("shows the empty-does fallback when the bot does nothing yet", () => {
    const empty: BotOverview = { ...sentences, does: [] };
    const markup = render(
      createElement(OverviewSection, { overview: empty, prompt, onOpen: vi.fn() }),
    );

    expect(markup).toContain("Nothing scheduled or learned yet.");
  });

  it("passes promptError through to PromptPreview instead of just nulling the data", () => {
    const markup = render(
      createElement(OverviewSection, { overview: sentences, prompt: null, promptError: true, onOpen: vi.fn() }),
    );

    expect(markup).toContain("Prompt preview");
  });

  it("keeps showing the loaded overview and adds a quiet banner when a background refresh fails", () => {
    const markup = render(
      createElement(OverviewSection, { overview: sentences, refreshError: true, prompt, onOpen: vi.fn() }),
    );

    expect(markup).toContain("Couldn’t refresh — showing the last loaded overview.");
    for (const line of sentences.wont) {
      expect(markup).toContain(line.text);
    }
  });

  it("omits the refresh banner when there was no refresh error", () => {
    const markup = render(
      createElement(OverviewSection, { overview: sentences, refreshError: false, prompt, onOpen: vi.fn() }),
    );

    expect(markup).not.toContain("Couldn’t refresh");
  });
});
