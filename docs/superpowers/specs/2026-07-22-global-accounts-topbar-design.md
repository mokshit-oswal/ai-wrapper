# AI Wrapper — Global accounts + top bar chrome

**Date:** 2026-07-22  
**Status:** Approved for planning  
**Approach:** UI + prefs only (no account-storage flatten)

## Problem

Account Add / Rename / Remove / Clear session live in the sidebar and are scoped to the **currently selected platform**. Switching ChatGPT → Claude hides other platforms’ accounts, so users cannot see or jump to every account from one place.

## Goals

1. Move account management controls into a **full-width top bar**.
2. Show **all accounts across all platforms** in the sidebar.
3. Selecting an account opens that account on **its** platform.
4. Apply a **dark theme** to the shell chrome.
5. Make the **sidebar width adjustable** (drag) and persist it.

## Non-goals

- Flattening `config.platforms.*.accounts` into a global array
- Code signing / notarization
- New platforms
- Workspace browse/search/attach changes
- Changing platform webview theming (sites keep their own UI)

## Shell layout

```
┌─────────────────────────────────────────────────────────────┐
│ Top bar (full width)                                        │
│  AI Wrapper | Platform▾ | Label | Add Rename Remove Clear   │
│                                          status…            │
├────────────────┬──┬─────────────────────────────────────────┤
│ Sidebar        │║ │ WebContentsView (active account)        │
│  Platforms     │║ │                                         │
│  All accounts  │║ │                                         │
│  Workspace     │║ │                                         │
└────────────────┴──┴─────────────────────────────────────────┘
         ▲ resize handle
```

- **Top bar:** app title, platform `<select>` (used when adding), label input, **Add**, **Rename**, **Remove**, **Clear session**, status text.
- **Sidebar:** Platforms list → **All accounts** (every account) → Workspace (existing controls unchanged).
- **Resize handle:** drag between sidebar and webview; width clamped (recommended **200–480px**, default **~280**).
- **Theme:** dark shell CSS variables for chrome only.

## Account & platform behavior

| Action | Behavior |
|--------|----------|
| Click account in All accounts | Set active platform + account; show that webview; sync platform rail + top-bar label |
| Click platform in rail | Open that platform’s **last-used** account, or **first** account if none recorded; sync selection |
| Add | Create account on platform chosen in top-bar **Platform** select + current label; select and show it |
| Rename | Rename **currently selected** account to label input |
| Remove | Confirm, then remove selected account + clear partition (existing semantics) |
| Clear session | Clear selected account’s partition storage; keep account record |

### Fallback after Remove

1. Another account on the same platform, else  
2. Any other account globally, else  
3. No webview / empty state.

### No selection

Rename / Remove / Clear with no selected account → status message, no-op.

## Account list presentation

- Flatten accounts from all platforms for display only.
- Label format: **`{label} · {platformLabel}`** (e.g. `Work · Claude`).
- Active account highlighted; active platform highlighted independently in the Platforms section.

## Prefs / config

Extend `prefs` (backward-compatible load):

```ts
prefs: {
  lastPlatform: PlatformId
  lastAccountId: string | null
  lastAccountIdByPlatform: Partial<Record<PlatformId, string | null>>
  sidebarWidth: number
}
```

- Missing keys on old `config.json` → defaults (`sidebarWidth` default ~280; per-platform map empty).
- On successful `showAccount`, update `lastPlatform`, `lastAccountId`, and `lastAccountIdByPlatform[platformId]`.
- Persist `sidebarWidth` when the user finishes a resize (mouseup / drag end).

Account records remain nested under `platforms[platformId].accounts`.

## Webview bounds

Main process must size the active `WebContentsView` using:

- `x` = current sidebar width  
- `y` = top bar height  
- `width` = window width − sidebar width  
- `height` = window height − top bar height  

Renderer reports live sidebar width + top-bar height (or a fixed CSS height constant shared with main) on resize / layout changes via existing `sessions:setBounds` (or a thin wrapper). Replace the hard-coded `SIDEBAR_WIDTH = 320` assumption in main + renderer.

## Implementation touchpoints

| Area | Files |
|------|--------|
| Types / defaults / load | `src/shared/types.ts`, `src/main/default-config.ts`, `src/main/config-store.ts` |
| Prefs updates on show/remove | `src/main/ipc.ts`, `src/main/account-service.ts` as needed |
| Bounds / restore | `src/main/index.ts`, session bounds IPC |
| Shell UI | `src/renderer/App.ts`, `src/renderer/styles.css` |
| Smoke | `scripts/smoke-add-account.mjs` (Add button now in top bar) |
| Docs | README usage bullets if account UX is described |

## Testing

- Unit: config-store accepts old prefs and fills new fields; sidebar width clamp helper if extracted.
- Smoke: launch → Add account still finds control and creates an account.
- Manual: global list shows cross-platform accounts; click jumps platform; platform rail restores last-used; resize persists after quit; dark chrome readable; Remove/Clear/Rename on selected account.

## Success criteria

- User can see every account without switching platforms first.
- Add / Rename / Remove / Clear live in the top bar with an explicit platform picker for Add.
- Dark shell + drag-resizable sidebar width that survives restart.
- Existing partition isolation and workspace assist behavior unchanged.
