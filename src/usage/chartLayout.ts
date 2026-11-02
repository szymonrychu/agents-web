/**
 * Geometry shared by the history chart and the session lane under it, so their time axes line up.
 * The plot of an x-charts line chart starts at `margin.left + yAxis.width` and ends at `width - margin.right`.
 */
export const MARGIN = { left: 56, right: 16 } as const
export const Y_AXIS_WIDTH = 45
/** Left edge of the plot in px; the lane pads itself by this much. */
export const PLOT_LEFT = MARGIN.left + Y_AXIS_WIDTH
