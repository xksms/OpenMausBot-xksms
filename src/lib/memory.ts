import { t } from "@/lib/i18n";
import { ApiError, api } from "@/state/store";

export const MEMORY_INDEX = "MEMORY.md";

export interface MemoryCapacity {
  lines: number;
  bytes: number;
  maxLines: number;
  maxBytes: number;
  loadedLines: number;
  loadedBytes: number;
  truncated: boolean;
  hash: string;
}

export interface MemoryFileInfo {
  path: string;
  name: string;
  bytes: number;
  modifiedAt: number;
}

export interface MemoryOverview {
  lendingReview?: LendingReview;
  botId: string;
  workspacePath: string;
  index: MemoryCapacity;
  topics: MemoryFileInfo[];
  logs: MemoryFileInfo[];
}

export interface MemoryDoc {
  path: string;
  text: string;
  hash: string;
  exists: boolean;
}

export type MemoryActor = "bot" | "person" | "import" | "upkeep";

export interface MemoryJournalRow {
  id: string;
  at: number;
  botId: string;
  path: string;
  actor: MemoryActor;
  via: string;
  threadId?: string;
  threadTitle?: string;
  kind: "created" | "edited" | "deleted";
  beforeHash: string | null;
  afterHash: string | null;
  diff: string;
  added: number;
  removed: number;
  canRevert: boolean;
  revertUnavailableReason?: string;
}

export type SaveResult =
  | { ok: true; doc: MemoryDoc; overview: MemoryOverview }
  | { ok: false; conflict: true; current: string; currentHash: string };

export function fetchMemoryOverview(botId: string): Promise<MemoryOverview> {
  return api(`/api/bots/${botId}/memory`);
}

export function fetchMemoryDoc(botId: string, path: string): Promise<MemoryDoc> {
  return api(`/api/bots/${botId}/memory/file?path=${encodeURIComponent(path)}`);
}

export async function saveMemoryDoc(botId: string, path: string, text: string, expectedHash: string | undefined): Promise<SaveResult> {
  const response = await fetch(`/api/bots/${botId}/memory/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, text, expectedHash }),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.status === 409 && typeof body.current === "string" && typeof body.currentHash === "string") {
    return { ok: false, conflict: true, current: body.current, currentHash: body.currentHash };
  }
  if (!response.ok) throw new ApiError(typeof body.error === "string" ? body.error : `${response.status} ${response.statusText}`, response.status);
  const saved = body as unknown as MemoryDoc & { overview: MemoryOverview };
  return { ok: true, doc: { path: saved.path, text: saved.text, hash: saved.hash, exists: saved.exists }, overview: saved.overview };
}

export function deleteMemoryDoc(botId: string, path: string): Promise<{ overview: MemoryOverview }> {
  return api(`/api/bots/${botId}/memory/file?path=${encodeURIComponent(path)}`, { method: "DELETE" });
}

export async function fetchMemoryJournal(botId: string, limit = 50): Promise<MemoryJournalRow[]> {
  const result: { entries: MemoryJournalRow[] } = await api(`/api/bots/${botId}/memory/journal?limit=${limit}`);
  return result.entries;
}

export function revertMemoryChange(botId: string, entryId: string): Promise<MemoryDoc & { overview: MemoryOverview }> {
  return api(`/api/bots/${botId}/memory/journal/${encodeURIComponent(entryId)}/revert`, { method: "POST" });
}

export interface TidyReport {
  at: number;
  expired: number;
  duplicates: number;
  superseded: number;
  deferred: number;
  organized?: number;
  contradictionsChecked: boolean;
  note?: string;
}

export interface CaptureReport {
  at: number;
  added: number;
  topics?: number;
  aboutMe?: number;
  note?: string;
}

export interface UpkeepStatus {
  enabled: boolean;
  modelSteps: boolean;
  lastTidy?: TidyReport;
  lastCapture?: CaptureReport;
}

export function noticedCount(report: CaptureReport | undefined): number {
  return report ? report.added + (report.topics ?? 0) : 0;
}

export function fetchUpkeepStatus(botId: string): Promise<UpkeepStatus> {
  return api(`/api/bots/${botId}/memory/upkeep`);
}

export interface LendingReview {
  token: string;
  changed: string[];
}

export function markMemoryReviewed(botId: string, token: string): Promise<{ ok: true; lendingReview: false }> {
  return api(`/api/bots/${botId}/memory/reviewed`, { method: "POST", body: JSON.stringify({ token }) });
}

export function tidyMemoryNow(botId: string): Promise<{ report: TidyReport; overview: MemoryOverview }> {
  return api(`/api/bots/${botId}/memory/tidy`, { method: "POST" });
}

export function tidySummary(report: TidyReport): string {
  const parts: string[] = [];
  if (report.expired) parts.push(t(report.expired === 1 ? "memory.tidy.archivedOne" : "memory.tidy.archivedMany", { count: report.expired }));
  if (report.duplicates) parts.push(t(report.duplicates === 1 ? "memory.tidy.mergedOne" : "memory.tidy.mergedMany", { count: report.duplicates }));
  if (report.superseded) parts.push(t(report.superseded === 1 ? "memory.tidy.crossedOutOne" : "memory.tidy.crossedOutMany", { count: report.superseded }));
  if (report.organized) parts.push(t(report.organized === 1 ? "memory.tidy.filedOne" : "memory.tidy.filedMany", { count: report.organized }));
  const head = parts.length ? parts.join(", ") : t("memory.tidy.nothing");
  return head.charAt(0).toUpperCase() + head.slice(1);
}

export type MemoryOpenTarget = "obsidian" | "folder";

export function openMemoryLocation(botId: string, target: MemoryOpenTarget): Promise<{ ok: boolean; workspacePath: string }> {
  return api(`/api/bots/${botId}/memory/open`, { method: "POST", body: JSON.stringify({ target }) });
}


export function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 102.4) / 10} KB`;
}

export function relativeTime(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return t("memory.time.justNow");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t("memory.time.minutesAgo", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("memory.time.hoursAgo", { count: hours });
  const days = Math.round(hours / 24);
  if (days === 1) return t("memory.time.yesterday");
  if (days < 7) return t("memory.time.daysAgo", { count: days });
  return new Date(at).toLocaleDateString([], { month: "short", day: "numeric" });
}

export type CapacityLevel = "ok" | "near" | "over";

export interface CapacityStatus {
  level: CapacityLevel;
  lineShare: number;
  byteShare: number;
  sentence: string;
  warning: string | null;
}

export function capacityStatus(index: MemoryCapacity): CapacityStatus {
  const lineShare = index.maxLines ? index.lines / index.maxLines : 0;
  const byteShare = index.maxBytes ? index.bytes / index.maxBytes : 0;
  const level: CapacityLevel = index.truncated ? "over" : Math.max(lineShare, byteShare) >= 0.8 ? "near" : "ok";
  const sentence = t("memory.capacity.sentence", {
    lines: index.lines,
    maxLines: index.maxLines,
    bytes: formatBytes(index.bytes),
    maxBytes: formatBytes(index.maxBytes),
  });
  let warning: string | null = null;
  if (index.truncated) {
    const missingLines = index.lines - index.loadedLines;
    warning = missingLines > 0
      ? t(missingLines === 1 ? "memory.capacity.warningOne" : "memory.capacity.warningMany", {
        lines: index.lines,
        loadedLines: index.loadedLines,
        missingLines,
      })
      : t("memory.capacity.warningRest", {
        bytes: formatBytes(index.bytes),
        loadedBytes: formatBytes(index.loadedBytes),
      });
  }
  return { level, lineShare, byteShare, sentence, warning };
}

function fileLabel(path: string): string {
  if (path === MEMORY_INDEX) return "MEMORY.md";
  if (path.startsWith("memory/log/")) return `the ${path.slice("memory/log/".length).replace(/\.md$/, "")} log`;
  return path.replace(/^memory\//, "").replace(/\.md$/, "");
}

export function journalSummary(row: MemoryJournalRow, botName: string): string {
  const who = row.actor === "bot" ? botName
    : row.actor === "import" ? t("memory.actor.import")
      : row.actor === "upkeep" ? t("memory.actor.upkeep")
        : t("memory.actor.you");
  const file = fileLabel(row.path);
  const isIndex = row.path === MEMORY_INDEX;
  const topic = isIndex || row.path.startsWith("memory/log/") ? file : t("memory.journal.topicName", { file });
  if (row.kind === "created") {
    return row.added
      ? t("memory.journal.createdWith", { who, topic, lines: lines(row.added) })
      : t("memory.journal.created", { who, topic });
  }
  if (row.kind === "deleted") return t("memory.journal.deleted", { who, topic });
  if (row.added && !row.removed) return t("memory.journal.added", { who, topic, lines: lines(row.added) });
  if (row.removed && !row.added) return t("memory.journal.removed", { who, topic, lines: lines(row.removed) });
  return t("memory.journal.rewrote", { who, topic, lines: lines(Math.max(row.added, row.removed)) });
}

function lines(count: number): string {
  return t(count === 1 ? "memory.journal.lineOne" : "memory.journal.lineMany", { count });
}

export function journalSource(row: MemoryJournalRow): string | null {
  if (row.via === "revert") return t("memory.source.undo");
  if (row.via === "disk") return t("memory.source.disk");
  if (row.via === "tidy") return t("memory.source.tidy");
  if (row.via === "organize") return t("memory.source.organize");
  if (row.via === "capture") return row.threadTitle ? t("memory.source.captureThread", { title: row.threadTitle }) : t("memory.source.captureChat");
  if (row.threadTitle) return t("memory.source.thread", { title: row.threadTitle });
  if (row.actor === "bot") return t("memory.source.task");
  if (row.via === "ui") return t("memory.source.settings");
  if (row.via === "api") return t("memory.source.api");
  return null;
}

export function fileManagerLabel(platform: string | undefined): string {
  if (platform === "darwin") return "Show in Finder";
  if (platform === "win32") return "Show in Explorer";
  return "Show in file manager";
}

export function topicFileName(input: string): string | null {
  const stem = input.trim().replace(/\.md$/i, "").replace(/[^\w .-]+/g, "-").replace(/^[^\w]+/, "").trim();
  if (!stem) return null;
  return `${stem}.md`;
}
