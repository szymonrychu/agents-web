// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { theme } from '../theme'
import type { ScheduleView } from './api'
import { ScheduleForm } from './ScheduleForm'

const api = vi.hoisted(() => ({ previewSchedule: vi.fn(), createSchedule: vi.fn(), updateSchedule: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))
const client = vi.hoisted(() => ({ listPresets: vi.fn() }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...client }))

const FIRES = ['2026-10-27T06:00:00Z', '2026-10-28T06:00:00Z', '2026-10-29T06:00:00Z']
const sched = (over: Partial<ScheduleView> = {}): ScheduleView =>
  ({
    id: 's1', name: 'nightly', cron: '0 6 * * *', timezone: 'Europe/London', preset_id: 'p2', prompt: 'Run {schedule_name}',
    enabled: false, next_fires: [], last_run: null, created_at: '2026-10-25T10:00:00Z', updated_at: '2026-10-25T10:00:00Z', ...over,
  }) as ScheduleView
const apiError = (status: number, code: string, message: string) => new ApiError(status, code, message)

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  client.listPresets.mockReset()
  client.listPresets.mockResolvedValue([
    { id: 'p1', name: 'Default preset', is_default: true },
    { id: 'p2', name: 'Other preset', is_default: false },
  ])
  api.previewSchedule.mockResolvedValue({ next_fires: FIRES })
})
afterEach(cleanup)

const mount = (schedule?: ScheduleView) => {
  const onSaved = vi.fn()
  const onCancel = vi.fn()
  render(<ThemeProvider theme={theme}><ScheduleForm schedule={schedule} onSaved={onSaved} onCancel={onCancel} /></ThemeProvider>)
  return { onSaved, onCancel }
}
const pickPreset = async (u: ReturnType<typeof userEvent.setup>, name: string) => {
  await u.click(await screen.findByRole('combobox', { name: 'Preset' }))
  await u.click(await screen.findByRole('option', { name: new RegExp(name) }))
}
const fill = async (u: ReturnType<typeof userEvent.setup>) => {
  await u.type(screen.getByLabelText('Name'), 'nightly')
  await u.type(screen.getByLabelText('Cron'), '0 6 * * *')
  await pickPreset(u, 'Default preset')
  await u.type(screen.getByLabelText('Prompt'), 'Do it')
}

describe('defaults', () => {
  test('defaults timezone to Europe/Warsaw, loads presets and hints the placeholders', async () => {
    mount()
    expect(screen.getByRole('combobox', { name: 'Timezone' }).textContent).toBe('Europe/Warsaw')
    expect(screen.getByText(/\{schedule_name\}/)).toBeTruthy()
    expect(screen.getByText(/\{fired_at\}/)).toBeTruthy()
    expect(screen.getByText(/5 fields/)).toBeTruthy()
    await userEvent.setup().click(await screen.findByRole('combobox', { name: 'Preset' }))
    expect(await screen.findByRole('option', { name: /Other preset/ })).toBeTruthy()
    expect(client.listPresets).toHaveBeenCalled()
    expect((screen.getByLabelText('Enabled') as HTMLInputElement).checked).toBe(true)
  })

  test('defaults come from the schedule when editing', async () => {
    mount(sched())
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('nightly')
    expect((screen.getByLabelText('Cron') as HTMLInputElement).value).toBe('0 6 * * *')
    expect(screen.getByRole('combobox', { name: 'Timezone' }).textContent).toBe('Europe/London')
    expect((screen.getByLabelText('Enabled') as HTMLInputElement).checked).toBe(false)
  })
})

describe('preview', () => {
  test('preview lists the next 3 fire times in the chosen zone, debounced', async () => {
    const u = userEvent.setup()
    mount()
    await u.type(screen.getByLabelText('Cron'), '0 6 * * *')
    expect(await screen.findByText(/2026-10-27 07:00/)).toBeTruthy()
    expect(screen.getByText(/2026-10-28 07:00/)).toBeTruthy()
    expect(screen.getByText(/2026-10-29 07:00/)).toBeTruthy()
    expect(api.previewSchedule).toHaveBeenCalledTimes(1)
    expect(api.previewSchedule).toHaveBeenCalledWith({ cron: '0 6 * * *', timezone: 'Europe/Warsaw' })
  })

  test('preview re-runs on timezone change', async () => {
    const u = userEvent.setup()
    mount(sched())
    expect(await screen.findByText(/2026-10-27 06:00/)).toBeTruthy()
    await u.click(screen.getByRole('combobox', { name: 'Timezone' }))
    await u.click(await screen.findByRole('option', { name: 'Europe/Paris' }))
    await waitFor(() => expect(api.previewSchedule).toHaveBeenLastCalledWith({ cron: '0 6 * * *', timezone: 'Europe/Paris' }))
  })

  test('preview shows the reason of an invalid cron under the cron field', async () => {
    api.previewSchedule.mockRejectedValue(apiError(422, 'invalid_cron', 'cron must have 5 fields'))
    const u = userEvent.setup()
    mount()
    await u.type(screen.getByLabelText('Cron'), 'nope')
    expect(await screen.findByText(/cron must have 5 fields/)).toBeTruthy()
    expect(screen.getByLabelText('Cron').getAttribute('aria-invalid')).toBe('true')
    expect(screen.queryByText(/2026-10-27/)).toBeNull()
  })

  test('preview shows an invalid timezone reason under the timezone field', async () => {
    api.previewSchedule.mockRejectedValue(apiError(422, 'invalid_timezone', 'unknown timezone'))
    mount(sched())
    expect(await screen.findByText(/unknown timezone/)).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Timezone' }).getAttribute('aria-invalid')).toBe('true')
  })

  test('preview is not called for an empty cron', async () => {
    mount()
    await new Promise((r) => setTimeout(r, 400))
    expect(api.previewSchedule).not.toHaveBeenCalled()
  })
})

describe('save', () => {
  test('save creates the schedule and reports it', async () => {
    const saved = sched({ id: 'new' })
    api.createSchedule.mockResolvedValue(saved)
    const u = userEvent.setup()
    const { onSaved } = mount()
    await fill(u)
    await u.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
    expect(api.createSchedule).toHaveBeenCalledWith({
      name: 'nightly', cron: '0 6 * * *', timezone: 'Europe/Warsaw', preset_id: 'p1', prompt: 'Do it', enabled: true,
    })
    expect(api.updateSchedule).not.toHaveBeenCalled()
  })

  test('save updates an existing schedule and reports it', async () => {
    const saved = sched({ prompt: 'changed' })
    api.updateSchedule.mockResolvedValue(saved)
    const u = userEvent.setup()
    const { onSaved } = mount(sched())
    await u.clear(screen.getByLabelText('Prompt'))
    await u.type(screen.getByLabelText('Prompt'), 'changed')
    await u.click(screen.getByLabelText('Enabled'))
    await u.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved))
    expect(api.updateSchedule).toHaveBeenCalledWith('s1', {
      name: 'nightly', cron: '0 6 * * *', timezone: 'Europe/London', preset_id: 'p2', prompt: 'changed', enabled: true,
    })
    expect(api.createSchedule).not.toHaveBeenCalled()
  })

  test('save is disabled until name, cron, preset and prompt are set, and cancel reports', async () => {
    const u = userEvent.setup()
    const { onCancel } = mount()
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
    await u.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})

describe('errors', () => {
  const attempt = async (e: unknown) => {
    api.createSchedule.mockRejectedValue(e)
    const u = userEvent.setup()
    const { onSaved } = mount()
    await fill(u)
    await u.click(screen.getByRole('button', { name: 'Save' }))
    return onSaved
  }

  test('errors: 409 conflict lands on the name field', async () => {
    const onSaved = await attempt(apiError(409, 'conflict', 'name already taken'))
    const msg = await screen.findByText(/name already taken/)
    expect(msg.id).toBe(screen.getByLabelText('Name').getAttribute('aria-describedby'))
    expect(onSaved).not.toHaveBeenCalled()
  })

  test('errors: invalid_cron lands on the cron field', async () => {
    await attempt(apiError(422, 'invalid_cron', 'bad cron value'))
    const msg = await screen.findByText(/bad cron value/)
    expect(msg.id).toBe(screen.getByLabelText('Cron').getAttribute('aria-describedby'))
  })

  test('errors: invalid_timezone lands on the timezone field', async () => {
    await attempt(apiError(422, 'invalid_timezone', 'bad zone value'))
    expect(await screen.findByText(/bad zone value/)).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Timezone' }).getAttribute('aria-invalid')).toBe('true')
  })

  test('errors: unknown_preset lands on the preset field', async () => {
    await attempt(apiError(422, 'unknown_preset', 'no such preset'))
    expect(await screen.findByText(/no such preset/)).toBeTruthy()
  })

  test('errors: other failures show as a form error', async () => {
    await attempt(apiError(503, 'orchestrator_unavailable', 'cannot reach orchestrator'))
    expect(await screen.findByText(/orchestrator_unavailable: cannot reach orchestrator/)).toBeTruthy()
  })

  test('errors: editing a field clears its server error', async () => {
    await attempt(apiError(409, 'conflict', 'name already taken'))
    await screen.findByText(/name already taken/)
    await userEvent.setup().type(screen.getByLabelText('Name'), 'x')
    expect(screen.queryByText(/name already taken/)).toBeNull()
  })
})
