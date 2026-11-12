/** Version history of one node: view any version, diff against the previous one, restore as a new version. */
import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Markdown } from '../markdown/Markdown'
import { VersionDiff } from '../specs/VersionDiff'
import { TOKENS } from '../theme'
import { FormError } from '../triggers'
import { conflictVersion, getVersion, listVersions, patchNode } from './api'
import type { VersionMeta, VersionView } from './api'

export interface NodeHistoryProps {
  nodeKey: string
  /** Row version of the node now (the optimistic-lock token a restore sends). */
  rowVersion: number
  /** Bumped when the node changes, to refetch the list. */
  refreshKey: number
  /** Called after a restore saved a new version. */
  onRestored: () => void
}

type Shown = { kind: 'view'; version: VersionView } | { kind: 'diff'; before: VersionView; after: VersionView }

export function NodeHistory({ nodeKey, rowVersion, refreshKey, onRestored }: NodeHistoryProps) {
  const [versions, setVersions] = useState<VersionMeta[]>()
  const [shown, setShown] = useState<Shown>()
  const [error, setError] = useState<unknown>()
  const [stale, setStale] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    listVersions(nodeKey).then(
      (v) => { if (live) { setVersions([...v].sort((a, b) => b.version - a.version)); setError(undefined) } },
      (e: unknown) => { if (live) setError(e) },
    )
    return () => { live = false }
  }, [nodeKey, refreshKey])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    setStale(false)
    try {
      await fn()
    } catch (e) {
      if (conflictVersion(e) !== undefined) setStale(true)
      else setError(e)
    } finally {
      setBusy(false)
    }
  }
  const view = (v: number) => run(async () => setShown({ kind: 'view', version: await getVersion(nodeKey, v) }))
  const diff = (v: number, previous: number) =>
    run(async () => {
      const [before, after] = await Promise.all([getVersion(nodeKey, previous), getVersion(nodeKey, v)])
      setShown({ kind: 'diff', before, after })
    })
  const restore = (v: number) =>
    run(async () => {
      const old = await getVersion(nodeKey, v)
      await patchNode(nodeKey, { version: rowVersion, notes: old.notes, summary: `restore v${v}` })
      setShown(undefined)
      onRestored()
    })

  if (!versions) return error ? <FormError error={error instanceof Error ? error : undefined} /> : <Typography color="text.secondary">Loading</Typography>
  return (
    <Stack spacing={1}>
      <Stack component="ul" spacing={0.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {versions.map((v, i) => {
          const previous = versions[i + 1]?.version
          return (
            <Stack key={v.version} component="li" spacing={0.25}>
              <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 500, fontSize: TOKENS.fontSizes.sm }}>{`v${v.version}`}</Typography>
                <Typography variant="caption" color="text.secondary">{v.author}</Typography>
                <Typography variant="caption" color="text.secondary">{new Date(v.created_at).toLocaleString()}</Typography>
              </Stack>
              <Typography sx={{ fontSize: TOKENS.fontSizes.sm, wordBreak: 'break-word' }}>{v.summary}</Typography>
              <Stack direction="row" spacing={0.5}>
                <Button size="small" disabled={busy} aria-label={`View v${v.version}`} onClick={() => void view(v.version)}>View</Button>
                {previous !== undefined && <Button size="small" disabled={busy} aria-label={`Diff v${v.version}`} onClick={() => void diff(v.version, previous)}>Diff</Button>}
                <Button size="small" disabled={busy} aria-label={`Restore v${v.version}`} onClick={() => void restore(v.version)}>Restore</Button>
              </Stack>
            </Stack>
          )
        })}
      </Stack>
      {stale && <Alert severity="warning" role="alert">This node changed meanwhile; the latest version is shown, try the restore again.</Alert>}
      <FormError error={error instanceof Error ? error : undefined} />
      {shown?.kind === 'view' && (
        <Stack spacing={0.5} data-testid="version-view">
          <Typography variant="subtitle2">{`v${shown.version.version}: ${shown.version.topic}`}</Typography>
          {shown.version.notes === '' ? <Typography color="text.secondary">No notes</Typography> : <Markdown>{shown.version.notes}</Markdown>}
        </Stack>
      )}
      {shown?.kind === 'diff' && (
        <VersionDiff before={shown.before.notes} after={shown.after.notes} beforeLabel={`v${shown.before.version}`} afterLabel={`v${shown.after.version}`} />
      )}
    </Stack>
  )
}
