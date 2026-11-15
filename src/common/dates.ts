/** Date and time text for timestamps shown in tables, cards and titles. */

export interface DateFormatOptions {
  /** IANA zone, e.g. a schedule's own time zone; default (and fallback for an unknown zone) the viewer's zone. */
  timeZone?: string
  /** BCP 47 locale; default the viewer's locale. */
  locale?: string
}

function format(iso: string, style: Intl.DateTimeFormatOptions, opts: DateFormatOptions): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return new Intl.DateTimeFormat(opts.locale, { ...style, timeZone: opts.timeZone }).format(date)
  } catch (e) {
    // An unknown IANA zone (per-row user data) throws RangeError: fall back to the viewer's zone.
    if (!(e instanceof RangeError) || opts.timeZone === undefined) throw e
    return new Intl.DateTimeFormat(opts.locale, style).format(date)
  }
}

/** Compact `{ dateStyle: 'short', timeStyle: 'short' }`; an unparsable input is returned unchanged. */
export function formatDateTime(iso: string, opts: DateFormatOptions = {}): string {
  return format(iso, { dateStyle: 'short', timeStyle: 'short' }, opts)
}

/** Full `{ dateStyle: 'full', timeStyle: 'long' }`, for the title. */
export function formatDateTimeFull(iso: string, opts: DateFormatOptions = {}): string {
  return format(iso, { dateStyle: 'full', timeStyle: 'long' }, opts)
}
