import { DEFAULT_SIDEBAR_WIDTH } from '../shared/layout'
import { platformIds, type PlatformId } from '../shared/platforms'
import type { AppConfig } from '../shared/types'

export function createDefaultConfig(): AppConfig {
  const platforms = {} as AppConfig['platforms']
  for (const id of platformIds()) {
    platforms[id] = { accounts: [] }
  }
  return {
    workspaces: [],
    platforms,
    prefs: {
      lastPlatform: 'chatgpt',
      lastAccountId: null,
      lastAccountIdByPlatform: {},
      sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    },
  }
}

export function isPlatformId(value: string): value is PlatformId {
  return (platformIds() as string[]).includes(value)
}
