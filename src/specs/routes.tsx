import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { Route, Routes, useParams } from 'react-router'
import { SpecsPage } from './SpecsPage'
import { docPath, specPath } from './paths'

export { docPath, specPath }

function SpecRoute() {
  const { key = '' } = useParams()
  return (
    <Box data-testid="spec-route" data-key={key} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, p: 2 }} />
  )
}

function NotFound() {
  return (
    <Box data-testid="specs-not-found">
      <Typography color="text.secondary">Not found</Typography>
    </Box>
  )
}

/** Mounted at `/specs/*`: the list at the index, one spec at `:key`, anything deeper is not found. */
export function SpecsRoute() {
  return (
    <Routes>
      <Route index element={<Box data-testid="specs-list-route" sx={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}><SpecsPage /></Box>} />
      <Route path=":key" element={<SpecRoute />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
