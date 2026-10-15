import type { BotRecord } from "./store.ts";
import type { Routine } from "./routines.ts";
import type { RoutineRequestSchedule } from "../shared/routine-request.ts";
import { approvalModeFor } from "../shared/approval-mode.ts";
import { cronScheduleLabel } from "../shared/cron-label.ts";

/** A schedule riding along inside a line's params, for a client to word itself. */
export type OverviewSchedule = RoutineRequestSchedule | Routine["schedule"];

/** One sentence for the Overview panel: `text` is the English this build words,
 * `code` names the catalog template a client can say it with instead, and
 * `params` refill that template. A param named `at` is an epoch-millisecond
 * clock time. */
export interface OverviewLine {
  text: string;
  code: string;
  params?: Record<string, string | number | OverviewLine | OverviewSchedule>;
}

export interface OverviewRecent {
  at: number;
  summary: string;
  field: string;
  before?: string;
  after?: string;
  /** Set when the summary is a sentence we word rather than recorded data. */
  summaryCode?: string;
  summaryParams?: Record<string, string | number>;
}

export interface BotOverview {
  who: { name: string; title: string; blurb: string; soulLead: string };
  does: OverviewLine[];
  reaches: OverviewLine[];
  wont: OverviewLine[];
  recent: OverviewRecent[];
  grants?: BotOverviewGrant[];
  setup: SetupStep[];
}

export interface BotOverviewGrant {
  slug: string;
  level: "all" | "partial" | "none";
  /** Granted tool count; 0 unless level is "partial". */
  toolCount: number;
}

export type SetupStepId = "identity" | "soul" | "folder" | "apps" | "schedule";
export type SetupStepSection = "identity" | "soul" | "access" | "routines";

export interface SetupStep {
  id: SetupStepId;
  label: string;
  done: boolean;
  section?: SetupStepSection;
}

export interface OverviewFacts {
  bot: Pick<
    BotRecord,
    | "name"
    | "title"
    | "description"
    | "soul"
    | "computer"
    | "cloudBackend"
    | "cwd"
    | "autoApprove"
    | "approvalMode"
    | "approvePeerComms"
    | "peers"
    | "composio"
    | "connectorTools"
    | "browser"
    | "chiefOfStaff"
    | "managedSections"
  >;
  routines: Array<{
    id: string;
    name: string;
    enabled: boolean;
    schedule: RoutineRequestSchedule | Routine["schedule"];
    nextRunAt: number | null;
  }>;
  runs: Array<{ routineId: string; status: string; finishedAt?: number; startedAt?: number; scheduledFor: number }>;
  webhooks: Array<{ name: string; enabled: boolean }>;
  skills: Array<{ name: string; description: string; enabled: boolean }>;
  engine: { agentsMcp?: boolean; composioMcp?: boolean; browserMcp?: boolean; computerMcp?: boolean } | null;
  browserEnabled?: boolean;
  cloudHome?: boolean;
  connectedApps: { configured: boolean; authoritative: boolean; services: string[] };
  sectionPeers: number;
  timeZone: string;
  recent: OverviewRecent[];
}

export function soulLead(soul: string | undefined): string {
  const trimmed = (soul ?? "").trim();
  if (!trimmed) return "";
  const paragraph = (trimmed.split(/\r?\n\s*\r?\n/)[0] ?? trimmed).trim();
  return paragraph.length > 240 ? `${paragraph.slice(0, 240).trimEnd()}…` : paragraph;
}

function line(code: string, text: string, params?: OverviewLine["params"]): OverviewLine {
  return params ? { text, code, params } : { text, code };
}

function lowerFirst(value: string): string {
  return value.length ? value[0]!.toLowerCase() + value.slice(1) : value;
}

function time(at: number, timeZone: string): string {
  return new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function clockTime(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(":").map((part) => Number.parseInt(part, 10) || 0);
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function schedulePhrase(schedule: OverviewFacts["routines"][number]["schedule"], timeZone: string): string {
  if (schedule.type === "cron") return cronScheduleLabel(schedule);
  if (schedule.type === "once") {
    const date = new Date(schedule.at).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone });
    return `Once on ${date} at ${time(schedule.at, timeZone)}`;
  }
  if (schedule.type === "interval") {
    const minutes = schedule.everyMinutes;
    if (minutes < 60) return `Every ${minutes} minute${minutes === 1 ? "" : "s"}`;
    if (minutes === 60) return "Every hour";
    if (minutes % 60 === 0) return `Every ${minutes / 60} hours`;
    return `Every ${Math.floor(minutes / 60)} hour${Math.floor(minutes / 60) === 1 ? "" : "s"} ${minutes % 60} minutes`;
  }
  const days = schedule.weekdays;
  const at = ` at ${clockTime(schedule.time)}`;
  if (days.length === 7) return `Every day${at}`;
  if (days.join(",") === "1,2,3,4,5") return `Every weekday${at}`;
  if (days.length === 1) return `Weekly on ${DAY_NAMES[days[0]!]}${at}`;
  return `${days.map((day) => DAY_NAMES[day]).join(", ")}${at}`;
}

function latestRunFor(runs: OverviewFacts["runs"], routineId: string): OverviewFacts["runs"][number] | undefined {
  let best: OverviewFacts["runs"][number] | undefined;
  let bestAt = -Infinity;
  for (const run of runs) {
    if (run.routineId !== routineId) continue;
    const at = run.finishedAt ?? run.startedAt ?? run.scheduledFor;
    if (at > bestAt) {
      bestAt = at;
      best = run;
    }
  }
  return best;
}

function doesLines(facts: OverviewFacts): OverviewLine[] {
  const lines: OverviewLine[] = [];
  for (const routine of facts.routines) {
    if (!routine.enabled) {
      lines.push(line("overview.does.paused", `Paused: ${routine.name}.`, { name: routine.name }));
      continue;
    }
    const nextRun = routine.nextRunAt != null
      ? line("overview.does.nextRun", ` Next run ${time(routine.nextRunAt, facts.timeZone)}.`, { at: routine.nextRunAt })
      : undefined;
    const latest = latestRunFor(facts.runs, routine.id);
    const at = latest ? latest.finishedAt ?? latest.startedAt ?? latest.scheduledFor : undefined;
    const lastRun = latest && at != null
      ? line("overview.does.lastRun", ` Last run ${latest.status} at ${time(at, facts.timeZone)}.`, {
        status: line(`overview.runStatus.${latest.status}`, latest.status),
        at,
      })
      : undefined;
    const schedule = schedulePhrase(routine.schedule, facts.timeZone);
    lines.push(line("overview.does.routine", `${schedule}: ${routine.name}.${nextRun?.text ?? ""}${lastRun?.text ?? ""}`, {
      schedule: routine.schedule,
      name: routine.name,
      nextRun: nextRun ?? "",
      lastRun: lastRun ?? "",
    }));
  }
  for (const skill of facts.skills) {
    if (!skill.enabled) continue;
    const what = lowerFirst(skill.description || skill.name);
    lines.push(line("overview.does.skill", `Knows how to ${what}.`, { what }));
  }
  for (const webhook of facts.webhooks) {
    if (!webhook.enabled) continue;
    lines.push(line("overview.does.webhook", `Listens for “${webhook.name}” webhooks.`, { name: webhook.name }));
  }
  return lines;
}

export async function connectedAppsFacts(
  configured: boolean,
  availability: "configured" | "unconfigured" | "unreadable",
  read: () => Promise<Record<string, { connected: boolean }>>,
): Promise<OverviewFacts["connectedApps"]> {
  let authoritative = availability !== "unreadable";
  let services: string[] = [];
  if (configured && authoritative) {
    try {
      services = Object.entries(await read())
        .filter(([, state]) => state.connected)
        .map(([slug]) => slug);
    } catch {
      authoritative = false;
    }
  }
  return { configured, authoritative, services };
}

function couldUseApps(facts: OverviewFacts): boolean {
  return facts.bot.composio !== false && facts.connectedApps.configured && Boolean(facts.engine?.composioMcp);
}

export function grantsSummary(connectorTools: BotRecord["connectorTools"]): BotOverviewGrant[] | undefined {
  if (connectorTools === undefined) return undefined;
  return Object.entries(connectorTools)
    .map(([slug, grant]): BotOverviewGrant => {
      if (grant.tools === "*") return { slug, level: "all", toolCount: 0 };
      if (grant.tools.length > 0) return { slug, level: "partial", toolCount: grant.tools.length };
      return { slug, level: "none", toolCount: 0 };
    })
    .sort((a, b) => (a.slug < b.slug ? -1 : 1));
}

function computerReach(computer: BotRecord["computer"], cloudHome = false): OverviewLine | null {
  const unavailable = cloudHome ? ", which isn't available on My Cloud" : "";
  switch (computer) {
    case "cloud":
      return line("overview.reaches.computer.cloud", "Computer preference: cloud computer.");
    case "vm":
      return cloudHome
        ? line("overview.reaches.computer.vmCloud", `Computer preference: Local VM${unavailable}.`)
        : line("overview.reaches.computer.vm", "Computer preference: Local VM.");
    case "local":
      return cloudHome
        ? line("overview.reaches.computer.localCloud", `Computer preference: this computer${unavailable}.`)
        : line("overview.reaches.computer.local", "Computer preference: this computer.");
    case "browser":
      return line("overview.reaches.computer.browser", "Computer preference: browser only.");
    case "off":
      return null;
    default:
      return line("overview.reaches.computer.auto", "Computer preference: Auto; availability is checked when a task starts.");
  }
}

function reachesLines(facts: OverviewFacts): OverviewLine[] {
  const lines: OverviewLine[] = [];
  const computer = computerReach(facts.bot.computer, facts.cloudHome);
  if (computer) lines.push(computer);
  lines.push(facts.bot.cwd
    ? line("overview.reaches.folder", `Works in ${facts.bot.cwd}.`, { cwd: facts.bot.cwd })
    : line("overview.reaches.folderPrivate", "Works in its own folder."));
  const apps = facts.connectedApps;
  if (couldUseApps(facts) && apps.authoritative && apps.services.length > 0) {
    const count = apps.services.length;
    const listed = apps.services.join(", ");
    lines.push(count === 1
      ? line("overview.reaches.appsOne", `Can use 1 connected app: ${listed}.`, { apps: listed })
      : line("overview.reaches.appsMany", `Can use ${count} connected apps: ${listed}.`, { count, apps: listed }));
  } else if (couldUseApps(facts) && !apps.authoritative) {
    lines.push(line("overview.reaches.appsUnknown", "Connected apps could not be checked."));
  }
  if (facts.browserEnabled && facts.engine?.browserMcp && facts.bot.browser !== false && facts.bot.computer !== "off") {
    lines.push(line("overview.reaches.browser", "Has the built-in browser."));
  }
  if (facts.engine?.agentsMcp && facts.sectionPeers > 0 && facts.bot.peers?.length !== 0) {
    const teams = facts.bot.chiefOfStaff && facts.bot.managedSections?.length;
    const one = facts.sectionPeers === 1;
    const scope = teams ? "its allowed teams" : "its section";
    lines.push(one
      ? line(teams ? "overview.reaches.peersOneTeams" : "overview.reaches.peersOne", `Can talk to 1 other bot in ${scope}.`)
      : line(teams ? "overview.reaches.peersManyTeams" : "overview.reaches.peersMany", `Can talk to ${facts.sectionPeers} other bots in ${scope}.`, { count: facts.sectionPeers }));
  }
  if (facts.bot.chiefOfStaff) lines.push(line("overview.reaches.chief", "Coordinates its section as Chief of Staff."));
  if (facts.bot.chiefOfStaff && facts.bot.managedSections?.length) {
    const teams = facts.bot.managedSections.map(name => name || "General").join(", ");
    lines.push(line("overview.reaches.chiefTeams", `May also coordinate these teams: ${teams}.`, { teams }));
  }
  return lines;
}

function wontLines(facts: OverviewFacts): OverviewLine[] {
  const lines: OverviewLine[] = [];
  const mode = approvalModeFor(facts.bot);
  if (mode === "ask") lines.push(line("overview.wont.approvalsAsk", "Command approvals use Ask mode; saved permissions and provider rules still apply."));
  if (mode === "custom") lines.push(line("overview.wont.approvalsCustom", "Command approvals follow the provider's custom configuration."));
  if (facts.bot.peers?.length === 0) lines.push(line("overview.wont.peersNone", "Cannot initiate contact with other bots."));
  else if (mode !== "full" && facts.bot.approvePeerComms) lines.push(line("overview.wont.peersAsk", "Asks before contacting other bots."));
  if (!couldUseApps(facts) || (facts.connectedApps.authoritative && facts.connectedApps.services.length === 0)) {
    lines.push(line("overview.wont.appsNone", "Has no connected apps."));
  }
  if (facts.bot.computer === "off") lines.push(line("overview.wont.computerOff", "Can't use a computer."));
  if (!facts.routines.some((routine) => routine.enabled)) lines.push(line("overview.wont.scheduleNone", "Won't act on a schedule."));
  if (mode !== "full") lines.push(line("overview.wont.profileApproval", "Profile proposal cards require your approval."));
  return lines;
}

export function buildBotOverview(facts: OverviewFacts): BotOverview {
  return {
    who: {
      name: facts.bot.name,
      title: facts.bot.title,
      blurb: facts.bot.description,
      soulLead: soulLead(facts.bot.soul),
    },
    does: doesLines(facts),
    reaches: reachesLines(facts),
    wont: wontLines(facts),
    recent: facts.recent,
    grants: grantsSummary(facts.bot.connectorTools),
    setup: setupSteps(facts),
  };
}

const DEFAULT_BOT_NAMES = /^(new bot|bot|untitled)(\s*\d+)?$/i;

export function setupSteps(facts: OverviewFacts): SetupStep[] {
  const named = facts.bot.name.trim() !== "" && !DEFAULT_BOT_NAMES.test(facts.bot.name.trim());
  const described = facts.bot.title.trim() !== "" || facts.bot.description.trim() !== "";
  const apps = facts.connectedApps;
  const routines = facts.routines.some((routine) => routine.enabled);
  const webhooks = facts.webhooks.some((webhook) => webhook.enabled);
  const steps: SetupStep[] = [
    { id: "identity", label: "Give it a name and a role", done: named && described, section: "identity" },
    { id: "soul", label: "Write its standing instructions", done: (facts.bot.soul ?? "").trim() !== "", section: "soul" },
    { id: "folder", label: "Choose a working folder", done: Boolean(facts.bot.cwd), section: "access" },
  ];
  if (couldUseApps(facts)) {
    steps.push({
      id: "apps",
      label: "Connect the apps it needs",
      done: apps.authoritative && apps.services.length > 0,
      section: "access",
    });
  }
  steps.push({ id: "schedule", label: "Add a schedule or a trigger", done: routines || webhooks, section: "routines" });
  return steps;
}
