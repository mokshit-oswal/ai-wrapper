import type { PlatformId } from './platforms'

export type Account = {
  id: string
  label: string
  partition: string
}

export type WorkspaceEntry = {
  id: string
  path: string
}

export type ThemeMode = 'light' | 'dark'

export type AppConfig = {
  workspaces: WorkspaceEntry[]
  platforms: Record<PlatformId, { accounts: Account[] }>
  prefs: {
    lastPlatform: PlatformId
    lastAccountId: string | null
    lastAccountIdByPlatform: Partial<Record<PlatformId, string | null>>
    sidebarWidth: number
    themeMode: ThemeMode
  }
}

export type DirEntry = {
  name: string
  path: string
  isDirectory: boolean
}

export type SearchHit = {
  path: string
  matchType: 'name' | 'content'
}

export type ReadTextResult =
  | { ok: true; text: string }
  | { ok: false; reason: string }

export type WorkspaceHealth = 'ok' | 'missing' | 'unreadable'
