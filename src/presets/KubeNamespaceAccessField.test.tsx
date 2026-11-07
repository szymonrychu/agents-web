// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import { KubeNamespaceAccessField, TIER_HELP } from './KubeNamespaceAccessField'
import type { KubeNamespaceRow } from './KubeNamespaceAccessField'

afterEach(cleanup)

const TIERS = ['read', 'port-forward', 'exec', 'edit', 'admin']
const setup = (o: Partial<React.ComponentProps<typeof KubeNamespaceAccessField>> = {}) => {
  const onChange = vi.fn()
  render(
    <ThemeProvider theme={theme}>
      <KubeNamespaceAccessField rows={[]} onChange={onChange} namespaces={['a', 'b', 'c']} tiers={TIERS} {...o} />
    </ThemeProvider>,
  )
  return onChange
}

describe('KubeNamespaceAccessField', () => {
  test('renders the title', () => {
    setup()
    expect(screen.getByText('Kubernetes namespace access')).toBeTruthy()
  })

  test('Add namespace appends an empty row', async () => {
    const rows: KubeNamespaceRow[] = [{ namespace: 'a', tiers: ['read'] }]
    const onChange = setup({ rows })
    await userEvent.click(screen.getByRole('button', { name: 'Add namespace' }))
    expect(onChange).toHaveBeenCalledWith([...rows, { namespace: '', tiers: [] }])
  })

  test('namespace select offers only namespaces not used by another row', async () => {
    setup({ rows: [{ namespace: 'a', tiers: [] }, { namespace: '', tiers: [] }] })
    await userEvent.click(screen.getAllByRole('combobox')[1])
    const options = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['b', 'c'])
  })

  test('selecting a namespace updates the row', async () => {
    const onChange = setup({ rows: [{ namespace: '', tiers: ['read'] }] })
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: 'b' }))
    expect(onChange).toHaveBeenCalledWith([{ namespace: 'b', tiers: ['read'] }])
  })

  test('a checkbox per tier with its help text, in prop order; toggling updates tiers', async () => {
    const onChange = setup({ rows: [{ namespace: 'a', tiers: ['read'] }] })
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(TIERS.length)
    for (const t of TIERS) expect(screen.getByText(TIER_HELP[t])).toBeTruthy()
    expect((boxes[0] as HTMLInputElement).checked).toBe(true)
    await userEvent.click(boxes[3])
    expect(onChange).toHaveBeenCalledWith([{ namespace: 'a', tiers: ['read', 'edit'] }])
    await userEvent.click(boxes[0])
    expect(onChange).toHaveBeenLastCalledWith([{ namespace: 'a', tiers: [] }])
  })

  test('an unknown tier shows the fallback help text', () => {
    setup({ rows: [{ namespace: 'a', tiers: [] }], tiers: ['mystery'] })
    expect(screen.getByText('no help text for this tier')).toBeTruthy()
  })

  test('remove drops the row', async () => {
    const onChange = setup({ rows: [{ namespace: 'a', tiers: [] }, { namespace: 'b', tiers: [] }] })
    await userEvent.click(screen.getByRole('button', { name: 'Remove namespace 1' }))
    expect(onChange).toHaveBeenCalledWith([{ namespace: 'b', tiers: [] }])
  })

  test('a stored namespace missing from the allowlist stays in its row options', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setup({ rows: [{ namespace: 'gone', tiers: ['read'] }] })
    const select = screen.getByRole('combobox', { name: 'Namespace 1' })
    expect(select.textContent).toBe('gone')
    await userEvent.click(select)
    expect(within(screen.getByRole('listbox')).getByRole('option', { name: 'gone' })).toBeTruthy()
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('out-of-range'))).toHaveLength(0)
    warn.mockRestore()
  })

  test('ignoredNote renders as helper text', () => {
    setup({ ignoredNote: 'Ignored while cluster access is on' })
    expect(screen.getByText('Ignored while cluster access is on')).toBeTruthy()
  })

  test('errors[i] renders on row i', () => {
    setup({ rows: [{ namespace: 'a', tiers: [] }, { namespace: 'b', tiers: [] }], errors: [undefined, 'Pick a tier'] })
    expect(screen.getAllByText('Pick a tier')).toHaveLength(1)
    expect(within(screen.getByRole('group', { name: 'Namespace access 2' })).getByText('Pick a tier')).toBeTruthy()
  })

  test('disabled disables controls', () => {
    setup({ rows: [{ namespace: 'a', tiers: [] }], disabled: true })
    expect((screen.getByRole('button', { name: 'Add namespace' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).disabled).toBe(true)
  })
})
