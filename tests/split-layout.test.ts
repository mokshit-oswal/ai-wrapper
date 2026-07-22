import { describe, it, expect } from 'vitest'
import {
  clampSplitRatio,
  computeSplitBounds,
  DIVIDER_GAP,
  MIN_PANE_WIDTH,
} from '../src/main/split-layout'

describe('split-layout', () => {
  it('splits 50/50 with divider gap', () => {
    const { left, right } = computeSplitBounds(
      { x: 320, y: 36, width: 1000, height: 800 },
      0.5,
    )
    expect(left.width + right.width + DIVIDER_GAP).toBe(1000)
    expect(left.width).toBe(Math.floor((1000 - DIVIDER_GAP) * 0.5))
    expect(right.x).toBe(left.x + left.width + DIVIDER_GAP)
    expect(left.y).toBe(36)
    expect(right.height).toBe(800)
  })

  it('clamps ratio so each pane keeps min width', () => {
    const width = 800
    const clamped = clampSplitRatio(0.05, width)
    expect(clamped).toBeCloseTo(MIN_PANE_WIDTH / (width - DIVIDER_GAP))
    const { left, right } = computeSplitBounds(
      { x: 0, y: 0, width, height: 600 },
      0.05,
    )
    expect(left.width).toBeGreaterThanOrEqual(MIN_PANE_WIDTH)
    expect(right.width).toBeGreaterThanOrEqual(MIN_PANE_WIDTH)
  })

  it('uses 0.5 when content cannot fit two min panes', () => {
    expect(clampSplitRatio(0.2, 400)).toBe(0.5)
  })
})
