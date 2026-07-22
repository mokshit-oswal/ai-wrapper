# Global Accounts + Top Bar Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move account Add/Rename/Remove/Clear into a full-width top bar, show all accounts across platforms in the sidebar, apply a dark shell theme, and make the sidebar drag-resizable with persisted width.

**Architecture:** Keep accounts nested under `platforms[platformId].accounts`. Extend `prefs` with `lastAccountIdByPlatform` and `sidebarWidth`. Renderer owns chrome layout (top bar + resize); main sizes `WebContentsView` from reported bounds using top-bar height + live sidebar width. Pure helpers for clamp/flatten/resolve live in `src/shared/`.

**Tech Stack:** Electron 35, TypeScript, electron-vite, Vitest, vanilla renderer TS/CSS (no new UI framework).

**Spec:** `docs/superpowers/specs/2026-07-22-global-accounts-topbar-design.md`

## Global Constraints

- UI + prefs only — do **not** flatten account storage into a global array.
- Dark theme applies to **shell chrome only**; platform webviews keep their own look.
- Account list label format: `{label} · {platformLabel}` (e.g. `Work · Claude`).
- Sidebar width clamp: **200–480**, default **280**. Top bar height constant: **48**.
- Preserve partition isolation and existing workspace assist behavior.
- Do **not** create git commits unless the user explicitly asks.

## File structure

```
src/shared/
  types.ts                 # extend prefs
  layout.ts                # NEW: widths, top bar height, clampSidebarWidth
  accounts-view.ts         # NEW: flattenAccounts, resolveAccountForPlatform
src/main/
  default-config.ts        # new prefs defaults
  config-store.ts          # migrate/normalize new prefs fields
  account-service.ts       # clear lastAccountIdByPlatform on remove
  ipc.ts                   # sessions:show prefs map; prefs:setSidebarWidth
  index.ts                 # initial layout uses prefs + TOP_BAR_HEIGHT
src/preload/index.ts       # expose setSidebarWidth
src/renderer/
  App.ts                   # top bar, global accounts, resize, dark layout
  styles.css               # dark theme + topbar + resize handle
  env.d.ts                 # AiWrapperApi.setSidebarWidth
tests/
  layout.test.ts           # NEW
  accounts-view.test.ts    # NEW
  config-store.test.ts     # extend migration cases
  account-service.test.ts  # extend remove prefs cases
scripts/smoke-add-account.mjs
README.md                  # usage bullets if needed
```

---

### Task 1: Shared layout constants + prefs types + config migration

**Files:**
- Create: `src/shared/layout.ts`
- Create: `tests/layout.test.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/main/default-config.ts`
- Modify: `src/main/config-store.ts`
- Modify: `tests/config-store.test.ts`

**Interfaces:**
- Produces:
  - `DEFAULT_SIDEBAR_WIDTH = 280`, `MIN_SIDEBAR_WIDTH = 200`, `MAX_SIDEBAR_WIDTH = 480`, `TOP_BAR_HEIGHT = 48`
  - `clampSidebarWidth(value: number): number`
  - `AppConfig.prefs.lastAccountIdByPlatform: Partial<Record<PlatformId, string | null>>`
  - `AppConfig.prefs.sidebarWidth: number`

- [ ] **Step 1: Write failing layout tests**

```ts
// tests/layout.test.ts
import { describe, it, expect } from 'vitest'
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  TOP_BAR_HEIGHT,
} from '../src/shared/layout'

describe('layout', () => {
  it('exposes agreed constants', () => {
    expect(DEFAULT_SIDEBAR_WIDTH).toBe(280)
    expect(MIN_SIDEBAR_WIDTH).toBe(200)
    expect(MAX_SIDEBAR_WIDTH).toBe(480)
    expect(TOP_BAR_HEIGHT).toBe(48)
  })

  it('clamps sidebar width', () => {
    expect(clampSidebarWidth(100)).toBe(200)
    expect(clampSidebarWidth(999)).toBe(480)
    expect(clampSidebarWidth(320)).toBe(320)
    expect(clampSidebarWidth(Number.NaN)).toBe(DEFAULT_SIDEBAR_WIDTH)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/layout.test.ts`
Expected: FAIL (module not found / exports missing)

- [ ] **Step 3: Implement `src/shared/layout.ts`**

```ts
export const DEFAULT_SIDEBAR_WIDTH = 280
export const MIN_SIDEBAR_WIDTH = 200
export const MAX_SIDEBAR_WIDTH = 480
export const TOP_BAR_HEIGHT = 48

export function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SIDEBAR_WIDTH
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(value)))
}
```

- [ ] **Step 4: Extend prefs types and defaults**

In `src/shared/types.ts`, replace prefs with:

```ts
prefs: {
  lastPlatform: PlatformId
  lastAccountId: string | null
  lastAccountIdByPlatform: Partial<Record<PlatformId, string | null>>
  sidebarWidth: number
}
```

In `src/main/default-config.ts`, import `DEFAULT_SIDEBAR_WIDTH` and set:

```ts
prefs: {
  lastPlatform: 'chatgpt',
  lastAccountId: null,
  lastAccountIdByPlatform: {},
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
}
```

- [ ] **Step 5: Write failing config-store migration tests**

Append to `tests/config-store.test.ts`:

```ts
  it('fills new prefs fields when loading legacy config', () => {
    fs.writeFileSync(
      file,
      JSON.stringify({
        workspaces: [],
        platforms: {
          chatgpt: { accounts: [] },
          claude: { accounts: [] },
          gemini: { accounts: [] },
          openai_platform: { accounts: [] },
        },
        prefs: { lastPlatform: 'claude', lastAccountId: null },
      }),
      'utf8',
    )
    const loaded = loadConfig(file)
    expect(loaded.prefs.lastPlatform).toBe('claude')
    expect(loaded.prefs.lastAccountIdByPlatform).toEqual({})
    expect(loaded.prefs.sidebarWidth).toBe(280)
  })

  it('clamps invalid sidebarWidth on load', () => {
    const base = createDefaultConfig()
    saveConfig(file, {
      ...base,
      prefs: { ...base.prefs, sidebarWidth: 50 },
    })
    // After normalize runs clamp — write raw JSON to bypass type safety:
    fs.writeFileSync(
      file,
      JSON.stringify({ ...base, prefs: { ...base.prefs, sidebarWidth: 50 } }),
      'utf8',
    )
    expect(loadConfig(file).prefs.sidebarWidth).toBe(200)
  })
```

- [ ] **Step 6: Run migration tests to verify failure**

Run: `npm test -- tests/config-store.test.ts`
Expected: FAIL on new prefs expectations until normalize is updated

- [ ] **Step 7: Update `normalizeConfig` in `config-store.ts`**

Import `clampSidebarWidth`, `DEFAULT_SIDEBAR_WIDTH`, and `PlatformId`. Normalize prefs:

```ts
  const rawByPlatform =
    obj.prefs && typeof obj.prefs === 'object' && obj.prefs.lastAccountIdByPlatform
      ? obj.prefs.lastAccountIdByPlatform
      : {}
  const lastAccountIdByPlatform: Partial<Record<PlatformId, string | null>> = {}
  for (const id of platformIds()) {
    const v = (rawByPlatform as Record<string, unknown>)[id]
    if (v === null || typeof v === 'string') lastAccountIdByPlatform[id] = v
  }

  const sidebarWidth = clampSidebarWidth(
    obj.prefs && typeof (obj.prefs as { sidebarWidth?: unknown }).sidebarWidth === 'number'
      ? (obj.prefs as { sidebarWidth: number }).sidebarWidth
      : DEFAULT_SIDEBAR_WIDTH,
  )

  return {
    workspaces,
    platforms,
    prefs: { lastPlatform, lastAccountId, lastAccountIdByPlatform, sidebarWidth },
  }
```

- [ ] **Step 8: Run unit tests**

Run: `npm test -- tests/layout.test.ts tests/config-store.test.ts`
Expected: PASS

---

### Task 2: Account view helpers + removeAccount prefs cleanup

**Files:**
- Create: `src/shared/accounts-view.ts`
- Create: `tests/accounts-view.test.ts`
- Modify: `src/main/account-service.ts`
- Modify: `tests/account-service.test.ts`

**Interfaces:**
- Consumes: `AppConfig`, `PlatformId`, `PLATFORMS`, `Account`
- Produces:
  - `type FlatAccount = { platformId: PlatformId; account: Account }`
  - `flattenAccounts(config: AppConfig): FlatAccount[]` — platform order = `platformIds()`, accounts in stored order
  - `resolveAccountForPlatform(config: AppConfig, platformId: PlatformId): Account | null` — last-used id from prefs if still present, else first account, else null
  - `removeAccount` also clears `lastAccountIdByPlatform[platformId]` when that id matches

- [ ] **Step 1: Write failing accounts-view tests**

```ts
// tests/accounts-view.test.ts
import { describe, it, expect } from 'vitest'
import { createDefaultConfig } from '../src/main/default-config'
import { addAccount } from '../src/main/account-service'
import { flattenAccounts, resolveAccountForPlatform } from '../src/shared/accounts-view'

describe('accounts-view', () => {
  it('flattens accounts across platforms in platform order', () => {
    let config = createDefaultConfig()
    config = addAccount(config, 'claude', 'Work').config
    config = addAccount(config, 'chatgpt', 'Personal').config
    const flat = flattenAccounts(config)
    expect(flat.map((f) => `${f.platformId}:${f.account.label}`)).toEqual([
      'chatgpt:Personal',
      'claude:Work',
    ])
  })

  it('resolves last-used account for a platform', () => {
    let config = createDefaultConfig()
    const a = addAccount(config, 'claude', 'A')
    config = a.config
    const b = addAccount(config, 'claude', 'B')
    config = b.config
    config = {
      ...config,
      prefs: {
        ...config.prefs,
        lastAccountIdByPlatform: { claude: b.account.id },
      },
    }
    expect(resolveAccountForPlatform(config, 'claude')?.id).toBe(b.account.id)
  })

  it('falls back to first account when last-used missing', () => {
    let config = createDefaultConfig()
    const a = addAccount(config, 'gemini', 'Only')
    config = a.config
    expect(resolveAccountForPlatform(config, 'gemini')?.id).toBe(a.account.id)
    expect(resolveAccountForPlatform(config, 'chatgpt')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- tests/accounts-view.test.ts`
Expected: FAIL (module missing)

- [ ] **Step 3: Implement `src/shared/accounts-view.ts`**

```ts
import { PLATFORMS, platformIds, type PlatformId } from './platforms'
import type { Account, AppConfig } from './types'

export type FlatAccount = { platformId: PlatformId; account: Account }

export function flattenAccounts(config: AppConfig): FlatAccount[] {
  const out: FlatAccount[] = []
  for (const platformId of platformIds()) {
    for (const account of config.platforms[platformId].accounts) {
      out.push({ platformId, account })
    }
  }
  return out
}

export function resolveAccountForPlatform(
  config: AppConfig,
  platformId: PlatformId,
): Account | null {
  const accounts = config.platforms[platformId].accounts
  if (accounts.length === 0) return null
  const remembered = config.prefs.lastAccountIdByPlatform[platformId]
  if (remembered) {
    const found = accounts.find((a) => a.id === remembered)
    if (found) return found
  }
  return accounts[0]
}

export function formatAccountLabel(platformId: PlatformId, label: string): string {
  return `${label} · ${PLATFORMS[platformId].label}`
}
```

- [ ] **Step 4: Extend account-service remove tests**

In `tests/account-service.test.ts`, add:

```ts
  it('clears lastAccountIdByPlatform when removing that account', () => {
    let config = createDefaultConfig()
    const { config: withAcct, account } = addAccount(config, 'claude', 'Work')
    config = {
      ...withAcct,
      prefs: {
        ...withAcct.prefs,
        lastAccountId: account.id,
        lastAccountIdByPlatform: { claude: account.id },
      },
    }
    config = removeAccount(config, 'claude', account.id)
    expect(config.prefs.lastAccountId).toBeNull()
    expect(config.prefs.lastAccountIdByPlatform.claude).toBeNull()
  })
```

- [ ] **Step 5: Update `removeAccount` prefs logic**

```ts
  const lastAccountIdByPlatform = { ...config.prefs.lastAccountIdByPlatform }
  if (lastAccountIdByPlatform[platformId] === accountId) {
    lastAccountIdByPlatform[platformId] = null
  }
  const prefs = {
    ...config.prefs,
    lastAccountId: config.prefs.lastAccountId === accountId ? null : config.prefs.lastAccountId,
    lastAccountIdByPlatform,
  }
```

- [ ] **Step 6: Run tests**

Run: `npm test -- tests/accounts-view.test.ts tests/account-service.test.ts`
Expected: PASS

---

### Task 3: IPC — showAccount prefs map + setSidebarWidth

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/env.d.ts`

**Interfaces:**
- Consumes: `clampSidebarWidth`
- Produces:
  - `sessions:show` writes `lastPlatform`, `lastAccountId`, and `lastAccountIdByPlatform[platformId] = accountId` while preserving `sidebarWidth` and other map entries
  - `prefs:setSidebarWidth(width: number): number` — clamps, persists, broadcasts, returns stored width
  - `window.api.setSidebarWidth(width: number): Promise<number>`

- [ ] **Step 1: Update `sessions:show` prefs merge in `ipc.ts`**

Replace the prefs assignment with:

```ts
    const prev = ctx.getConfig()
    ctx.setConfig({
      ...prev,
      prefs: {
        ...prev.prefs,
        lastPlatform: platformId,
        lastAccountId: accountId,
        lastAccountIdByPlatform: {
          ...prev.prefs.lastAccountIdByPlatform,
          [platformId]: accountId,
        },
      },
    })
```

- [ ] **Step 2: Add `prefs:setSidebarWidth` handler**

```ts
  ipcMain.handle('prefs:setSidebarWidth', (_e, width: number) => {
    const sidebarWidth = clampSidebarWidth(width)
    const prev = ctx.getConfig()
    ctx.setConfig({
      ...prev,
      prefs: { ...prev.prefs, sidebarWidth },
    })
    ctx.persist()
    ctx.broadcastConfig()
    return sidebarWidth
  })
```

Import `clampSidebarWidth` from `../shared/layout`.

- [ ] **Step 3: Expose on preload + typings**

In `src/preload/index.ts` add:

```ts
  setSidebarWidth: (width: number) => Promise<number>
  // ...
  setSidebarWidth: (width) => ipcRenderer.invoke('prefs:setSidebarWidth', width),
```

Mirror on `AiWrapperApi` in `src/renderer/env.d.ts`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS

---

### Task 4: Main window initial layout uses top bar + sidebar width

**Files:**
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `TOP_BAR_HEIGHT`, `clampSidebarWidth` / `config.prefs.sidebarWidth`
- Produces: initial `setContentBounds` with `x = sidebarWidth`, `y = TOP_BAR_HEIGHT`, `height = contentHeight - TOP_BAR_HEIGHT`

- [ ] **Step 1: Replace hard-coded `SIDEBAR_WIDTH` in `index.ts`**

```ts
import { TOP_BAR_HEIGHT, clampSidebarWidth } from '../shared/layout'

// inside createWindow, after sessions attached:
  const layoutSessions = (): void => {
    const [width, height] = win.getContentSize()
    const sidebarWidth = clampSidebarWidth(ctx.getConfig().prefs.sidebarWidth)
    sessions.setContentBounds({
      x: sidebarWidth,
      y: TOP_BAR_HEIGHT,
      width: Math.max(100, width - sidebarWidth),
      height: Math.max(100, height - TOP_BAR_HEIGHT),
    })
  }
```

Renderer `reportBounds` remains the source of truth during interaction; this keeps restore/resize sane before first renderer report.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS

---

### Task 5: Renderer shell — top bar, global accounts, dark theme, resize

**Files:**
- Modify: `src/renderer/App.ts` (major)
- Modify: `src/renderer/styles.css` (major)

**Interfaces:**
- Consumes: `flattenAccounts`, `formatAccountLabel`, `resolveAccountForPlatform`, `TOP_BAR_HEIGHT`, `clampSidebarWidth`, `window.api.setSidebarWidth`
- Produces: working UI matching the spec mockup

- [ ] **Step 1: Replace shell markup in `mountApp`**

Structure:

```html
<div class="shell">
  <header class="topbar" id="topbar">
    <div class="topbar-brand">AI Wrapper</div>
    <label class="topbar-field">
      <span>Platform</span>
      <select id="add-platform"></select>
    </label>
    <input type="text" id="account-label" placeholder="Account label" value="Personal" />
    <button class="action primary" id="add-account" type="button">Add</button>
    <button class="action" id="rename-account" type="button">Rename</button>
    <button class="action danger" id="remove-account" type="button">Remove</button>
    <button class="action danger" id="clear-session" type="button">Clear session</button>
    <p class="status" id="status">Ready</p>
  </header>
  <div class="shell-body">
    <aside class="sidebar" id="sidebar">
      <section class="platforms">...</section>
      <section class="accounts">
        <h2 class="section-title">All accounts</h2>
        <div id="account-list"></div>
      </section>
      <section class="workspace">...</section>
    </aside>
    <div class="resize-handle" id="resize-handle" role="separator" aria-orientation="vertical"></div>
    <div class="webview-slot" id="webview-slot" aria-hidden="true"></div>
  </div>
</div>
```

Populate `#add-platform` options from `platformIds()` / `PLATFORMS`. Keep workspace section markup/handlers equivalent to today.

- [ ] **Step 2: State + bounds**

```ts
  let sidebarWidth = clampSidebarWidth(config.prefs.sidebarWidth)
  const addPlatformSelect = root.querySelector('#add-platform') as HTMLSelectElement

  function reportBounds(): void {
    const height = Math.max(100, window.innerHeight - TOP_BAR_HEIGHT)
    const width = Math.max(100, window.innerWidth - sidebarWidth)
    void window.api.setSessionBounds({
      x: sidebarWidth,
      y: TOP_BAR_HEIGHT,
      width,
      height,
    })
  }

  function applySidebarWidth(px: number): void {
    sidebarWidth = clampSidebarWidth(px)
    root.style.setProperty('--sidebar', `${sidebarWidth}px`)
    reportBounds()
  }
```

On mount: `applySidebarWidth(config.prefs.sidebarWidth)`.

- [ ] **Step 3: Global account list rendering**

```ts
  function renderAccounts(): void {
    const list = root.querySelector('#account-list')!
    const flat = flattenAccounts(config)
    if (flat.length === 0) {
      list.innerHTML = `<p class="status">No accounts yet. Choose a platform, enter a label, and click Add.</p>`
      return
    }
    list.innerHTML = flat
      .map(({ platformId: pid, account: a }) => {
        const active = a.id === accountId && pid === platformId ? 'active' : ''
        const text = formatAccountLabel(pid, a.label)
        return `<button type="button" class="account-btn ${active}" data-id="${a.id}" data-platform="${pid}">${escapeHtml(text)}</button>`
      })
      .join('')
    list.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', async () => {
        platformId = (btn as HTMLButtonElement).dataset.platform as PlatformId
        accountId = (btn as HTMLButtonElement).dataset.id!
        const selected = config.platforms[platformId].accounts.find((a) => a.id === accountId)
        labelInput.value = selected?.label ?? 'Personal'
        addPlatformSelect.value = platformId
        try {
          await window.api.showAccount(platformId, accountId)
          setStatus(`Showing ${formatAccountLabel(platformId, selected?.label ?? '')}`)
        } catch (err) {
          setStatus(`Failed to show account: ${String(err)}`)
        }
        render()
      })
    })
  }
```

- [ ] **Step 4: Platform rail uses `resolveAccountForPlatform`**

On platform button click:

```ts
        platformId = (btn as HTMLButtonElement).dataset.id as PlatformId
        const resolved = resolveAccountForPlatform(config, platformId)
        accountId = resolved?.id ?? null
        labelInput.value = resolved?.label ?? 'Personal'
        addPlatformSelect.value = platformId
        render()
        if (accountId) void window.api.showAccount(platformId, accountId)
```

- [ ] **Step 5: Top-bar Add uses `#add-platform`**

```ts
      const targetPlatform = addPlatformSelect.value as PlatformId
      const account = await window.api.addAccount(targetPlatform, label)
      platformId = targetPlatform
      accountId = account.id
      // then getConfig, showAccount, render — same as today
```

- [ ] **Step 6: Remove fallback across platforms**

After successful remove:

```ts
      config = await window.api.getConfig()
      const samePlatform = config.platforms[platformId].accounts[0]
      if (samePlatform) {
        accountId = samePlatform.id
      } else {
        const next = flattenAccounts(config)[0]
        if (next) {
          platformId = next.platformId
          accountId = next.account.id
        } else {
          accountId = null
        }
      }
      labelInput.value =
        (accountId &&
          config.platforms[platformId].accounts.find((a) => a.id === accountId)?.label) ||
        'Personal'
      render()
      if (accountId) await window.api.showAccount(platformId, accountId)
```

- [ ] **Step 7: Resize handle drag**

On `#resize-handle` pointerdown → pointermove/up (or mousemove/up on window):

- Track `startX` and `startWidth`
- On move: `applySidebarWidth(startWidth + (clientX - startX))`
- On up: `await window.api.setSidebarWidth(sidebarWidth)` then release listeners
- Set `document.body.style.cursor = 'col-resize'` while dragging; clear on up

- [ ] **Step 8: Dark theme CSS**

Rewrite `:root` / chrome styles roughly as:

```css
:root {
  color-scheme: dark;
  --bg: #0f1115;
  --panel: #12151b;
  --border: #2a2f3a;
  --text: #e8eaed;
  --muted: #8b939e;
  --accent: #3b82f6;
  --danger: #f87171;
  --sidebar: 280px;
  --topbar-height: 48px;
  font-family: "SF Pro Text", "Segoe UI", system-ui, sans-serif;
}

.shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.topbar {
  height: var(--topbar-height);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
  background: #161a22;
  flex-shrink: 0;
  z-index: 3;
}

.shell-body {
  display: grid;
  grid-template-columns: var(--sidebar) 6px 1fr;
  flex: 1;
  min-height: 0;
}

.resize-handle {
  cursor: col-resize;
  background: var(--border);
}

.sidebar { /* dark panel styles, overflow auto */ }
.platform-btn.active,
.account-btn.active {
  background: #1e3a5f;
  border-color: #2563eb;
  color: #93c5fd;
}
```

Ensure inputs/selects/buttons in the top bar use dark surfaces; keep `#status` in the top bar (`margin-left: auto`).

- [ ] **Step 9: Manual sanity via `npm run dev`**

Checklist:
- All accounts visible regardless of active platform
- Click account switches platform webview
- Platform rail opens last-used account
- Add uses platform select
- Rename/Remove/Clear operate on selection
- Drag resize + quit/reopen keeps width
- Dark chrome readable

---

### Task 6: Smoke test + README touch-up

**Files:**
- Modify: `scripts/smoke-add-account.mjs`
- Modify: `README.md` (Usage section only if account UX text is stale)

**Interfaces:**
- Smoke still uses `#add-account`, `#account-label`, `#account-list` — IDs preserved
- Assert list text includes `Smoke Test · ChatGPT` (formatAccountLabel) **or** still includes `Smoke Test` substring (current assertion already passes)

- [ ] **Step 1: Ensure smoke selectors still match**

Keep `#add-account` / `#account-label` / `#account-list` / `#status`. Optionally set `#add-platform` to `chatgpt` before add (default first option is fine if options are in `platformIds()` order).

Update wait assertion if desired:

```js
    await page.waitForFunction(
      () => document.querySelector('#account-list')?.textContent?.includes('Smoke Test'),
      null,
      { timeout: 15_000 },
    )
```

- [ ] **Step 2: Run unit + smoke**

Run: `npm test && npm run test:smoke`
Expected: all unit tests PASS; smoke prints `SMOKE_OK add-account works`

- [ ] **Step 3: Update README Usage bullets if needed**

Reflect: accounts listed globally; manage accounts from the top bar; choose platform when adding.

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Full-width top bar with Add/Rename/Remove/Clear + platform picker | 5 |
| All accounts list with `label · platform` | 2, 5 |
| Click account → that platform session | 5 |
| Click platform → last-used / first | 2, 5 |
| Dark shell theme | 5 |
| Resizable sidebar 200–480, default 280, persist | 1, 3, 5 |
| Prefs `lastAccountIdByPlatform` + `sidebarWidth` migration | 1, 3 |
| Webview bounds use top bar + sidebar width | 4, 5 |
| Remove fallback across platforms | 5 |
| Smoke / README | 6 |
| No account-storage flatten | Global constraint |

## Placeholder / consistency notes

- Constants and prefs field names are identical across tasks: `lastAccountIdByPlatform`, `sidebarWidth`, `TOP_BAR_HEIGHT = 48`.
- Element IDs `#add-account`, `#account-label`, `#account-list`, `#status` intentionally preserved for smoke.
- New IPC channel name: `prefs:setSidebarWidth` / `api.setSidebarWidth`.
