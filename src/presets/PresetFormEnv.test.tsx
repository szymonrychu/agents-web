// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Meta, PresetView } from '../api/client'
import { stubRangeRects } from '../editor/testEditor'
import { theme } from '../theme'
import { PresetForm } from './PresetForm'
import { HOOK_EVENTS_FIXTURE } from '../hooks/testEvents'

const api = vi.hoisted(() => ({ createPreset: vi.fn(), updatePreset: vi.fn(), getMeta: vi.fn(), setPresetSecret: vi.fn() }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...api }))

const meta = (): Meta => ({
  agent_image: 'img', agent_images: ['img'], cache: { available: true, max_bytes: 5368709120 }, kube_access: { available: true }, caps: { max_sessions: 8, max_pvc_size: '100Gi', max_replicas: 16 },
  defaults: {
    any_mcp_config: { plugins: ['x'] }, auto_compact_pct: 80, discard_hook: 'none', effort: 'high', max_attempts: 5, model: 'opus', pvc_size: '10Gi', replicas: 1,
    resources: { limits: { cpu: '4', memory: '8Gi' }, requests: { cpu: '500m', memory: '1Gi' } }, storage_class: 'rook-ceph-rwx', workdir: 'workdir',
  },
  discard_hook: 'none', hook_events: HOOK_EVENTS_FIXTURE, models: ['opus'], efforts: ['high'],
})
const preset = (spec: Record<string, unknown> = {}): PresetView =>
  ({ created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', id: 'p-1', name: 'fast', is_default: false, spec }) as PresetView

const wrap = (el: React.ReactElement) => render(<ThemeProvider theme={theme}>{el}</ThemeProvider>)
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const toggle = (label: string) => screen.getByRole('switch', { name: label }) as HTMLInputElement
const noop = { onClose: vi.fn(), onSaved: vi.fn() }

// a stand-in marker, not a credential
const MARK = 'zz-marker-value'
const storedProtected = { protected: true, expand: false, set: true, version: 3, updated_at: '2026-02-03T04:05:06Z' }

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset())
  api.getMeta.mockResolvedValue(meta())
})
let restoreRange: () => void = () => {}
beforeAll(() => { restoreRange = stubRangeRects() })
afterAll(() => restoreRange())
afterEach(cleanup)

async function ready() {
  await waitFor(() => expect(field('Auto-compact percent').value).toBe('80'))
}
const type = async (label: string, text: string) => {
  await userEvent.click(field(label))
  await userEvent.paste(text)
}

describe('env variables: protected and expand', () => {
  test('a new row is plain, sends value with protected and expand false', async () => {
    api.createPreset.mockResolvedValue(preset())
    wrap(<PresetForm open {...noop} />)
    await ready()
    await type('Name', 'n')
    await userEvent.click(button('Add env'))
    await type('Env key 1', 'FOO')
    await type('Env value 1', 'bar')
    expect(toggle('Protected 1').checked).toBe(false)
    expect(toggle('Expand 1').checked).toBe(false)
    await userEvent.click(toggle('Expand 1'))
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalled())
    expect(api.createPreset.mock.calls[0][0].spec.env).toEqual({ FOO: { value: 'bar', protected: false, expand: true } })
  })

  test('Expand is disabled and off while Protected is on', async () => {
    wrap(<PresetForm open {...noop} />)
    await ready()
    await userEvent.click(button('Add env'))
    await type('Env key 1', 'FOO')
    await type('Env value 1', 'bar')
    await userEvent.click(toggle('Expand 1'))
    await userEvent.click(toggle('Protected 1'))
    expect(toggle('Expand 1').disabled).toBe(true)
    expect(toggle('Expand 1').checked).toBe(false)
  })

  test('Mark protected converts a plain row and sends its value once', async () => {
    api.createPreset.mockResolvedValue(preset())
    wrap(<PresetForm open {...noop} />)
    await ready()
    await type('Name', 'n')
    await userEvent.click(button('Add env'))
    await type('Env key 1', 'TOKEN_A')
    await type('Env value 1', MARK)
    await userEvent.click(button('Mark protected 1'))
    expect(toggle('Protected 1').checked).toBe(true)
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalled())
    expect(api.createPreset.mock.calls[0][0].spec.env).toEqual({ TOKEN_A: { protected: true, expand: false, value: MARK } })
  })

  test('a protected row needs a value before it can be saved', async () => {
    wrap(<PresetForm open {...noop} />)
    await ready()
    await userEvent.click(button('Add env'))
    await type('Env key 1', 'TOKEN_A')
    await userEvent.click(toggle('Protected 1'))
    expect(screen.getByText('A protected variable needs a value')).toBeTruthy()
  })

  test('a stored protected row shows set, updated_at and Replace value, never a value', async () => {
    wrap(<PresetForm open preset={preset({ env: { TOKEN_A: storedProtected } })} {...noop} />)
    await ready()
    expect(screen.getByText(/^set\b/)).toBeTruthy()
    expect(screen.getByText(/2026-02-03/)).toBeTruthy()
    expect(screen.queryByLabelText('Env value 1')).toBeNull()
    expect(screen.queryByLabelText('New value 1')).toBeNull()
    expect(button('Replace value 1')).toBeTruthy()
    expect(toggle('Protected 1').checked).toBe(true)
    expect(toggle('Expand 1').disabled).toBe(true)
  })

  test('an unset protected row shows unset', async () => {
    wrap(<PresetForm open preset={preset({ env: { TOKEN_A: { protected: true, expand: false, set: false, version: 0, updated_at: null } } })} {...noop} />)
    await ready()
    expect(screen.getByText(/^unset/)).toBeTruthy()
  })

  test('an untouched protected row sends no value', async () => {
    api.updatePreset.mockResolvedValue(preset())
    wrap(<PresetForm open preset={preset({ env: { TOKEN_A: storedProtected, PLAIN: { value: 'x', protected: false, expand: false } } })} {...noop} />)
    await ready()
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalled())
    expect(api.updatePreset.mock.calls[0][1].spec.env).toEqual({
      TOKEN_A: { protected: true, expand: false },
      PLAIN: { value: 'x', protected: false, expand: false },
    })
    expect(api.setPresetSecret).not.toHaveBeenCalled()
  })

  test('Replace value on a saved preset posts to the secret route, not the spec', async () => {
    api.updatePreset.mockResolvedValue(preset())
    api.setPresetSecret.mockResolvedValue({})
    wrap(<PresetForm open preset={preset({ env: { TOKEN_A: storedProtected } })} {...noop} />)
    await ready()
    await userEvent.click(button('Replace value 1'))
    await type('New value 1', MARK)
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalled())
    expect(api.setPresetSecret).toHaveBeenCalledWith('p-1', 'TOKEN_A', MARK)
    expect(JSON.stringify(api.updatePreset.mock.calls[0][1])).not.toContain(MARK)
    expect(api.updatePreset.mock.calls[0][1].spec.env).toEqual({ TOKEN_A: { protected: true, expand: false } })
  })

  test('Replace value needs a non-empty value, Cancel returns to untouched', async () => {
    wrap(<PresetForm open preset={preset({ env: { TOKEN_A: storedProtected } })} {...noop} />)
    await ready()
    await userEvent.click(button('Replace value 1'))
    expect(screen.getByText('A protected variable needs a value')).toBeTruthy()
    await userEvent.click(button('Cancel replace 1'))
    expect(screen.queryByLabelText('New value 1')).toBeNull()
    expect(button('Replace value 1')).toBeTruthy()
  })

  test('copying a preset sends a replaced value in the body (no preset to post to yet)', async () => {
    api.createPreset.mockResolvedValue(preset())
    wrap(<PresetForm open copyOf={preset({ env: { TOKEN_A: { protected: true, expand: false, set: false, version: 0, updated_at: null } } })} {...noop} />)
    await ready()
    await userEvent.click(button('Replace value 1'))
    await type('New value 1', MARK)
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalled())
    expect(api.createPreset.mock.calls[0][0].spec.env).toEqual({ TOKEN_A: { protected: true, expand: false, value: MARK } })
    expect(api.setPresetSecret).not.toHaveBeenCalled()
  })

  test('a plain-string env from old data is shown with a clear message and saves as a plain variable', async () => {
    api.updatePreset.mockResolvedValue(preset())
    wrap(<PresetForm open preset={preset({ env: { OLD: 'legacy-text' } })} {...noop} />)
    await ready()
    expect(screen.getByText(/OLD.*old plain-string format/)).toBeTruthy()
    expect(field('Env value 1').value).toBe('legacy-text')
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalled())
    expect(api.updatePreset.mock.calls[0][1].spec.env).toEqual({ OLD: { value: 'legacy-text', protected: false, expand: false } })
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
    expect(api.createPreset.mock.calls[0][0].spec.env).toEqual({ X: { value: '1', protected: false, expand: false } })
  })
})
