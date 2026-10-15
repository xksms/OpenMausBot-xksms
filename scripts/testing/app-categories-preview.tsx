import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { PluginsPanel } from "../../src/components/PluginsPanel";
import { StoreProvider, useStore } from "../../src/state/store";
import { setAnalyticsEnabled } from "../../src/lib/analytics";
import { setLocale } from "../../src/lib/i18n";
import { applySkin } from "../../src/lib/skins";
import { CONNECTED_APPS_CACHE_KEY, writeCachedInventory } from "../../src/lib/connected-apps-cache";
import "../../src/styles.css";

function Preview() {
  const { state, dispatch } = useStore();
  useEffect(() => { dispatch({ type: "togglePlugins", open: true, surface: "apps" }); }, [dispatch]);
  return <main className="p-8">
    <button onClick={() => dispatch({ type: "togglePlugins", open: true, surface: "apps" })}>打开应用</button>
    {state.pluginsOpen && <PluginsPanel />}
  </main>;
}

setAnalyticsEnabled(false);
const params = new URL(location.href).searchParams;
setLocale(params.get("lang") ?? "zh");
const inventory = params.get("inventory");
if (inventory === "cold") localStorage.removeItem(CONNECTED_APPS_CACHE_KEY);
if (inventory === "warm" || inventory === "fresh") {
  writeCachedInventory({ github: { connected: true, pending: false, status: "ACTIVE", accounts: [{ id: "ca_fixture", alias: "测试账号", status: "ACTIVE" }] } }, Date.now() - (inventory === "warm" ? 10 * 60_000 : 60_000));
}
applySkin("daylight");
createRoot(document.getElementById("root")!).render(<StoreProvider><Preview /></StoreProvider>);
