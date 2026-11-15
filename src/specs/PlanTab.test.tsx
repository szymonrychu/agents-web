// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PlanTab } from './PlanTab'
import { plan, step } from './testUtils'
import { setViewport } from '../test/viewport'

const api = vi.hoisted(() => ({ getPlan: vi.fn(), listSteps: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api, specStreamUrl: () => '/tb/stream' }))
vi.mock('../api/stream', () => ({ openStream: () => ({ close: () => {} }) }))
vi.mock('../markdown/MermaidBlock', () => ({ MermaidBlock: ({ source }: { source: string }) => <pre data-testid="graph">{source}</pre> }))

const steps = () => [
  step({ key: 'T-11', step: 1, title: 'Write schema', status: 'done', assignee_session: 'sess-a', model: 'sonnet', refs: [{ kind: 'pr', value: 'https://github.com/o/r/pull/3' }] }),
  step({ key: 'T-12', step: 2, title: 'Write routes', status: 'open', ready: true, deps: ['T-11'], model: null }),
  step({ key: 'T-13', step: 3, title: 'Write web', status: 'open', ready: false, deps: ['T-12'], model: 'opus' }),
]

beforeEach(() => {
  setViewport(1440)
  for (const f of Object.values(api)) f.mockReset()
  api.getPlan.mockResolvedValue(plan({ goal: 'Plans on the server', constraints: ['No em dashes'], version: 4 }))
  api.listSteps.mockResolvedValue({ items: steps(), steps_version: 6 })
})
afterEach(cleanup)

describe('plan tab', () => {
  test('lists the ordered steps with status, assignee, model, ready mark and refs as links', async () => {
    render(<MemoryRouter><PlanTab specKey="S-1" /></MemoryRouter>)
    await screen.findByText('Write schema')
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['1', '2', '3'])
    expect(within(rows[0]).getByText('done')).toBeTruthy()
    expect(within(rows[0]).getByText('sess-a')).toBeTruthy()
    expect(within(rows[0]).getByText('sonnet')).toBeTruthy()
    expect(within(rows[0]).queryByText('ready')).toBeNull()
    expect(within(rows[1]).getByText('ready')).toBeTruthy()
    expect(within(rows[2]).queryByText('ready')).toBeNull()
    const link = within(rows[0]).getByRole('link', { name: /pr.*pull\/3/ })
    expect(link.getAttribute('href')).toBe('https://github.com/o/r/pull/3')
    expect(within(rows[1]).getByRole('link', { name: 'T-12' }).getAttribute('href')).toBe('/tasks/T-12')
  })

  test('shows the plan header', async () => {
    render(<MemoryRouter><PlanTab specKey="S-1" /></MemoryRouter>)
    expect(await screen.findByText('Plans on the server')).toBeTruthy()
    expect(screen.getByText('No em dashes')).toBeTruthy()
  })

  test('renders the dependency graph through the mermaid block', async () => {
    render(<MemoryRouter><PlanTab specKey="S-1" /></MemoryRouter>)
    const g = await screen.findByTestId('graph')
    expect(g.textContent).toBe('graph TD\n  s1["1 Write schema"] --> s2["2 Write routes"]\n  s2 --> s3["3 Write web"]')
  })

  test('no steps says so and draws no graph', async () => {
    api.listSteps.mockResolvedValue({ items: [], steps_version: 0 })
    render(<MemoryRouter><PlanTab specKey="S-1" /></MemoryRouter>)
    expect(await screen.findByText('No steps')).toBeTruthy()
    expect(screen.queryByTestId('graph')).toBeNull()
  })
})

describe('plan tab layouts', () => {
  test('on a wide screen it is a table with the columns in order', async () => {
    render(<MemoryRouter><PlanTab specKey="S-1" /></MemoryRouter>)
    await screen.findByText('Write schema')
    const table = screen.getByRole('table', { name: 'Plan steps' })
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['#', 'Step', 'Status', 'Assignee', 'Model', 'Refs', ''])
    expect(within(table).getByRole('button', { name: 'Edit step 1' })).toBeTruthy()
  })

  test('on a phone it is one card per step with every field and one actions menu', async () => {
    setViewport(375, { coarse: true })
    const user = userEvent.setup()
    render(<MemoryRouter><PlanTab specKey="S-1" /></MemoryRouter>)
    const card = await screen.findByRole('article', { name: 'Step 1' })
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getAllByRole('article')).toHaveLength(3)
    const c = within(card)
    expect(c.getByText('Write schema', { exact: false })).toBeTruthy()
    for (const label of ['#', 'Status', 'Assignee', 'Model', 'Refs']) expect(c.getByText(label, { selector: 'dt' })).toBeTruthy()
    expect(c.getByText('sess-a')).toBeTruthy()
    expect(c.getByText('sonnet')).toBeTruthy()
    expect(c.getByRole('link', { name: /pr.*pull\/3/ })).toBeTruthy()
    expect(c.queryByRole('button', { name: 'Edit step 1' })).toBeNull()
    expect(within(screen.getByRole('article', { name: 'Step 2' })).getAllByText('-').length).toBeGreaterThan(0)
    await user.click(c.getByRole('button', { name: 'Actions for Step 1' }))
    expect(await screen.findByRole('menuitem', { name: 'Edit step 1' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Move step 1 up' }).getAttribute('aria-disabled')).toBe('true')
  })
})
