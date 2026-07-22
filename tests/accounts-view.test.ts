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
