// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { GatePanel } from './GatePanel'
import { gate } from './testUtils'

const api = vi.hoisted(() => ({ getGate: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api, specStreamUrl: () => '/tb/stream' }))
vi.mock('../api/stream', () => ({ openStream: () => ({ close: () => {} }) }))

const mount = (onApprove = vi.fn()) => {
  render(<MemoryRouter><GatePanel specKey="S-1" onApprove={onApprove} /></MemoryRouter>)
  return onApprove
}

beforeEach(() => api.getGate.mockReset())
afterEach(cleanup)

describe('gate panel', () => {
  test('none: no gate decision asked yet', async () => {
    api.getGate.mockResolvedValue(gate({ gate: 'none', gate_task: null, decisions: [] }))
    mount()
    expect(await screen.findByText('none')).toBeTruthy()
    expect(screen.getByText('No gate decisions')).toBeTruthy()
  })

  test('waiting: lists open and answered decisions with their answers and the gate task link', async () => {
    api.getGate.mockResolvedValue(gate({
      gate: 'waiting', gate_task: 'T-4',
      decisions: [
        { id: 1, question: 'Which db?', status: 'answered', answer: { choice: 0, label: 'Postgres' } },
        { id: 2, question: 'Ship it?', status: 'open', answer: null },
        { id: 3, question: 'Free text?', status: 'answered', answer: { text: 'maybe' } },
      ],
    }))
    mount()
    expect(await screen.findByText('waiting')).toBeTruthy()
    expect(screen.getByText('Which db?')).toBeTruthy()
    expect(screen.getByText('Postgres')).toBeTruthy()
    expect(screen.getByText('maybe')).toBeTruthy()
    expect(screen.getByText('open')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'T-4' }).getAttribute('href')).toBe('/tasks/T-4')
  })

  test('open: all answered, and Approve is optional', async () => {
    api.getGate.mockResolvedValue(gate({ gate: 'open', gate_task: 'T-4', status: 'review', decisions: [{ id: 1, question: 'Which db?', status: 'answered', answer: { text: 'x' } }] }))
    const onApprove = mount()
    expect(await screen.findByText('open')).toBeTruthy()
    expect(screen.getByText(/Approval is optional/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(onApprove).toHaveBeenCalled()
  })

  test('an approved spec shows the approved versions and no Approve button', async () => {
    api.getGate.mockResolvedValue(gate({ gate: 'open', status: 'approved', approved: true, approved_versions: { 'plan.md': 3 }, decisions: [] }))
    mount()
    expect(await screen.findByText('plan.md v3')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })
})
