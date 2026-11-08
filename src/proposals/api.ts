/** Preset change proposals: the human routes of the orchestrator (`/api/v1/proposals`). */
import { query, request } from '../api/client'
import type { components } from '../api/schema'

type S = components['schemas']
export type ProposalView = S['ProposalView']
export type ProposalRevisionView = S['ProposalRevisionView']
export type ProposalItemView = S['ProposalItemView']

/** `active` is the server filter for proposals that still need a human or a proposer: open, rework and stale. */
export type ProposalFilter = 'active' | 'open' | 'closed' | 'all'

export const listProposals = (status: ProposalFilter = 'active', limit?: number) =>
  request<ProposalView[]>('GET', `/proposals${query({ status, limit })}`)

export type ReviewIn = components['schemas']['ReviewIn']
export type ReviewItemIn = components['schemas']['ReviewItemIn']

export const getProposal = (id: number) => request<ProposalView>('GET', `/proposals/${id}`)

/** Decide every item of the proposal's current revision; 409 `proposal_stale` / `revision_changed`, 422 `invalid_spec`. */
export const reviewProposal = (id: number, review: ReviewIn) => request<ProposalView>('POST', `/proposals/${id}/review`, review)
