import { boatCapableEngine } from "@/lib/remote-desktop";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Cloud,
  Copy,
  ExternalLink,
  Laptop,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RotateCw,
  Send,
  Trash2,
  Webhook,
  X,
} from "lucide-react";

import { BotAvatar } from "@/components/Avatar";
import { cn } from "@/lib/cn";
import type { RoutineRun, RoutineRunOn } from "@/lib/routines";
import {
  loadWebhookCredentials,
  removeWebhookCredential,
  saveWebhookCredential,
  webhookCredentialStore,
} from "@/lib/webhook-credentials";
import { WEBHOOK_DEFAULT_MAX_PENDING_RUNS, WEBHOOK_MAX_PENDING_RUNS_LIMIT, webhookActivationDefaults, webhookMaxPendingRunsInput, type WebhookAttempt, type WebhookCredential, type WebhookTrigger, type WebhookTriggerInput } from "@/lib/webhooks";
import { api, openBotThread, useStore, type Bot } from "@/state/store";
import { useShowThreads } from "@/lib/thread-preferences";
import { copyText } from "@/lib/copy-text";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";

export function relativeTime(at?: number) {
  if (!at) return t("people.never");
  const elapsed = Math.max(0, Date.now() - at);
  if (elapsed < 60_000) return t("webhooks.justNow");
  if (elapsed < 60 * 60_000) return t("webhooks.minutesAgo", { count: Math.floor(elapsed / 60_000) });
  if (elapsed < 24 * 60 * 60_000) return t("webhooks.hoursAgo", { count: Math.floor(elapsed / 3_600_000) });
  return new Date(at).toLocaleDateString([], { month: "short", day: "numeric" });
}

function deliverySummary(run: RoutineRun) {
  const eventName = run.prompt?.match(/^Event: (.+)$/m)?.[1]?.trim() || t("webhooks.webhookEvent");
  const eventData = run.prompt?.match(/\[UNTRUSTED WEBHOOK EVENT DATA\]\n([\s\S]*?)\n\[\/UNTRUSTED WEBHOOK EVENT DATA\]/)?.[1] ?? "";
  const payloadStart = eventData.indexOf("\n\n");
  const payload = (payloadStart >= 0 ? eventData.slice(payloadStart + 2) : eventData).replace(/\s+/g, " ").trim();
  return { eventName, preview: payload.slice(0, 240) };
}

export function suggestedName(prompt: string, bot?: Bot) {
  const first = prompt.trim().split(/[.!?\n]/)[0]?.trim().slice(0, 60);
  return first || t("webhooks.suggestedName", { name: bot?.name ?? "MAUS" });
}

export function statusFor(webhook: WebhookTrigger) {
  if (webhook.verificationPending) return { label: t("webhooks.status.waitingForTest"), tone: "text-accent", dot: "bg-accent animate-pulse" };
  if (webhook.verifiedAt && !webhook.enabled) return { label: t("webhooks.status.readyToEnable"), tone: "text-warning", dot: "bg-warning" };
  if (webhook.enabled) return { label: t("routines.activeSchedule"), tone: "text-success", dot: "bg-success" };
  return { label: t("routines.goal.paused"), tone: "text-ink-secondary", dot: "bg-ink-secondary/50" };
}

export function outcomeTone(outcome: WebhookAttempt["outcome"], run?: RoutineRun) {
  if (outcome === "rejected" || run?.status === "failed" || run?.status === "missed") return "text-danger";
  if (run && ["queued", "running", "waiting"].includes(run.status)) return "text-accent";
  if (run?.status === "completed" || outcome === "captured" || outcome === "accepted") return "text-success";
  return "text-ink-secondary";
}

const RUN_STATUS: Record<RoutineRun["status"], LocaleKey> = {
  queued: "routines.status.queued",
  running: "routines.status.running",
  waiting: "webhooks.needsYou",
  completed: "routines.status.completed",
  failed: "routines.status.failed",
  cancelled: "routines.status.cancelled",
  missed: "routines.status.missed",
};

export function outcomeLabel(outcome: WebhookAttempt["outcome"], run?: RoutineRun) {
  if (run) return t(RUN_STATUS[run.status]);
  if (outcome === "captured") return t("webhooks.testReceived");
  if (outcome === "duplicate") return t("webhooks.duplicate");
  if (outcome === "ignored") return t("webhooks.ignored");
  if (outcome === "rejected") return t("webhooks.rejected");
  return t("webhooks.accepted");
}

export function terminalCommand(credential: WebhookCredential) {
  return `curl -sS '${credential.url}' --json '{"task":"A customer wrote: This app saved me hours. Write a short thank-you reply."}'`;
}

export function WebhookEditor({ webhook, bots, onClose, onCredential }: { webhook?: WebhookTrigger; bots: Bot[]; onClose: () => void; onCredential: (credential: WebhookCredential, webhookId: string) => void }) {
  const { state, dispatch } = useStore();
  const [botId, setBotId] = useState(webhook?.botId ?? bots[0]?.id ?? "");
  const [name, setName] = useState(webhook?.name ?? "");
  const [prompt, setPrompt] = useState(webhook?.prompt ?? "");
  const [runOn, setRunOn] = useState<RoutineRunOn>(webhook?.runOn ?? "maus");
  const [eventTypes, setEventTypes] = useState((webhook?.eventTypes ?? []).join(", "));
  const [maxPendingRuns, setMaxPendingRuns] = useState(webhook?.maxPendingRuns?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const cloudReady = Boolean(state.config?.box.configured && boatCapableEngine(state.instances, bots.find(bot => bot.id === botId)?.modelSelection.instanceId)?.snapshot.state === "available");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.hasAttribute("hidden"));
    (dialog.querySelector<HTMLElement>("[data-initial-focus]") ?? focusable()[0] ?? dialog).focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (!controls.length) return event.preventDefault();
      const first = controls[0]!;
      const last = controls[controls.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", onKey);
    return () => {
      dialog.removeEventListener("keydown", onKey);
      if (previousFocus?.getClientRects().length) previousFocus.focus();
      else document.querySelector<HTMLElement>('summary[aria-label="Create an automation"]')?.focus();
    };
  }, []);

  const save = async () => {
    const bot = bots.find((candidate) => candidate.id === botId);
    const pendingLimit = webhookMaxPendingRunsInput(maxPendingRuns);
    if (pendingLimit === undefined) {
      setError(t("webhooks.editor.pendingLimitError", { max: WEBHOOK_MAX_PENDING_RUNS_LIMIT }));
      return;
    }
    const input: WebhookTriggerInput = { name: name.trim() || suggestedName(prompt, bot), prompt: prompt.trim(), botId, runOn, ...webhookActivationDefaults(webhook), eventTypes: eventTypes.split(",").map((value) => value.trim()).filter(Boolean), maxPendingRuns: pendingLimit };
    setSaving(true);
    setError("");
    try {
      const response = await api(webhook ? `/api/webhooks/${webhook.id}` : "/api/webhooks", { method: webhook ? "PATCH" : "POST", body: JSON.stringify(input) });
      dispatch({ type: "webhookPatched", webhook: response.webhook });
      onClose();
      if (response.credential) onCredential(response.credential, response.webhook.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={webhook ? t("webhooks.editor.edit") : t("routines.newWebhook")} tabIndex={-1} className="flex max-h-[90vh] w-full max-w-[590px] flex-col overflow-hidden rounded-2xl border border-hairline/60 bg-panel shadow-2xl">
        <div className="flex items-start justify-between border-b border-hairline/40 px-5 py-4"><div><div className="text-[17px] font-semibold text-ink">{webhook ? t("webhooks.editor.edit") : t("routines.newWebhook")}</div><div className="mt-1 text-[12px] text-ink-secondary">{t("webhooks.editor.subtitle")}</div></div><button onClick={onClose} aria-label={t("webhooks.editor.close")} className="rounded-lg p-2 text-ink-secondary hover:bg-raised hover:text-ink"><X size={18} /></button></div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <div><div className="mb-2 text-[12px] font-medium text-ink-secondary">{t("webhooks.editor.whoReceives")}</div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{bots.map((bot) => <button key={bot.id} type="button" data-initial-focus={botId === bot.id ? "" : undefined} onClick={() => setBotId(bot.id)} className={cn("flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left", botId === bot.id ? "border-accent/70 bg-accent/10" : "border-hairline/50 bg-inset hover:bg-raised/60")}><BotAvatar bot={bot} state={botId === bot.id ? "happy" : "idle"} size={38} animated={false} /><span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{bot.name}</span></button>)}</div></div>
          <div className="rounded-xl border border-accent/20 bg-accent/5 px-3.5 py-3 text-[11.5px] leading-relaxed text-ink-secondary">{t("triggers.requestTask")} <code className="text-ink">{JSON.stringify({ task: t("triggers.sampleTask") })}</code>. {t("triggers.keepsSetup")}</div>
          <details className="group rounded-xl border border-hairline/45 bg-inset/45 px-4 py-3" open={Boolean(webhook)}>
            <summary className="cursor-pointer text-[12.5px] font-medium text-ink">{t("triggers.advanced")}</summary>
            <div className="mt-4 space-y-4">
              <label className="block"><span className="mb-1.5 block text-[11.5px] font-medium text-ink-secondary">{t("botSettings.simple.name")} <span className="font-normal">· {t("avatarGeneration.optional")}</span></span><input value={name} onChange={(event) => setName(event.target.value)} placeholder={suggestedName(prompt, bots.find((bot) => bot.id === botId))} className="w-full rounded-xl border border-hairline/60 bg-panel px-3.5 py-2.5 text-[13px] text-ink outline-none placeholder:text-ink-tertiary focus:border-accent/70" /></label>
              <label className="block"><span className="mb-1.5 block text-[11.5px] font-medium text-ink-secondary">{t("webhooks.editor.defaultInstructions")} <span className="font-normal">· {t("avatarGeneration.optional")}</span></span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={3} placeholder={t("webhooks.editor.instructionsPlaceholder")} className="w-full resize-y rounded-xl border border-hairline/60 bg-panel px-3.5 py-3 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-tertiary focus:border-accent/70" /><span className="mt-1.5 block text-[10.5px] leading-relaxed text-ink-secondary">{t("webhooks.editor.instructionsHint")}</span></label>
              <div><div className="mb-2 text-[11.5px] font-medium text-ink-secondary">{t("webhooks.editor.runOn")}</div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setRunOn("maus")} className={cn("rounded-xl border p-3 text-left", runOn === "maus" ? "border-accent/70 bg-accent/10" : "border-hairline/50 bg-panel hover:bg-raised/60")}><div className="flex items-center gap-2 text-[12.5px] font-medium text-ink"><Laptop size={14} />{t("routines.runsOn.local")}</div></button><button type="button" disabled={!cloudReady && runOn !== "cloud"} onClick={() => setRunOn("cloud")} className={cn("rounded-xl border p-3 text-left disabled:cursor-not-allowed disabled:opacity-45", runOn === "cloud" ? "border-accent/70 bg-accent/10" : "border-hairline/50 bg-panel hover:bg-raised/60")}><div className="flex items-center gap-2 text-[12.5px] font-medium text-ink"><Cloud size={14} />{t("triggers.cloudVm")}</div></button></div></div>
              <label className="block"><span className="mb-1.5 block text-[11.5px] font-medium text-ink-secondary">{t("webhooks.editor.onlyAcceptTypes")} <span className="font-normal">· {t("avatarGeneration.optional")}</span></span><input value={eventTypes} onChange={(event) => setEventTypes(event.target.value)} placeholder="push, workflow_run" className="w-full rounded-xl border border-hairline/60 bg-panel px-3.5 py-2.5 text-[13px] text-ink outline-none placeholder:text-ink-tertiary focus:border-accent/70" /><span className="mt-1.5 block text-[10.5px] text-ink-secondary">{t("webhooks.editor.eventTypesHint")}</span></label>
              <label className="block"><span className="mb-1.5 block text-[11.5px] font-medium text-ink-secondary">{t("webhooks.editor.pendingLimit")} <span className="font-normal">· {t("avatarGeneration.optional")}</span></span><input type="number" inputMode="numeric" min={1} max={WEBHOOK_MAX_PENDING_RUNS_LIMIT} step={1} value={maxPendingRuns} onChange={(event) => setMaxPendingRuns(event.target.value)} placeholder={String(WEBHOOK_DEFAULT_MAX_PENDING_RUNS)} className="w-full rounded-xl border border-hairline/60 bg-panel px-3.5 py-2.5 text-[13px] text-ink outline-none placeholder:text-ink-tertiary focus:border-accent/70" /><span className="mt-1.5 block text-[10.5px] text-ink-secondary">{t("webhooks.editor.pendingLimitHint", { count: WEBHOOK_DEFAULT_MAX_PENDING_RUNS })}</span></label>
            </div>
          </details>
          {error && <div className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-3 text-[12px] text-danger">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-hairline/40 px-5 py-4"><button onClick={onClose} className="rounded-xl px-4 py-2 text-[13px] text-ink-secondary hover:bg-raised hover:text-ink">{t("common.cancel")}</button><button disabled={saving || !botId} onClick={() => void save()} className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-40">{saving && <Loader2 size={14} className="animate-spin" />}{webhook ? t("common.save") : t("routines.webhook.empty.create")}</button></div>
      </div>
    </div>
  );
}

export interface ActivityItem { id: string; at: number; outcome: WebhookAttempt["outcome"]; eventName: string; preview: string; reason?: string; run?: RoutineRun }

export function webhookActivity(webhook: WebhookTrigger, webhookAttempts: WebhookAttempt[], routineRuns: RoutineRun[]): ActivityItem[] {
  const runById = new Map(routineRuns.map((run) => [run.id, run]));
  const attemptsByRun = new Set(webhookAttempts.map((attempt) => attempt.runId).filter(Boolean));
  const attempts = webhookAttempts
    .filter((attempt) => attempt.webhookId === webhook.id)
    .map((attempt) => ({
      id: attempt.id,
      at: attempt.receivedAt,
      outcome: attempt.outcome,
      eventName: attempt.eventName || (attempt.outcome === "rejected" ? t("webhooks.rejectedRequest") : t("webhooks.webhookEvent")),
      preview: attempt.preview || "",
      reason: attempt.reason,
      run: attempt.runId ? runById.get(attempt.runId) : undefined,
    }));
  const legacy = routineRuns
    .filter((run) => run.webhookId === webhook.id && !attemptsByRun.has(run.id))
    .map((run) => {
      const summary = deliverySummary(run);
      return { id: run.id, at: run.scheduledFor, outcome: "accepted" as const, eventName: summary.eventName, preview: summary.preview, run };
    });
  return [...attempts, ...legacy].sort((a, b) => b.at - a.at).slice(0, 30);
}

export function useWebhookActions() {
  const { dispatch } = useStore();
  const [credentials, setCredentials] = useState<Record<string, WebhookCredential>>(() =>
    loadWebhookCredentials(webhookCredentialStore()),
  );
  const [working, setWorking] = useState<string | null>(null);
  // A second click can arrive before React paints the disabled state: claim synchronously so rotations cannot race and
  // save a revoked URL.
  const workingRef = useRef(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedKind, setCopiedKind] = useState<"command" | "link">("command");
  const [error, setError] = useState("");

  const invoke = async (webhook: WebhookTrigger, action: "toggle" | "delete") => {
    if (workingRef.current) return;
    workingRef.current = true;
    setWorking(`${webhook.id}:${action}`);
    setError("");
    try {
      if (action === "delete") {
        if (!window.confirm(t("webhooks.confirmDelete", { name: webhook.name }))) return;
        await api(`/api/webhooks/${webhook.id}`, { method: "DELETE" });
        dispatch({ type: "webhookDeleted", webhookId: webhook.id });
        removeWebhookCredential(webhookCredentialStore(), webhook.id);
        setCredentials((current) => {
          const next = { ...current };
          delete next[webhook.id];
          return next;
        });
      } else {
        const enabling = !webhook.enabled;
        if (enabling && webhook.verificationPending) throw new Error(t("webhooks.enableNeedsRequest"));
        const response = await api(`/api/webhooks/${webhook.id}`, { method: "PATCH", body: JSON.stringify({ enabled: enabling, verificationPending: false }) });
        dispatch({ type: "webhookPatched", webhook: response.webhook });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      workingRef.current = false;
      setWorking(null);
    }
  };

  const createAndCopyCommand = async (webhook: WebhookTrigger, replace = false, copy: "command" | "link" = "command") => {
    if (workingRef.current) return;
    workingRef.current = true;
    setWorking(`${webhook.id}:command`);
    setError("");
    try {
      if (replace && !window.confirm(t("webhooks.confirmReplace"))) return;
      let credential = replace ? undefined : credentials[webhook.id];
      if (!credential) {
        const response = await api(`/api/webhooks/${webhook.id}/rotate`, { method: "POST" });
        credential = response.credential;
        dispatch({ type: "webhookPatched", webhook: response.webhook });
        setCredentials((current) => ({ ...current, [webhook.id]: credential! }));
        saveWebhookCredential(webhookCredentialStore(), webhook.id, credential!);
      }
      if (!credential) throw new Error(t("webhooks.commandFailed"));
      if (await copyText(copy === "link" ? credential.url : terminalCommand(credential)) !== "copied") throw new Error(t("common.copyFailed"));
      setCopiedId(webhook.id);
      setCopiedKind(copy);
      setTimeout(() => setCopiedId((current) => current === webhook.id ? null : current), 1_800);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      workingRef.current = false;
      setWorking(null);
    }
  };

  const rememberCredential = (webhookId: string, credential: WebhookCredential) => {
    saveWebhookCredential(webhookCredentialStore(), webhookId, credential);
    setCredentials((current) => ({ ...current, [webhookId]: credential }));
  };

  return { credentials, setCredentials, rememberCredential, working, copiedId, copiedKind, error, setError, invoke, createAndCopyCommand };
}

export function WebhooksPanel({
  bots,
  createRequest,
  onCreateHandled,
}: {
  bots: Bot[];
  createRequest: number;
  onCreateHandled: () => void;
}) {
  const { state, dispatch } = useStore();
  const showThreads = useShowThreads();
  const [editor, setEditor] = useState<WebhookTrigger | "new" | null>(null);
  const { credentials, setCredentials, working, copiedId, error, setError, invoke, createAndCopyCommand } = useWebhookActions();
  const [selectedId, setSelectedId] = useState<string | null>(state.webhooks[0]?.id ?? null);
  const [tab, setTab] = useState<"setup" | "activity">("setup");

  useEffect(() => {
    if (!state.webhooks.length) setSelectedId(null);
    else if (!selectedId || !state.webhooks.some((webhook) => webhook.id === selectedId)) setSelectedId(state.webhooks[0]!.id);
  }, [selectedId, state.webhooks]);

  useEffect(() => {
    if (createRequest > 0) {
      setEditor("new");
      onCreateHandled();
    }
  }, [createRequest, onCreateHandled]);

  const selected = state.webhooks.find((webhook) => webhook.id === selectedId) ?? null;
  const selectedBot = selected ? bots.find((bot) => bot.id === selected.botId) : undefined;
  const activity = useMemo<ActivityItem[]>(
    () => selected ? webhookActivity(selected, state.webhookAttempts, state.routineRuns) : [],
    [selected, state.routineRuns, state.webhookAttempts],
  );

  const ingress = state.webhookIngress;
  const credential = selected ? credentials[selected.id] : undefined;
  const command = credential ? terminalCommand(credential) : "";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-[1120px] space-y-4">
        {error && <div className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-3 text-[12px] text-danger">{error}</div>}
        {ingress && !ingress.available && <div className="flex items-center gap-2 rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-3 text-[12px] text-danger"><span className="size-1.5 shrink-0 rounded-full bg-danger" />{t("webhooks.receiverUnavailable")}{ingress.error ? `: ${ingress.error}` : "."}</div>}

        {state.webhooks.length === 0 ? (
          <div className="border-t border-hairline/40 px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent/10 text-accent"><Send size={23} /></div>
            <h3 className="text-[16px] font-semibold text-ink">{t("routines.webhook.empty.title")}</h3>
            <p className="mx-auto mt-2 max-w-[420px] text-[12.5px] leading-relaxed text-ink-secondary">{t("routines.webhook.empty.description")}</p>
            <button onClick={() => setEditor("new")} disabled={bots.length === 0} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-40"><Plus size={15} />{t("routines.webhook.empty.create")}</button>
            {bots.length === 0 && <p className="mt-3 text-[12px] text-warning">{t("routines.webhook.empty.needBot")}</p>}
          </div>
        ) : selected && (
          <div className="min-h-[580px] overflow-hidden rounded-2xl border border-hairline/45 bg-panel/25 md:grid md:grid-cols-[250px_minmax(0,1fr)]">
            <aside className="border-b border-hairline/40 bg-inset/35 p-2.5 md:border-r md:border-b-0">
              <div className="flex items-center justify-between px-2 py-2">
                <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-secondary">{t("webhooks.yours")}</span>
                <span className="text-[10px] tabular-nums text-ink-secondary">{state.webhooks.length}</span>
              </div>
              <nav className="flex gap-1 overflow-x-auto md:block md:space-y-1 md:overflow-visible">
                {state.webhooks.map((webhook) => {
                  const bot = bots.find((candidate) => candidate.id === webhook.botId);
                  const status = statusFor(webhook);
                  return (
                    <button key={webhook.id} onClick={() => { setSelectedId(webhook.id); setTab("setup"); setError(""); }} className={cn("flex min-w-[210px] items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-colors md:w-full md:min-w-0", webhook.id === selected.id ? "bg-raised text-ink shadow-sm" : "text-ink-secondary hover:bg-raised/55 hover:text-ink")}>
                      {bot ? <BotAvatar bot={bot} state={webhook.enabled ? "idle" : "sleeping"} size={36} animated={false} label={bot.name} /> : <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-raised text-ink-secondary"><Webhook size={16} /></div>}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium">{webhook.name}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[10px]"><span className={cn("size-1.5 rounded-full", status.dot)} /><span className={status.tone}>{status.label}</span></span>
                      </span>
                    </button>
                  );
                })}
              </nav>
            </aside>

            <section className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 md:px-7 md:pt-6">
                <div className="flex min-w-0 items-center gap-3">
                  {selectedBot ? <BotAvatar bot={selectedBot} state={selected.enabled ? "idle" : "sleeping"} size={44} animated={false} label={selectedBot.name} /> : <div className="flex size-11 items-center justify-center rounded-xl bg-raised text-ink-secondary"><Webhook size={18} /></div>}
                  <div className="min-w-0">
                    <h3 className="truncate text-[17px] font-semibold text-ink">{selected.name}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-ink-secondary"><span>{selectedBot?.name ?? t("webhooks.deletedBot")}</span><span>·</span><span>{t(selected.runOn === "cloud" ? "triggers.cloudVm" : "routines.runsOn.local")}</span></div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!selected.verificationPending && <button disabled={Boolean(working)} onClick={() => void invoke(selected, "toggle")} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11.5px] font-medium", selected.enabled ? "bg-raised text-ink-secondary hover:text-ink" : "bg-accent text-white hover:brightness-110")}>{selected.enabled ? <Pause size={13} /> : <Play size={13} />}{selected.enabled ? t("routines.pause") : t("approval.action.enable")}</button>}
                  <details className="relative"><summary className="list-none rounded-lg p-2 text-ink-secondary hover:bg-raised hover:text-ink"><MoreHorizontal size={17} /></summary><div className="absolute right-0 top-full z-20 mt-1 w-[180px] rounded-xl border border-hairline/50 bg-card p-1.5 shadow-2xl"><button onClick={() => setEditor(selected)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-ink hover:bg-raised">{t("triggers.editSettings")}</button><button onClick={() => void invoke(selected, "delete")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] text-danger hover:bg-danger/10"><Trash2 size={13} />{t("common.delete")}</button></div></details>
                </div>
              </div>

              <div className="mt-5 flex gap-5 border-b border-hairline/35 px-5 md:px-7">
                <button onClick={() => setTab("setup")} className={cn("border-b-2 px-0.5 pb-3 text-[12px] font-medium", tab === "setup" ? "border-accent text-ink" : "border-transparent text-ink-secondary hover:text-ink")}>{t("vm.setup.title")}</button>
                <button onClick={() => setTab("activity")} className={cn("flex items-center gap-1.5 border-b-2 px-0.5 pb-3 text-[12px] font-medium", tab === "activity" ? "border-accent text-ink" : "border-transparent text-ink-secondary hover:text-ink")}>{t("activity.title")}{activity.length > 0 && <span className="rounded-full bg-raised px-1.5 py-0.5 text-[9px] tabular-nums text-ink-secondary">{activity.length}</span>}</button>
              </div>

              {tab === "setup" ? (
                <div className="px-5 py-6 md:px-7">
                  <div className="max-w-[720px]">
                    <h4 className="text-[14px] font-semibold text-ink">{t("webhooks.sendTask")}</h4>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-ink-secondary">{t("webhooks.sendTaskHint", { name: selectedBot?.name ?? t("webhooks.thisMaus") })}</p>
                    {credential ? (
                      <div className="mt-4 overflow-hidden rounded-xl border border-hairline/45 bg-inset">
                        <div className="flex items-center justify-between border-b border-hairline/45 px-3.5 py-2"><span className="text-[9.5px] font-medium uppercase tracking-wider text-ink-secondary">{t("engineSetup.terminal")}</span><div className="flex items-center gap-1"><button onClick={() => void createAndCopyCommand(selected)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10.5px] font-medium text-ink-secondary hover:bg-raised hover:text-ink">{copiedId === selected.id ? <Check size={12} className="text-success" /> : <Copy size={12} />}{copiedId === selected.id ? t("triggers.copied") : t("engineSetup.copyCommand")}</button><button onClick={() => void createAndCopyCommand(selected, true)} className="rounded-lg p-1.5 text-ink-secondary hover:bg-raised hover:text-ink" title={t("triggers.rotateUrl")}><RotateCw size={12} /></button></div></div>
                        <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-ink-secondary">{command}</pre>
                      </div>
                    ) : (
                      <div className="mt-4">
                        <p className="max-w-[560px] text-[10.5px] leading-relaxed text-ink-secondary">{t("webhooks.privateUrlHint")}</p>
                        <button disabled={Boolean(working) || !ingress?.available} onClick={() => void createAndCopyCommand(selected)} className="mt-3 flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2.5 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40">{working === `${selected.id}:command` ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}{t("webhooks.generateUrl")}</button>
                      </div>
                    )}
                    <div className="mt-3 flex items-start gap-2 text-[10.5px] leading-relaxed text-ink-secondary"><Laptop size={12} className="mt-0.5 shrink-0" /><span>{t("webhooks.keepOpen")}</span></div>

                    {selected.verificationSample && !selected.enabled && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-success/20 bg-success/5 px-3.5 py-3"><div><div className="flex items-center gap-2 text-[11.5px] font-medium text-success"><Check size={13} />{t("webhooks.requestReceived")}</div><p className="mt-1 max-w-[520px] truncate font-mono text-[10px] text-ink-secondary">{selected.verificationSample.preview || t("triggers.emptyPayload")}</p></div><button disabled={Boolean(working)} onClick={() => void invoke(selected, "toggle")} className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[11px] font-medium text-white hover:brightness-110"><Play size={12} />{t("mcp.turnOn")}</button></div>}

                    <div className="mt-7 border-t border-hairline/35 pt-5">
                      <div className="grid gap-4 text-[11.5px] sm:grid-cols-2"><div><div className="text-[10px] uppercase tracking-wider text-ink-secondary">{t("webhooks.tasksGoTo")}</div><div className="mt-1.5 font-medium text-ink">{selectedBot?.name ?? t("webhooks.deletedBot")}</div></div><div><div className="text-[10px] uppercase tracking-wider text-ink-secondary">{t("routines.drawer.runsOn")}</div><div className="mt-1.5 font-medium text-ink">{t(selected.runOn === "cloud" ? "triggers.cloudVm" : "routines.runsOn.local")}</div></div></div>
                    </div>

                    <details className="group mt-5 border-t border-hairline/35 pt-4"><summary className="flex cursor-pointer list-none items-center justify-between text-[11.5px] font-medium text-ink"><span>{t("organization.advanced")}</span><ChevronDown size={14} className="text-ink-secondary transition-transform group-open:rotate-180" /></summary><div className="mt-4 space-y-3 text-[10.5px] leading-relaxed text-ink-secondary">{selected.prompt ? <p><span className="font-medium text-ink">{t("triggers.defaultInstruction")}</span> {selected.prompt}</p> : <p>{t("triggers.requestInstruction")}</p>}{selected.eventTypes?.length ? <p><span className="font-medium text-ink">{t("triggers.acceptedEvents")}</span> {selected.eventTypes.join(", ")}</p> : <p>{t("triggers.allEvents")}</p>}<p><span className="font-medium text-ink">{t("triggers.pendingTasks")}</span> {t("triggers.pendingTasksHelp", { count: selected.maxPendingRuns ?? WEBHOOK_DEFAULT_MAX_PENDING_RUNS })}</p><button onClick={() => setEditor(selected)} className="rounded-lg border border-hairline/50 px-3 py-2 text-[11px] font-medium text-ink hover:bg-raised">{t("triggers.editSettings")}</button></div></details>
                  </div>
                </div>
              ) : (
                <div className="px-5 py-5 md:px-7">
                  <div className="mb-3"><h4 className="text-[13px] font-semibold text-ink">{t("triggers.recentDeliveries")}</h4><p className="mt-1 text-[10.5px] text-ink-secondary">{t("webhooks.deliveriesHint")}</p></div>
                  <div className="border-t border-hairline/35">
                    {activity.length === 0 ? <div className="px-2 py-12 text-center text-[11.5px] text-ink-secondary">{t("webhooks.noRequests")}</div> : activity.map((item) => (
                      <div key={item.id} className="flex items-center gap-2.5 border-b border-hairline/25 px-1 py-3.5">
                        <span className={cn("size-2 shrink-0 rounded-full", item.outcome === "rejected" || item.run?.status === "failed" ? "bg-danger" : item.run && ["queued", "running", "waiting"].includes(item.run.status) ? "animate-pulse bg-accent" : item.outcome === "ignored" || item.outcome === "duplicate" ? "bg-ink-secondary/50" : "bg-success")} />
                        <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5 text-[11.5px]"><span className="truncate font-medium text-ink">{item.eventName}</span><span className="shrink-0 text-ink-secondary">· {relativeTime(item.at)}</span></div><div className="mt-0.5 truncate font-mono text-[10px] text-ink-tertiary">{item.reason || item.preview || t("triggers.emptyPayload")}</div></div>
                        <span className={cn("shrink-0 text-[10px] font-medium", outcomeTone(item.outcome, item.run))}>{outcomeLabel(item.outcome, item.run)}</span>
                        {item.run?.threadId && selectedBot && <button onClick={() => openBotThread(dispatch, selectedBot, item.run!.threadId!, showThreads)} className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] text-ink-secondary hover:bg-raised hover:text-ink" title={t("webhooks.openInChatTitle")}><ExternalLink size={11} />{t("canvas.openChat")}</button>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
      {editor && <WebhookEditor webhook={editor === "new" ? undefined : editor} bots={bots} onClose={() => setEditor(null)} onCredential={(newCredential, webhookId) => { saveWebhookCredential(webhookCredentialStore(), webhookId, newCredential); setCredentials((current) => ({ ...current, [webhookId]: newCredential })); setSelectedId(webhookId); setTab("setup"); }} />}
    </div>
  );
}
