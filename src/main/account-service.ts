import { randomUUID } from 'node:crypto'
import type { PlatformId } from '../shared/platforms'
import type { Account, AppConfig } from '../shared/types'

export function partitionFor(platformId: PlatformId, accountId: string): string {
  return `persist:${platformId}-${accountId}`
}

export function addAccount(
  config: AppConfig,
  platformId: PlatformId,
  label: string,
): { config: AppConfig; account: Account } {
  const id = randomUUID()
  const account: Account = {
    id,
    label: label.trim() || 'Account',
    partition: partitionFor(platformId, id),
  }
  const next: AppConfig = {
    ...config,
    platforms: {
      ...config.platforms,
      [platformId]: {
        accounts: [...config.platforms[platformId].accounts, account],
      },
    },
  }
  return { config: next, account }
}

export function renameAccount(
  config: AppConfig,
  platformId: PlatformId,
  accountId: string,
  label: string,
): AppConfig {
  const accounts = config.platforms[platformId].accounts.map((a) =>
    a.id === accountId ? { ...a, label: label.trim() || a.label } : a,
  )
  return {
    ...config,
    platforms: {
      ...config.platforms,
      [platformId]: { accounts },
    },
  }
}

export function removeAccount(
  config: AppConfig,
  platformId: PlatformId,
  accountId: string,
): AppConfig {
  const accounts = config.platforms[platformId].accounts.filter((a) => a.id !== accountId)
  const lastAccountIdByPlatform = { ...config.prefs.lastAccountIdByPlatform }
  if (lastAccountIdByPlatform[platformId] === accountId) {
    lastAccountIdByPlatform[platformId] = null
  }
  const prefs = {
    ...config.prefs,
    lastAccountId: config.prefs.lastAccountId === accountId ? null : config.prefs.lastAccountId,
    lastAccountIdByPlatform,
  }
  return {
    ...config,
    prefs,
    platforms: {
      ...config.platforms,
      [platformId]: { accounts },
    },
  }
}

export function findAccount(
  config: AppConfig,
  platformId: PlatformId,
  accountId: string,
): Account | undefined {
  return config.platforms[platformId].accounts.find((a) => a.id === accountId)
}
