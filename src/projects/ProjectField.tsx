/** A "Project" select for forms: the active projects, plus the current value when the list does not offer it (an archived project). */
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { useProject } from './ProjectContext'

export interface ProjectFieldProps {
  value: string
  onChange: (slug: string) => void
  helperText?: string
}

export function ProjectField({ value, onChange, helperText }: ProjectFieldProps) {
  const { projects } = useProject()
  const known = projects.some((p) => p.slug === value)
  return (
    <TextField select size="small" label="Project" value={value} onChange={(e) => onChange(e.target.value)} helperText={helperText} fullWidth>
      {known ? null : <MenuItem value={value}>{value}</MenuItem>}
      {projects.map((p) => <MenuItem key={p.slug} value={p.slug}>{p.name}</MenuItem>)}
    </TextField>
  )
}
