/** Top bar project selector: "All projects" plus each active project. */
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import { useProject } from './ProjectContext'

const ALL = ''

export function ProjectSelect() {
  const { project, setProject, projects } = useProject()
  // A slug the list does not offer (a ?project= link, an archived project) is shown rather than dropped.
  const known = project === null || projects.some((p) => p.slug === project)
  return (
    <Select
      size="small"
      displayEmpty
      value={project ?? ALL}
      onChange={(e) => setProject(e.target.value === ALL ? null : e.target.value)}
      inputProps={{ 'aria-label': 'Project' }}
      sx={{ flexShrink: 0, minWidth: 140 }}
    >
      <MenuItem value={ALL}>All projects</MenuItem>
      {known ? null : <MenuItem value={project}>{project}</MenuItem>}
      {projects.map((p) => <MenuItem key={p.slug} value={p.slug}>{p.name}</MenuItem>)}
    </Select>
  )
}
