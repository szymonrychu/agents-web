import Box from '@mui/material/Box'
import { safeArea } from '../layout/safeArea'
import { Route, Routes } from 'react-router'
import { MindmapsPage } from './MindmapsPage'
import { mapPath } from './paths'

export { mapPath }

function Page() {
  return (
    <Box data-testid="mindmaps-route" sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0, p: 2, boxSizing: 'border-box', ...safeArea(['top', 'right', 'bottom', 'left'], 16) }}>
      <MindmapsPage />
    </Box>
  )
}

/** Mounted at `/mindmaps/*`: the index and one map at `:mapKey`; the selection travels in `?node=N-n&direction=D-n`. */
export function MindmapsRoute() {
  return (
    <Routes>
      <Route index element={<Page />} />
      <Route path=":mapKey" element={<Page />} />
    </Routes>
  )
}

export default MindmapsRoute
