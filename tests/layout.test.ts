import { describe, it, expect } from 'vitest'
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  TOP_BAR_HEIGHT,
  RESIZE_HANDLE_WIDTH,
  STAGE_INSET,
  sessionContentBounds,
} from '../src/shared/layout'

describe('layout', () => {
  it('exposes agreed constants', () => {
    expect(DEFAULT_SIDEBAR_WIDTH).toBe(220)
    expect(MIN_SIDEBAR_WIDTH).toBe(180)
    expect(MAX_SIDEBAR_WIDTH).toBe(360)
    expect(TOP_BAR_HEIGHT).toBe(64)
    expect(RESIZE_HANDLE_WIDTH).toBe(6)
    expect(STAGE_INSET).toBe(12)
  })

  it('clamps sidebar width', () => {
    expect(clampSidebarWidth(100)).toBe(180)
    expect(clampSidebarWidth(999)).toBe(360)
    expect(clampSidebarWidth(240)).toBe(240)
    expect(clampSidebarWidth(Number.NaN)).toBe(DEFAULT_SIDEBAR_WIDTH)
  })

  it('computes center stage bounds without right panel', () => {
    const b = sessionContentBounds(1400, 900, 220)
    expect(b.x).toBe(220 + 6 + 12)
    expect(b.y).toBe(64 + 12)
    expect(b.width).toBe(1400 - b.x - 12)
    expect(b.height).toBe(900 - 64 - 24)
  })
})
