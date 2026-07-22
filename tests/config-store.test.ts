import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDefaultConfig } from '../src/main/default-config'
import { loadConfig, saveConfig } from '../src/main/config-store'
import { addAccount } from '../src/main/account-service'

describe('config-store', () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-wrapper-config-'))
    file = path.join(dir, 'config.json')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('returns default when missing', () => {
    const config = loadConfig(file)
    expect(config.platforms.claude.accounts).toEqual([])
    expect(config.workspaces).toEqual([])
  })

  it('round-trips accounts', () => {
    let config = createDefaultConfig()
    config = addAccount(config, 'gemini', 'Personal').config
    saveConfig(file, config)
    const loaded = loadConfig(file)
    expect(loaded.platforms.gemini.accounts).toHaveLength(1)
    expect(loaded.platforms.gemini.accounts[0].label).toBe('Personal')
  })

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
    expect(loaded.prefs.sidebarWidth).toBe(220)
    expect(loaded.prefs.themeMode).toBe('light')
    expect(loaded.platforms.perplexity.accounts).toEqual([])
    expect(loaded.platforms.groq.accounts).toEqual([])
    expect(loaded.platforms).not.toHaveProperty('openai_platform')
  })

  it('seeds lastAccountIdByPlatform from legacy lastAccountId', () => {
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
        prefs: { lastPlatform: 'claude', lastAccountId: 'acct-legacy-1' },
      }),
      'utf8',
    )
    const loaded = loadConfig(file)
    expect(loaded.prefs.lastAccountId).toBe('acct-legacy-1')
    expect(loaded.prefs.lastAccountIdByPlatform).toEqual({ claude: 'acct-legacy-1' })
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
    expect(loadConfig(file).prefs.sidebarWidth).toBe(180)
  })

  it('loads and clamps themeMode', () => {
    const base = createDefaultConfig()
    fs.writeFileSync(
      file,
      JSON.stringify({ ...base, prefs: { ...base.prefs, themeMode: 'dark' } }),
      'utf8',
    )
    expect(loadConfig(file).prefs.themeMode).toBe('dark')
    fs.writeFileSync(
      file,
      JSON.stringify({ ...base, prefs: { ...base.prefs, themeMode: 'neon' } }),
      'utf8',
    )
    expect(loadConfig(file).prefs.themeMode).toBe('light')
  })
})
