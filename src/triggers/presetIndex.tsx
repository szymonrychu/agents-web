import Chip from '@mui/material/Chip'
import { useEffect, useState } from 'react'
import { listPresets } from '../api/client'
import { useFocusTick } from '../common/useFocusTick'

export interface PresetInfo {
  name: string
  project: string
}

/** Preset id -> name and project, from the orchestrator's `GET /presets`; empty while loading or when the call fails. */
export function usePresetIndex(): Record<string, PresetInfo> {
  const [index, setIndex] = useState<Record<string, PresetInfo>>({})
  const focusTick = useFocusTick()
  useEffect(() => {
    let live = true
    listPresets().then(
      (ps) => { if (live) setIndex(Object.fromEntries(ps.map((p) => [p.id, { name: p.name, project: p.project }]))) },
      () => {},
    )
    return () => { live = false }
  }, [focusTick])
  return index
}

/** The project of a row's preset, as an outlined chip; "-" when the row has no known preset. */
export function ProjectCell({ presetId, index }: { presetId: string | null | undefined; index: Record<string, PresetInfo> }) {
  const project = presetId ? index[presetId]?.project : undefined
  return project ? <Chip size="small" variant="outlined" label={project} sx={{ maxWidth: '100%' }} /> : <>-</>
}
