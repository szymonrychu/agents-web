// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { PresetView } from '../api/client'
import { theme } from '../theme'
import { PresetsPage } from './PresetsPage'

const ctx = vi.hoisted(() => ({ project: null as string | null, projects: [] as { slug: string; name: string }[] }))
vi.mock('../projects/ProjectContext', () => ({ useProject: () => ({ ...ctx, setProject: () => {} }) }))
const api = vi.hoisted(() => ({ listPresets: vi.fn(), deletePreset: vi.fn() }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...api }))

/** The form is covered by its own tests: a stub that shows the mode it was opened in and can save. */
vi.mock('./PresetForm', () => ({
  PresetForm: (p: { open: boolean; preset?: PresetView; copyOf?: PresetView; onClose: () => void; onSaved: (p: PresetView) => void }) =>
    p.open ? (
      <div role="dialog" aria-label="Preset form">
        <span>{p.preset ? `edit ${p.preset.name}` : p.copyOf ? `copy ${p.copyOf.name}` : 'new'}</span>
        <button onClick={() => p.onSaved(p.preset ?? p.copyOf ?? ({} as PresetView))}>Save</button>
        <button onClick={p.onClose}>Close</button>
      </div>
    ) : null,
}))

const preset = (id: string, name: string, is_default = false, superleader_manageable = false): PresetView =>
  ({ created_at: '2026-01-01T00:00:00Z', id, is_default, name, spec: {}, superleader_manageable, updated_at: '2026-01-01T00:00:00Z' }) as PresetView
// The server may return them in any order; the page puts the default first.
const PRESETS = [preset('p-big', 'Big box'), preset('p-default', 'Default', true), preset('p-fast', 'Fast')]

const wrap = (onBack = vi.fn()) => ({ onBack, ...render(<ThemeProvider theme={theme}><PresetsPage onBack={onBack} /></ThemeProvider>) })
const rows = () => screen.getAllByRole('listitem')
const row = (name: string) => rows().find((r) => within(r).queryByRole('button', { name: `Edit ${name}` }))!

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset())
  api.listPresets.mockResolvedValue(PRESETS)
  api.deletePreset.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('PresetsPage', () => {
  test('lists the selected projects presets and shows each presets project', async () => {
    ctx.project = 'infra'
    api.listPresets.mockResolvedValue([{ ...preset('p-a', 'Alpha'), project: 'infra' }])
    wrap()
    await screen.findByText('Alpha')
    expect(api.listPresets).toHaveBeenLastCalledWith('infra')
    expect(within(row('Alpha')).getByText('infra', { selector: '.MuiChip-label' })).toBeTruthy()
    ctx.project = null
  })

  describe('badges', () => {
    const flagged = (id: string, name: string, messaging: boolean, manageable: boolean): PresetView =>
      ({ ...preset(id, name, false, manageable), spec: { session_messaging: messaging } }) as PresetView
    const chip = (name: string, label: string) => within(row(name)).queryByText(label, { selector: '.MuiChip-label' })

    test('each badge follows its own flag', async () => {
      api.listPresets.mockResolvedValue([
        flagged('p-1', 'Messaging', true, false),
        flagged('p-2', 'Managed', false, true),
        flagged('p-3', 'Both', true, true),
        flagged('p-4', 'Neither', false, false),
      ])
      wrap()
      await screen.findByText('Messaging')
      expect([chip('Messaging', 'Superleader'), chip('Messaging', 'Superleader-managed')].map(Boolean)).toEqual([true, false])
      expect([chip('Managed', 'Superleader'), chip('Managed', 'Superleader-managed')].map(Boolean)).toEqual([false, true])
      expect([chip('Both', 'Superleader'), chip('Both', 'Superleader-managed')].map(Boolean)).toEqual([true, true])
      expect([chip('Neither', 'Superleader'), chip('Neither', 'Superleader-managed')].map(Boolean)).toEqual([false, false])
    })

    test('badges explain themselves with the form helper text', async () => {
      api.listPresets.mockResolvedValue([flagged('p-3', 'Both', true, true)])
      wrap()
      await screen.findByText('Both')
      expect(screen.getByText('Superleader', { selector: '.MuiChip-label' }).closest('[aria-label]')?.getAttribute('aria-label')).toBe('superleader: can message the leaders of all sessions')
      expect(screen.getByText('Superleader-managed', { selector: '.MuiChip-label' }).closest('[aria-label]')?.getAttribute('aria-label')).toBe(
        'The superleader sees this preset and the sessions, webhooks, schedules and chats that use it, and can start, stop and edit them',
      )
    })
  })

  test('actions sit in the row flow and chips live in the wrapping chip container', async () => {
    api.listPresets.mockResolvedValue([{ ...preset('p-a', 'Alpha', true, true), project: 'infra', spec: { session_messaging: true } } as PresetView])
    wrap()
    await screen.findByText('Alpha')
    const r = row('Alpha')
    expect(r.querySelector('.MuiListItemSecondaryAction-root')).toBeNull()
    expect(r.classList.contains('MuiListItem-secondaryAction')).toBe(false)
    const chips = within(r).getByTestId('preset-chips')
    expect(getComputedStyle(chips).flexWrap).toBe('wrap')
    for (const label of ['infra', 'Default', 'Superleader', 'Superleader-managed']) {
      expect(within(chips).getByText(label, { selector: '.MuiChip-label' })).toBeTruthy()
    }
    expect(r.querySelectorAll('.MuiChip-root').length).toBe(within(chips).getAllByText(/./, { selector: '.MuiChip-label' }).length)
    expect(chips.contains(within(r).getByRole('button', { name: 'Edit Alpha' }))).toBe(false)
  })

  test('lists_presets_default_marked_without_delete', async () => {
    wrap()
    expect(screen.getByRole('heading', { name: 'Presets' })).toBeTruthy()
    await screen.findByText('Big box')
    expect(rows().map((r) => r.querySelector('.MuiListItemText-primary')?.textContent)).toEqual(['Default', 'Big box', 'Fast'])
    const def = row('Default')
    expect(within(def).getByText('Default', { selector: '.MuiChip-label' })).toBeTruthy()
    expect(within(def).getByRole('button', { name: 'Edit Default' })).toBeTruthy()
    expect(within(def).getByRole('button', { name: 'Copy Default' })).toBeTruthy()
    expect(within(def).queryByRole('button', { name: /Delete/ })).toBeNull()
    expect(within(row('Big box')).getByRole('button', { name: 'Delete Big box' })).toBeTruthy()
    expect(within(row('Big box')).queryByText('Default', { selector: '.MuiChip-label' })).toBeNull()
  })

  test('new_edit_copy_open_form_and_reload', async () => {
    wrap()
    await screen.findByText('Big box')
    expect(api.listPresets).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'New preset' }))
    expect(within(screen.getByRole('dialog')).getByText('new')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.listPresets).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('dialog')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Edit Big box' }))
    expect(within(screen.getByRole('dialog')).getByText('edit Big box')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.listPresets).toHaveBeenCalledTimes(3))

    await userEvent.click(screen.getByRole('button', { name: 'Copy Default' }))
    expect(within(screen.getByRole('dialog')).getByText('copy Default')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.listPresets).toHaveBeenCalledTimes(4))
    expect(screen.queryByRole('dialog')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Edit Fast' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.listPresets).toHaveBeenCalledTimes(4)
  })

  test('delete_confirms_and_shows_conflict', async () => {
    wrap()
    await screen.findByText('Big box')
    await userEvent.click(screen.getByRole('button', { name: 'Delete Big box' }))
    expect(screen.getByRole('heading', { name: /Delete .*Big box/ })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(api.deletePreset).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await userEvent.click(screen.getByRole('button', { name: 'Delete Big box' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.deletePreset).toHaveBeenCalledWith('p-big'))
    await waitFor(() => expect(api.listPresets).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    api.deletePreset.mockRejectedValue(new ApiError(409, 'last_preset', 'the last preset cannot be deleted'))
    await userEvent.click(screen.getByRole('button', { name: 'Delete Fast' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('the last preset cannot be deleted')
    expect(alert.className).toContain('MuiAlert-outlined')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  test('back_calls_on_back', async () => {
    const { onBack } = wrap()
    await screen.findByText('Big box')
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  test('list_error_is_shown', async () => {
    api.listPresets.mockRejectedValue(new Error('boom'))
    wrap()
    expect((await screen.findByRole('alert')).textContent).toContain('boom')
  })

  test('presets table shows label chips', async () => {
    api.listPresets.mockResolvedValue([{ ...preset('p-a', 'Alpha'), labels: ['mine', 'ops'] }, preset('p-b', 'Beta')])
    wrap()
    await screen.findByText('Alpha')
    expect(within(row('Alpha')).getByText('mine')).toBeTruthy()
    expect(within(row('Alpha')).getByText('ops')).toBeTruthy()
    expect(within(row('Beta')).queryByText('mine')).toBeNull()
  })
})
