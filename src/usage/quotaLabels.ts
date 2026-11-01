/** The two quota windows and their names, shared by the preset form fields and the chart (series and quota lines). */
export type QuotaWindow = 'five_hour' | 'seven_day'

export const WINDOW_NAMES: Record<QuotaWindow, string> = { five_hour: '5-hour', seven_day: 'Weekly' }

/** Label of each preset quota field. */
export const QUOTA_FIELD_LABELS: Record<QuotaWindow, string> = {
  five_hour: `${WINDOW_NAMES.five_hour} quota percent`,
  seven_day: `${WINDOW_NAMES.seven_day} quota percent`,
}
