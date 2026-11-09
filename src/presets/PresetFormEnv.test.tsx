// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Meta, PresetView } from '../api/client'
import { editorView, stubRangeRects } from '../editor/testEditor'
import { theme } from '../theme'
import { PresetForm } from './PresetForm'
import { HOOK_EVENTS_FIXTURE } from '../hooks/testEvents'

const api = vi.hoisted(() => ({ createPreset: vi.fn(), updatePreset: vi.fn(), getMeta: vi.fn() }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...api }))

const meta = (): Meta => ({
  agent_image: 'img', agent_images: ['img'], cache: { available: true, max_bytes: 5368709120 }, kube_cluster_access: { available: true }, kube_namespace_access: { available: true, namespaces: ['media', 'e2e-target'], tiers: ['read', 'port-forward', 'exec', 'edit', 'admin'] }, docker: { available: false, max_cpu: '8', max_memory: '16Gi', max_storage: '100Gi', storage: '30Gi' }, permission_modes: [{ value: 'bypassPermissions', label: 'Allow all' }, { value: 'auto', label: 'Auto' }], caps: { max_sessions: 8, max_pvc_size: '100Gi', max_replicas: 16 },
  defaults: {
    any_mcp_config: { plugins: ['x'] }, auto_compact_pct: 80, discard_hook: 'none', effort: 'high', max_attempts: 5, model: 'opus', pvc_size: '10Gi', replicas: 1,
    resources: { limits: { cpu: '4', memory: '8Gi' }, requests: { cpu: '500m', memory: '1Gi' } }, storage_class: 'rook-ceph-rwx', workdir: 'workdir',
  },
  discard_hook: 'none', hook_events: HOOK_EVENTS_FIXTURE, usage: { configured: false, quota_default_pct: 100 }, inactivity: { reminder_seconds: 0, close_seconds: 0, handoff_seconds: 300 }, models: ['opus'], efforts: ['high'],
})
const preset = (spec: Record<string, unknown> = {}): PresetView =>
  ({ created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', id: 'p-1', name: 'fast', is_default: false, spec }) as PresetView

const wrap = (el: React.ReactElement) => render(<ThemeProvider theme={theme}>{el}</ThemeProvider>)
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const toggle = (label: string) => screen.getByRole('switch', { name: label }) as HTMLInputElement
const noop = { onClose: vi.fn(), onSaved: vi.fn() }


beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset())
  api.getMeta.mockResolvedValue(meta())
})
let restoreRange: () => void = () => {}
beforeAll(() => { restoreRange = stubRangeRects() })
afterAll(() => restoreRange())
afterEach(cleanup)

// The lazy CodeMirror editors mount asynchronously; waiting for them keeps their import out of the middle of an interaction.
async function ready() {
  await waitFor(() => expect(field('Auto-compact percent').value).toBe('80'))
  await editorView('Start prompt')
}
const type = async (label: string, text: string) => {
  await userEvent.click(field(label))
  await userEvent.paste(text)
}

const GREF = { vault: '01234567-89ab-cdef-0123-456789abcdef', env: 'GITHUB_TOKEN' }

describe('env variables: plain and vault refs', () => {
  test('a new row is plain, sends value and expand', async () => {
    api.createPreset.mockResolvedValue(preset())
    wrap(<PresetForm open {...noop} />)
    await ready()
    await type('Name', 'n')
    await userEvent.click(button('Add env'))
    await type('Env key 1', 'FOO')
    await type('Env value 1', 'bar')
    expect(toggle('Expand 1').checked).toBe(false)
    await userEvent.click(toggle('Expand 1'))
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalled())
    expect(api.createPreset.mock.calls[0][0].spec.env).toEqual({ FOO: { value: 'bar', expand: true } })
  })

  test('no Protected switch and no Mark protected button', async () => {
    wrap(<PresetForm open {...noop} />)
    await ready()
    await userEvent.click(button('Add env'))
    expect(screen.queryByRole('switch', { name: 'Protected 1' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Mark protected/ })).toBeNull()
  })

  test('a plain-string env from old data is shown with a clear message and saves as a plain variable', async () => {
    api.updatePreset.mockResolvedValue(preset())
    wrap(<PresetForm open preset={preset({ env: { OLD: 'legacy-text' } })} {...noop} />)
    await ready()
    expect(screen.getByText(/OLD.*old plain-string format/)).toBeTruthy()
    expect(field('Env value 1').value).toBe('legacy-text')
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalled())
    expect(api.updatePreset.mock.calls[0][1].spec.env).toEqual({ OLD: { value: 'legacy-text', expand: false } })
  })

  test('Paste .env makes plain rows with expand off', async () => {
    api.createPreset.mockResolvedValue(preset())
    wrap(<PresetForm open {...noop} />)
    await ready()
    await type('Name', 'n')
    await userEvent.click(button('Paste .env'))
    await type('Paste .env contents', 'X=1')
    await userEvent.click(button('Apply'))
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalled())
    expect(api.createPreset.mock.calls[0][0].spec.env).toEqual({ X: { value: '1', expand: false } })
  })

  test('a stored vault ref row keeps its key and round-trips unchanged', async () => {
    api.updatePreset.mockResolvedValue(preset())
    wrap(<PresetForm open preset={preset({ env: { G: GREF, A: { value: 'x', expand: true } } })} {...noop} />)
    await ready()
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalled())
    expect(api.updatePreset.mock.calls[0][1].spec.env).toEqual({ G: GREF, A: { value: 'x', expand: true } })
  })

  test('test_paste_onto_vault_row_refused', async () => {
    wrap(<PresetForm open preset={preset({ env: { G: GREF } })} {...noop} />)
    await ready()
    await userEvent.click(button('Paste .env'))
    await type('Paste .env contents', 'G=plain')
    await userEvent.click(button('Apply'))
    expect(screen.getByText('G is a vault reference; remove that row first')).toBeTruthy()
    expect((field('Env value 1')).disabled).toBe(true)
    expect(field('Env key 1').value).toBe('G')
  })

  test('paste of a new key next to a vault row still appends a plain row', async () => {
    api.updatePreset.mockResolvedValue(preset())
    wrap(<PresetForm open preset={preset({ env: { G: GREF } })} {...noop} />)
    await ready()
    await userEvent.click(button('Paste .env'))
    await type('Paste .env contents', 'N=1')
    await userEvent.click(button('Apply'))
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalled())
    expect(api.updatePreset.mock.calls[0][1].spec.env).toEqual({ G: GREF, N: { value: '1', expand: false } })
  })
})
