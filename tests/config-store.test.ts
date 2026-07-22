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
})
