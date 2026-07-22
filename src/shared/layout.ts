export const DEFAULT_SIDEBAR_WIDTH = 220
export const MIN_SIDEBAR_WIDTH = 180
export const MAX_SIDEBAR_WIDTH = 360
export const TOP_BAR_HEIGHT = 64
export const RESIZE_HANDLE_WIDTH = 6
export const STAGE_INSET = 12

export function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SIDEBAR_WIDTH
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(value)))
}

/** Content bounds for the embedded WebContentsView (center stage). */
export function sessionContentBounds(
  windowWidth: number,
  windowHeight: number,
  sidebarWidth: number,
): { x: number; y: number; width: number; height: number } {
  const side = clampSidebarWidth(sidebarWidth)
  const x = side + RESIZE_HANDLE_WIDTH + STAGE_INSET
  const y = TOP_BAR_HEIGHT + STAGE_INSET
  const width = Math.max(100, windowWidth - x - STAGE_INSET)
  const height = Math.max(100, windowHeight - TOP_BAR_HEIGHT - STAGE_INSET * 2)
  return { x, y, width, height }
}
