import { describe, it, expect } from 'vitest'
import { PLATFORMS, platformIds } from '../src/shared/platforms'

describe('PLATFORMS', () => {
  it('has exactly four platforms with expected ids', () => {
    expect(platformIds()).toEqual(['chatgpt', 'claude', 'gemini', 'openai_platform'])
  })

  it('maps chatgpt to chatgpt.com', () => {
    expect(PLATFORMS.chatgpt.url).toMatch(/chatgpt\.com/)
  })
})
