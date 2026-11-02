/** The selected session's labels in the header: the chips are the editor, every change is saved with PATCH /sessions/{id}/labels. */
import { useState } from 'react'
import Box from '@mui/material/Box'
import FormHelperText from '@mui/material/FormHelperText'
import { setSessionLabels } from '../api/client'
import type { SessionView } from '../api/client'
import { LabelEditor } from '../labels/LabelEditor'

export interface SessionLabelsProps {
  session: SessionView
  onUpdated: (session: SessionView) => void
}

export function SessionLabels({ session, onUpdated }: SessionLabelsProps) {
  const [error, setError] = useState<string | null>(null)
  async function save(labels: string[]) {
    setError(null)
    try {
      onUpdated(await setSessionLabels(session.id, labels))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <Box>
      <LabelEditor label="Session labels" value={session.labels ?? []} onChange={(labels) => void save(labels)} />
      {error && <FormHelperText error>{error}</FormHelperText>}
    </Box>
  )
}
