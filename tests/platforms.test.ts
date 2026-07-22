import { describe, it, expect } from 'vitest'
import { PLATFORMS, platformIds } from '../src/shared/platforms'

describe('PLATFORMS', () => {
  it('lists the five supported platforms', () => {
    expect(platformIds()).toEqual(['chatgpt', 'claude', 'gemini', 'perplexity', 'groq'])
  })

  it('has https entry urls', () => {
    expect(PLATFORMS.chatgpt.url).toMatch(/chatgpt\.com/)
    expect(PLATFORMS.perplexity.url).toMatch(/perplexity\.ai/)
    expect(PLATFORMS.groq.url).toMatch(/groq\.com/)
  })
})
