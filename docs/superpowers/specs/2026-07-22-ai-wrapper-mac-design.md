# AI Wrapper — Mac Desktop App Design

**Date:** 2026-07-22  
**Status:** Draft for review  
**Product:** Personal free Mac desktop app that wraps major AI web platforms with multi-account sessions and a local workspace read/search bridge.

## Goal

Give one Mac app where you can:

- Open **ChatGPT**, **Claude**, **Gemini**, and **OpenAI Platform** web UIs
- Keep **multiple Google-authenticated accounts per platform** and switch between them without mixing sessions
- **Read and search** granted local project folders
- Push selected files into chats via **manual assist** (copy / prepare upload) — not silent auto-send

No app paywall, no app accounts, no telemetry in v1. Users bring their own platform subscriptions.

## Non-goals (v1)

- Writing or editing local files on behalf of the model
- Auto-injecting prompts into site composers / auto-sending chats
- Cross-machine account sync
- Additional AI sites beyond the four listed
- Open-source distribution requirements (personal free tool only)
- Native API chat clients (this app embeds official web UIs)

## Approach

**Electron multi-partition shell (hybrid):**

- Chromium webviews for each platform account, isolated via persistent `session.partition`s
- App chrome for platform/account navigation and workspace tools
- Main-process file APIs for grant, browse, search, and read under user-approved folders

Chosen over Tauri/native Swift primarily because multi-account Google login and cookie isolation are Electron’s strength.

## Architecture

Three layers:

1. **Main process** — BrowserWindow, account registry, session partitions, workspace permissions, file search/read IPC.
2. **Renderer (shell UI)** — platform rail, account list, workspace browser/search, assist actions, webview host layout.
3. **Isolated web sessions** — one persistent partition per account (e.g. `persist:claude-personal`). Cookies and storage stay per account so Google login persists and switching is “show this webview.”

```
┌─────────────────────────────────────────────────────────┐
│  Shell UI (renderer)                                    │
│  ┌──────────┬──────────────┬──────────────────────────┐ │
│  │ Platforms│ Accounts     │ Workspace + Assist       │ │
│  │ ChatGPT  │ • Work       │ browse / search / copy   │ │
│  │ Claude   │ • Personal   │ prepare attach           │ │
│  │ Gemini   │ [+ Add]      │                          │ │
│  │ OpenAI   │              │                          │ │
│  └──────────┴──────────────┴──────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Active account WebContentsView (partition X)       │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
         │ IPC                         │ session.partition
         ▼                             ▼
┌─────────────────┐          ┌──────────────────────────┐
│ Main: config,   │          │ Chromium persist disks   │
│ workspace FS,   │          │ (cookies per account)    │
│ search worker   │          └──────────────────────────┘
└─────────────────┘
```

### Platforms (v1)

| Label | Primary URL |
|-------|-------------|
| ChatGPT | `https://chatgpt.com` |
| Claude | `https://claude.ai` |
| Gemini | `https://gemini.google.com` |
| OpenAI Platform | `https://platform.openai.com` |

URLs may be adjusted if a site redirects; the product intent is these four surfaces.

## Components

| Component | Responsibility |
|-----------|----------------|
| **Platform rail** | Fixed list of four platforms; selecting one filters the account list. |
| **Account list** | Add, rename, remove accounts per platform. Each account has a stable partition ID. |
| **Session host** | Displays the active account’s `WebContentsView` (preferred over legacy `BrowserView`). May keep recently used sessions warm; others lazy-load. |
| **OAuth helper** | Routes `window.open` / Google login popups into the **same partition** as the initiating account. Other site login methods still work; Google is the expected primary path. |
| **Workspace picker** | Grant/revoke one or more folders via macOS open dialog; remember paths in local config. |
| **File browser + search** | Tree navigation and filename/content search over granted folders. |
| **Assist actions** | Copy path, copy text contents (size-capped), prepare attach for the site’s file input when feasible. |
| **Account / config store** | Local JSON (or equivalent) for labels, partition IDs, workspace paths, UI prefs. No passwords stored by the app. |

## Data model (local config)

Conceptual shape (exact schema left to implementation):

```json
{
  "workspaces": [{ "id": "...", "path": "/Users/…/project" }],
  "platforms": {
    "chatgpt": {
      "accounts": [
        { "id": "acc_…", "label": "Work", "partition": "persist:chatgpt-acc_…" }
      ]
    },
    "claude": { "accounts": [] },
    "gemini": { "accounts": [] },
    "openai_platform": { "accounts": [] }
  },
  "prefs": { "lastPlatform": "claude", "lastAccountId": "acc_…" }
}
```

Session secrets remain inside Chromium partition storage on disk, not in this config.

## Data flows

### Account switch

1. User selects platform → account.
2. Shell shows that account’s webview (create on first use).
3. Existing partition cookies keep the user logged in unless expired or logged out in-page.

### First Google login

1. User adds an account; empty partition loads the platform URL.
2. User uses the site’s “Sign in with Google.”
3. Popups/new windows are bound to that partition so cookies land in the correct jar.
4. Subsequent launches reuse the partition — seamless switch.

### Workspace → chat (manual assist)

1. User grants one or more folders once.
2. Browse/search and select file(s).
3. User chooses an assist action:
   - **Copy contents** or **Copy path** → paste into the web chat manually, or
   - **Prepare attach** → stage paths and help the page’s file picker when the platform allows; otherwise user uploads via the site’s normal UI.
4. No upload or send occurs without the user completing the action in the web UI.

## Error handling

| Situation | Behavior |
|-----------|----------|
| Google popup blocked / wrong session | Intercept new-window events; always attach to the active account partition. Offer retry or “Clear this account session” (wipe that partition’s Chromium storage only). |
| Session expired | Site shows its login wall; user re-auths in place. Partition preserved. |
| Workspace missing / permission denied | Mark folder unhealthy; prompt to re-grant. Search does not crash. |
| File too large for copy-contents | Enforce a text size cap (default ~100KB, configurable). Offer path copy or prepare-attach instead. Binaries: path/attach only. |
| Huge trees / slow search | Cap depth and result count; run off UI thread; cancel on new query. |
| Attach helper breaks after site DOM change | Degrade to copy path + use site upload. Never half-submit a chat. |
| Remove account | Confirm, then delete that account’s partition data only. |
| App/Chromium updates | Partitions persist; if assist helpers break, webview still works as a browser. |

### Security baseline (v1)

- Read only under user-granted folders.
- No proxying or logging of chat traffic by the app.
- No telemetry.
- No storage of Google passwords or scraped auth tokens in app config.

## Testing

### Automated

- Account registry: add / rename / remove → correct partition IDs, no cross-links.
- Config load/save round-trip.
- Workspace grant/revoke and missing-folder detection.
- File search against fixture trees; copy-contents size-cap rules.
- Partition isolation via Electron session APIs (two sessions do not share cookie jars).

### Manual acceptance checklist

- Google login on all four sites.
- At least two accounts on one site with no cookie bleed.
- Switch accounts without relaunch; sessions survive quit/reopen.
- OAuth popup completes in the intended account.
- Copy contents + prepare-attach verified on ChatGPT and Claude at minimum.
- Large file, binary, and revoked-folder behaviors match the error table.

### Out of scope for automation (v1)

- Brittle live DOM tests against ChatGPT/Claude/Gemini UIs.

## Tech choices

| Choice | Decision |
|--------|----------|
| Framework | Electron (latest stable suitable for `WebContentsView`) |
| UI | Lightweight web UI in the renderer (exact library deferred to implementation plan; keep shell simple) |
| Persistence | Chromium `persist:` partitions + local config file under user data |
| File search | Main-process (or utility process) walk + content search; optimize later if needed |
| Distribution | Personal local build/run; not a paid product |

## Success criteria

v1 is successful when:

1. You can maintain multiple logged-in Google accounts per platform and switch without re-login under normal cookie lifetime.
2. Accounts never share cookies across partitions.
3. You can grant project folder(s), search/read files, and get them into a chat via copy or prepare-attach without leaving the app for Finder except as fallback.
4. The app remains free for personal use with no app-side account or paywall.

## Implementation notes (for planning)

- Prefer `WebContentsView` (modern Electron) over legacy `BrowserView` if the target Electron version supports it cleanly.
- Treat “prepare attach” as best-effort per site; document fallback UX.
- Keep platform URL list and assist adapters in one place so adding a fifth site later is localized (even though a fifth site is out of v1 scope).
