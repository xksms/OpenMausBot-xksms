# Connected-app inventory reuse

Run with Node 24 or newer:

```sh
node --experimental-strip-types scripts/verify-app-inventory.ts
```

The printed page mounts the real Apps modal against a disposable fake-engine
workspace and a synthetic inventory delayed by 20 seconds. The fixture reads
no live connections and disables remote logos. Its control route is
`/__inventory-fixture` on the printed preview origin only.

- Open the preview with `?inventory=warm`. It seeds a ten-minute-old GitHub
  account. The account and Add account button appear while revalidation waits.
  Close and reopen the modal before ten seconds pass. No Checking labels
  appear; the control route's request count stays at one.
- After ten seconds, the cached account remains and the stale-result notice
  appears. Failure must not erase the account or make the whole list unavailable.
- POST `{"delayMs":0,"services":{}}` to the fixture control route, then click
  Refresh. The old account disappears and GitHub offers Connect.
- Open a new renderer at `?inventory=fresh`. The recent persisted result
  appears without incrementing the inventory request count. Reopening the
  modal also makes no inventory request.
- POST `{"delayMs":20000}` to the fixture control route and open a new renderer
  at `?inventory=cold`. Without a cache, Checking becomes Unavailable after ten
  seconds. Switching to Connected offers Retry, not a false empty inventory.

Stop the foreground process with Ctrl-C. The fixture home is disposable; the
printed server log is retained. This verifies renderer caching and timeout
behaviour, not a live provider's latency.

```sh
pnpm exec vitest run src/components/PluginsPanel.inventory.test.ts src/components/PluginsPanel.test.ts src/components/PluginsPanel.navigation.test.ts src/lib/connected-apps-cache.test.ts src/components/bot-settings/useBotApps.test.ts
pnpm typecheck
```
