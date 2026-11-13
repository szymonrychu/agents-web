/** A task (`T-n`) or spec (`S-n`) key as a link to its taskboard page; any other text stays plain. */
import Link from '@mui/material/Link'
import { Link as RouterLink } from 'react-router'
import { specPath } from '../specs/paths'
import { taskPath } from '../tasks/paths'

export function RefLink({ refKey }: { refKey: string }) {
  if (/^T-[1-9][0-9]*$/.test(refKey)) return <Link component={RouterLink} to={taskPath(refKey)}>{refKey}</Link>
  if (/^S-[1-9][0-9]*$/.test(refKey)) return <Link component={RouterLink} to={specPath(refKey)}>{refKey}</Link>
  return <>{refKey}</>
}
