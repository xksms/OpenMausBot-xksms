import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONNECTED_APPS_CACHE_KEY } from "@/lib/connected-apps-cache";

const fixture = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/state/store", () => ({ api: fixture.request, useStore: vi.fn() }));

const now = Date.UTC(2026, 9, 15, 6);
const services = { github: { connected: true, pending: false, status: "ACTIVE", accounts: [{ id: "ca_fixture", status: "ACTIVE" }] } };
let saved: Map<string, string>;
let preload: typeof import("./PluginsPanel")["preloadConnectedApps"];
const seed = (at = now - 60_000, value = services) => saved.set(CONNECTED_APPS_CACHE_KEY, JSON.stringify({ at, services: value }));

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  fixture.request.mockReset();
  saved = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  });
  ({ preloadConnectedApps: preload } = await import("./PluginsPanel"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("reusing the connected-app inventory", () => {
  it("uses a recent persisted result immediately after a renderer reload", async () => {
    seed();
    expect(await preload()).toEqual({ services, authoritative: true });
    expect(fixture.request).not.toHaveBeenCalled();
    expect(JSON.parse(saved.get(CONNECTED_APPS_CACHE_KEY)!).at).toBe(now - 60_000);
  });

  it("deduplicates a slow revalidation when an expired inventory is reopened", async () => {
    seed(now - 10 * 60_000);
    let release!: (value: unknown) => void;
    fixture.request.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const first = preload();
    expect(preload()).toBe(first);
    expect(fixture.request).toHaveBeenCalledExactlyOnceWith("/api/connectors/connected", { timeoutMs: 10_000 });
    expect(JSON.parse(saved.get(CONNECTED_APPS_CACHE_KEY)!).services).toEqual(services);
    release({ services: {} });
    expect(await first).toEqual({ services: {}, authoritative: true });
  });

  it("does not extend freshness just because a cached inventory was read", async () => {
    seed(now);
    vi.setSystemTime(now + 4 * 60_000);
    await preload();
    vi.setSystemTime(now + 5 * 60_000 + 1);
    fixture.request.mockResolvedValue({ services });
    await preload();
    expect(fixture.request).toHaveBeenCalledOnce();
  });

  it("bypasses a recent cache while authorization is pending", async () => {
    seed(now, { github: { ...services.github, pending: true } });
    fixture.request.mockResolvedValue({ services });
    await preload();
    expect(fixture.request).toHaveBeenCalledOnce();
  });

  it("lets manual refresh replace a recent connected account with an authoritative empty list", async () => {
    seed();
    await preload();
    fixture.request.mockResolvedValue({ services: {} });
    expect(await preload(true)).toEqual({ services: {}, authoritative: true });
    expect(await preload()).toEqual({ services: {}, authoritative: true });
    expect(fixture.request).toHaveBeenCalledOnce();
    expect(JSON.parse(saved.get(CONNECTED_APPS_CACHE_KEY)!)).toEqual({ at: now, services: {} });
  });

  it("keeps the last known accounts and timestamp when revalidation fails", async () => {
    seed();
    fixture.request.mockRejectedValue(new Error("offline"));
    expect(await preload(true)).toEqual({ services, authoritative: false });
    expect(JSON.parse(saved.get(CONNECTED_APPS_CACHE_KEY)!)).toEqual({ at: now - 60_000, services });
    fixture.request.mockResolvedValue({ services: {} });
    expect(await preload()).toEqual({ services: {}, authoritative: true });
    expect(fixture.request).toHaveBeenCalledTimes(2);
  });

  it("keeps cached accounts when the credential store cannot be read", async () => {
    seed();
    fixture.request.mockResolvedValue({ credentialStore: "unavailable", services: {} });
    expect(await preload(true)).toEqual({ services, authoritative: false });
    expect(JSON.parse(saved.get(CONNECTED_APPS_CACHE_KEY)!).services).toEqual(services);
  });

  it("does not invent disconnected state after a failed first check and can retry", async () => {
    fixture.request.mockRejectedValueOnce(new Error("timed out"));
    expect(await preload()).toEqual({ services: {}, authoritative: false });
    expect(saved.has(CONNECTED_APPS_CACHE_KEY)).toBe(false);
    fixture.request.mockResolvedValue({ services });
    expect(await preload()).toEqual({ services, authoritative: true });
  });
});
