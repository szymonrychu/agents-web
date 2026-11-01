// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { Meta, PresetView } from '../api/client'
import { editorText, setEditorText, stubRangeRects } from '../editor/testEditor'
import { theme } from '../theme'
import { PresetForm } from './PresetForm'
import { HOOK_EVENTS_FIXTURE } from '../hooks/testEvents'

const api = vi.hoisted(() => ({ createPreset: vi.fn(), updatePreset: vi.fn(), getMeta: vi.fn() }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...api }))

const meta = (o: Partial<Meta> = {}): Meta => ({
  agent_image: 'img', agent_images: ['img'], cache: { available: true, max_bytes: 5368709120 }, kube_access: { available: true }, caps: { max_sessions: 8, max_pvc_size: '100Gi', max_replicas: 16 },
  defaults: {
    any_mcp_config: { plugins: ['x'] }, auto_compact_pct: 80, discard_hook: 'none', effort: 'high', max_attempts: 5, model: 'opus', pvc_size: '10Gi', replicas: 1,
    resources: { limits: { cpu: '4', memory: '8Gi' }, requests: { cpu: '500m', memory: '1Gi' } }, storage_class: 'rook-ceph-rwx', workdir: 'workdir',
  },
  discard_hook: 'none', hook_events: HOOK_EVENTS_FIXTURE, models: ['opus', 'sonnet', 'haiku'], efforts: ['low', 'medium', 'high', 'max'], ...o,
})
const preset = (o: Partial<PresetView> = {}): PresetView =>
  ({ created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', id: 'p-1', name: 'fast', is_default: false, spec: {}, ...o }) as PresetView

const wrap = (el: React.ReactElement) => render(<ThemeProvider theme={theme}>{el}</ThemeProvider>)
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement

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
const paste = async (label: string, text: string) => {
  await userEvent.click(field(label))
  await userEvent.paste(text)
}
const replace = async (label: string, text: string) => {
  await userEvent.clear(field(label))
  if (text) await paste(label, text)
}
const pick = async (label: string, option: string) => {
  await userEvent.click(screen.getByRole('combobox', { name: label }))
  await userEvent.click(screen.getByRole('option', { name: option }))
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
}


const noop = { onClose: vi.fn(), onSaved: vi.fn() }
const optionTexts = () => screen.getAllByRole('option').map((o) => o.textContent)

describe('PresetForm', () => {
  test('keeps edits made before meta loads', { timeout: 15000 }, async () => {
    let resolveMeta: (m: Meta) => void = () => {}
    api.getMeta.mockReturnValue(new Promise<Meta>((r) => { resolveMeta = r }))
    api.createPreset.mockResolvedValue(preset())
    wrap(<PresetForm open onClose={vi.fn()} onSaved={vi.fn()} />)
    await replace('Name', 'early')
    await replace('Max attempts', '9')
    resolveMeta(meta())
    await ready()
    expect(field('Name').value).toBe('early')
    expect(field('Max attempts').value).toBe('9')
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalled())
    const body = api.createPreset.mock.calls[0][0]
    expect(body.name).toBe('early')
    expect(body.spec.max_attempts).toBe(9)
  })

  test('new_preset_prefills_defaults_saves_only_set_fields', { timeout: 15000 }, async () => {
    api.createPreset.mockResolvedValue(preset())
    const onSaved = vi.fn()
    wrap(<PresetForm open onClose={vi.fn()} onSaved={onSaved} />)
    await ready()
    expect(screen.getByRole('combobox', { name: 'Model' }).textContent).toBe('opus')
    expect(screen.getByRole('combobox', { name: 'Effort' }).textContent).toBe('high')
    await userEvent.click(screen.getByRole('combobox', { name: 'Model' }))
    expect(optionTexts()).toEqual(['default', 'opus', 'sonnet', 'haiku'])
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('combobox', { name: 'Effort' }))
    expect(optionTexts()).toEqual(['model default', 'low', 'medium', 'high', 'max'])
    await userEvent.keyboard('{Escape}')
    expect(field('Replicas').value).toBe('1')
    expect(field('Workdir').value).toBe('workdir')
    expect(field('PVC size').value).toBe('10Gi')
    expect(field('any-mcp config').value).toBe(JSON.stringify({ plugins: ['x'] }, null, 2))
    expect(field('Max attempts').value).toBe('5')
    expect(field('CPU request').value).toBe('500m')
    expect(field('CPU limit').value).toBe('4')
    expect(field('Memory request').value).toBe('1Gi')
    expect(field('Memory limit').value).toBe('8Gi')
    expect(button('Create').disabled).toBe(true)
    await paste('Name', 'Fast 1')
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalledTimes(1))
    expect(api.createPreset).toHaveBeenLastCalledWith({ name: 'Fast 1', spec: {} })
    await waitFor(() => expect(onSaved).toHaveBeenCalled())

    await replace('Replicas', '3')
    await pick('Model', 'sonnet')
    await userEvent.click(field('Peers'))
    await userEvent.click(button('Add env'))
    await paste('Env key 1', 'FOO')
    await paste('Env value 1', 'bar')
    await replace('Memory limit', '4Gi')
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalledTimes(2))
    expect(api.createPreset).toHaveBeenLastCalledWith({
      name: 'Fast 1',
      spec: {
        replicas: 3, model: 'sonnet', peers: false, env: { FOO: 'bar' },
        resources: { requests: { cpu: '500m', memory: '1Gi' }, limits: { cpu: '4', memory: '4Gi' } },
      },
    })
    expect(api.updatePreset).not.toHaveBeenCalled()
  })

  test('edit_round_trips_stored_fields', async () => {
    const stored = { replicas: 2, model: 'opus', env: { A: 'b' }, pvc_size: '20Gi', workdir: 'work', image: 'reg/custom:1' }
    api.updatePreset.mockResolvedValue(preset({ spec: stored }))
    wrap(<PresetForm open preset={preset({ spec: stored })} {...noop} />)
    await ready()
    expect(field('Name').value).toBe('fast')
    expect(field('Replicas').value).toBe('2')
    expect(field('Workdir').value).toBe('work')
    expect(field('PVC size').value).toBe('20Gi')
    expect(field('Env key 1').value).toBe('A')
    expect(field('Env value 1').value).toBe('b')
    expect(field('Max attempts').value).toBe('5')
    expect(screen.getByRole('combobox', { name: 'Effort' }).textContent).toBe('high')
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalledTimes(1))
    expect(api.updatePreset).toHaveBeenLastCalledWith('p-1', { name: 'fast', spec: stored })
    await replace('Replicas', '4')
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalledTimes(2))
    expect(api.updatePreset).toHaveBeenLastCalledWith('p-1', { name: 'fast', spec: { ...stored, replicas: 4 } })
    expect(api.createPreset).not.toHaveBeenCalled()
  })

  test('edit_shows_unavailable_stored_value', async () => {
    const stored = { model: 'legacy-model', effort: 'ultra' }
    api.updatePreset.mockResolvedValue(preset({ spec: stored }))
    wrap(<PresetForm open preset={preset({ spec: stored })} {...noop} />)
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Model' }).textContent).toBe('legacy-model (not available)'))
    expect(screen.getByRole('combobox', { name: 'Effort' }).textContent).toBe('ultra (not available)')
    await userEvent.click(screen.getByRole('combobox', { name: 'Model' }))
    expect(optionTexts()).toEqual(['default', 'legacy-model (not available)', 'opus', 'sonnet', 'haiku'])
    await userEvent.keyboard('{Escape}')
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalledTimes(1))
    expect(api.updatePreset).toHaveBeenLastCalledWith('p-1', { name: 'fast', spec: stored })
  })

  test('clearing_a_field_unsets_it', async () => {
    api.updatePreset.mockResolvedValue(preset())
    const stored = { replicas: 2, pvc_size: '20Gi', max_attempts: 3, model: 'opus', workdir: 'work' }
    wrap(<PresetForm open preset={preset({ spec: stored })} {...noop} />)
    await ready()
    await userEvent.clear(field('Replicas'))
    await userEvent.clear(field('PVC size'))
    await userEvent.clear(field('Max attempts'))
    await userEvent.clear(field('Workdir'))
    await pick('Model', 'default')
    expect(button('Save').disabled).toBe(false)
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalledTimes(1))
    const body = api.updatePreset.mock.calls[0][1]
    expect(body).toEqual({ name: 'fast', spec: {} })
    expect(JSON.stringify(body)).not.toContain('null')
  })

  test('copy_prefills_from_source', async () => {
    const spec = { replicas: 2, model: 'opus' }
    api.createPreset.mockResolvedValue(preset())
    wrap(<PresetForm open copyOf={preset({ name: 'fast', spec, is_default: true })} {...noop} />)
    await ready()
    expect(field('Name').value).toBe('fast copy')
    expect(field('Name').disabled).toBe(false)
    expect(field('Replicas').value).toBe('2')
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalledTimes(1))
    expect(api.createPreset).toHaveBeenLastCalledWith({ name: 'fast copy', spec })
    expect(api.updatePreset).not.toHaveBeenCalled()
    cleanup()
    const long = `${'A'.repeat(34)} tail`
    wrap(<PresetForm open copyOf={preset({ name: long })} {...noop} />)
    await ready()
    expect(field('Name').value).toBe(`${'A'.repeat(34)} copy`)
    cleanup()
    const full = 'B'.repeat(40)
    wrap(<PresetForm open copyOf={preset({ name: full })} {...noop} />)
    await ready()
    expect(field('Name').value).toBe(`${'B'.repeat(35)} copy`)
    expect(field('Name').value.length).toBeLessThanOrEqual(40)
  })

  test('name_rules_default_name_and_pvc', async () => {
    wrap(<PresetForm open {...noop} />)
    await ready()
    await userEvent.type(field('Name'), ' x')
    expect(screen.getByText(/start or end with a space/)).toBeTruthy()
    expect(button('Create').disabled).toBe(true)
    await replace('Name', 'x ')
    expect(screen.getByText(/start or end with a space/)).toBeTruthy()
    expect(button('Create').disabled).toBe(true)
    await replace('Name', 'bad/name')
    expect(screen.getByText(/letters, digits, spaces, dots, dashes and underscores/)).toBeTruthy()
    await replace('Name', 'a'.repeat(41))
    expect(screen.getByText(/at most 40/)).toBeTruthy()
    await replace('Name', 'ok name_1.2-3')
    expect(button('Create').disabled).toBe(false)
    await userEvent.clear(field('PVC size'))
    expect(button('Create').disabled).toBe(false)
    cleanup()

    wrap(<PresetForm open preset={preset({ name: 'default', is_default: true })} {...noop} />)
    await ready()
    expect(field('Name').disabled).toBe(true)
    expect(field('PVC size').disabled).toBe(false)
    await replace('PVC size', '30Gi')
    expect(field('PVC size').value).toBe('30Gi')
    cleanup()

    wrap(<PresetForm open preset={preset()} {...noop} />)
    await ready()
    expect(field('Name').disabled).toBe(false)
  })

  test('validates env keys, webhook url and any-mcp json', async () => {
    wrap(<PresetForm open {...noop} />)
    await ready()
    await paste('Name', 'ok')
    await userEvent.click(button('Add env'))
    await userEvent.type(field('Env key 1'), 'API_TOKEN')
    expect(screen.queryByText(/secret/i)).toBeNull()
    expect(field('Env key 1').getAttribute('aria-invalid')).toBe('false')
    expect(button('Create').disabled).toBe(false)
    await replace('Env key 1', 'DB_PASSWORD')
    expect(field('Env key 1').getAttribute('aria-invalid')).toBe('false')
    expect(button('Create').disabled).toBe(false)
    await replace('Env key 1', 'CCW_X')
    expect(screen.getByText(/reserved/i)).toBeTruthy()
    await replace('Env key 1', 'GOOD')
    expect(button('Create').disabled).toBe(false)
    await userEvent.type(field('Pre-discard webhook URL'), 'ftp://x')
    expect(screen.getByText(/http or https/)).toBeTruthy()
    expect(button('Create').disabled).toBe(true)
    await replace('Pre-discard webhook URL', '')
    await paste('any-mcp config', '{nope')
    expect(screen.getByText(/valid JSON/)).toBeTruthy()
    expect(button('Create').disabled).toBe(true)
    expect(api.createPreset).not.toHaveBeenCalled()
  })

  describe('Paste .env', () => {
    const openPaste = async (text: string) => {
      await userEvent.click(button('Paste .env'))
      await paste('Paste .env contents', text)
    }

    test('applying merges pairs, replaces in place, appends in order and submits them', async () => {
      api.updatePreset.mockResolvedValue(preset())
      wrap(<PresetForm open preset={preset({ spec: { env: { A: 'old', B: 'keep' } } })} {...noop} />)
      await ready()
      await openPaste('C=3\nA=new\n# note\nD=4\n')
      await userEvent.click(button('Apply'))
      expect(screen.queryByLabelText('Paste .env contents')).toBeNull()
      expect(field('Env key 1').value).toBe('A')
      expect(field('Env value 1').value).toBe('new')
      expect(field('Env key 2').value).toBe('B')
      expect(field('Env key 3').value).toBe('C')
      expect(field('Env key 4').value).toBe('D')
      await userEvent.click(button('Save'))
      await waitFor(() => expect(api.updatePreset).toHaveBeenCalledTimes(1))
      expect(api.updatePreset.mock.calls[0][1].spec.env).toEqual({ A: 'new', B: 'keep', C: '3', D: '4' })
    })

    test('a pasted key replaces only the first of duplicate rows', async () => {
      wrap(<PresetForm open {...noop} />)
      await ready()
      await userEvent.click(button('Add env'))
      await userEvent.click(button('Add env'))
      await paste('Env key 1', 'A')
      await paste('Env value 1', '1')
      await paste('Env key 2', 'A')
      await paste('Env value 2', '2')
      await openPaste('A=new')
      await userEvent.click(button('Apply'))
      expect(field('Env value 1').value).toBe('new')
      expect(field('Env value 2').value).toBe('2')
      expect(screen.queryByLabelText('Env key 3')).toBeNull()
    })

    test('a paste-only edit marks env set so the sparse spec carries it', async () => {
      api.createPreset.mockResolvedValue(preset())
      wrap(<PresetForm open {...noop} />)
      await ready()
      await paste('Name', 'sparse')
      await openPaste('X=1')
      await userEvent.click(button('Apply'))
      await userEvent.click(button('Create'))
      await waitFor(() => expect(api.createPreset).toHaveBeenCalledTimes(1))
      expect(api.createPreset).toHaveBeenLastCalledWith({ name: 'sparse', spec: { env: { X: '1' } } })
    })

    test('drops empty rows on a merge', async () => {
      wrap(<PresetForm open {...noop} />)
      await ready()
      await userEvent.click(button('Add env'))
      await openPaste('X=1')
      await userEvent.click(button('Apply'))
      expect(field('Env key 1').value).toBe('X')
      expect(screen.queryByLabelText('Env key 2')).toBeNull()
    })

    test('an invalid line applies nothing and lists every error', async () => {
      wrap(<PresetForm open preset={preset({ spec: { env: { A: 'old' } } })} {...noop} />)
      await ready()
      await openPaste('A=new\nbroken\nB="x')
      await userEvent.click(button('Apply'))
      expect(field('Paste .env contents').value).toBe('A=new\nbroken\nB="x')
      expect(screen.getByText(/line 2: /)).toBeTruthy()
      expect(screen.getByText(/line 3: /)).toBeTruthy()
      expect(field('Env value 1').value).toBe('old')
      expect(screen.queryByLabelText('Env key 2')).toBeNull()
    })

    test('apply with no pairs changes nothing and closes', async () => {
      wrap(<PresetForm open {...noop} />)
      await ready()
      await userEvent.click(button('Add env'))
      await openPaste('# only a comment\n\n')
      await userEvent.click(button('Apply'))
      expect(screen.queryByLabelText('Paste .env contents')).toBeNull()
      expect(field('Env key 1').value).toBe('')
    })

    test('cancel closes, clears and leaves rows unchanged', async () => {
      wrap(<PresetForm open preset={preset({ spec: { env: { A: 'old' } } })} {...noop} />)
      await ready()
      await openPaste('A=new')
      await userEvent.click(within(screen.getByRole('group', { name: 'Paste .env' })).getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByLabelText('Paste .env contents')).toBeNull()
      expect(field('Env value 1').value).toBe('old')
      await userEvent.click(button('Paste .env'))
      expect(field('Paste .env contents').value).toBe('')
    })

    test('a pasted reserved key shows its error and blocks submit', async () => {
      wrap(<PresetForm open {...noop} />)
      await ready()
      await paste('Name', 'ok')
      await openPaste('API_TOKEN=x\nCCW_X=y')
      await userEvent.click(button('Apply'))
      expect(screen.getByText(/reserved/i)).toBeTruthy()
      expect(screen.queryByText(/secret/i)).toBeNull()
      expect(button('Create').disabled).toBe(true)
    })

    const SECRET_NAMED = ['MY_TOKEN', 'APP_SECRET', 'DB_PASSWORD', 'ADMIN_PASSWD', 'GIT_CREDENTIAL', 'STRIPE_API_KEY', 'SIGNING_PRIVATE_KEY', 'AWS_ACCESS_KEY']

    test('secret-named keys are accepted', { timeout: 30000 }, async () => {
      wrap(<PresetForm open {...noop} />)
      await ready()
      await paste('Name', 'ok')
      await userEvent.click(button('Add env'))
      for (const key of SECRET_NAMED) {
        await replace('Env key 1', key)
        expect(field('Env key 1').getAttribute('aria-invalid')).toBe('false')
        expect(button('Create').disabled).toBe(false)
      }
      await userEvent.click(button('Remove env 1'))
      await openPaste(SECRET_NAMED.map((k) => `${k}=v`).join('\n'))
      await userEvent.click(button('Apply'))
      expect(field(`Env key ${SECRET_NAMED.length}`).value).toBe(SECRET_NAMED[SECRET_NAMED.length - 1])
      for (let i = 1; i <= SECRET_NAMED.length; i++) expect(field(`Env key ${i}`).getAttribute('aria-invalid')).toBe('false')
      expect(screen.queryByText(/secret/i)).toBeNull()
      expect(button('Create').disabled).toBe(false)
    })

    test('Create applies a pending paste', async () => {
      api.createPreset.mockResolvedValue(preset())
      wrap(<PresetForm open {...noop} />)
      await ready()
      await paste('Name', 'pending')
      await openPaste('FOO=1\nAPI_TOKEN=secret')
      expect(button('Create').disabled).toBe(false)
      await userEvent.click(button('Create'))
      await waitFor(() => expect(api.createPreset).toHaveBeenCalledTimes(1))
      expect(api.createPreset).toHaveBeenLastCalledWith({ name: 'pending', spec: { env: { FOO: '1', API_TOKEN: 'secret' } } })
    })

    test('Save applies a pending paste', async () => {
      api.updatePreset.mockResolvedValue(preset())
      wrap(<PresetForm open preset={preset({ spec: { env: { A: 'old', B: 'keep' } } })} {...noop} />)
      await ready()
      await openPaste('C=3\nA=new')
      await userEvent.click(button('Save'))
      await waitFor(() => expect(api.updatePreset).toHaveBeenCalledTimes(1))
      expect(Object.entries(api.updatePreset.mock.calls[0][1].spec.env)).toEqual([['A', 'new'], ['B', 'keep'], ['C', '3']])
      expect(api.createPreset).not.toHaveBeenCalled()
    })

    test('a blank pending paste box submits as before', async () => {
      api.createPreset.mockResolvedValue(preset())
      wrap(<PresetForm open {...noop} />)
      await ready()
      await paste('Name', 'blank')
      await openPaste('  \n ')
      await userEvent.click(button('Create'))
      await waitFor(() => expect(api.createPreset).toHaveBeenCalledTimes(1))
      expect(api.createPreset).toHaveBeenLastCalledWith({ name: 'blank', spec: {} })
    })

    test('a pending paste with a parse error blocks submit', async () => {
      wrap(<PresetForm open {...noop} />)
      await ready()
      await paste('Name', 'bad')
      await openPaste('FOO=1\nbroken\nB="x')
      await userEvent.click(button('Create'))
      expect(api.createPreset).not.toHaveBeenCalled()
      expect(field('Paste .env contents').value).toBe('FOO=1\nbroken\nB="x')
      expect(screen.getByText(/line 2: /)).toBeTruthy()
      expect(screen.getByText(/line 3: /)).toBeTruthy()
      expect(screen.queryByLabelText('Env key 1')).toBeNull()
    })

    test('a pending paste with a reserved key applies the rows, shows the error and sends nothing', async () => {
      wrap(<PresetForm open {...noop} />)
      await ready()
      await paste('Name', 'res')
      await openPaste('FOO=1\nCCW_X=y')
      await userEvent.click(button('Create'))
      expect(api.createPreset).not.toHaveBeenCalled()
      expect(screen.queryByLabelText('Paste .env contents')).toBeNull()
      expect(field('Env key 1').value).toBe('FOO')
      expect(field('Env key 2').value).toBe('CCW_X')
      expect(screen.getByText(/reserved/i)).toBeTruthy()
      expect(button('Create').disabled).toBe(true)
    })
  })

  test('shows_server_errors', async () => {
    api.createPreset.mockRejectedValueOnce(new ApiError(409, 'conflict', 'preset name fast already exists'))
    wrap(<PresetForm open {...noop} />)
    await ready()
    await userEvent.type(field('Name'), 'fast')
    await userEvent.click(button('Create'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('preset name fast already exists')
    expect(alert.className).toContain('MuiAlert-outlined')
    api.createPreset.mockRejectedValueOnce(new ApiError(422, 'invalid', 'replicas above cap'))
    await userEvent.click(button('Create'))
    expect((await screen.findByRole('alert')).textContent).toBe('replicas above cap')
    expect(screen.queryByText('preset name fast already exists')).toBeNull()
    cleanup()
    api.updatePreset.mockRejectedValueOnce(new ApiError(422, 'invalid', 'model gone not allowed'))
    wrap(<PresetForm open preset={preset()} {...noop} />)
    await ready()
    await userEvent.click(button('Save'))
    expect((await screen.findByRole('alert')).textContent).toBe('model gone not allowed')
  })

  test('edit_path_retired', () => {
    const tracked = execFileSync('git', ['ls-files', 'src/clusters/ClusterForm.tsx', 'src/clusters/ClusterForm.test.tsx'], { encoding: 'utf8' })
    expect(tracked).toBe('')
    const client = readFileSync('src/api/client.ts', 'utf8')
    expect(client).not.toContain('patchCluster')
    expect(client).not.toContain('PatchCluster')
  })
  test('help texts name the session', async () => {
    wrap(<PresetForm open {...noop} />)
    await ready()
    expect(screen.getByText('More than 1 makes the session a hive')).toBeTruthy()
    expect(screen.getByText('Runs once when a session starts, in the shared workdir; agents can read and edit it; edits apply to the next session.')).toBeTruthy()
  })

  test('max replicas renders, validates bounds and maps only when set', { timeout: 15000 }, async () => {
    api.createPreset.mockResolvedValue(preset())
    wrap(<PresetForm open onClose={vi.fn()} onSaved={vi.fn()} />)
    await ready()
    expect(field('Max replicas').value).toBe('')
    expect(screen.getByText('More than 1 makes the session a hive')).toBeTruthy()
    await replace('Name', 'a')
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalledTimes(1))
    expect(api.createPreset.mock.calls[0][0].spec).not.toHaveProperty('max_replicas')
    await replace('Replicas', '3')
    await replace('Max replicas', '2')
    expect(screen.getByText('Max replicas must be 3 to 16')).toBeTruthy()
    expect(button('Create').disabled).toBe(true)
    await replace('Max replicas', '17')
    expect(screen.getByText('Max replicas must be 3 to 16')).toBeTruthy()
    await replace('Max replicas', '4')
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalledTimes(2))
    expect(api.createPreset.mock.calls[1][0].spec.max_replicas).toBe(4)
  })

  test('static switch maps to spec.static and errors when max replicas differs from replicas', { timeout: 15000 }, async () => {
    api.createPreset.mockResolvedValue(preset())
    wrap(<PresetForm open onClose={vi.fn()} onSaved={vi.fn()} />)
    await ready()
    await replace('Name', 'a')
    await replace('Replicas', '2')
    await replace('Max replicas', '4')
    await userEvent.click(screen.getByLabelText('Static (scaling disabled)'))
    expect(screen.getByText('Static needs max replicas equal to replicas')).toBeTruthy()
    expect(button('Create').disabled).toBe(true)
    await replace('Max replicas', '2')
    expect(screen.queryByText('Static needs max replicas equal to replicas')).toBeNull()
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalled())
    expect(api.createPreset.mock.calls[0][0].spec.static).toBe(true)
  })

  test('init scripts add, edit and remove rows and submit init_scripts', { timeout: 20000 }, async () => {
    api.createPreset.mockResolvedValue(preset())
    wrap(<PresetForm open {...noop} />)
    await ready()
    expect(screen.getByText('Runs once when a session starts, in the shared workdir; agents can read and edit it; edits apply to the next session.')).toBeTruthy()
    await replace('Name', 'a')
    await userEvent.click(button('Add init script'))
    await userEvent.click(button('Add init script'))
    await setEditorText('Init script 1', 'echo one')
    await setEditorText('Init script 2', 'echo two')
    await userEvent.click(button('Remove init script 1'))
    expect(await editorText('Init script 1')).toBe('echo two')
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalledTimes(1))
    expect(api.createPreset.mock.calls[0][0].spec.init_scripts).toEqual(['echo two'])
  })

  test('init scripts sparse: loads stored rows, omits the key when unset, sends [] when all removed', { timeout: 20000 }, async () => {
    api.updatePreset.mockResolvedValue(preset())
    wrap(<PresetForm open preset={preset({ spec: { init_scripts: ['a', 'b'] } })} {...noop} />)
    await ready()
    expect(await editorText('Init script 1')).toBe('a')
    expect(await editorText('Init script 2')).toBe('b')
    await userEvent.click(button('Remove init script 2'))
    await userEvent.click(button('Remove init script 1'))
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalledTimes(1))
    expect(api.updatePreset.mock.calls[0][1].spec).toEqual({ init_scripts: [] })
    cleanup()
    wrap(<PresetForm open preset={preset({ spec: { replicas: 2 } })} {...noop} />)
    await ready()
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalledTimes(2))
    expect(api.updatePreset.mock.calls[1][1].spec).not.toHaveProperty('init_scripts')
  })

  test('init scripts validation names the script and blocks Save', { timeout: 30000 }, async () => {
    wrap(<PresetForm open {...noop} />)
    await ready()
    await replace('Name', 'a')
    await userEvent.click(button('Add init script'))
    expect(screen.getByText('Init script 1 must not be empty')).toBeTruthy()
    expect(button('Create').disabled).toBe(true)
    await setEditorText('Init script 1', 'x'.repeat(16385))
    expect(await screen.findByText('Init script 1 must be at most 16384 characters')).toBeTruthy()
    expect(button('Create').disabled).toBe(true)
    await setEditorText('Init script 1', 'ok')
    await waitFor(() => expect(button('Create').disabled).toBe(false))
    for (let i = 0; i < 20; i++) await userEvent.click(button('Add init script'))
    expect(screen.getByText('Init script 21: at most 20 init scripts')).toBeTruthy()
    expect(button('Create').disabled).toBe(true)
  })
  test('config fields', { timeout: 30000 }, async () => {
    api.createPreset.mockResolvedValue(preset())
    wrap(<PresetForm open {...noop} />)
    await ready()
    await replace('Name', 'cfg')
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalledTimes(1))
    const sparse = api.createPreset.mock.calls[0][0].spec
    for (const k of ['leader_lease_seconds', 'autoclose_after_seconds', 'wrapper']) expect(sparse).not.toHaveProperty(k)
    expect(screen.getByText(/300 s minimum/)).toBeTruthy()
    expect(screen.getByText(/agent's credentials/)).toBeTruthy()

    await replace('Max replicas', '3')
    await replace('Leader lease seconds', '120')
    await replace('Autoclose after seconds', '600')
    await replace('Auto-compact idle seconds', '30')
    await setEditorText('Auto-compact instructions', 'keep it short')
    await replace('Auto-compact min context tokens', '5000')
    await setEditorText('System append', 'be nice')
    await setEditorText('Restart continue prompt', 'go on')
    await replace('Turn stall seconds', '90')
    await replace('Max restarts', '2')
    await replace('Turn max seconds', '600')
    await replace('Permissions allow', 'Bash, Read')
    await replace('Permissions deny', 'WebFetch')
    await userEvent.click(button('Raw JSON'))
    await paste('Hooks JSON', '{"onTurn":[{"type":"command","run":"echo"}]}')
    await paste('MCP servers', '{"s":{"type":"http","url":"http://x"}}')
    await userEvent.click(button('Plugins raw JSON'))
    await paste('Plugins JSON', '{"install":[]}')
    await userEvent.click(screen.getByRole('combobox', { name: 'Agent commands' }))
    await userEvent.click(screen.getByRole('option', { name: 'compact' }))
    await userEvent.click(screen.getByRole('option', { name: 'mcp' }))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalledTimes(2))
    const spec = api.createPreset.mock.calls[1][0].spec
    expect(spec).toMatchObject({ max_replicas: 3, leader_lease_seconds: 120, autoclose_after_seconds: 600 })
    expect(spec.wrapper).toEqual({
      auto_compact: { idle_seconds: 30, instructions: 'keep it short', min_context_tokens: 5000 },
      system_append: 'be nice', restart_continue_prompt: 'go on', turn_stall_seconds: 90, max_restarts: 2, turn_max_seconds: 600,
      agent_commands: ['compact', 'mcp'], permissions: { allow: ['Bash', 'Read'], deny: ['WebFetch'] },
      hooks: { onTurn: [{ type: 'command', run: 'echo' }] }, mcp_servers: { s: { type: 'http', url: 'http://x' } }, plugins: { install: [] },
    })
    cleanup()

    wrap(<PresetForm open preset={preset({ spec: { max_replicas: 3, leader_lease_seconds: 120, autoclose_after_seconds: 600, wrapper: spec.wrapper } as PresetView['spec'] })} {...noop} />)
    await ready()
    expect(field('Leader lease seconds').value).toBe('120')
    expect(field('Autoclose after seconds').value).toBe('600')
    expect(field('Auto-compact min context tokens').value).toBe('5000')
    expect(field('Permissions allow').value).toBe('Bash, Read')
    expect(screen.getByRole('group', { name: 'onTurn' })).toBeTruthy()
    expect(await editorText('Auto-compact instructions')).toBe('keep it short')
    expect(screen.getByRole('combobox', { name: 'Agent commands' }).textContent).toBe('compact, mcp')
    api.updatePreset.mockResolvedValue(preset())
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalledTimes(1))
    expect(api.updatePreset.mock.calls[0][1].spec).toEqual(spec)
  })

  test('plugins editor round trips through the form', { timeout: 30000 }, async () => {
    api.createPreset.mockResolvedValue(preset())
    wrap(<PresetForm open {...noop} />)
    await ready()
    await replace('Name', 'plug')
    await userEvent.click(button('Add marketplace'))
    await replace('Marketplace name 1', 'acme')
    await replace('Marketplace repo 1', 'acme/tools')
    await userEvent.click(button('Add install'))
    await replace('Install plugin 1', 'jira')
    await userEvent.selectOptions(screen.getByLabelText('Install marketplace 1'), 'acme')
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalledTimes(1))
    const spec = api.createPreset.mock.calls[0][0].spec
    expect(spec.wrapper.plugins).toEqual({ marketplaces: [{ name: 'acme', source: 'acme/tools' }], install: [{ plugin: 'jira@acme' }] })
    cleanup()
    wrap(<PresetForm open preset={preset({ spec })} {...noop} />)
    await ready()
    expect((field('Marketplace name 1')).value).toBe('acme')
    expect((field('Install plugin 1')).value).toBe('jira')
  })

  test('unlisted install marketplace blocks save', { timeout: 30000 }, async () => {
    wrap(<PresetForm open preset={preset({ spec: { wrapper: { plugins: { install: [{ plugin: 'p@gone' }] } } } as PresetView['spec'] })} {...noop} />)
    await ready()
    expect(screen.getByText(/marketplace "gone" is not listed/)).toBeTruthy()
    expect(button('Save').disabled).toBe(true)
  })

  test('config validation', { timeout: 30000 }, async () => {
    wrap(<PresetForm open {...noop} />)
    await ready()
    await replace('Name', 'v')
    expect(screen.queryByLabelText('Leader lease seconds')).toBeNull()
    await replace('Max replicas', '2')
    expect(screen.getByLabelText('Leader lease seconds')).toBeTruthy()
    await userEvent.click(button('Plugins raw JSON'))
    for (const label of ['MCP servers', 'Plugins JSON']) {
      await paste(label, '{nope')
      expect(screen.getByText(/valid JSON/)).toBeTruthy()
      expect(button('Create').disabled).toBe(true)
      await replace(label, '[1]')
      expect(screen.getByText(/JSON object/)).toBeTruthy()
      expect(button('Create').disabled).toBe(true)
      await replace(label, '')
      expect(button('Create').disabled).toBe(false)
    }
    expect(api.createPreset).not.toHaveBeenCalled()
  })

  test('start prompt: help text, preview on the web chat surface, sparse save and load', { timeout: 30000 }, async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ rendered: 'hi sample-user', error: null, variables: ['user'] }), { status: 200 }))
    vi.stubGlobal('fetch', f)
    try {
      api.createPreset.mockResolvedValue(preset())
      wrap(<PresetForm open {...noop} />)
      await ready()
      expect(screen.getByText('Sent before the session, webhook, chat or cron prompt, in one message.')).toBeTruthy()
      await replace('Name', 's')
      await setEditorText('Start prompt', 'hi {{ user }}')
      await userEvent.click(within(screen.getByRole('group', { name: 'Start prompt' })).getByRole('button', { name: 'Preview' }))
      await waitFor(() => expect(screen.getByTestId('template-rendered').textContent).toBe('hi sample-user'))
      expect(JSON.parse(f.mock.calls.find((c) => String(c[0]).endsWith('/templates/preview'))?.[1].body)).toEqual({ template: 'hi {{ user }}', surface: 'web_chat_start' })
      await userEvent.click(button('Create'))
      await waitFor(() => expect(api.createPreset).toHaveBeenCalledTimes(1))
      expect(api.createPreset.mock.calls[0][0].spec.start_prompt).toBe('hi {{ user }}')
      cleanup()
      wrap(<PresetForm open preset={preset({ spec: { start_prompt: 'stored' } as PresetView['spec'] })} {...noop} />)
      await ready()
      expect(await editorText('Start prompt')).toBe('stored')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('hooks come from the /meta events and a rule violation blocks Save', { timeout: 30000 }, async () => {
    wrap(<PresetForm open {...noop} />)
    await ready()
    await replace('Name', 'h')
    expect(screen.getByLabelText('Hook event').textContent).toContain('onTurn')
    expect(screen.getByLabelText('Hook event').textContent).toContain('onAgentToolCall')
    await userEvent.click(button('Add hook'))
    expect(screen.getByText('run: required')).toBeTruthy()
    expect(button('Create').disabled).toBe(true)
    await paste('Run', 'echo hi')
    expect(button('Create').disabled).toBe(false)
  })

  test('invalid raw hooks JSON blocks Save and shows the error', { timeout: 30000 }, async () => {
    api.updatePreset.mockResolvedValue(preset())
    wrap(<PresetForm open preset={preset({ spec: { wrapper: { hooks: { onTurn: [{ type: 'command', run: 'echo' }] } } } as PresetView['spec'] })} {...noop} />)
    await ready()
    await userEvent.click(button('Raw JSON'))
    await replace('Hooks JSON', '')
    await paste('Hooks JSON', '{nope')
    expect(screen.getByText(/Invalid JSON/)).toBeTruthy()
    expect(button('Save').disabled).toBe(true)
    await replace('Hooks JSON', '{"onTurn":[{"type":"command","run":"ok"}]}')
    expect(button('Save').disabled).toBe(false)
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalledTimes(1))
    expect(api.updatePreset.mock.calls[0][1].spec.wrapper.hooks).toEqual({ onTurn: [{ type: 'command', run: 'ok' }] })
  })

  test('hooks edit round-trips through the form', { timeout: 30000 }, async () => {
    api.updatePreset.mockResolvedValue(preset())
    const hooks = { onTurn: [{ type: 'command', run: 'echo' }] }
    wrap(<PresetForm open preset={preset({ spec: { wrapper: { hooks } } as PresetView['spec'] })} {...noop} />)
    await ready()
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalledTimes(1))
    expect(api.updatePreset.mock.calls[0][1].spec).toEqual({ wrapper: { hooks } })
  })

  test.each([
    ['Auto-compact instructions', 'preset_text'],
    ['System append', 'preset_text'],
    ['Restart continue prompt', 'preset_text'],
    ['Init script 1', 'init_script'],
  ])('%s previews through the orchestrator with surface %s', { timeout: 30000 }, async (label, surface) => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ rendered: 'RENDERED', error: null, variables: ['session_slug'] }), { status: 200 }))
    vi.stubGlobal('fetch', f)
    try {
      wrap(<PresetForm open {...noop} />)
      await ready()
      if (label.startsWith('Init')) await userEvent.click(button('Add init script'))
      await setEditorText(label, 'echo {{ session_slug }}')
      await userEvent.click(within(screen.getByRole('group', { name: label })).getByRole('button', { name: 'Preview' }))
      await waitFor(() => expect(screen.getByTestId('template-rendered').textContent).toBe('RENDERED'))
      const call = f.mock.calls.find((c) => String(c[0]).endsWith('/templates/preview'))
      expect(call?.[1].method).toBe('POST')
      expect(JSON.parse(call?.[1].body)).toEqual({ template: 'echo {{ session_slug }}', surface })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('reuse running agent row renders off by default with its help text', { timeout: 15000 }, async () => {
    wrap(<PresetForm open {...noop} />)
    await ready()
    expect(field('Reuse running agent').checked).toBe(false)
    expect(screen.getByText('Webhook and schedule events for the same item go to the agent still running for it instead of starting a new one')).toBeTruthy()
  })

  test('reuse running agent switched on saves reuse_running_agent true', { timeout: 15000 }, async () => {
    api.createPreset.mockResolvedValue(preset())
    wrap(<PresetForm open {...noop} />)
    await ready()
    await replace('Name', 'r')
    await userEvent.click(field('Reuse running agent'))
    expect(field('Reuse running agent').checked).toBe(true)
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalled())
    expect(api.createPreset.mock.calls[0][0].spec.reuse_running_agent).toBe(true)
  })

  test('reuse running agent stored on a preset loads on and round-trips', { timeout: 15000 }, async () => {
    api.updatePreset.mockResolvedValue(preset())
    wrap(<PresetForm open preset={preset({ spec: { reuse_running_agent: true } as PresetView['spec'] })} {...noop} />)
    await ready()
    expect(field('Reuse running agent').checked).toBe(true)
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalled())
    expect(api.updatePreset.mock.calls[0][1].spec).toEqual({ reuse_running_agent: true })
  })

  test('reuse running agent untouched keeps the spec sparse', { timeout: 15000 }, async () => {
    api.createPreset.mockResolvedValue(preset())
    wrap(<PresetForm open {...noop} />)
    await ready()
    await replace('Name', 's')
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalled())
    expect(api.createPreset.mock.calls[0][0].spec).not.toHaveProperty('reuse_running_agent')
  })

  test('session options default off and stay sparse', { timeout: 15000 }, async () => {
    api.createPreset.mockResolvedValue(preset())
    wrap(<PresetForm open {...noop} />)
    await ready()
    expect(field('Superleader').checked).toBe(false)
    expect(field('Kubernetes access').checked).toBe(false)
    expect(screen.getByText('superleader: can message the leaders of all sessions')).toBeTruthy()
    expect(screen.getByText('Agents get full read-write access to every namespace and resource')).toBeTruthy()
    await replace('Name', 's')
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalled())
    const spec = api.createPreset.mock.calls[0][0].spec
    expect(spec).not.toHaveProperty('session_messaging')
    expect(spec).not.toHaveProperty('kube_access')
  })

  test('session options save and round-trip', { timeout: 15000 }, async () => {
    api.createPreset.mockResolvedValue(preset())
    wrap(<PresetForm open {...noop} />)
    await ready()
    await replace('Name', 'o')
    await userEvent.click(field('Superleader'))
    await userEvent.click(field('Kubernetes access'))
    expect(field('Superleader').checked).toBe(true)
    expect(field('Kubernetes access').checked).toBe(true)
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalled())
    expect(api.createPreset.mock.calls[0][0]).toEqual({ name: 'o', spec: { session_messaging: true, kube_access: true } })
    cleanup()

    api.updatePreset.mockResolvedValue(preset())
    wrap(<PresetForm open preset={preset({ spec: { session_messaging: true, kube_access: true } as PresetView['spec'] })} {...noop} />)
    await ready()
    expect(field('Superleader').checked).toBe(true)
    expect(field('Kubernetes access').checked).toBe(true)
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalled())
    expect(api.updatePreset.mock.calls[0][1].spec).toEqual({ session_messaging: true, kube_access: true })
    cleanup()

    api.createPreset.mockClear()
    wrap(<PresetForm open {...noop} />)
    await ready()
    await replace('Name', 'p')
    await userEvent.click(field('Superleader'))
    await userEvent.click(field('Superleader'))
    expect(field('Superleader').checked).toBe(false)
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalled())
    expect(api.createPreset.mock.calls[0][0].spec).not.toHaveProperty('session_messaging')
  })

  test('kube access disabled when unavailable', { timeout: 15000 }, async () => {
    api.getMeta.mockResolvedValue(meta({ kube_access: { available: false } }))
    wrap(<PresetForm open {...noop} />)
    await ready()
    await waitFor(() => expect(field('Kubernetes access').disabled).toBe(true))
    expect(screen.getByText('Not configured on this orchestrator')).toBeTruthy()
    expect(screen.queryByText('Agents get full read-write access to every namespace and resource')).toBeNull()
    expect(field('Superleader').disabled).toBe(false)
    cleanup()

    api.updatePreset.mockResolvedValue(preset())
    wrap(<PresetForm open preset={preset({ spec: { kube_access: true } as PresetView['spec'] })} {...noop} />)
    await ready()
    expect(field('Kubernetes access').checked).toBe(true)
    expect(field('Kubernetes access').disabled).toBe(true)
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalled())
    expect(api.updatePreset.mock.calls[0][1].spec).toEqual({ kube_access: true })
    cleanup()

    api.getMeta.mockResolvedValue(meta({ kube_access: { available: true } }))
    wrap(<PresetForm open {...noop} />)
    await ready()
    expect(field('Kubernetes access').disabled).toBe(false)
    expect(screen.queryByText('Not configured on this orchestrator')).toBeNull()
  })

  const previewReply = (rendered: string | null, error: { line: number | null; message: string } | null = null) => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ rendered, error, variables: ['preset_name'] }), { status: 200 }))
    vi.stubGlobal('fetch', f)
    return f
  }
  const previewOf = async (label: string) => {
    await userEvent.click(within(screen.getByRole('group', { name: label })).getByRole('button', { name: 'Preview' }))
  }

  test('saves an empty cache when enabled with derived keys', { timeout: 15000 }, async () => {
    api.createPreset.mockResolvedValue(preset())
    wrap(<PresetForm open {...noop} />)
    await ready()
    expect(screen.getByText('Workspace cache')).toBeTruthy()
    expect(field('Cache the workspace in S3').checked).toBe(false)
    await replace('Name', 'c')
    await userEvent.click(field('Cache the workspace in S3'))
    expect(field('Cache the workspace in S3').checked).toBe(true)
    expect(field('Derive the keys from the preset').checked).toBe(true)
    expect(screen.queryByRole('group', { name: 'Restore key' })).toBeNull()
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalled())
    expect(api.createPreset.mock.calls[0][0]).toEqual({ name: 'c', spec: { cache: {} } })
  })

  test('two key editors on the archive_name surface, both keys saved and no old key', { timeout: 30000 }, async () => {
    const f = previewReply('team/fast/')
    try {
      api.createPreset.mockResolvedValue(preset())
      wrap(<PresetForm open {...noop} />)
      await ready()
      await replace('Name', 'c')
      await userEvent.click(field('Cache the workspace in S3'))
      await userEvent.click(field('Derive the keys from the preset'))
      await setEditorText('Restore key', 'team/{{ preset_name }}/')
      await setEditorText('Save key', 'team/{{ preset_name }}/{{ now }}')
      await userEvent.click(within(screen.getByRole('group', { name: 'Restore key' })).getByRole('button', { name: 'Preview' }))
      await waitFor(() => expect(within(screen.getByRole('group', { name: 'Restore key' })).getByTestId('template-rendered').textContent).toBe('team/fast/'))
      expect(JSON.parse(f.mock.calls.find((c) => String(c[0]).endsWith('/templates/preview'))?.[1].body)).toEqual({ template: 'team/{{ preset_name }}/', surface: 'archive_name' })
      expect(screen.getByText('Restores the newest archive under this prefix')).toBeTruthy()
      await paste('Exclude (one glob per line)', 'node_modules/**\n\n  dist/*  \n')
      await userEvent.click(button('Create'))
      await waitFor(() => expect(api.createPreset).toHaveBeenCalled())
      const cache = api.createPreset.mock.calls[0][0].spec.cache
      expect(cache).toEqual({ restore_key: 'team/{{ preset_name }}/', save_key: 'team/{{ preset_name }}/{{ now }}', exclude: ['node_modules/**', 'dist/*'] })
      expect(cache).not.toHaveProperty('key')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('an empty save key says restore only, an empty restore key says fresh start', { timeout: 30000 }, async () => {
    wrap(<PresetForm open {...noop} />)
    await ready()
    await userEvent.click(field('Cache the workspace in S3'))
    await userEvent.click(field('Derive the keys from the preset'))
    expect(screen.getByText('Empty: restore only, nothing is saved')).toBeTruthy()
    expect(screen.getByText('Empty: fresh start, nothing is restored')).toBeTruthy()
    await setEditorText('Save key', 'out')
    await waitFor(() => expect(screen.queryByText('Empty: restore only, nothing is saved')).toBeNull())
  })

  test('an invalid key template shows the preview error line', { timeout: 30000 }, async () => {
    previewReply(null, { line: 1, message: 'unexpected end of template' })
    try {
      wrap(<PresetForm open {...noop} />)
      await ready()
      await userEvent.click(field('Cache the workspace in S3'))
      await userEvent.click(field('Derive the keys from the preset'))
      await setEditorText('Save key', '{{ now')
      await previewOf('Save key')
      await waitFor(() => expect(within(screen.getByRole('group', { name: 'Save key' })).getByText(/unexpected end of template/)).toBeTruthy())
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('rejects a key longer than 256 characters and keeps excludes validated', { timeout: 30000 }, async () => {
    wrap(<PresetForm open {...noop} />)
    await ready()
    await replace('Name', 'c')
    await userEvent.click(field('Cache the workspace in S3'))
    await userEvent.click(field('Derive the keys from the preset'))
    await setEditorText('Restore key', 'x'.repeat(257))
    await waitFor(() => expect(screen.getByText('Restore key: at most 256 characters')).toBeTruthy())
    expect(button('Create').disabled).toBe(true)
    await setEditorText('Restore key', 'ok')
    await waitFor(() => expect(button('Create').disabled).toBe(false))
    const cases: [string, string][] = [
      ['/abs', "Exclude line 1: must be relative with no '..' segment"],
      ['a/../b', "Exclude line 1: must be relative with no '..' segment"],
      ['ok\n..', "Exclude line 2: must be relative with no '..' segment"],
      ['y'.repeat(257), 'Exclude line 1: at most 256 characters'],
      [Array.from({ length: 51 }, (_, i) => `g${i}`).join('\n'), 'Exclude: at most 50 globs'],
    ]
    for (const [text, message] of cases) {
      await replace('Exclude (one glob per line)', text)
      expect(screen.getByText(message)).toBeTruthy()
      expect(button('Create').disabled).toBe(true)
    }
    await replace('Exclude (one glob per line)', 'fine/**')
    expect(button('Create').disabled).toBe(false)
    await userEvent.click(field('Cache the workspace in S3'))
    expect(button('Create').disabled).toBe(false)
    expect(api.createPreset).not.toHaveBeenCalled()
  })

  test('shows the server message when a save is refused', { timeout: 15000 }, async () => {
    const message = 'cache.restore_key prefix preset- is reserved for preset-derived keys'
    api.updatePreset.mockRejectedValueOnce(new ApiError(422, 'invalid', message))
    wrap(<PresetForm open preset={preset({ spec: { cache: { restore_key: 'preset-0123456789abcdef', save_key: 'preset-0123456789abcdef', exclude: [] } } as PresetView['spec'] })} {...noop} />)
    await ready()
    expect(button('Save').disabled).toBe(false)
    await userEvent.click(button('Save'))
    expect((await screen.findByRole('alert')).textContent).toBe(message)
  })

  test('disables the cache section when the orchestrator has no cache', { timeout: 15000 }, async () => {
    api.getMeta.mockResolvedValue(meta({ cache: { available: false, max_bytes: 0 } }))
    wrap(<PresetForm open {...noop} />)
    await ready()
    expect(screen.getByText('Workspace cache is not configured on the orchestrator')).toBeTruthy()
    expect(field('Cache the workspace in S3').disabled).toBe(true)
    expect(field('Derive the keys from the preset').disabled).toBe(true)
    expect(field('Exclude (one glob per line)').disabled).toBe(true)
    cleanup()
    api.getMeta.mockResolvedValue(meta())
    wrap(<PresetForm open {...noop} />)
    await ready()
    expect(screen.queryByText('Workspace cache is not configured on the orchestrator')).toBeNull()
    expect(field('Cache the workspace in S3').disabled).toBe(false)
  })

  test('loads a stored cache', { timeout: 15000 }, async () => {
    const stored = { cache: { restore_key: 'team-a/', save_key: '', exclude: ['node_modules/**', '*.log'] } }
    api.updatePreset.mockResolvedValue(preset())
    wrap(<PresetForm open preset={preset({ spec: stored as PresetView['spec'] })} {...noop} />)
    await ready()
    expect(field('Cache the workspace in S3').checked).toBe(true)
    expect(field('Derive the keys from the preset').checked).toBe(false)
    expect(await editorText('Restore key')).toBe('team-a/')
    expect(await editorText('Save key')).toBe('')
    expect(screen.getByText('Empty: restore only, nothing is saved')).toBeTruthy()
    expect(field('Exclude (one glob per line)').value).toBe('node_modules/**\n*.log')
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalled())
    expect(api.updatePreset.mock.calls[0][1].spec).toEqual(stored)
    cleanup()
    api.updatePreset.mockClear()
    wrap(<PresetForm open preset={preset({ spec: { cache: { exclude: [] } } as PresetView['spec'] })} {...noop} />)
    await ready()
    expect(field('Cache the workspace in S3').checked).toBe(true)
    expect(field('Derive the keys from the preset').checked).toBe(true)
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalled())
    expect(api.updatePreset.mock.calls[0][1].spec).toEqual({ cache: {} })
  })

  test('keeps presets without a cache sparse', { timeout: 15000 }, async () => {
    api.createPreset.mockResolvedValue(preset())
    api.updatePreset.mockResolvedValue(preset())
    wrap(<PresetForm open {...noop} />)
    await ready()
    await replace('Name', 's')
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalled())
    expect(api.createPreset.mock.calls[0][0].spec).not.toHaveProperty('cache')
    cleanup()
    wrap(<PresetForm open preset={preset({ spec: { replicas: 2, cache: { restore_key: 'team-a', save_key: 'team-a', exclude: [] } } as PresetView['spec'] })} {...noop} />)
    await ready()
    await userEvent.click(field('Cache the workspace in S3'))
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalled())
    expect(api.updatePreset.mock.calls[0][1].spec).toEqual({ replicas: 2 })
  })

  test('a copy drops preset-derived cache keys', { timeout: 15000 }, async () => {
    api.createPreset.mockResolvedValue(preset())
    wrap(<PresetForm open copyOf={preset({ spec: { cache: { restore_key: 'preset-0123456789abcdef', save_key: 'preset-0123456789abcdef', exclude: ['a'] } } as PresetView['spec'] })} {...noop} />)
    await ready()
    expect(field('Cache the workspace in S3').checked).toBe(true)
    expect(field('Derive the keys from the preset').checked).toBe(true)
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalled())
    expect(api.createPreset.mock.calls[0][0].spec).toEqual({ cache: { exclude: ['a'] } })
  })

  describe('any-mcp plugins', () => {
    const GITHUB = 'github.com/acme/tools//plugins/jira?ref=v1.2'
    const GITLAB = 'git::https://gitlab.example.com/team/plugins.git?ref=main'
    const rows = () => screen.queryAllByLabelText(/^any-mcp plugin \d+$/) as HTMLInputElement[]

    test('any-mcp plugins sparse by default', { timeout: 15000 }, async () => {
      api.createPreset.mockResolvedValue(preset())
      wrap(<PresetForm open {...noop} />)
      await ready()
      expect(rows()).toHaveLength(0)
      expect(button('Add any-mcp plugin')).toBeTruthy()
      await replace('Name', 'plain')
      await userEvent.click(button('Create'))
      await waitFor(() => expect(api.createPreset).toHaveBeenCalled())
      expect(api.createPreset.mock.calls[0][0].spec).not.toHaveProperty('any_mcp_sources')
    })

    test('any-mcp plugins add rows and save', { timeout: 20000 }, async () => {
      api.createPreset.mockResolvedValue(preset())
      wrap(<PresetForm open {...noop} />)
      await ready()
      await replace('Name', 'with plugins')
      await userEvent.click(button('Add any-mcp plugin'))
      expect(rows()).toHaveLength(1)
      await userEvent.click(button('Add any-mcp plugin'))
      expect(rows()).toHaveLength(2)
      for (const input of rows()) expect(input.tagName).toBe('INPUT')
      await paste('any-mcp plugin 1', `  ${GITHUB} `)
      await paste('any-mcp plugin 2', GITLAB)
      await userEvent.click(button('Create'))
      await waitFor(() => expect(api.createPreset).toHaveBeenCalled())
      expect(api.createPreset.mock.calls[0][0].spec.any_mcp_sources).toEqual([GITHUB, GITLAB])
    })

    test('any-mcp plugins remove rows', { timeout: 20000 }, async () => {
      api.updatePreset.mockResolvedValue(preset())
      const third = 'github.com/acme/other'
      wrap(<PresetForm open preset={preset({ spec: { replicas: 2, any_mcp_sources: [GITHUB, GITLAB, third] } as PresetView['spec'] })} {...noop} />)
      await ready()
      await userEvent.click(button('Remove any-mcp plugin 2'))
      expect(rows().map((r) => r.value)).toEqual([GITHUB, third])
      await userEvent.click(button('Remove any-mcp plugin 2'))
      await userEvent.click(button('Remove any-mcp plugin 1'))
      expect(rows()).toHaveLength(0)
      await userEvent.click(button('Save'))
      await waitFor(() => expect(api.updatePreset).toHaveBeenCalled())
      expect(api.updatePreset.mock.calls[0][1].spec).toEqual({ replicas: 2 })
    })

    test('any-mcp plugins validate and load', { timeout: 20000 }, async () => {
      api.updatePreset.mockResolvedValue(preset())
      wrap(<PresetForm open preset={preset({ spec: { any_mcp_sources: [GITHUB, GITLAB] } as PresetView['spec'] })} {...noop} />)
      await ready()
      expect(rows().map((r) => r.value)).toEqual([GITHUB, GITLAB])
      await userEvent.click(button('Add any-mcp plugin'))
      expect(screen.getByText('plugin source is empty')).toBeTruthy()
      expect(button('Save').disabled).toBe(true)
      await paste('any-mcp plugin 3', './local/plugin')
      expect(screen.getByText(/^plugin source '\.\/local\/plugin': only https git sources are allowed/)).toBeTruthy()
      expect(field('any-mcp plugin 3').getAttribute('aria-invalid')).toBe('true')
      expect(field('any-mcp plugin 1').getAttribute('aria-invalid')).toBe('false')
      expect(button('Save').disabled).toBe(true)
      await replace('any-mcp plugin 3', 'github.com/acme/third')
      expect(button('Save').disabled).toBe(false)
      await userEvent.click(button('Save'))
      await waitFor(() => expect(api.updatePreset).toHaveBeenCalled())
      expect(api.updatePreset.mock.calls[0][1].spec).toEqual({ any_mcp_sources: [GITHUB, GITLAB, 'github.com/acme/third'] })
    })
  })
})
