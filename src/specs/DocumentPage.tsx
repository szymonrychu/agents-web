import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router'
import { ApiError } from '../api/client'
import { Markdown } from '../markdown/Markdown'
import { TOKENS } from '../theme'
import { FormError, usePoll } from '../triggers'
import { getDoc, listComments, listVersions, type DocBody, type DocVersion, type SpecComment } from './api'
import { Comments } from './Comments'
import { specPath } from './paths'
import { useSpecStream } from './useSpecStream'
import { VersionDiff } from './VersionDiff'

const POLL_MS = 10000
const VERSION_LIMIT = 200

interface Loaded {
  current: DocBody
  shown: DocBody
  against: DocBody | null
  versions: DocVersion[]
  comments: SpecComment[]
}

const asVersion = (raw: string | null): number | undefined => {
  const n = Number(raw)
  return raw !== null && Number.isInteger(n) && n > 0 ? n : undefined
}

async function load(key: string, path: string, v: number | undefined, diff: number | undefined): Promise<Loaded> {
  const [current, versions, comments] = await Promise.all([getDoc(key, path), listVersions(key, path, { limit: VERSION_LIMIT }), listComments(key, { path })])
  const shown = v === undefined || v === current.version ? current : await getDoc(key, path, v)
  const against = diff === undefined ? null : diff === shown.version ? shown : await getDoc(key, path, diff)
  return { current, shown, against, versions: versions.items.filter((x) => x.removed !== true), comments: comments.items }
}

export function DocumentPage({ specKey, path }: { specKey: string; path: string }) {
  const [params, setParams] = useSearchParams()
  const v = asVersion(params.get('v'))
  const diff = asVersion(params.get('diff'))
  const { data, error, refresh } = usePoll(() => load(specKey, path, v, diff), POLL_MS, [specKey, path, v, diff])
  const [deleted, setDeleted] = useState(false)
  useSpecStream((ev) => {
    if (ev.type === 'reset') void refresh()
    else if (ev.key === specKey) {
      if (ev.deleted) setDeleted(true)
      else void refresh()
    }
  })

  const back = (
    <Button component={RouterLink} to={specPath(specKey)}>{`Back to ${specKey}`}</Button>
  )
  if (deleted) return <Box><Typography>This spec was deleted</Typography>{back}</Box>
  if (error instanceof ApiError && error.status === 404) return <Box><Typography>{`${path} not found in ${specKey}`}</Typography>{back}</Box>
  if (!data) return error ? <FormError error={error} /> : <Typography color="text.secondary">Loading</Typography>
  const { current, shown, against, versions, comments } = data

  const setParam = (name: string, value: string) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev)
      if (value === '') p.delete(name)
      else p.set(name, value)
      return p
    }, { replace: true })
  const options = versions.map((x) => <option key={x.version} value={x.version}>{`v${x.version}`}</option>)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {back}
        <Typography component="h1" sx={{ fontSize: TOKENS.fontSizes.lg }}>{path}</Typography>
        <Chip size="small" label={`v${shown.version}`} />
        {shown.version !== current.version && <Chip size="small" color="warning" label={`current is v${current.version}`} />}
      </Box>
      <FormError error={error} />
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField select size="small" label="Version" value={String(shown.version)} onChange={(e) => setParam('v', e.target.value === String(current.version) ? '' : e.target.value)} slotProps={{ select: { native: true } }}>
          {options}
        </TextField>
        <TextField select size="small" label="Diff against" value={against ? String(against.version) : ''} onChange={(e) => setParam('diff', e.target.value)} slotProps={{ select: { native: true } }}>
          <option value="">None</option>
          {options}
        </TextField>
      </Box>
      {shown.note && <Typography color="text.secondary">{shown.note}</Typography>}
      {against ? (
        <VersionDiff before={against.body} after={shown.body} beforeLabel={`v${against.version}`} afterLabel={`v${shown.version}`} />
      ) : (
        <Box data-testid="document-body"><Markdown headingIds>{shown.body}</Markdown></Box>
      )}
      <Box component="section" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography component="h2" sx={{ fontSize: TOKENS.fontSizes.md, fontWeight: 500 }}>Comments</Typography>
        <Comments specKey={specKey} path={path} currentVersion={current.version} currentBody={current.body} comments={comments} onChanged={() => void refresh()} />
      </Box>
    </Box>
  )
}
