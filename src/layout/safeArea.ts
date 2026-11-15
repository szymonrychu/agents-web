/** Safe-area insets (notch, Home Indicator, rounded corners) for `viewport-fit=cover`: one helper for every edge. */
export type Side = 'top' | 'right' | 'bottom' | 'left'

const PADDING = { top: 'paddingTop', right: 'paddingRight', bottom: 'paddingBottom', left: 'paddingLeft' } as const

/** `max(base, env(safe-area-inset-<side>))`: the base padding, grown to the inset where the device has one. */
export function safeInset(side: Side, basePx = 0): string {
  return `max(${basePx}px, env(safe-area-inset-${side}))`
}

/** Padding for the given sides, each at least `basePx` and at least the device inset. */
export function safeArea(sides: Side[], basePx = 0): Record<string, string> {
  return Object.fromEntries(sides.map((side) => [PADDING[side], safeInset(side, basePx)]))
}
