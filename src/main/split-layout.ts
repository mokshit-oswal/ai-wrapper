export type Rect = { x: number; y: number; width: number; height: number }

export const MIN_PANE_WIDTH = 280
export const DIVIDER_GAP = 4

export function clampSplitRatio(
  ratio: number,
  contentWidth: number,
  minPane = MIN_PANE_WIDTH,
  gap = DIVIDER_GAP,
): number {
  const usable = contentWidth - gap
  if (usable < minPane * 2) return 0.5
  const minR = minPane / usable
  const maxR = 1 - minPane / usable
  return Math.min(maxR, Math.max(minR, ratio))
}

export function computeSplitBounds(
  region: Rect,
  ratio: number,
  minPane = MIN_PANE_WIDTH,
  gap = DIVIDER_GAP,
): { left: Rect; right: Rect } {
  const r = clampSplitRatio(ratio, region.width, minPane, gap)
  const usable = region.width - gap
  const leftW = Math.floor(usable * r)
  const rightW = usable - leftW
  return {
    left: { x: region.x, y: region.y, width: leftW, height: region.height },
    right: {
      x: region.x + leftW + gap,
      y: region.y,
      width: rightW,
      height: region.height,
    },
  }
}
