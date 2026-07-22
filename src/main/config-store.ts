import fs from 'node:fs'
import path from 'node:path'
import { createDefaultConfig, isPlatformId } from './default-config'
import { clampSidebarWidth, DEFAULT_SIDEBAR_WIDTH } from '../shared/layout'
import { platformIds, type PlatformId } from '../shared/platforms'
import type { AppConfig } from '../shared/types'

function normalizeConfig(raw: unknown): AppConfig {
  const fallback = createDefaultConfig()
  if (!raw || typeof raw !== 'object') return fallback
  const obj = raw as Partial<AppConfig>
  const platforms = createDefaultConfig().platforms
  for (const id of platformIds()) {
    const incoming = obj.platforms?.[id]
    platforms[id] = {
      accounts: Array.isArray(incoming?.accounts)
        ? incoming.accounts.filter(
            (a) =>
              a &&
              typeof a.id === 'string' &&
              typeof a.label === 'string' &&
              typeof a.partition === 'string',
          )
        : [],
    }
  }
  const workspaces = Array.isArray(obj.workspaces)
    ? obj.workspaces.filter(
        (w) => w && typeof w.id === 'string' && typeof w.path === 'string',
      )
    : []
  const lastPlatform =
    obj.prefs && isPlatformId(String(obj.prefs.lastPlatform))
      ? obj.prefs.lastPlatform
      : fallback.prefs.lastPlatform
  const lastAccountId =
    obj.prefs && (obj.prefs.lastAccountId === null || typeof obj.prefs.lastAccountId === 'string')
      ? obj.prefs.lastAccountId
      : null
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
}

export function loadConfig(filePath: string): AppConfig {
  try {
    if (!fs.existsSync(filePath)) return createDefaultConfig()
    const text = fs.readFileSync(filePath, 'utf8')
    return normalizeConfig(JSON.parse(text))
  } catch {
    return createDefaultConfig()
  }
}

export function saveConfig(filePath: string, config: AppConfig): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8')
  fs.renameSync(tmp, filePath)
}
