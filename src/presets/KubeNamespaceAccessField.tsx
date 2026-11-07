/** Rows of {namespace, tiers} for the namespace-scoped Kubernetes access of a preset; props only, the parent owns the state. */
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

export type KubeNamespaceRow = { namespace: string; tiers: string[] }

export const TIER_HELP: Record<string, string> = {
  read: 'View workloads, services, config maps, events and logs; no Secrets',
  'port-forward': 'Port-forward to pods and services',
  exec: 'Run commands in pods; can read Secrets mounted into them',
  edit: 'Read-write, Secrets included; can run pods as any ServiceAccount in the namespace',
  admin: 'Edit plus Roles and RoleBindings in the namespace',
}

const NO_HELP = 'no help text for this tier'

export function KubeNamespaceAccessField({ rows, onChange, namespaces, tiers, errors, ignoredNote, disabled }: {
  rows: KubeNamespaceRow[]
  onChange: (rows: KubeNamespaceRow[]) => void
  namespaces: string[]
  tiers: string[]
  errors?: (string | undefined)[]
  ignoredNote?: string
  disabled?: boolean
}) {
  const patch = (index: number, p: Partial<KubeNamespaceRow>) => onChange(rows.map((r, i) => (i === index ? { ...r, ...p } : r)))
  const toggle = (index: number, tier: string, on: boolean) => {
    const current = rows[index].tiers
    patch(index, { tiers: on ? [...current, tier] : current.filter((t) => t !== tier) })
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="subtitle2">Kubernetes namespace access</Typography>
      {ignoredNote && <FormHelperText>{ignoredNote}</FormHelperText>}
      {rows.map((row, i) => {
        const taken = new Set(rows.filter((_, j) => j !== i).map((r) => r.namespace))
        const options = namespaces.filter((ns) => !taken.has(ns))
        const error = errors?.[i]
        return (
          <Box key={i} role="group" aria-label={`Namespace access ${i + 1}`} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <TextField select size="small" label={`Namespace ${i + 1}`} value={row.namespace} onChange={(e) => patch(i, { namespace: e.target.value })} disabled={disabled} error={Boolean(error)} sx={{ flex: '1 1 12rem' }}>
                {options.map((ns) => <MenuItem key={ns} value={ns}>{ns}</MenuItem>)}
              </TextField>
              <IconButton size="small" aria-label={`Remove namespace ${i + 1}`} disabled={disabled} onClick={() => onChange(rows.filter((_, j) => j !== i))}>x</IconButton>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              {tiers.map((tier) => (
                <FormControlLabel
                  key={tier}
                  control={<Checkbox size="small" checked={row.tiers.includes(tier)} disabled={disabled} onChange={(e) => toggle(i, tier, e.target.checked)} slotProps={{ input: { 'aria-label': `${tier} ${i + 1}` } }} />}
                  label={<Box><Typography variant="body2">{tier}</Typography><Typography variant="caption" color="text.secondary">{TIER_HELP[tier] ?? NO_HELP}</Typography></Box>}
                />
              ))}
            </Box>
            {error && <FormHelperText error>{error}</FormHelperText>}
          </Box>
        )
      })}
      <Box>
        <Button size="small" disabled={disabled} onClick={() => onChange([...rows, { namespace: '', tiers: [] }])}>Add namespace</Button>
      </Box>
    </Box>
  )
}
