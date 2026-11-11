/** Which rows a selected project keeps. `null` is "All projects". */
import type { SessionView } from '../api/client'
import type { PresetInfo } from '../triggers/presetIndex'

const isSuperleader = (s: SessionView) => Boolean((s.spec as { session_messaging?: boolean } | undefined)?.session_messaging)

/** Superleader sessions (spec.session_messaging) stay visible under every project (user decision, option A). */
export const sessionVisibleIn = (s: SessionView, project: string | null): boolean =>
  project === null || s.project === project || isSuperleader(s)

/** A row follows its preset's project; a row whose preset is unknown (or not loaded yet) is hidden under a selection. */
export const presetInProject = (presetId: string | null | undefined, index: Record<string, PresetInfo>, project: string | null): boolean =>
  project === null || (presetId != null && index[presetId]?.project === project)
