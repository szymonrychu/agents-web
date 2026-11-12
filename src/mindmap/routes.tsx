import Box from '@mui/material/Box'
import { Route, Routes } from 'react-router'
import { MindmapsPage } from './MindmapsPage'
import { mapPath } from './paths'

export { mapPath }

function Page() {
  return (
    <Box data-testid="mindmaps-route" sx={{ display: 'flex', flexDirection: 'column', height: '100dvh', p: 2, boxSizing: 'border-box' }}>
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
