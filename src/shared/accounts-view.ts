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
