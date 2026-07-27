# ThinkAI Notes-Centric Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand to ThinkAI and rebuild the shell around local markdown notes beside existing multi-account webview sessions, with one-note↔one-chat URL links and a toggleable side-by-side layout.

**Architecture:** Keep Electron multi-partition webviews and account/workspace IPC. Add a main-process notes service over a user-chosen `.md` folder, pure shared helpers for frontmatter/link body and split layout bounds, and a notes-first renderer (stacked Accounts + Notes sidebar, markdown editor, split toggle). No API chat.

**Tech Stack:** Electron 35, TypeScript, electron-vite, Vitest, vanilla renderer TS/CSS (no new UI framework; no frontmatter npm dependency).

**Spec:** `docs/superpowers/specs/2026-07-27-thinkai-notes-centric-design.md`

## Global Constraints

- No OpenAI/Anthropic API keys, no unofficial web-API scraping — chat stays official embedded sites.
- One note ↔ one chat link; store in YAML frontmatter + managed `[Linked chat](...)` body line.
- Notes folder is user-selected; v1 lists top-level `*.md` only.
- Keep `appId` as `com.aiwrapper.desktop` so existing userData paths stay valid; change `productName` / titles to ThinkAI only.
- Preserve account partition isolation and workspace assist IPC behavior.
- Chrome/nav text ≈ **13px** (`--text-md` is already `0.8125rem` / 13px — use it for section titles and topbar controls).
- Do **not** create git commits unless the user explicitly asks.

## File structure

```
src/shared/
  types.ts                 # notes prefs + NoteMeta types
  layout.ts                # split bounds + notes pane clamp
  note-frontmatter.ts      # NEW: parse/serialize + link body line
  note-link.ts             # NEW: isWeakChatUrl
src/main/
  default-config.ts        # new prefs defaults
  config-store.ts          # migrate/normalize notes prefs
  notes-service.ts         # NEW: folder list/read/write/create/rename/delete
  session-manager.ts       # getActiveURL + navigateActive
  ipc.ts                   # notes:* + prefs + sessions:getUrl/navigate
  index.ts                 # window title ThinkAI; initial bounds respect split
src/preload/index.ts       # expose notes + navigate/getUrl APIs
src/renderer/
  App.ts                   # notes-first shell, split, linking
  styles.css / tokens.css  # notes pane, 13px nav, ThinkAI
  index.html               # title ThinkAI
  env.d.ts                 # API typings
tests/
  layout.test.ts           # extend split cases
  note-frontmatter.test.ts # NEW
  note-link.test.ts        # NEW
  notes-service.test.ts    # NEW
  config-store.test.ts     # extend migration
package.json               # productName ThinkAI (keep appId)
README.md                  # ThinkAI + notes usage
scripts/smoke-add-account.mjs  # title/selectors if needed
fixtures/notes-sample/     # NEW sample .md files for tests
```

---

### Task 1: Notes prefs types + config migration

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/default-config.ts`
- Modify: `src/main/config-store.ts`
- Modify: `tests/config-store.test.ts`

**Interfaces:**
- Produces:
  - `AppConfig.prefs.notesFolderPath: string | null`
  - `AppConfig.prefs.notesSplitEnabled: boolean`
  - `AppConfig.prefs.notesPaneWidth: number`
  - `AppConfig.prefs.lastNotePath: string | null`

- [ ] **Step 1: Write failing migration test**

Add to `tests/config-store.test.ts` (create file if missing patterns; follow existing load/save style):

```ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadConfig, saveConfig } from '../src/main/config-store'
import { DEFAULT_NOTES_PANE_WIDTH } from '../src/shared/layout'

describe('config-store notes prefs', () => {
  it('defaults missing notes prefs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thinkai-cfg-'))
    const file = path.join(dir, 'config.json')
    fs.writeFileSync(
      file,
      JSON.stringify({
        workspaces: [],
        platforms: {},
        prefs: { lastPlatform: 'chatgpt', lastAccountId: null },
      }),
    )
    const cfg = loadConfig(file)
    expect(cfg.prefs.notesFolderPath).toBeNull()
    expect(cfg.prefs.notesSplitEnabled).toBe(false)
    expect(cfg.prefs.notesPaneWidth).toBe(DEFAULT_NOTES_PANE_WIDTH)
    expect(cfg.prefs.lastNotePath).toBeNull()
  })

  it('round-trips notes prefs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thinkai-cfg-'))
    const file = path.join(dir, 'config.json')
    const cfg = loadConfig(file)
    cfg.prefs.notesFolderPath = '/tmp/notes'
    cfg.prefs.notesSplitEnabled = true
    cfg.prefs.notesPaneWidth = 420
    cfg.prefs.lastNotePath = '/tmp/notes/a.md'
    saveConfig(file, cfg)
    const again = loadConfig(file)
    expect(again.prefs.notesFolderPath).toBe('/tmp/notes')
    expect(again.prefs.notesSplitEnabled).toBe(true)
    expect(again.prefs.notesPaneWidth).toBe(420)
    expect(again.prefs.lastNotePath).toBe('/tmp/notes/a.md')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/config-store.test.ts`
Expected: FAIL on missing prefs fields / `DEFAULT_NOTES_PANE_WIDTH`.

- [ ] **Step 3: Extend types + defaults + normalize**

In `src/shared/types.ts`, extend `prefs`:

```ts
prefs: {
  lastPlatform: PlatformId
  lastAccountId: string | null
  lastAccountIdByPlatform: Partial<Record<PlatformId, string | null>>
  sidebarWidth: number
  themeMode: ThemeMode
  notesFolderPath: string | null
  notesSplitEnabled: boolean
  notesPaneWidth: number
  lastNotePath: string | null
}
```

In `src/main/default-config.ts`, import `DEFAULT_NOTES_PANE_WIDTH` from layout (added in Task 2 — if Task 1 runs first, temporarily use `400` then switch, **or** implement Task 2 constants before finishing this step). Prefer implementing layout constants from Task 2 Step 3 first if blocked.

```ts
notesFolderPath: null,
notesSplitEnabled: false,
notesPaneWidth: DEFAULT_NOTES_PANE_WIDTH,
lastNotePath: null,
```

In `src/main/config-store.ts` `normalizeConfig`, after `themeMode`:

```ts
const notesFolderPath =
  obj.prefs &&
  (obj.prefs.notesFolderPath === null || typeof obj.prefs.notesFolderPath === 'string')
    ? obj.prefs.notesFolderPath
    : null
const notesSplitEnabled = Boolean(
  obj.prefs && typeof obj.prefs === 'object' && (obj.prefs as { notesSplitEnabled?: unknown }).notesSplitEnabled,
)
const notesPaneWidth = clampNotesPaneWidth(
  obj.prefs && typeof (obj.prefs as { notesPaneWidth?: unknown }).notesPaneWidth === 'number'
    ? (obj.prefs as { notesPaneWidth: number }).notesPaneWidth
    : DEFAULT_NOTES_PANE_WIDTH,
)
const lastNotePath =
  obj.prefs &&
  (obj.prefs.lastNotePath === null || typeof obj.prefs.lastNotePath === 'string')
    ? obj.prefs.lastNotePath
    : null
```

Include these four fields in the returned `prefs` object. Import `clampNotesPaneWidth` and `DEFAULT_NOTES_PANE_WIDTH` from `../shared/layout`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/config-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add src/shared/types.ts src/main/default-config.ts src/main/config-store.ts tests/config-store.test.ts src/shared/layout.ts
git commit -m "Add ThinkAI notes prefs to config migration."
```

---

### Task 2: Split layout helpers

**Files:**
- Modify: `src/shared/layout.ts`
- Modify: `tests/layout.test.ts`

**Interfaces:**
- Produces:
  - `DEFAULT_NOTES_PANE_WIDTH = 420`
  - `MIN_NOTES_PANE_WIDTH = 280`
  - `MAX_NOTES_PANE_WIDTH = 720`
  - `NOTES_SPLIT_HANDLE_WIDTH = 6`
  - `clampNotesPaneWidth(value: number): number`
  - `sessionContentBounds(windowWidth, windowHeight, sidebarWidth, options?: SessionBoundsOptions)`
  - `type SessionBoundsOptions = { splitEnabled?: boolean; notesPaneWidth?: number; webviewVisible?: boolean }`

- [ ] **Step 1: Write failing layout tests**

Append to `tests/layout.test.ts`:

```ts
import {
  clampNotesPaneWidth,
  DEFAULT_NOTES_PANE_WIDTH,
  MIN_NOTES_PANE_WIDTH,
  MAX_NOTES_PANE_WIDTH,
  NOTES_SPLIT_HANDLE_WIDTH,
  sessionContentBounds,
} from '../src/shared/layout'

it('clamps notes pane width', () => {
  expect(clampNotesPaneWidth(100)).toBe(MIN_NOTES_PANE_WIDTH)
  expect(clampNotesPaneWidth(9999)).toBe(MAX_NOTES_PANE_WIDTH)
  expect(clampNotesPaneWidth(400)).toBe(400)
  expect(clampNotesPaneWidth(Number.NaN)).toBe(DEFAULT_NOTES_PANE_WIDTH)
})

it('shrinks webview when split is enabled', () => {
  const full = sessionContentBounds(1400, 900, 220)
  const split = sessionContentBounds(1400, 900, 220, {
    splitEnabled: true,
    notesPaneWidth: 420,
    webviewVisible: true,
  })
  expect(split.x).toBeGreaterThan(full.x)
  expect(split.width).toBeLessThan(full.width)
  expect(split.y).toBe(full.y)
  expect(split.height).toBe(full.height)
  // notes take 420 + split handle inside the stage after sidebar
  expect(split.x).toBe(full.x + 420 + NOTES_SPLIT_HANDLE_WIDTH)
})

it('hides webview when not visible', () => {
  const b = sessionContentBounds(1400, 900, 220, { webviewVisible: false })
  expect(b.width).toBe(0)
  expect(b.height).toBe(0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/layout.test.ts`
Expected: FAIL — missing exports / options ignored.

- [ ] **Step 3: Implement layout helpers**

Add to `src/shared/layout.ts`:

```ts
export const DEFAULT_NOTES_PANE_WIDTH = 420
export const MIN_NOTES_PANE_WIDTH = 280
export const MAX_NOTES_PANE_WIDTH = 720
export const NOTES_SPLIT_HANDLE_WIDTH = 6

export function clampNotesPaneWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_NOTES_PANE_WIDTH
  return Math.min(MAX_NOTES_PANE_WIDTH, Math.max(MIN_NOTES_PANE_WIDTH, Math.round(value)))
}

export type SessionBoundsOptions = {
  splitEnabled?: boolean
  notesPaneWidth?: number
  /** When false, return zero-size off-stage bounds (notes-only mode). Default true. */
  webviewVisible?: boolean
}

export function sessionContentBounds(
  windowWidth: number,
  windowHeight: number,
  sidebarWidth: number,
  options: SessionBoundsOptions = {},
): { x: number; y: number; width: number; height: number } {
  const webviewVisible = options.webviewVisible !== false
  if (!webviewVisible) {
    return { x: -10_000, y: -10_000, width: 0, height: 0 }
  }

  const side = clampSidebarWidth(sidebarWidth)
  let x = side + RESIZE_HANDLE_WIDTH + STAGE_INSET
  const y = TOP_BAR_HEIGHT + STAGE_INSET
  let width = Math.max(100, windowWidth - x - STAGE_INSET)
  const height = Math.max(100, windowHeight - TOP_BAR_HEIGHT - STAGE_INSET * 2)

  if (options.splitEnabled) {
    const notes = clampNotesPaneWidth(options.notesPaneWidth ?? DEFAULT_NOTES_PANE_WIDTH)
    x += notes + NOTES_SPLIT_HANDLE_WIDTH
    width = Math.max(100, windowWidth - x - STAGE_INSET)
  }

  return { x, y, width, height }
}
```

Keep existing no-options call sites working (webview full stage).

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/layout.test.ts`
Expected: PASS (update the existing “without right panel” test if numbers change — they should not).

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add src/shared/layout.ts tests/layout.test.ts
git commit -m "Add notes split bounds helpers for ThinkAI stage."
```

---

### Task 3: Frontmatter + managed link line

**Files:**
- Create: `src/shared/note-frontmatter.ts`
- Create: `tests/note-frontmatter.test.ts`

**Interfaces:**
- Produces:
  - `type NoteFrontmatter = { title?: string; chat_url?: string; account_id?: string; platform?: string; linked_at?: string; [key: string]: string | undefined }`
  - `parseNoteMarkdown(raw: string): { frontmatter: NoteFrontmatter; body: string }`
  - `serializeNoteMarkdown(frontmatter: NoteFrontmatter, body: string): string`
  - `applyChatLink(raw: string, link: { chat_url: string; account_id: string; platform: string; linked_at: string }): string`
  - `removeChatLink(raw: string): string`
  - `LINKED_CHAT_LINE_RE` — matches a single line `[Linked chat](url)`

- [ ] **Step 1: Write failing tests**

```ts
// tests/note-frontmatter.test.ts
import { describe, it, expect } from 'vitest'
import {
  parseNoteMarkdown,
  serializeNoteMarkdown,
  applyChatLink,
  removeChatLink,
} from '../src/shared/note-frontmatter'

describe('note-frontmatter', () => {
  it('round-trips frontmatter and body', () => {
    const raw = `---
title: Hello
chat_url: https://chatgpt.com/c/abc
---

Body line
`
    const parsed = parseNoteMarkdown(raw)
    expect(parsed.frontmatter.title).toBe('Hello')
    expect(parsed.frontmatter.chat_url).toBe('https://chatgpt.com/c/abc')
    expect(parsed.body.trim()).toBe('Body line')
    const again = parseNoteMarkdown(serializeNoteMarkdown(parsed.frontmatter, parsed.body))
    expect(again.frontmatter.title).toBe('Hello')
    expect(again.body.trim()).toBe('Body line')
  })

  it('applyChatLink sets frontmatter and managed body line', () => {
    const raw = `---
title: N
---

Notes here
`
    const next = applyChatLink(raw, {
      chat_url: 'https://claude.ai/chat/xyz',
      account_id: 'acc-1',
      platform: 'claude',
      linked_at: '2026-07-27T00:00:00.000Z',
    })
    const parsed = parseNoteMarkdown(next)
    expect(parsed.frontmatter.chat_url).toBe('https://claude.ai/chat/xyz')
    expect(parsed.frontmatter.account_id).toBe('acc-1')
    expect(parsed.body.startsWith('[Linked chat](https://claude.ai/chat/xyz)')).toBe(true)
    expect(parsed.body).toContain('Notes here')
  })

  it('applyChatLink replaces previous link', () => {
    const once = applyChatLink(`---\ntitle: N\n---\n\nHi\n`, {
      chat_url: 'https://chatgpt.com/c/1',
      account_id: 'a',
      platform: 'chatgpt',
      linked_at: '2026-07-27T00:00:00.000Z',
    })
    const twice = applyChatLink(once, {
      chat_url: 'https://chatgpt.com/c/2',
      account_id: 'a',
      platform: 'chatgpt',
      linked_at: '2026-07-27T01:00:00.000Z',
    })
    const parsed = parseNoteMarkdown(twice)
    expect(parsed.frontmatter.chat_url).toBe('https://chatgpt.com/c/2')
    expect(parsed.body.match(/\[Linked chat\]/g)?.length).toBe(1)
  })

  it('removeChatLink clears link fields and managed line', () => {
    const linked = applyChatLink(`---\ntitle: N\n---\n\nHi\n`, {
      chat_url: 'https://chatgpt.com/c/1',
      account_id: 'a',
      platform: 'chatgpt',
      linked_at: '2026-07-27T00:00:00.000Z',
    })
    const cleared = removeChatLink(linked)
    const parsed = parseNoteMarkdown(cleared)
    expect(parsed.frontmatter.chat_url).toBeUndefined()
    expect(parsed.frontmatter.account_id).toBeUndefined()
    expect(parsed.body).not.toContain('[Linked chat]')
    expect(parsed.body).toContain('Hi')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/note-frontmatter.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement minimal YAML frontmatter (string values only)**

```ts
// src/shared/note-frontmatter.ts
export type NoteFrontmatter = {
  title?: string
  chat_url?: string
  account_id?: string
  platform?: string
  linked_at?: string
  [key: string]: string | undefined
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
export const LINKED_CHAT_LINE_RE = /^\[Linked chat\]\(([^)]+)\)\s*$/m

export function parseNoteMarkdown(raw: string): { frontmatter: NoteFrontmatter; body: string } {
  const m = raw.match(FM_RE)
  if (!m) return { frontmatter: {}, body: raw }
  const frontmatter: NoteFrontmatter = {}
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) frontmatter[key] = value
  }
  return { frontmatter, body: raw.slice(m[0].length) }
}

export function serializeNoteMarkdown(frontmatter: NoteFrontmatter, body: string): string {
  const keys = Object.keys(frontmatter).filter((k) => frontmatter[k] != null && frontmatter[k] !== '')
  if (keys.length === 0) return body.startsWith('\n') ? body : body
  const lines = keys.map((k) => `${k}: ${frontmatter[k]}`)
  const normalizedBody = body.replace(/^\r?\n/, '')
  return `---\n${lines.join('\n')}\n---\n\n${normalizedBody}`
}

function stripManagedLinkLine(body: string): string {
  const lines = body.split(/\r?\n/)
  const out: string[] = []
  let skipped = false
  for (const line of lines) {
    if (!skipped && LINKED_CHAT_LINE_RE.test(line)) {
      skipped = true
      continue
    }
    out.push(line)
  }
  return out.join('\n').replace(/^\r?\n+/, '')
}

export function applyChatLink(
  raw: string,
  link: { chat_url: string; account_id: string; platform: string; linked_at: string },
): string {
  const { frontmatter, body } = parseNoteMarkdown(raw)
  frontmatter.chat_url = link.chat_url
  frontmatter.account_id = link.account_id
  frontmatter.platform = link.platform
  frontmatter.linked_at = link.linked_at
  const rest = stripManagedLinkLine(body)
  const nextBody = `[Linked chat](${link.chat_url})\n\n${rest}`.replace(/\n+$/, '\n')
  return serializeNoteMarkdown(frontmatter, nextBody)
}

export function removeChatLink(raw: string): string {
  const { frontmatter, body } = parseNoteMarkdown(raw)
  delete frontmatter.chat_url
  delete frontmatter.account_id
  delete frontmatter.platform
  delete frontmatter.linked_at
  return serializeNoteMarkdown(frontmatter, stripManagedLinkLine(body))
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/note-frontmatter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add src/shared/note-frontmatter.ts tests/note-frontmatter.test.ts
git commit -m "Add markdown frontmatter helpers for note chat links."
```

---

### Task 4: Weak chat URL heuristic

**Files:**
- Create: `src/shared/note-link.ts`
- Create: `tests/note-link.test.ts`

**Interfaces:**
- Produces: `isWeakChatUrl(url: string): boolean` — true when URL is empty, invalid, or looks like a site homepage / auth page rather than a conversation.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { isWeakChatUrl } from '../src/shared/note-link'

describe('isWeakChatUrl', () => {
  it('flags empty and homepages', () => {
    expect(isWeakChatUrl('')).toBe(true)
    expect(isWeakChatUrl('https://chatgpt.com/')).toBe(true)
    expect(isWeakChatUrl('https://chatgpt.com')).toBe(true)
    expect(isWeakChatUrl('https://claude.ai/')).toBe(true)
    expect(isWeakChatUrl('https://claude.ai/login')).toBe(true)
  })

  it('allows conversation-looking paths', () => {
    expect(isWeakChatUrl('https://chatgpt.com/c/abc-123')).toBe(false)
    expect(isWeakChatUrl('https://claude.ai/chat/abc-123')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/note-link.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

```ts
// src/shared/note-link.ts
const WEAK_PATHS = new Set(['', '/', '/login', '/signin', '/auth', '/intro', '/new'])

export function isWeakChatUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return true
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return true
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true
  const path = parsed.pathname.replace(/\/+$/, '') || '/'
  if (WEAK_PATHS.has(path) || WEAK_PATHS.has(parsed.pathname)) return true
  // require at least one path segment beyond root that isn't a known marketing page
  const segments = path.split('/').filter(Boolean)
  if (segments.length < 2) return true
  return false
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/note-link.test.ts`
Expected: PASS

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add src/shared/note-link.ts tests/note-link.test.ts
git commit -m "Add weak chat URL heuristic for note linking."
```

---

### Task 5: Notes service (filesystem)

**Files:**
- Create: `src/main/notes-service.ts`
- Create: `tests/notes-service.test.ts`
- Create: `fixtures/notes-sample/alpha.md` (optional fixture; tests may use temp dirs)

**Interfaces:**
- Produces:
  - `type NoteListItem = { path: string; title: string; linked: boolean }`
  - `notesFolderHealth(folderPath: string | null): 'ok' | 'missing' | 'unreadable' | 'unset'`
  - `listNotes(folderPath: string): NoteListItem[]`
  - `readNote(filePath: string, folderPath: string): { ok: true; raw: string } | { ok: false; reason: string }`
  - `writeNote(filePath: string, folderPath: string, raw: string): { ok: true } | { ok: false; reason: string }`
  - `createNote(folderPath: string, title: string): { ok: true; path: string } | { ok: false; reason: string }`
  - `renameNote(filePath: string, folderPath: string, nextTitle: string): { ok: true; path: string } | { ok: false; reason: string }`
  - `deleteNote(filePath: string, folderPath: string): { ok: true } | { ok: false; reason: string }`
  - `isPathInsideNotesFolder(filePath: string, folderPath: string): boolean`

- [ ] **Step 1: Write failing tests**

```ts
// tests/notes-service.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  listNotes,
  createNote,
  readNote,
  writeNote,
  deleteNote,
  notesFolderHealth,
} from '../src/main/notes-service'

function tmpNotes(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thinkai-notes-'))
  fs.writeFileSync(
    path.join(dir, 'one.md'),
    `---\ntitle: One\nchat_url: https://chatgpt.com/c/x\n---\n\nHi\n`,
  )
  fs.writeFileSync(path.join(dir, 'two.md'), `# No fm\n`)
  fs.mkdirSync(path.join(dir, 'nested'))
  fs.writeFileSync(path.join(dir, 'nested', 'hidden.md'), 'nope')
  return dir
}

describe('notes-service', () => {
  it('lists top-level md only with titles and link flag', () => {
    const dir = tmpNotes()
    const items = listNotes(dir)
    expect(items.map((i) => path.basename(i.path)).sort()).toEqual(['one.md', 'two.md'])
    const one = items.find((i) => i.path.endsWith('one.md'))!
    expect(one.title).toBe('One')
    expect(one.linked).toBe(true)
  })

  it('creates reads writes deletes within folder', () => {
    const dir = tmpNotes()
    expect(notesFolderHealth(dir)).toBe('ok')
    const created = createNote(dir, 'Fresh idea')
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const read = readNote(created.path, dir)
    expect(read.ok).toBe(true)
    if (!read.ok) return
    const written = writeNote(created.path, dir, read.raw + '\nmore\n')
    expect(written.ok).toBe(true)
    expect(deleteNote(created.path, dir).ok).toBe(true)
  })

  it('rejects paths outside folder', () => {
    const dir = tmpNotes()
    const outside = path.join(os.tmpdir(), 'outside.md')
    fs.writeFileSync(outside, 'x')
    expect(readNote(outside, dir).ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/notes-service.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/main/notes-service.ts`**

Use `fs`, `path`, `randomUUID` only as needed. Sanitize filenames from titles (`Fresh idea` → `Fresh idea.md`, replace `/\\` with `-`). On create, write:

```markdown
---
title: Fresh idea
---


```

Use `parseNoteMarkdown` for title/linked detection. `listNotes` sorts by title localeCompare. Enforce `isPathInsideNotesFolder` on read/write/rename/delete (realpath when possible, same pattern as workspace-service).

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/notes-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add src/main/notes-service.ts tests/notes-service.test.ts
git commit -m "Add local markdown notes filesystem service."
```

---

### Task 6: Session URL capture + navigate

**Files:**
- Modify: `src/main/session-manager.ts`
- Modify: `src/main/ipc.ts` (handlers added in Task 7; methods here)

**Interfaces:**
- Produces:
  - `SessionManager.getActiveURL(): string | null`
  - `SessionManager.navigateActive(url: string): boolean`

- [ ] **Step 1: Add methods to SessionManager**

```ts
getActiveURL(): string | null {
  const wc = this.getActiveWebContents()
  if (!wc) return null
  try {
    return wc.getURL() || null
  } catch {
    return null
  }
}

navigateActive(url: string): boolean {
  const wc = this.getActiveWebContents()
  if (!wc) return false
  try {
    void wc.loadURL(url)
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (or only pre-existing errors unrelated to this).

- [ ] **Step 3: Commit (only if user asked)**

```bash
git add src/main/session-manager.ts
git commit -m "Allow capturing and navigating the active session URL."
```

---

### Task 7: IPC + preload + env typings

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/env.d.ts`
- Modify: `src/shared/types.ts` (export `NoteListItem` if not already from notes-service — prefer defining `NoteListItem` in `src/shared/types.ts` and importing it in notes-service)

**Interfaces:**
- Produces IPC channels and matching preload names (use these exact identifiers in later tasks):
  - `notes:chooseFolder` → `chooseNotesFolder(): Promise<string | null>`
  - `notes:list` → `listNotes(): Promise<NoteListItem[]>`
  - `notes:read` → `readNote(filePath): Promise<{ ok: true; raw: string } | { ok: false; reason: string }>`
  - `notes:write` → `writeNote(filePath, raw): Promise<{ ok: true } | { ok: false; reason: string }>`
  - `notes:create` → `createNote(title): Promise<{ ok: true; path: string } | { ok: false; reason: string }>`
  - `notes:rename` → `renameNote(filePath, title): Promise<{ ok: true; path: string } | { ok: false; reason: string }>`
  - `notes:delete` → `deleteNote(filePath): Promise<{ ok: true } | { ok: false; reason: string }>`
  - `notes:applyLink` → `applyNoteLink(filePath, link): Promise<{ ok: true } | { ok: false; reason: string }>`
  - `notes:removeLink` → `removeNoteLink(filePath): Promise<{ ok: true } | { ok: false; reason: string }>`
  - `prefs:setNotesSplit` → `setNotesSplit(enabled: boolean): Promise<boolean>`
  - `prefs:setNotesPaneWidth` → `setNotesPaneWidth(width: number): Promise<number>`
  - `prefs:setLastNotePath` → `setLastNotePath(filePath: string | null): Promise<string | null>`
  - `sessions:getUrl` → `getSessionUrl(): Promise<string | null>`
  - `sessions:navigate` → `navigateSession(url: string): Promise<boolean>`

Move `NoteListItem` to `src/shared/types.ts`:

```ts
export type NoteListItem = {
  path: string
  title: string
  linked: boolean
}
```

- [ ] **Step 1: Register handlers in `registerIpc`**

Pattern for choose folder (mirror workspace:add):

```ts
ipcMain.handle('notes:chooseFolder', async () => {
  const win = ctx.getWindow()
  if (!win) return null
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const notesFolderPath = result.filePaths[0]
  const prev = ctx.getConfig()
  ctx.setConfig({
    ...prev,
    prefs: { ...prev.prefs, notesFolderPath, lastNotePath: null },
  })
  ctx.persist()
  ctx.broadcastConfig()
  return notesFolderPath
})
```

For list/read/write/create/rename/delete: read `ctx.getConfig().prefs.notesFolderPath`; if unset return empty / `{ ok:false, reason:'No notes folder' }`.

For `notes:applyLink` / `notes:removeLink`: read file, transform with shared helpers, write back.

```ts
ipcMain.handle('sessions:getUrl', () => ctx.getSessions()?.getActiveURL() ?? null)
ipcMain.handle('sessions:navigate', (_e, url: string) => {
  if (typeof url !== 'string' || !url) return false
  return ctx.getSessions()?.navigateActive(url) ?? false
})
```

Prefs setters mirror `prefs:setSidebarWidth`.

- [ ] **Step 2: Expose on preload `AiWrapperApi` (keep type name or rename to `ThinkAiApi` — either is fine; keep `window.api`)**

Add corresponding `ipcRenderer.invoke` methods.

- [ ] **Step 3: Update `src/renderer/env.d.ts` to match**

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit (only if user asked)**

```bash
git add src/main/ipc.ts src/preload/index.ts src/renderer/env.d.ts src/shared/types.ts src/main/notes-service.ts
git commit -m "Wire notes and session URL IPC for ThinkAI."
```

---

### Task 8: ThinkAI branding + 13px nav chrome

**Files:**
- Modify: `package.json` (`productName`, `description`, `author` display strings — **do not change `appId`**)
- Modify: `src/main/index.ts` (`title: 'ThinkAI'`)
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/App.ts` (brand text)
- Modify: `src/renderer/tokens.css` / `styles.css`
- Modify: `README.md` (product name + notes bullets)

**Interfaces:**
- Produces: User-visible ThinkAI naming; section titles / topbar controls use ~13px.

- [ ] **Step 1: Branding string updates**

- `package.json`: `"productName": "ThinkAI"`, description/author mention ThinkAI; leave `"appId": "com.aiwrapper.desktop"`.
- Window + HTML + `.rail-brand` / topbar title → `ThinkAI`.
- README title/usage: ThinkAI; document Notes folder + side-by-side + link actions.

- [ ] **Step 2: Nav font ~13px**

In `styles.css`, set:

```css
.section-title {
  font-size: var(--text-md); /* 13px */
}
.topbar-add select,
.topbar-add input[type='text'],
.topbar .status,
.action {
  font-size: var(--text-md);
}
```

Keep brand mark slightly larger via `--text-brand` if desired.

- [ ] **Step 3: Manual/dev sanity**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 4: Commit (only if user asked)**

```bash
git add package.json src/main/index.ts src/renderer/index.html src/renderer/App.ts src/renderer/styles.css src/renderer/tokens.css README.md
git commit -m "Rebrand shell to ThinkAI and bump nav text to 13px."
```

---

### Task 9: Notes-first shell layout (sidebar + stage + split)

**Files:**
- Modify: `src/renderer/App.ts`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Consumes: `sessionContentBounds(..., { splitEnabled, notesPaneWidth, webviewVisible })`, notes prefs, `setNotesSplit`, `setNotesPaneWidth`, `setSessionBounds`
- Produces: UI structure with collapsible Accounts + Notes (+ minimal Workspace section using existing workspace APIs), notes editor pane, split toggle, notes/webview split handle

- [ ] **Step 1: Restructure shell HTML in `mountApp`**

Replace center stage with:

```html
<div class="stage-frame" id="stage-frame">
  <div class="notes-pane" id="notes-pane">
    <div class="notes-toolbar">
      <button type="button" id="notes-choose-folder">Choose folder</button>
      <button type="button" id="notes-new">New note</button>
      <button type="button" id="notes-link">Link current chat</button>
      <button type="button" id="notes-paste-link">Paste chat URL</button>
      <button type="button" id="notes-open-link">Open linked chat</button>
      <button type="button" id="notes-unlink">Unlink</button>
      <button type="button" id="notes-delete">Delete</button>
    </div>
    <input id="note-title" type="text" placeholder="Title" />
    <textarea id="note-body" placeholder="Markdown body…"></textarea>
    <p class="notes-empty" id="notes-empty">Pick or create a note</p>
  </div>
  <div class="notes-split-handle" id="notes-split-handle" hidden></div>
  <div class="webview-slot" id="webview-slot" aria-hidden="true"></div>
</div>
```

Sidebar order:

1. Brand ThinkAI  
2. `<details open>` **Accounts** (platforms list + account list + manage menu)  
3. `<details open>` **Notes** (`#note-list`, choose-folder hint)  
4. `<details>` **Workspace** (Add folder / list / existing assist hooks if present in API — minimal: add workspace button + list paths)  
5. Theme toggle footer  

Top bar: keep Add account controls; add:

```html
<button type="button" id="toggle-split" class="action">Side by side</button>
```

- [ ] **Step 2: Wire split state + bounds reporting**

```ts
let notesSplitEnabled = config.prefs.notesSplitEnabled
let notesPaneWidth = clampNotesPaneWidth(config.prefs.notesPaneWidth)
let activeNotePath: string | null = config.prefs.lastNotePath

function reportBounds(): void {
  const webviewVisible = notesSplitEnabled || !activeNotePath
  void window.api.setSessionBounds(
    sessionContentBounds(window.innerWidth, window.innerHeight, sidebarWidth, {
      splitEnabled: notesSplitEnabled && Boolean(activeNotePath || notesSplitEnabled),
      notesPaneWidth,
      webviewVisible: notesSplitEnabled ? true : !activeNotePath,
    }),
  )
}
```

Mode rules from spec:

| Mode | webviewVisible | splitEnabled option |
|------|----------------|---------------------|
| Split on | true | true |
| Split off + note selected | false | false |
| Split off + no note | true | false |

Toggle button calls `prefs:setNotesSplit` and `reportBounds`. Notes split handle drag updates `notesPaneWidth` via `prefs:setNotesPaneWidth` (mirror sidebar resize).

CSS: `.stage-frame` becomes grid when split on: `minmax(0, var(--notes-pane)) auto minmax(0, 1fr)`; notes pane visible; when split off + note, notes pane full width; when no note and split off, notes empty state can sit under topbar while webview fills (notes pane `display:none` or zero width).

- [ ] **Step 3: Run typecheck + unit tests**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 4: Commit (only if user asked)**

```bash
git add src/renderer/App.ts src/renderer/styles.css
git commit -m "Rebuild ThinkAI shell with notes pane and side-by-side split."
```

---

### Task 10: Notes list + editor autosave

**Files:**
- Modify: `src/renderer/App.ts`

**Interfaces:**
- Consumes: `notes:list|read|write|create|delete|chooseFolder`, `prefs:setLastNotePath`

- [ ] **Step 1: Implement list rendering and selection**

- On config update / folder choose / window `focus`: `const items = await window.api.listNotes()` (name per preload).
- Render buttons in `#note-list`; linked notes show a `🔗` or `.linked` class.
- Click → `readNote`, fill `#note-title` + `#note-body` (body = raw without forcing users to edit frontmatter manually — **v1 approach:** show editable title field + body textarea as **full raw markdown** OR title+body split:
  - **Required v1:** edit **full raw file** in the textarea (simplest, preserves frontmatter), and keep title input synced from parsed `title` on load / updates frontmatter title on save.
  - On save: if title input changed, parse → set `frontmatter.title` → serialize with current body text carefully.
  - Simpler acceptable v1: **single textarea = full file raw**; title input writes through on blur into frontmatter then rewrite textarea. Pick **single raw textarea + title input that updates frontmatter on blur/save**.

- [ ] **Step 2: Autosave**

Debounce 400ms on textarea input → `notes:write`. On blur, flush immediately. Track `dirty` flag; on focus refresh, if dirty and file mtime changed, `setStatus('Note changed on disk; keeping your edits')` and skip reload.

- [ ] **Step 3: New / delete / choose folder**

Wire toolbar buttons to IPC; after create, select new path; delete confirms via `window.api.confirm`.

- [ ] **Step 4: Persist `lastNotePath` on select**

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 6: Commit (only if user asked)**

```bash
git add src/renderer/App.ts
git commit -m "Add notes list, editor, and autosave."
```

---

### Task 11: Link / paste / open / unlink flows

**Files:**
- Modify: `src/renderer/App.ts`
- Modify: `src/main/ipc.ts` (if open-link orchestration is easier server-side — prefer renderer orchestration)

**Interfaces:**
- Consumes: `sessions:getUrl`, `sessions:navigate`, `showAccount`, `notes:applyLink`, `notes:removeLink`, `isWeakChatUrl` (import in renderer from shared)

- [ ] **Step 1: Link to current chat**

```ts
async function linkCurrentChat(): Promise<void> {
  if (!activeNotePath) {
    setStatus('Select a note first')
    return
  }
  if (!accountId) {
    setStatus('Select an account first')
    return
  }
  const url = await window.api.getSessionUrl()
  if (!url || isWeakChatUrl(url)) {
    setStatus('Current page does not look like a chat URL — use Paste chat URL')
    return
  }
  const result = await window.api.applyNoteLink(activeNotePath, {
    chat_url: url,
    account_id: accountId,
    platform: platformId,
    linked_at: new Date().toISOString(),
  })
  if (!result.ok) {
    setStatus(result.reason)
    return
  }
  await reloadActiveNote()
  await refreshNoteList()
  setStatus('Linked note to chat')
}
```

- [ ] **Step 2: Paste chat URL**

Use `window.prompt` or a small inline modal input. Same apply path after `isWeakChatUrl` check (allow paste even if weak only when user confirms via `confirm`).

- [ ] **Step 3: Open linked chat**

Parse active note frontmatter (`parseNoteMarkdown` in renderer). Resolve account:

1. If `account_id` exists under `platform`, `showAccount(platform, account_id)`.
2. Else if `platform` valid, pick last account for that platform or first account; status warn if prompted choice needed — v1: use `resolveAccountForPlatform` / first account on that platform.
3. `setNotesSplit(true)`; `navigateSession(chat_url)`; `reportBounds()`.

- [ ] **Step 4: Unlink**

Call `notes:removeLink`; reload editor + list.

- [ ] **Step 5: Manual checklist note in README**

- Link on ChatGPT `/c/...` and Claude `/chat/...`
- Weak URL warning
- Open restores account + navigates + enables split

- [ ] **Step 6: Run full test suite**

Run: `npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit (only if user asked)**

```bash
git add src/renderer/App.ts README.md
git commit -m "Add note-to-chat link, paste, open, and unlink flows."
```

---

### Task 12: Smoke script + final docs pass

**Files:**
- Modify: `scripts/smoke-add-account.mjs`
- Modify: `README.md`

- [ ] **Step 1: Update smoke script**

If it asserts window title or UI strings `AI Wrapper`, change to `ThinkAI`. Keep Add account click path working with new topbar selectors.

- [ ] **Step 2: README success path**

Document:

1. Choose Notes folder  
2. Create note  
3. Sign into ChatGPT/Claude account  
4. Open a chat in the site → Link current chat (or paste)  
5. Toggle Side by side / Open linked chat  

- [ ] **Step 3: Run unit tests + smoke if display available**

Run: `npm test`
Run: `npm run test:smoke` (when possible)

Expected: unit PASS; smoke launches and Add account still works.

- [ ] **Step 4: Commit (only if user asked)**

```bash
git add scripts/smoke-add-account.mjs README.md
git commit -m "Update ThinkAI smoke script and notes usage docs."
```

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Rebrand ThinkAI | 8, 12 |
| Notes-first center stage | 9, 10 |
| Top bar kept + ~13px | 8, 9 |
| Stacked Accounts + Notes | 9 |
| User-picked `.md` folder | 5, 7, 10 |
| One note ↔ one chat | 3, 11 |
| Frontmatter + body link line | 3, 7, 11 |
| Capture or paste URL | 4, 6, 11 |
| Side-by-side anytime | 2, 9 |
| Open link → account + navigate + split | 6, 11 |
| Preserve partitions / workspace assist | 7, 9 (workspace section + existing IPC) |
| No API keys | Global constraint |
| Keep appId / userData | 8 |
| Error/recovery behaviors | 5, 10, 11 |
| Tests listed in spec | 1–5, 12 |

## Placeholder / consistency notes

- Preload method names in Task 11 (`getSessionUrl`, `applyNoteLink`, …) must match the exact names added in Task 7 — when implementing, pick one naming scheme in Task 7 and use it unchanged later (`getSessionUrl` ↔ `sessions:getUrl`, `applyNoteLink` ↔ `notes:applyLink`, etc.).
- `DEFAULT_NOTES_PANE_WIDTH` is defined in Task 2 and consumed by Task 1 — implement Task 2 constants before finishing Task 1 if running strictly in order.
