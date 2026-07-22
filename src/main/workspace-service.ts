import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { canCopyTextContents, mimeHintFromPath } from '../shared/copy-limits'
import type {
  AppConfig,
  DirEntry,
  ReadTextResult,
  SearchHit,
  WorkspaceEntry,
  WorkspaceHealth,
} from '../shared/types'

const SKIP_DIR_NAMES = new Set(['node_modules', '.git', '.DS_Store', 'dist', 'out', '.cache'])
const MAX_CONTENT_SEARCH_BYTES = 1_000_000

export function addWorkspace(config: AppConfig, absPath: string): AppConfig {
  const resolved = path.resolve(absPath)
  if (config.workspaces.some((w) => w.path === resolved)) return config
  const entry: WorkspaceEntry = { id: randomUUID(), path: resolved }
  return { ...config, workspaces: [...config.workspaces, entry] }
}

export function removeWorkspace(config: AppConfig, id: string): AppConfig {
  return {
    ...config,
    workspaces: config.workspaces.filter((w) => w.id !== id),
  }
}

export function workspaceHealth(workspacePath: string): WorkspaceHealth {
  try {
    if (!fs.existsSync(workspacePath)) return 'missing'
    fs.accessSync(workspacePath, fs.constants.R_OK)
    const stat = fs.statSync(workspacePath)
    if (!stat.isDirectory()) return 'unreadable'
    return 'ok'
  } catch {
    return 'unreadable'
  }
}

function tryRealpath(p: string): string | null {
  try {
    return fs.realpathSync(p)
  } catch {
    return null
  }
}

export function isPathInsideWorkspace(filePath: string, workspaceRoots: string[]): boolean {
  const realFile = tryRealpath(filePath) ?? path.resolve(filePath)
  for (const root of workspaceRoots) {
    const realRoot = tryRealpath(root) ?? path.resolve(root)
    const rel = path.relative(realRoot, realFile)
    if (rel === '') return true
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) return true
  }
  return false
}

export function listDir(rootPaths: string[], relativeDir = ''): DirEntry[] {
  const entries: DirEntry[] = []
  for (const root of rootPaths) {
    if (workspaceHealth(root) !== 'ok') continue
    const target = relativeDir ? path.join(root, relativeDir) : root
    if (!isPathInsideWorkspace(target, rootPaths)) continue
    let names: string[]
    try {
      names = fs.readdirSync(target)
    } catch {
      continue
    }
    for (const name of names) {
      if (SKIP_DIR_NAMES.has(name)) continue
      const full = path.join(target, name)
      try {
        const stat = fs.statSync(full)
        entries.push({
          name,
          path: full,
          isDirectory: stat.isDirectory(),
        })
      } catch {
        // skip unreadable
      }
    }
  }
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return entries
}

function walkFiles(root: string, onFile: (filePath: string) => boolean): void {
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop()!
    let names: string[]
    try {
      names = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (SKIP_DIR_NAMES.has(name)) continue
      const full = path.join(dir, name)
      let stat: fs.Stats
      try {
        stat = fs.statSync(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        stack.push(full)
      } else if (stat.isFile()) {
        const keepGoing = onFile(full)
        if (!keepGoing) return
      }
    }
  }
}

export function searchFiles(
  rootPaths: string[],
  query: string,
  opts?: { maxResults?: number },
): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const maxResults = opts?.maxResults ?? 100
  const hits: SearchHit[] = []
  const seen = new Set<string>()

  for (const root of rootPaths) {
    if (workspaceHealth(root) !== 'ok') continue
    walkFiles(root, (filePath) => {
      if (hits.length >= maxResults) return false
      const base = path.basename(filePath).toLowerCase()
      if (base.includes(q)) {
        if (!seen.has(filePath)) {
          seen.add(filePath)
          hits.push({ path: filePath, matchType: 'name' })
        }
        return hits.length < maxResults
      }
      try {
        const stat = fs.statSync(filePath)
        if (stat.size > MAX_CONTENT_SEARCH_BYTES) return true
        const mime = mimeHintFromPath(filePath)
        if (
          !mime.startsWith('text/') &&
          mime !== 'application/json' &&
          mime !== 'application/javascript'
        ) {
          return true
        }
        const text = fs.readFileSync(filePath, 'utf8')
        if (text.toLowerCase().includes(q) && !seen.has(filePath)) {
          seen.add(filePath)
          hits.push({ path: filePath, matchType: 'content' })
        }
      } catch {
        // skip
      }
      return hits.length < maxResults
    })
  }
  return hits
}

export function readTextForCopy(filePath: string, workspaceRoots: string[]): ReadTextResult {
  if (!isPathInsideWorkspace(filePath, workspaceRoots)) {
    return { ok: false, reason: 'Path is outside granted workspaces' }
  }
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return { ok: false, reason: 'Not a file' }
    const mime = mimeHintFromPath(filePath)
    if (!canCopyTextContents(stat.size, mime)) {
      if (stat.size > 100_000) return { ok: false, reason: 'File too large to copy as text' }
      return { ok: false, reason: 'Binary or unsupported type — use path or prepare attach' }
    }
    const text = fs.readFileSync(filePath, 'utf8')
    return { ok: true, text }
  } catch {
    return { ok: false, reason: 'Unable to read file' }
  }
}
