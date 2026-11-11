import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { Route, Routes, useParams } from 'react-router'
import { DocumentPage } from './DocumentPage'
import { SpecPage } from './SpecPage'
import { SpecsPage } from './SpecsPage'
import { docPath, specPath } from './paths'

export { docPath, specPath }

function SpecRoute() {
  const { key = '' } = useParams()
  return (
    <Box data-testid="spec-route" data-key={key} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, p: 2 }}>
      <SpecPage key={key} specKey={key} />
    </Box>
  )
}

function DocRoute() {
  const { key = '', '*': path = '' } = useParams()
  return (
    <Box data-testid="doc-route" data-key={key} data-path={path} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, p: 2 }}>
      <DocumentPage key={`${key}/${path}`} specKey={key} path={path} />
    </Box>
  )
}

function NotFound() {
  return (
    <Box data-testid="specs-not-found">
      <Typography color="text.secondary">Not found</Typography>
    </Box>
  )
}

/** Mounted at `/specs/*`: the list at the index, one spec at `:key`, one document at `:key/doc/<path>`, anything deeper is not found. */
export function SpecsRoute() {
  return (
    <Routes>
      <Route index element={<Box data-testid="specs-list-route" sx={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}><SpecsPage /></Box>} />
      <Route path=":key" element={<SpecRoute />} />
      <Route path=":key/doc/*" element={<DocRoute />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
