/**
 * Map-level links of one map. The mindmap API lists links only by the task or spec key (`GET /links?key=`),
 * not by map, so the user looks a key up and this shows its links that point at the whole map; each can be deleted.
 */
import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import { FormError } from '../triggers'
import { listLinks } from './api'
import type { LinkView } from './api'
import { DeleteDialog } from './EditDialogs'
import { RefLink } from './RefLink'

export interface MapLinksProps {
  mapKey: string
  /** Bumped by the page when the stream reports a change, to refetch the looked-up key. */
  refreshKey: number
  onChanged: () => void
}

export function MapLinks({ mapKey, refreshKey, onChanged }: MapLinksProps) {
  const [input, setInput] = useState('')
  const [looked, setLooked] = useState<string>()
  const [links, setLinks] = useState<LinkView[]>()
  const [error, setError] = useState<unknown>()
  const [target, setTarget] = useState<LinkView>()
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    if (looked === undefined) return
    let live = true
    listLinks(looked).then(
      (l) => { if (live) { setLinks(l.filter((x) => x.map === mapKey && x.node === null)); setError(undefined) } },
      (e: unknown) => { if (live) setError(e) },
    )
    return () => { live = false }
  }, [looked, mapKey, refreshKey, reloads])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const key = input.trim()
    if (key === '') return
    setLinks(undefined)
    setLooked(key)
    setReloads((n) => n + 1)
  }
  const deleted = useCallback(() => { setTarget(undefined); setReloads((n) => n + 1); onChanged() }, [onChanged])

  return (
    <Stack spacing={1} sx={{ p: 1 }}>
      <Stack component="form" direction="row" spacing={1} onSubmit={submit}>
        <TextField size="small" label="Task or spec key" value={input} onChange={(e) => setInput(e.target.value)} helperText="Shows this map's links to that key, for example T-12 or S-3" />
        <Button type="submit" size="small" variant="outlined" sx={{ alignSelf: 'flex-start', mt: '4px' }}>Show links</Button>
      </Stack>
      <FormError error={error instanceof Error ? error : undefined} />
      {looked !== undefined && links?.length === 0 && <Typography color="text.secondary">{`No link from this map to ${looked}`}</Typography>}
      {links && links.length > 0 && (
        <Stack component="ul" aria-label="Map links" spacing={0.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {links.map((l) => (
            <Stack key={l.id} component="li" direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <Chip size="small" label={l.relation.replace(/_/g, ' ')} />
              <Typography sx={{ flexGrow: 1 }}><RefLink refKey={l.ref_key} />{l.note ? ` - ${l.note}` : ''}</Typography>
              <IconButton size="small" aria-label={`Delete link ${l.ref_key}`} onClick={() => setTarget(l)}><DeleteOutlineIcon fontSize="inherit" /></IconButton>
            </Stack>
          ))}
        </Stack>
      )}
      {target && <DeleteDialog target={{ kind: 'link', id: target.id, label: `link ${target.ref_key}` }} onClose={() => setTarget(undefined)} onDeleted={deleted} />}
    </Stack>
  )
}
