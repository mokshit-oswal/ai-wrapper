import { describe, it, expect } from 'vitest'
import { createDefaultConfig } from '../src/main/default-config'
import {
  addAccount,
  removeAccount,
  renameAccount,
  partitionFor,
} from '../src/main/account-service'

describe('account-service', () => {
  it('adds account with unique partition', () => {
    const config = createDefaultConfig()
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
