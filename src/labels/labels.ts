/** Label rules, the same as the taskboard server: trim, lowercase, 1-40 chars of [a-z0-9-_.:], at most 20. */
export const MAX_LABELS = 20
export const MAX_LABEL_LENGTH = 40
const LABEL_RE = /^[a-z0-9_.:-]{1,40}$/

export type LabelResult = { ok: true; label: string } | { ok: false; error: string }

export function normalizeLabel(raw: string): LabelResult {
  const label = raw.trim().toLowerCase()
  if (!LABEL_RE.test(label)) return { ok: false, error: `Invalid label "${raw}": 1-${MAX_LABEL_LENGTH} characters of a-z, 0-9, - _ . :` }
  return { ok: true, label }
}

export type LabelsResult = { ok: true; labels: string[] } | { ok: false; error: string }

/** Normalises and dedupes (keeping order); the first bad label or a list over the maximum is the error. */
export function normalizeLabels(raw: string[]): LabelsResult {
  const labels: string[] = []
  for (const item of raw) {
    const r = normalizeLabel(item)
    if (!r.ok) return r
    if (!labels.includes(r.label)) labels.push(r.label)
  }
  if (labels.length > MAX_LABELS) return { ok: false, error: `At most ${MAX_LABELS} labels` }
  return { ok: true, labels }
}
