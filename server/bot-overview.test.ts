import { describe, expect, it } from "vitest";

import {
  buildBotOverview,
  connectedAppsFacts,
  grantsSummary,
  setupSteps,
  soulLead,
  type OverviewFacts,
  type OverviewLine,
} from "./bot-overview.ts";

function baseFacts(overrides: Partial<OverviewFacts> = {}): OverviewFacts {
  return {
    bot: {
      name: "Kiwi",
      title: "Tracker",
      description: "Files bugs.",
      soul: "",
      computer: "off",
      cloudBackend: undefined,
      cwd: undefined,
      autoApprove: false,
      approvePeerComms: false,
      peers: [],
      composio: undefined,
      browser: undefined,
      chiefOfStaff: undefined,
    },
    routines: [],
    runs: [],
    webhooks: [],
    skills: [],
    engine: null,
    connectedApps: { configured: false, authoritative: true, services: [] },
    sectionPeers: 0,
    timeZone: "UTC",
    recent: [],
    ...overrides,
  };
}

const texts = (lines: OverviewLine[]): string[] => lines.map((line) => line.text);

const WONT_ORDER = [
  "Command approvals use Ask mode; saved permissions and provider rules still apply.",
  "Cannot initiate contact with other bots.",
  "Has no connected apps.",
  "Can't use a computer.",
  "Won't act on a schedule.",
  "Profile proposal cards require your approval.",
];

describe("buildBotOverview", () => {
  it("describes additional teams only for an authorized Chief", () => {
    const facts = baseFacts({ bot: { ...baseFacts().bot, chiefOfStaff: true, managedSections: ["Engineering", "Research"], peers: undefined }, engine: { agentsMcp: true }, sectionPeers: 3 });
    expect(texts(buildBotOverview(facts).reaches)).toContain("Can talk to 3 other bots in its allowed teams.");
    expect(texts(buildBotOverview(facts).reaches)).toContain("May also coordinate these teams: Engineering, Research.");
    facts.bot.chiefOfStaff = false;
    expect(texts(buildBotOverview(facts).reaches).join(" ")).not.toContain("Engineering");
  });
  it("yields all six wont lines in order and no does lines for a bot on Ask", () => {
    const overview = buildBotOverview(baseFacts({ bot: { ...baseFacts().bot, approvalMode: "ask" } }));
    expect(texts(overview.wont)).toEqual(WONT_ORDER);
    expect(overview.does).toEqual([]);
  });

  it("describes a fresh bot at the default level, Full access", () => {
    expect(texts(buildBotOverview(baseFacts()).wont)).toEqual(WONT_ORDER.slice(1, -1));
  });

  it("drops the first wont line when autoApprove is on", () => {
    const overview = buildBotOverview(baseFacts({ bot: { ...baseFacts().bot, autoApprove: true } }));
    expect(texts(overview.wont)).toEqual(WONT_ORDER.slice(1));
  });

  it("uses the effective approval level rather than the legacy Auto bit", () => {
    const bot = { ...baseFacts().bot, approvalMode: "full" as const, autoApprove: false };
    expect(texts(buildBotOverview(baseFacts({ bot })).wont)).not.toContain(WONT_ORDER[0]);
    expect(texts(buildBotOverview(baseFacts({ bot: { ...bot, approvalMode: "custom" } })).wont))
      .toContain("Command approvals follow the provider's custom configuration.");
  });

  it("does not promise duplicate profile or peer approvals in Full Access", () => {
    const bot = { ...baseFacts().bot, peers: undefined, approvePeerComms: true, approvalMode: "full" as const, autoApprove: false };
    const full = texts(buildBotOverview(baseFacts({ bot })).wont);
    expect(full).not.toContain("Asks before contacting other bots.");
    expect(full).not.toContain("Profile proposal cards require your approval.");
    for (const approvalMode of ["ask", "custom"] as const) {
      const reviewed = texts(buildBotOverview(baseFacts({ bot: { ...bot, approvalMode, autoApprove: true } })).wont);
      expect(reviewed).toContain("Asks before contacting other bots.");
      expect(reviewed).toContain("Profile proposal cards require your approval.");
    }
    expect(texts(buildBotOverview(baseFacts({ bot: { ...bot, peers: [] } })).wont))
      .toContain("Cannot initiate contact with other bots.");
  });

  it("does not advertise a browser disabled globally or unsupported by the engine", () => {
    const facts = baseFacts({ bot: { ...baseFacts().bot, computer: "browser" }, browserEnabled: true, engine: { browserMcp: false } });
    expect(texts(buildBotOverview(facts).reaches)).not.toContain("Has the built-in browser.");
    facts.engine = { browserMcp: true };
    facts.browserEnabled = false;
    expect(texts(buildBotOverview(facts).reaches)).not.toContain("Has the built-in browser.");
    facts.browserEnabled = true;
    expect(texts(buildBotOverview(facts).reaches)).toContain("Has the built-in browser.");
  });

  it("renders an enabled interval routine with its last completed run", () => {
    const facts = baseFacts({
      routines: [
        {
          id: "r1",
          name: "Triage Discord",
          enabled: true,
          schedule: { type: "interval", everyMinutes: 5, anchorAt: 1_000 },
          nextRunAt: 2_000,
        },
      ],
      runs: [
        { routineId: "r1", status: "completed", finishedAt: 1_500, scheduledFor: 1_000 },
      ],
    });
    const overview = buildBotOverview(facts);
    expect(overview.does).toHaveLength(1);
    expect(overview.does[0]!.text).toMatch(/^Every 5 minutes: Triage Discord\./);
    expect(overview.does[0]!.text).not.toContain("UTC");
    expect(overview.does[0]!.text).not.toContain("anchored");
    expect(overview.does[0]!.text).toContain("Last run completed at");
    expect(overview.does[0]!.text).toContain("Next run");
    expect(texts(overview.wont)).not.toContain("Won't act on a schedule.");
  });

  it("carries the catalog code and the values a client words each line from", () => {
    const facts = baseFacts({
      bot: { ...baseFacts().bot, computer: "local", cwd: "/work" },
      routines: [
        { id: "r1", name: "Triage Discord", enabled: true, schedule: { type: "interval", everyMinutes: 5, anchorAt: 1_000 }, nextRunAt: 2_000 },
      ],
      runs: [{ routineId: "r1", status: "completed", finishedAt: 1_500, scheduledFor: 1_000 }],
    });
    const overview = buildBotOverview(facts);
    const routine = overview.does[0]!;
    expect(routine.code).toBe("overview.does.routine");
    expect(routine.params!.schedule).toEqual({ type: "interval", everyMinutes: 5, anchorAt: 1_000 });
    expect(routine.params!.name).toBe("Triage Discord");
    const nextRun = routine.params!.nextRun as OverviewLine;
    expect(nextRun.code).toBe("overview.does.nextRun");
    expect(nextRun.params).toEqual({ at: 2_000 });
    const lastRun = routine.params!.lastRun as OverviewLine;
    expect(lastRun.code).toBe("overview.does.lastRun");
    expect(lastRun.params!.at).toBe(1_500);
    expect((lastRun.params!.status as OverviewLine).code).toBe("overview.runStatus.completed");
    expect(overview.reaches[0]).toEqual({ text: "Computer preference: this computer.", code: "overview.reaches.computer.local" });
    expect(overview.reaches[1]).toEqual({ text: "Works in /work.", code: "overview.reaches.folder", params: { cwd: "/work" } });
    expect(overview.wont.every((line) => line.code.startsWith("overview.wont."))).toBe(true);
  });

  it("renders a paused routine as Paused: name", () => {
    const facts = baseFacts({
      routines: [
        {
          id: "r2",
          name: "Nightly Backup",
          enabled: false,
          schedule: { type: "daily", time: "09:00", weekdays: [1] },
          nextRunAt: null,
        },
      ],
    });
    const overview = buildBotOverview(facts);
    expect(texts(overview.does)).toEqual(["Paused: Nightly Backup."]);
    expect(texts(overview.wont)).toContain("Won't act on a schedule.");
  });

  it("renders enabled skills and webhooks as their own does lines", () => {
    const facts = baseFacts({
      skills: [
        { name: "triage", description: "Triage incoming bug reports", enabled: true },
        { name: "disabled-skill", description: "Should not appear", enabled: false },
      ],
      webhooks: [
        { name: "Linear", enabled: true },
        { name: "Disabled hook", enabled: false },
      ],
    });
    const overview = buildBotOverview(facts);
    expect(texts(overview.does)).toEqual([
      "Knows how to triage incoming bug reports.",
      "Listens for “Linear” webhooks.",
    ]);
  });

  it("shows two connected services in reaches", () => {
    const facts = baseFacts({
      bot: { ...baseFacts().bot, composio: true, computer: "local" },
      engine: { composioMcp: true },
      connectedApps: { configured: true, authoritative: true, services: ["gmail", "linear"] },
    });
    const overview = buildBotOverview(facts);
    expect(texts(overview.reaches)).toContain("Can use 2 connected apps: gmail, linear.");
    expect(texts(overview.wont)).not.toContain("Has no connected apps.");
  });

  it("reports connected apps could not be checked when unauthoritative, without also claiming none connected", () => {
    const facts = baseFacts({
      bot: { ...baseFacts().bot, composio: true, computer: "local" },
      engine: { composioMcp: true },
      connectedApps: { configured: true, authoritative: false, services: [] },
    });
    const overview = buildBotOverview(facts);
    expect(texts(overview.reaches)).toContain("Connected apps could not be checked.");
    expect(texts(overview.wont)).not.toContain("Has no connected apps.");
    expect(texts(overview.reaches).some((line) => line.startsWith("Can use"))).toBe(false);
  });

  it("states 'Has no connected apps.' when apps are off for the bot, even if the inventory is unverifiable", () => {
    // Apps off is a definite negative that needs no inventory — saying
    // "could not be checked" here would imply the bot might have apps.
    const facts = baseFacts({
      bot: { ...baseFacts().bot, composio: false, computer: "local" },
      engine: { composioMcp: true },
      connectedApps: { configured: true, authoritative: false, services: [] },
    });
    const overview = buildBotOverview(facts);
    expect(texts(overview.wont)).toContain("Has no connected apps.");
    expect(texts(overview.reaches)).not.toContain("Connected apps could not be checked.");
  });

  it("stays silent about apps in reaches when the engine cannot mount them", () => {
    const facts = baseFacts({
      bot: { ...baseFacts().bot, composio: true, computer: "local" },
      engine: { composioMcp: false },
      connectedApps: { configured: true, authoritative: false, services: ["gmail"] },
    });
    const overview = buildBotOverview(facts);
    expect(texts(overview.wont)).toContain("Has no connected apps.");
    expect(texts(overview.reaches).some((line) => line.includes("connected app"))).toBe(false);
  });

  it("uses the singular for one connected app", () => {
    const facts = baseFacts({
      bot: { ...baseFacts().bot, composio: true, computer: "local" },
      engine: { composioMcp: true },
      connectedApps: { configured: true, authoritative: true, services: ["gmail"] },
    });
    const reaches = buildBotOverview(facts).reaches;
    expect(texts(reaches)).toContain("Can use 1 connected app: gmail.");
    expect(reaches.find((line) => line.text.startsWith("Can use"))!.code).toBe("overview.reaches.appsOne");
  });

  it("writes daily and once schedules as prose", () => {
    const overview = buildBotOverview(baseFacts({
      routines: [
        { id: "a", name: "Standup", enabled: true, schedule: { type: "daily", time: "09:30", weekdays: [1, 2, 3, 4, 5] }, nextRunAt: null },
        { id: "b", name: "Digest", enabled: true, schedule: { type: "daily", time: "18:00", weekdays: [0, 1, 2, 3, 4, 5, 6] }, nextRunAt: null },
        { id: "c", name: "Review", enabled: true, schedule: { type: "daily", time: "08:00", weekdays: [3] }, nextRunAt: null },
        { id: "d", name: "Launch", enabled: true, schedule: { type: "once", at: Date.UTC(2026, 8, 5, 12) }, nextRunAt: null },
        { id: "e", name: "Hourly", enabled: true, schedule: { type: "interval", everyMinutes: 60, anchorAt: 1 }, nextRunAt: null },
      ],
    }));
    expect(texts(overview.does)).toEqual([
      "Every weekday at 9:30 AM: Standup.",
      "Every day at 6:00 PM: Digest.",
      "Weekly on Wednesday at 8:00 AM: Review.",
      "Once on September 5 at 12:00 PM: Launch.",
      "Every hour: Hourly.",
    ]);
  });

  it("picks a computer automatically and stays reachable by default when computer/peers are unset", () => {
    const facts = baseFacts({
      bot: { ...baseFacts().bot, computer: undefined, peers: undefined, approvePeerComms: false },
    });
    const overview = buildBotOverview(facts);
    expect(texts(overview.reaches)).toContain("Computer preference: Auto; availability is checked when a task starts.");
    expect(texts(overview.wont)).not.toContain("Can't use a computer.");
    expect(texts(overview.wont)).not.toContain("Won't contact other bots without asking.");
  });

  it("says a Cloud home cannot use this computer or a Local VM, and changes nothing elsewhere", () => {
    const reach = (computer: OverviewFacts["bot"]["computer"], cloudHome?: boolean) =>
      buildBotOverview(baseFacts({ bot: { ...baseFacts().bot, computer }, ...(cloudHome === undefined ? {} : { cloudHome }) })).reaches[0]!;
    expect(reach("local", true).text).toBe("Computer preference: this computer, which isn't available on My Cloud.");
    expect(reach("local", true).code).toBe("overview.reaches.computer.localCloud");
    expect(reach("vm", true).text).toBe("Computer preference: Local VM, which isn't available on My Cloud.");
    expect(reach("cloud", true).text).toBe("Computer preference: cloud computer.");
    expect(reach("browser", true).text).toBe("Computer preference: browser only.");
    expect(reach(undefined, true).text).toBe("Computer preference: Auto; availability is checked when a task starts.");
    for (const cloudHome of [undefined, false]) {
      expect(reach("local", cloudHome).text).toBe("Computer preference: this computer.");
      expect(reach("vm", cloudHome).text).toBe("Computer preference: Local VM.");
    }
  });
});

describe("soulLead", () => {
  it("cuts at the first blank line", () => {
    expect(soulLead("First paragraph.\n\nSecond paragraph.")).toBe("First paragraph.");
  });

  it("cuts at 240 characters", () => {
    const long = "A".repeat(300);
    const result = soulLead(long);
    expect(result).toBe(`${"A".repeat(240)}…`);
  });

  it("returns an empty string for an unset soul", () => {
    expect(soulLead(undefined)).toBe("");
  });
});

describe("connectedAppsFacts", () => {
  it("lists the connected slugs when the inventory reads cleanly", async () => {
    const facts = await connectedAppsFacts(true, "configured", async () => ({
      gmail: { connected: true },
      linear: { connected: false },
    }));
    expect(facts).toEqual({ configured: true, authoritative: true, services: ["gmail"] });
  });

  it("marks the inventory unverified instead of throwing when the read fails", async () => {
    const facts = await connectedAppsFacts(true, "configured", async () => {
      throw new Error("Connected apps: HTTP 502");
    });
    expect(facts).toEqual({ configured: true, authoritative: false, services: [] });
  });

  it("never reads when the connector is unconfigured or the store was unreadable", async () => {
    let reads = 0;
    const read = async () => {
      reads += 1;
      return {};
    };
    expect(await connectedAppsFacts(false, "unconfigured", read)).toEqual({ configured: false, authoritative: true, services: [] });
    expect(await connectedAppsFacts(false, "unreadable", read)).toEqual({ configured: false, authoritative: false, services: [] });
    expect(reads).toBe(0);
  });
});

describe("grantsSummary", () => {
  it("stays off the wire for a bot with no grants record", () => {
    expect(grantsSummary(undefined)).toBeUndefined();
    expect(buildBotOverview(baseFacts()).grants).toBeUndefined();
  });

  it("summarizes wildcards, exact lists and an explicit no-tools record", () => {
    const grants = grantsSummary({
      slack: { tools: "*" },
      gmail: { tools: ["GMAIL_SEND_EMAIL", "GMAIL_FETCH_EMAILS"] },
    });
    expect(grants).toEqual([
      { slug: "gmail", level: "partial", toolCount: 2 },
      { slug: "slack", level: "all", toolCount: 0 },
    ]);
    // {} is the explicit no-tools record: an empty list, not an absent one
    expect(grantsSummary({})).toEqual([]);
    expect(buildBotOverview(baseFacts({ bot: { ...baseFacts().bot, connectorTools: {} } })).grants).toEqual([]);
  });

  it("rides along in the built overview for a partial grant set", () => {
    const connectorTools = { gmail: { tools: ["GMAIL_SEND_EMAIL"] } };
    const overview = buildBotOverview(baseFacts({ bot: { ...baseFacts().bot, connectorTools } }));
    expect(overview.grants).toEqual([{ slug: "gmail", level: "partial", toolCount: 1 }]);
  });
});

describe("setupSteps", () => {
  it("lists optional setup ideas without inspecting conversation history", () => {
    const steps = setupSteps(baseFacts({ bot: { ...baseFacts().bot, name: "New bot", title: "", description: "" } }));
    expect(steps.map((step) => [step.id, step.done])).toEqual([
      ["identity", false],
      ["soul", false],
      ["folder", false],
      ["schedule", false],
    ]);
    expect(steps.find((step) => step.id === "apps")).toBeUndefined();
    expect(steps.every((step) => step.section)).toBe(true);
  });

  it("marks steps done from the same facts the sentences use", () => {
    const facts = baseFacts({
      bot: { ...baseFacts().bot, name: "Kiwi", title: "Tracker", soul: "Be brief.", cwd: "/work", composio: true },
      engine: { composioMcp: true },
      connectedApps: { configured: true, authoritative: true, services: ["gmail"] },
      routines: [{ id: "r1", name: "Digest", enabled: true, schedule: { type: "daily", time: "09:00", weekdays: [1, 2, 3, 4, 5] }, nextRunAt: null }],
    });
    expect(setupSteps(facts).every((step) => step.done)).toBe(true);
    expect(setupSteps(facts).map((step) => step.id)).toContain("apps");
    expect(buildBotOverview(facts).setup).toEqual(setupSteps(facts));
  });

  it("does not count an unverified app inventory or a paused routine as done", () => {
    const facts = baseFacts({
      bot: { ...baseFacts().bot, composio: true },
      engine: { composioMcp: true },
      connectedApps: { configured: true, authoritative: false, services: ["gmail"] },
      routines: [{ id: "r1", name: "Digest", enabled: false, schedule: { type: "daily", time: "09:00", weekdays: [1] }, nextRunAt: null }],
    });
    const byId = Object.fromEntries(setupSteps(facts).map((step) => [step.id, step.done]));
    expect(byId.apps).toBe(false);
    expect(byId.schedule).toBe(false);
  });
});
