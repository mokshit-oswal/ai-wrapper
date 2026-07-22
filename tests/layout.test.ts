import { describe, it, expect } from 'vitest'
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  TOP_BAR_HEIGHT,
} from '../src/shared/layout'

describe('layout', () => {
  it('exposes agreed constants', () => {
    expect(DEFAULT_SIDEBAR_WIDTH).toBe(280)
    expect(MIN_SIDEBAR_WIDTH).toBe(200)
    expect(MAX_SIDEBAR_WIDTH).toBe(480)
    expect(TOP_BAR_HEIGHT).toBe(48)
  })

  it('clamps sidebar width', () => {
    expect(clampSidebarWidth(100)).toBe(200)
    expect(clampSidebarWidth(999)).toBe(480)
    expect(clampSidebarWidth(320)).toBe(320)
    expect(clampSidebarWidth(Number.NaN)).toBe(DEFAULT_SIDEBAR_WIDTH)
  })
})
