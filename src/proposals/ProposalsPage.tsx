/** Settings > Proposals: active and closed change proposals; a row opens the review dialog (read-only when terminal). */
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { useState, type JSX } from 'react'
import { formatAge, useNow } from '../chat/agentAge'
import { FormError, usePoll } from '../triggers'
import { listProposals, type ProposalView } from './api'
import { ProposalReviewDialog } from './ProposalReviewDialog'

const POLL_MS = 20000

type TabId = 'active' | 'closed'

export interface ProposalsPageProps {
  onBack: () => void
}

export function ProposalsPage({ onBack }: ProposalsPageProps): JSX.Element {
  const now = useNow()
  const [tab, setTab] = useState<TabId>('active')
  const [opened, setOpened] = useState<ProposalView | null>(null)
  const { data, error, loading, refresh } = usePoll(() => listProposals(tab), POLL_MS, [tab])
  const rows = data ?? []
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Button size="small" onClick={onBack}>Back</Button>
        <Typography variant="h6" component="h1">Proposals</Typography>
      </Box>
      <Tabs value={tab} onChange={(_e, v: TabId) => setTab(v)}>
        <Tab value="active" label="Active" />
        <Tab value="closed" label="Closed" />
      </Tabs>
      {error && <FormError error={error} />}
      {!loading && !error && rows.length === 0 && <Typography color="text.secondary">{`No ${tab} proposals`}</Typography>}
      {rows.length > 0 && (
        <Table size="small">
          <TableHead>
            <TableRow>
              {['Kind', 'Target', 'Proposer', 'Status', 'Revision', 'Age'].map((h) => <TableCell key={h}>{h}</TableCell>)}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id} hover sx={{ cursor: 'pointer' }} onClick={() => setOpened(p)}>
                <TableCell>{p.kind}</TableCell>
                <TableCell>{p.target_name}</TableCell>
                <TableCell>{p.proposer_slug}</TableCell>
                <TableCell>{p.status}</TableCell>
                <TableCell>{`r${p.revision}`}</TableCell>
                <TableCell>{formatAge(now - Date.parse(p.created_at))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {opened && (
        <ProposalReviewDialog
          key={`${opened.id}:${opened.revision}`}
          proposal={opened}
          onClose={() => {
            setOpened(null)
            void refresh()
          }}
          onChanged={() => void refresh()}
        />
      )}
    </Box>
  )
}
