# Apps category menu and Chinese labels

Run with Node 24 or newer from the repository root:

```sh
node --experimental-strip-types scripts/verify-app-categories.ts
```

Open the printed `previewUrl` in a browser. The page mounts the real Apps
modal against a disposable fake-engine workspace. The checked-in metadata
sample contains 101 provider categories and 94 common apps, including those
in the reported screenshots. No provider credentials or user data are read.
Append `?lang=en` to inspect the English labels.

To verify an already captured public catalogue response containing `cards`,
pass `--catalog PATH.json`. The fixture serves only the supplied app metadata;
logos are disabled and no requests reach upstream services.

- Open More categories. Check the inline categories and all menu labels
  in Chinese, with product names retained and known app descriptions translated.
  Apps without a specific translation show a Chinese category summary, labelled
  用途. Hover a description to read its provider source under 原文说明.
- Check desktop and narrow viewports. The menu stays inside the viewport,
  starts beside its trigger, and scrolls when its list exceeds the space below
  or above the trigger.
- Press Escape while the trigger or an item has focus. Only the menu closes;
  the Apps modal remains open and focus returns to the trigger.
- Reopen with ArrowDown. Use End to reach the final item, then Enter to select
  it. The heading and app list match that category.
- Reopen and click a category, then verify its heading and matching app. Click
  the search field to dismiss the menu without changing the category.

Stop the foreground launcher with Ctrl-C to remove its temporary workspace.
This checks renderer layout, translations and filtering; it does not qualify
real OAuth flows or an installed desktop package.

Focused automated checks:

```sh
pnpm exec vitest run src/lib/app-catalog-copy.test.ts src/components/PluginsPanel.i18n.test.ts src/components/PluginsPanel.navigation.test.ts src/components/SidebarPopoverMenu.anchored.test.ts src/components/SidebarPopoverMenu.test.ts src/lib/app-catalog.test.ts
pnpm typecheck
pnpm i18n:check
```
