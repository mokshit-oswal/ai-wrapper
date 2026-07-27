# ThinkAI — Notes-centric shell redesign

**Date:** 2026-07-27  
**Status:** Approved for planning  
**Product rename:** AI Wrapper → **ThinkAI**  
**Approach:** Notes-centric UI rebuild on top of the existing multi-account webview core (no API chat)

## Problem

The current app is a webview **wrapper** for ChatGPT / Claude / Gemini / etc. Users want ThinkAI to feel like a **local notes workspace** that sits beside those same signed-in web sessions, with durable links from a note to a specific chat — without API keys or a custom chat backend.

Official OpenAI / Anthropic APIs require separate billed API accounts and do not use Google sign-in. The user will not use API keys now or later. Therefore chat remains the embedded official web UIs; notes and linking are owned by ThinkAI locally.

## Goals

1. Rebrand the app to **ThinkAI** (display name, window title, docs/README product name).
2. Make **local markdown notes** the primary center-stage experience.
3. Keep the **top bar** account-management structure; bump chrome/nav text to about **13px**.
4. Left sidebar: stacked collapsible **Accounts** (above) and **Notes** (below).
5. User picks a folder of `.md` files; notes are real files on disk.
6. **One note ↔ one chat** link via capture-current-URL or paste-URL.
7. Persist link in **YAML frontmatter** and a visible `[Linked chat](...)` body line.
8. **Side-by-side toggle** anytime (notes | webview); opening a link switches account, navigates to the chat URL, and enables split if needed.
9. Preserve existing multi-account partitions, Google sign-in, workspace grant/search/copy/prepare-attach.

## Non-goals (v1)

- Custom chat UI backed by OpenAI / Anthropic APIs
- API keys, OAuth-to-API bridges, or unofficial reverse-engineered web backends
- Nested note folders, cloud sync, or multi-device note sync
- Rich WYSIWYG editing (markdown only)
- Auto-injecting prompts into site composers / auto-sending chats
- Changing session/partition isolation semantics
- Code signing / notarization

## Product shell & information architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│ Top bar (~13px chrome text)                                          │
│  ThinkAI | Platform▾ | Label | Add Rename Remove Clear | Split | … │
├────────────────┬──┬──────────────────────────────────────────────────┤
│ Sidebar        │║ │ Center stage                                     │
│ ▼ Accounts     │║ │  [Notes editor]  │  [Webview]   ← when split on  │
│   …            │║ │  or notes-only / soft empty when no note         │
│ ▼ Notes        │║ │                                                  │
│   note.md 🔗   │║ │                                                  │
│   …            │║ │                                                  │
│ Workspace …    │║ │                                                  │
└────────────────┴──┴──────────────────────────────────────────────────┘
```

- **Top bar:** Same management controls as today (platform select, label, Add / Rename / Remove / Clear session, status). Add **side-by-side toggle** (and optional notes-folder affordance if not only in sidebar). Product title: ThinkAI. Font size for nav/chrome labels ≈ **13px**.
- **Sidebar:** Collapsible **Accounts** section (platform rail + all accounts, existing selection rules). Collapsible **Notes** section (list from notes folder, link badge when linked). Workspace controls remain available and must not be removed.
- **Center:** Notes-first. Selecting a note opens the markdown editor. Split mode shows notes pane | active account `WebContentsView`. Without a selected note, show a calm empty state; accounts/webview still usable when split is on or when user focuses chat.

### Cold start

1. If `notesFolderPath` is unset → prompt to choose a Notes folder before the list is useful.
2. Empty folder → “New note” CTA.
3. Existing accounts/sessions behave as today on first launch after upgrade.

## Notes data model

### Folder

- User manually selects a directory of markdown notes.
- Path persisted in app prefs (`notesFolderPath`).
- v1 lists **top-level `*.md` only** (no recursive nested folders).
- User may change folder later from Notes chrome / settings-equivalent control.

### File format

```markdown
---
title: Sprint planning
chat_url: https://chatgpt.com/c/example
account_id: <account-uuid>
platform: chatgpt
linked_at: 2026-07-27T16:00:00.000Z
---

[Linked chat](https://chatgpt.com/c/example)

Note body in markdown…
```

| Field | Role |
|-------|------|
| `title` | Display title in sidebar/editor; may default from filename stem when missing |
| `chat_url` | Target URL for open-link |
| `account_id` | ThinkAI account record to activate |
| `platform` | Platform id for fallback matching |
| `linked_at` | ISO timestamp of last successful link |

- **Cardinality:** exactly one chat link per note. Re-link replaces frontmatter fields and updates/replaces the auto-managed `[Linked chat](...)` line.
- **Unlink:** clears link-related frontmatter keys and removes the auto-managed body line; leaves the rest of the body intact.
- **Create / rename / delete** map to filesystem operations on `.md` files.
- **External edits:** refresh listing on window focus; optional lightweight directory watch. If the open buffer is dirty and the file changed on disk, keep the buffer and warn (do not silently overwrite).

### Editor

- Markdown source editing (title + body).
- v1 is **edit-first**; a light preview is optional, not required to ship.
- Autosave on debounce and/or blur to the `.md` file (preserve frontmatter round-trip).

## Chat linking behavior

| Action | Behavior |
|--------|----------|
| Link to current chat | Read active webview URL + current account/platform; write frontmatter + body link line |
| Paste chat URL | User supplies URL; confirm/use current account (or prompt if needed); same write path |
| Open linked chat | Activate `account_id` session (fallback: match `platform` + ask user if missing); `loadURL(chat_url)`; enable side-by-side if off; select that note |
| Unlink | Clear link metadata + auto body line |

### URL quality

Deep links only work when the site exposes a stable chat URL. If capture returns a generic homepage / login / non-chat URL, **warn** and offer the paste flow instead of silently saving a weak link.

### Platforms

Linking is available for **any** platform account that has an active webview URL (ChatGPT, Claude, Gemini, etc.). Quality of deep links may vary by site; ThinkAI does not scrape or call unofficial backends.

## Side-by-side layout

- Toggle available anytime — linked or not.
- Default split roughly 50/50; user-draggable divider between notes pane and webview.
- Persist `notesSplitEnabled` and `notesPaneWidth` (or equivalent ratio) in prefs.
- Selecting an account while split is on updates the chat half without dismissing the notes pane.
- Opening a linked note forces split on so note + chat appear together.

### Layout math (sketch)

Extend existing `sessionContentBounds` (or sibling helpers). Center-stage modes:

| Mode | Notes pane | WebContentsView |
|------|------------|-----------------|
| Split on | Left portion of center stage (renderer) | Right remainder |
| Split off + note selected | Full center stage | Hidden / zero bounds |
| Split off + no note selected | Empty state or hidden | Full center stage (today’s behavior) |

Exact pixel helpers live in shared layout utilities and are unit-tested.

## Architecture

Three layers (unchanged Electron shape, new notes domain):

1. **Main process** — existing BrowserWindow, account registry, session partitions, workspace IPC; new **notes-service** (choose folder, list, read, write, rename, delete, watch/refresh hooks, frontmatter parse/serialize, link apply/unlink helpers).
2. **Renderer (ThinkAI shell)** — notes-first UI: stacked Accounts + Notes sidebar, markdown editor, split toggle, top bar at ~13px, webview host layout coordinated with main.
3. **Isolated web sessions** — unchanged `persist:` partitions per account; Google sign-in stays inside each platform’s official site.

```
┌─────────────────────────────────────┐
│ Renderer: ThinkAI shell             │
│  top bar · sidebar · notes editor   │
│  split host for WebContentsView     │
└──────────────┬──────────────────────┘
               │ IPC
               ▼
┌─────────────────────────────────────┐
│ Main: config · accounts · sessions  │
│       workspace · notes-service     │
└──────────────┬──────────────────────┘
               │
     ┌─────────┴─────────┐
     ▼                   ▼
 User Notes folder    Chromium partitions
 (*.md on disk)       (per-account cookies)
```

### Config / prefs additions

Add to app config prefs (names may match implementation style):

- `notesFolderPath: string | null`
- `notesSplitEnabled: boolean`
- `notesPaneWidth: number` (or split ratio)
- `lastNotePath: string | null`

Account/platform storage shape stays as today.

### Branding touchpoints

- `package.json` / Electron `productName` / window title → ThinkAI
- README and in-app title strings → ThinkAI
- Keep repo folder name as-is unless packaging requires a separate app id change; if `appId` changes, document it in the implementation plan (avoid breaking existing user data paths without a migration note).

## Error handling

| Situation | Behavior |
|-----------|----------|
| Notes folder missing / unreadable | Show recovery UI: choose folder again |
| Write failure | Surface error in status/chrome; keep editor buffer |
| Dirty buffer vs external file change | Warn; do not clobber buffer |
| Weak captured URL | Warn; offer paste |
| Linked `account_id` missing | Fall back by `platform`; prompt to pick account; still attempt navigation |
| Navigation failure | Keep note open; status message |

## Testing

- Frontmatter round-trip (parse + serialize preserves unknown keys where practical).
- Link apply / replace / unlink updates frontmatter and the managed body line only.
- Notes list from a fixture folder (top-level `*.md` only).
- Layout bounds with split on/off and sidebar width interaction.
- Config defaults/migration for new prefs.
- Smoke: app launches under ThinkAI naming; Add account still works.
- Manual: Google login unchanged; link capture on ChatGPT/Claude chat URLs; paste fallback; side-by-side resize persistence.

## Migration from AI Wrapper

- Existing accounts, partitions, workspaces, and prefs continue to load.
- New notes prefs default to unset folder / split off.
- Users see ThinkAI branding after update; no forced notes-folder migration.

## Success criteria

- User can pick a notes folder, create/edit/delete markdown notes locally.
- User can link a note to a chat (capture or paste), see the link in the file, and reopen that chat in the correct account beside the note.
- Side-by-side works with or without a link.
- Top bar account workflows and multi-account isolation remain intact.
- Chrome text reads at ~13px; product presents as ThinkAI.
- No API key flows exist in the product.
