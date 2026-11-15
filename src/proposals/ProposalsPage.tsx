/** Settings > Proposals: active and closed change proposals; a row opens the review dialog (read-only when terminal). */
import Box from '@mui/material/Box'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { useState, type JSX } from 'react'
import { formatAge, useNow } from '../chat/agentAge'
import { FormError, usePoll } from '../triggers'
import { listProposals, type ProposalView } from './api'
import { ProposalReviewDialog } from './ProposalReviewDialog'
import { PageHeader } from '../layout/PageHeader'
import { ResponsiveTable, type Column } from '../layout/ResponsiveTable'

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
  const columns: Column<ProposalView>[] = [
    { key: 'kind', label: 'Kind', role: 'meta', render: (p) => p.kind },
    { key: 'target', label: 'Target', role: 'primary', render: (p) => p.target_name },
    { key: 'proposer', label: 'Proposer', role: 'meta', render: (p) => p.proposer_slug },
    { key: 'status', label: 'Status', role: 'meta', render: (p) => p.status },
    { key: 'revision', label: 'Revision', role: 'meta', render: (p) => `r${p.revision}` },
    { key: 'age', label: 'Age', role: 'meta', render: (p) => formatAge(now - Date.parse(p.created_at)) },
  ]
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0, overflow: 'auto' }}>
      <PageHeader title="Proposals" onBack={onBack} />
      <Tabs value={tab} onChange={(_e, v: TabId) => setTab(v)}>
        <Tab value="active" label="Active" />
        <Tab value="closed" label="Closed" />
      </Tabs>
      {error && <FormError error={error} />}
      {!loading && !error && rows.length === 0 && <Typography color="text.secondary">{`No ${tab} proposals`}</Typography>}
      {rows.length > 0 && (
        <ResponsiveTable
          rows={rows}
          columns={columns}
          rowKey={(p) => String(p.id)}
          ariaLabel="Proposals"
          cardLabel={(p) => `Proposal ${p.target_name}`}
          onRowClick={setOpened}
        />
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
