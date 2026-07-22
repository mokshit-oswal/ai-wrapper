# AI Wrapper Mac App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a personal free Electron Mac app that embeds ChatGPT, Claude, Gemini, and OpenAI Platform in isolated multi-account sessions, with workspace read/search and manual file-assist into chats.

**Architecture:** Electron main process owns config, partitions, workspace FS, and `WebContentsView` sessions; renderer is a simple shell UI (platform rail, accounts, workspace panel) talking over contextBridge IPC. No app accounts or telemetry.

**Tech Stack:** Electron 35+, TypeScript, Vite (renderer), Vitest (unit tests for pure modules), Node `fs`/`path` for workspace IO.

**Spec:** `docs/superpowers/specs/2026-07-22-ai-wrapper-mac-design.md`

## Global Constraints

- Mac desktop only for v1; personal free app; BYO platform accounts; no app paywall; no telemetry.
- Platforms exactly: ChatGPT (`https://chatgpt.com`), Claude (`https://claude.ai`), Gemini (`https://gemini.google.com`), OpenAI Platform (`https://platform.openai.com`).
- One persistent Chromium `persist:` partition per account; Google login popups must share that partition.
- Workspace: read + search only under user-granted folders; copy contents capped at 100KB text; binaries = path/attach only.
- Manual assist only — no auto-send into composers.
- Do **not** create git commits unless the user explicitly asks.

## File structure

```
package.json
electron.vite.config.ts          # or vite + electron-builder style split
tsconfig.json
tsconfig.node.json
src/
  shared/
    platforms.ts                 # platform ids, labels, urls
    types.ts                     # Account, Workspace, AppConfig
    copy-limits.ts               # MAX_COPY_BYTES = 100_000
  main/
    index.ts                     # app ready, window, IPC register
    config-store.ts              # load/save AppConfig JSON
    account-service.ts           # add/rename/remove accounts + partition ids
    session-manager.ts           # WebContentsView map, show/hide, OAuth windows
    workspace-service.ts         # grant/revoke, list, search, readText
    ipc.ts                       # ipcMain handlers
    preload.ts                   # contextBridge API
  renderer/
    index.html
    main.ts
    styles.css
    App.ts                       # shell UI (vanilla TS; keep deps minimal)
tests/
  config-store.test.ts
  account-service.test.ts
  workspace-service.test.ts
  copy-limits.test.ts
fixtures/
  workspace-sample/
    hello.txt
    nested/note.md
    binary.bin
```

---

### Task 1: Scaffold + shared types + platforms

**Files:**
- Create: `package.json`, `tsconfig.json`, `electron.vite.config.ts`, `src/shared/types.ts`, `src/shared/platforms.ts`, `src/shared/copy-limits.ts`
- Test: `tests/copy-limits.test.ts`, `tests/platforms.test.ts`

**Interfaces:**
- Produces: `PlatformId`, `PLATFORMS`, `Account`, `WorkspaceEntry`, `AppConfig`, `MAX_COPY_BYTES`, `canCopyTextContents(size, mimeHint)`

- [ ] **Step 1: Write failing tests for platforms and copy limits**

```ts
// tests/platforms.test.ts
import { describe, it, expect } from 'vitest'
import { PLATFORMS, platformIds } from '../src/shared/platforms'

describe('PLATFORMS', () => {
  it('has exactly four platforms with expected ids', () => {
    expect(platformIds()).toEqual(['chatgpt', 'claude', 'gemini', 'openai_platform'])
  })
  it('maps chatgpt to chatgpt.com', () => {
    expect(PLATFORMS.chatgpt.url).toMatch(/chatgpt\.com/)
  })
})
```

```ts
// tests/copy-limits.test.ts
import { describe, it, expect } from 'vitest'
import { MAX_COPY_BYTES, canCopyTextContents } from '../src/shared/copy-limits'

describe('canCopyTextContents', () => {
  it('allows small text', () => {
    expect(canCopyTextContents(1000, 'text/plain')).toBe(true)
  })
  it('rejects over MAX_COPY_BYTES', () => {
    expect(canCopyTextContents(MAX_COPY_BYTES + 1, 'text/plain')).toBe(false)
  })
  it('rejects binary mime', () => {
    expect(canCopyTextContents(100, 'application/octet-stream')).toBe(false)
  })
})
```

- [ ] **Step 2: Implement shared modules + package scripts; run tests until green**

```ts
// src/shared/platforms.ts
export type PlatformId = 'chatgpt' | 'claude' | 'gemini' | 'openai_platform'

export const PLATFORMS: Record<PlatformId, { id: PlatformId; label: string; url: string }> = {
  chatgpt: { id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com' },
  claude: { id: 'claude', label: 'Claude', url: 'https://claude.ai' },
  gemini: { id: 'gemini', label: 'Gemini', url: 'https://gemini.google.com' },
  openai_platform: { id: 'openai_platform', label: 'OpenAI Platform', url: 'https://platform.openai.com' },
}

export function platformIds(): PlatformId[] {
  return Object.keys(PLATFORMS) as PlatformId[]
}
```

```ts
// src/shared/copy-limits.ts
export const MAX_COPY_BYTES = 100_000

export function canCopyTextContents(byteLength: number, mimeHint: string): boolean {
  if (byteLength > MAX_COPY_BYTES) return false
  if (mimeHint.startsWith('text/')) return true
  if (mimeHint === 'application/json' || mimeHint === 'application/javascript') return true
  return false
}
```

```ts
// src/shared/types.ts
import type { PlatformId } from './platforms'

export type Account = {
  id: string
  label: string
  partition: string // persist:${platform}-${id}
}

export type WorkspaceEntry = {
  id: string
  path: string
}

export type AppConfig = {
  workspaces: WorkspaceEntry[]
  platforms: Record<PlatformId, { accounts: Account[] }>
  prefs: { lastPlatform: PlatformId; lastAccountId: string | null }
}
```

Run: `npx vitest run tests/platforms.test.ts tests/copy-limits.test.ts`  
Expected: PASS

---

### Task 2: Config store + account service (pure, testable)

**Files:**
- Create: `src/main/config-store.ts`, `src/main/account-service.ts`, `src/main/default-config.ts`
- Test: `tests/config-store.test.ts`, `tests/account-service.test.ts`

**Interfaces:**
- Consumes: `AppConfig`, `PlatformId`, `Account`
- Produces:
  - `createDefaultConfig(): AppConfig`
  - `loadConfig(filePath: string): AppConfig`
  - `saveConfig(filePath: string, config: AppConfig): void`
  - `addAccount(config, platformId, label): { config: AppConfig; account: Account }`
  - `renameAccount(config, platformId, accountId, label): AppConfig`
  - `removeAccount(config, platformId, accountId): AppConfig`
  - `partitionFor(platformId, accountId): string` → `persist:${platformId}-${accountId}`

- [ ] **Step 1: Write failing account-service tests**

```ts
import { describe, it, expect } from 'vitest'
import { createDefaultConfig } from '../src/main/default-config'
import { addAccount, removeAccount, renameAccount, partitionFor } from '../src/main/account-service'

describe('account-service', () => {
  it('adds account with unique partition', () => {
    let config = createDefaultConfig()
    const r = addAccount(config, 'claude', 'Work')
    expect(r.account.label).toBe('Work')
    expect(r.account.partition).toBe(partitionFor('claude', r.account.id))
    expect(r.config.platforms.claude.accounts).toHaveLength(1)
  })

  it('rename and remove do not touch other platforms', () => {
    let config = createDefaultConfig()
    const a = addAccount(config, 'claude', 'A')
    config = addAccount(a.config, 'chatgpt', 'B').config
    config = renameAccount(config, 'claude', a.account.id, 'A2')
    expect(config.platforms.claude.accounts[0].label).toBe('A2')
    expect(config.platforms.chatgpt.accounts).toHaveLength(1)
    config = removeAccount(config, 'claude', a.account.id)
    expect(config.platforms.claude.accounts).toHaveLength(0)
    expect(config.platforms.chatgpt.accounts).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Implement default-config, account-service, config-store; tests green**

Use `crypto.randomUUID()` for ids. `loadConfig` returns default if file missing; validates shape lightly (platforms keys present). Persist with `fs.writeFileSync` atomic via temp+rename.

Run: `npx vitest run tests/account-service.test.ts tests/config-store.test.ts`  
Expected: PASS

---

### Task 3: Workspace service (grant paths, list, search, read)

**Files:**
- Create: `src/main/workspace-service.ts`
- Test: `tests/workspace-service.test.ts`
- Create: `fixtures/workspace-sample/**`

**Interfaces:**
- Produces:
  - `isPathInsideWorkspace(filePath, workspaceRoots: string[]): boolean`
  - `listDir(rootPaths, relativeDir): { name, path, isDirectory }[]`
  - `searchFiles(rootPaths, query, opts?: { maxResults?: number }): { path, matchType }[]`
  - `readTextForCopy(filePath, workspaceRoots): { ok: true, text: string } | { ok: false, reason: string }`
  - `addWorkspace(config, absPath): AppConfig`
  - `removeWorkspace(config, id): AppConfig`
  - `workspaceHealth(path): 'ok' | 'missing' | 'unreadable'`

- [ ] **Step 1: Write failing tests against fixtures**

```ts
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { searchFiles, readTextForCopy, isPathInsideWorkspace } from '../src/main/workspace-service'

const root = path.join(__dirname, '../fixtures/workspace-sample')

describe('workspace-service', () => {
  it('rejects path escape', () => {
    expect(isPathInsideWorkspace('/etc/passwd', [root])).toBe(false)
  })
  it('finds hello.txt by name', () => {
    const hits = searchFiles([root], 'hello')
    expect(hits.some((h) => h.path.endsWith('hello.txt'))).toBe(true)
  })
  it('copies small text; rejects binary', async () => {
    const text = readTextForCopy(path.join(root, 'hello.txt'), [root])
    expect(text.ok).toBe(true)
    const bin = readTextForCopy(path.join(root, 'binary.bin'), [root])
    expect(bin.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Implement with realpath checks; ignore `node_modules`/`.git`; maxResults default 100; content search only for files under 1MB**

Run: `npx vitest run tests/workspace-service.test.ts`  
Expected: PASS

---

### Task 4: Electron main + preload + session manager

**Files:**
- Create: `src/main/index.ts`, `src/main/ipc.ts`, `src/main/preload.ts`, `src/main/session-manager.ts`
- Create: `src/renderer/index.html`, `src/renderer/main.ts`, `src/renderer/styles.css`, `src/renderer/App.ts`

**Interfaces:**
- `SessionManager`:
  - `constructor(parent: BrowserWindow)`
  - `showAccount(platformId, account: Account, url: string): void`
  - `clearPartition(partition: string): Promise<void>`
  - handles `setWindowOpenHandler` so child windows use the same `session.fromPartition(partition)`
- Preload `window.api`:
  - `getConfig()`, `addAccount(platformId, label)`, `renameAccount(...)`, `removeAccount(...)`
  - `clearAccountSession(platformId, accountId)`
  - `showAccount(platformId, accountId)`
  - `addWorkspace()`, `removeWorkspace(id)`, `listDir(rel)`, `search(query)`, `copyPath(path)`, `copyContents(path)`, `prepareAttach(paths: string[])`
  - `onConfigUpdated(cb)`

- [ ] **Step 1: Wire electron-vite (or equivalent) so `npm run dev` launches Electron with preload**

- [ ] **Step 2: Implement SessionManager**

Key behavior:

```ts
const view = new WebContentsView({
  webPreferences: {
    partition: account.partition,
    sandbox: true,
  },
})
view.webContents.setWindowOpenHandler(({ url }) => {
  // open child BrowserWindow with same partition, or allow deny+manual load
  return { action: 'allow', overrideBrowserWindowOptions: {
    webPreferences: { partition: account.partition }
  }}
})
view.webContents.loadURL(url)
```

Layout: leave left/top chrome for shell; set `view.setBounds` under content region. On resize, update bounds.

- [ ] **Step 3: Implement IPC handlers calling account-service / workspace-service / clipboard**

`prepareAttach`: store staged paths in main; on next file-input in active webContents, use `webContents.session` debugger or `webContents.executeJavaScript` only as best-effort — if not reliable, expose `getStagedAttachPaths()` and show UI hint “use Upload and pick staged folder” OR use Electron `webContents` file chooser interception:

```ts
session.fromPartition(partition).setPermissionRequestHandler(...)
// Prefer: app.on('web-contents-created') + select-client-certificate etc.
// Concrete attach: listen for 'will-prevent-unload' N/A
// Use: contents.on did-finish-load; for prepareAttach call
session.defaultSession // NO — use account session
```

**Concrete prepare-attach for v1:** When user clicks Prepare attach, copy files to a staging directory and open that directory in Finder (`shell.showItemInFolder` / `shell.openPath`), and set clipboard to the first file path — plus toast in UI: “Files staged — use the site’s upload control.” Optionally attempt `webContents.focus()`. Do **not** depend on fragile DOM injection for v1 green path.

- [ ] **Step 4: Build minimal shell UI**

Vanilla TS layout matching the ASCII wireframe: platforms | accounts | workspace. Buttons: Add account, Rename, Remove, Clear session, Add folder, Search, Copy path, Copy contents, Prepare attach.

- [ ] **Step 5: Manual smoke**

Run: `npm run dev`  
Verify: four platforms listed; add two Claude accounts; each loads claude.ai; Google popup stays in-session (manual); workspace grant + search works; copy contents of `hello.txt` works.

---

### Task 5: Polish + README + acceptance checklist

**Files:**
- Create: `README.md`
- Modify: shell CSS for usable density; persist last platform/account on switch

- [ ] **Step 1: Persist prefs on every successful `showAccount`**
- [ ] **Step 2: Mark unhealthy workspaces in UI via `workspaceHealth`**
- [ ] **Step 3: README with `npm install`, `npm run dev`, `npm test`, and manual acceptance checklist from the spec**
- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`  
Expected: all PASS

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Four platforms + URLs | 1 |
| Per-platform accounts + persist partitions | 2, 4 |
| Google OAuth same partition | 4 |
| Workspace grant/read/search | 3, 4 |
| Manual assist copy / prepare attach | 4 (Finder staging fallback) |
| Free / no telemetry | global + no analytics code |
| Error cases (missing folder, size cap, clear session) | 3, 4 |
| Automated tests for registry/config/workspace | 1–3 |
| Manual checklist documented | 5 |

## Execution note

User requested implementation immediately after planning. Prefer **inline execution** of Tasks 1→5 in this session. Skip git commits unless explicitly requested.
