import type { ProposalItemView, ProposalRevisionView, ProposalView } from './api'

export const item = (o: Partial<ProposalItemView> = {}): ProposalItemView => ({
  path: 'model',
  before: 'opus',
  after: 'sonnet',
  decision: 'pending',
  grant: false,
  security: false,
  secret: null,
  note: null,
  ...o,
})

export const revision = (n: number, items: ProposalItemView[], o: Partial<ProposalRevisionView> = {}): ProposalRevisionView => ({
  revision: n,
  reason: `reason r${n}`,
  outcome: null,
  created_at: '2026-11-08T10:00:00Z',
  reviewed_at: null,
  items,
  ...o,
})

const grantItem = item({ path: 'kube_access', before: false, after: true, grant: true, security: true })
const secretItem = item({ path: 'env.API_KEY', before: null, after: { name: 'API_KEY' }, security: true, secret: 'set' })

/** Two revisions: r1 proposed model sonnet, r2 changed it to haiku; grant and secret items are unchanged. */
export const proposal = (o: Partial<ProposalView> = {}): ProposalView => ({
  id: 7,
  kind: 'preset',
  target_id: 'p1',
  target_name: 'worker',
  proposer_slug: 'lead-1',
  proposer_superleader: true,
  revision: 2,
  status: 'open',
  stale: false,
  created_at: '2026-11-08T10:00:00Z',
  updated_at: '2026-11-08T10:05:00Z',
  expires_at: '2026-11-09T10:00:00Z',
  closed_at: null,
  revisions: [
    revision(1, [item(), grantItem, secretItem], { outcome: 'rework' }),
    revision(2, [item({ after: 'haiku' }), grantItem, secretItem]),
  ],
  ...o,
})
