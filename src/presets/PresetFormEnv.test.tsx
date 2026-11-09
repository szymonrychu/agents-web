// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Meta, PresetView } from '../api/client'
import { editorView, stubRangeRects } from '../editor/testEditor'
import { theme } from '../theme'
import { ApiError } from '../api/client'
import { PresetForm } from './PresetForm'
import { HOOK_EVENTS_FIXTURE } from '../hooks/testEvents'

const api = vi.hoisted(() => ({ createPreset: vi.fn(), updatePreset: vi.fn(), getMeta: vi.fn() }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...api }))
const vault = vi.hoisted(() => ({ vaultEnabled: vi.fn(), listEntries: vi.fn() }))
vi.mock('../vault/api', async (orig) => ({ ...(await orig<typeof import('../vault/api')>()), ...vault }))
const ctx = vi.hoisted(() => ({ project: null as string | null, projects: [{ slug: 'alpha', name: 'Alpha' }, { slug: 'beta', name: 'Beta' }] }))
vi.mock('../projects/ProjectContext', () => ({ useProject: () => ({ ...ctx, setProject: () => {} }) }))

const meta = (): Meta => ({
  agent_image: 'img', agent_images: ['img'], cache: { available: true, max_bytes: 5368709120 }, kube_cluster_access: { available: true }, kube_namespace_access: { available: true, namespaces: ['media', 'e2e-target'], tiers: ['read', 'port-forward', 'exec', 'edit', 'admin'] }, docker: { available: false, max_cpu: '8', max_memory: '16Gi', max_storage: '100Gi', storage: '30Gi' }, permission_modes: [{ value: 'bypassPermissions', label: 'Allow all' }, { value: 'auto', label: 'Auto' }], caps: { max_sessions: 8, max_pvc_size: '100Gi', max_replicas: 16 },
  defaults: {
    any_mcp_config: { plugins: ['x'] }, auto_compact_pct: 80, discard_hook: 'none', effort: 'high', max_attempts: 5, model: 'opus', pvc_size: '10Gi', replicas: 1,
    resources: { limits: { cpu: '4', memory: '8Gi' }, requests: { cpu: '500m', memory: '1Gi' } }, storage_class: 'rook-ceph-rwx', workdir: 'workdir',
  },
  discard_hook: 'none', hook_events: HOOK_EVENTS_FIXTURE, usage: { configured: false, quota_default_pct: 100 }, inactivity: { reminder_seconds: 0, close_seconds: 0, handoff_seconds: 300 }, models: ['opus'], efforts: ['high'],
})
const preset = (spec: Record<string, unknown> = {}, project = 'default'): PresetView =>
  ({ created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', id: 'p-1', name: 'fast', is_default: false, project, spec }) as PresetView

const wrap = (el: React.ReactElement) => render(<ThemeProvider theme={theme}>{el}</ThemeProvider>)
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const toggle = (label: string) => screen.getByRole('switch', { name: label }) as HTMLInputElement
const noop = { onClose: vi.fn(), onSaved: vi.fn() }


beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset())
  Object.values(vault).forEach((f) => f.mockReset())
  vault.vaultEnabled.mockReturnValue(false)
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
    expect(screen.getByTestId('vault-ref-0')).toBeTruthy()
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

const ENTRY = {
  id: GREF.vault, name: 'GitHub', labels: ['github', 'project:alpha'], description: '',
  envs: [{ env: 'GITHUB_TOKEN', protected: true, value: null }, { env: 'GITHUB_USER', protected: false, value: 'bot' }],
}
const HREF = { vault: GREF.vault, env: 'GITHUB_USER' }
const vaultOn = (entries: unknown[] = [ENTRY]) => {
  vault.vaultEnabled.mockReturnValue(true)
  vault.listEntries.mockResolvedValue(entries)
}

describe('vault ref rows', () => {
  test('test_stored_ref_shown_by_name', async () => {
    vaultOn()
    wrap(<PresetForm open preset={preset({ env: { G: GREF } })} {...noop} />)
    await ready()
    await waitFor(() => expect(screen.getByTestId('vault-ref-0').textContent).toContain('GitHub / GITHUB_TOKEN'))
    expect(screen.getByText('protected')).toBeTruthy()
  })

  test('test_ref_env_switch', async () => {
    vaultOn()
    api.updatePreset.mockResolvedValue(preset())
    wrap(<PresetForm open preset={preset({ env: { G: GREF } })} {...noop} />)
    await ready()
    await waitFor(() => expect(screen.getByTestId('vault-ref-0').textContent).toContain('GitHub'))
    await userEvent.click(screen.getByRole('combobox', { name: 'Entry env 1' }))
    await userEvent.click(screen.getByRole('option', { name: 'GITHUB_USER' }))
    expect(screen.getByText('bot')).toBeTruthy()
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalled())
    expect(api.updatePreset.mock.calls[0][1].spec.env).toEqual({ G: HREF })
  })

  test('test_ref_rename_preset_env', async () => {
    vaultOn()
    api.updatePreset.mockResolvedValue(preset())
    wrap(<PresetForm open preset={preset({ env: { G: GREF } })} {...noop} />)
    await ready()
    await userEvent.clear(field('Env key 1'))
    await type('Env key 1', 'GH_TOKEN')
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalled())
    expect(api.updatePreset.mock.calls[0][1].spec.env).toEqual({ GH_TOKEN: GREF })
  })

  test('test_project_change_warns_stored_ref', async () => {
    vaultOn()
    wrap(<PresetForm open preset={preset({ env: { G: GREF } }, 'alpha')} {...noop} />)
    await ready()
    await waitFor(() => expect(screen.getByTestId('vault-ref-0').textContent).toContain('GitHub'))
    expect(screen.queryByText(/Only for/)).toBeNull()
    await userEvent.click(screen.getByRole('combobox', { name: 'Project' }))
    await userEvent.click(screen.getByRole('option', { name: 'Beta' }))
    expect(screen.getByText('Only for project:alpha')).toBeTruthy()
  })

  test('test_tag_label_never_warns', async () => {
    vaultOn([{ ...ENTRY, labels: ['github'] }])
    wrap(<PresetForm open preset={preset({ env: { G: GREF } }, 'alpha')} {...noop} />)
    await ready()
    await waitFor(() => expect(screen.getByTestId('vault-ref-0').textContent).toContain('GitHub'))
    await userEvent.click(screen.getByRole('combobox', { name: 'Project' }))
    await userEvent.click(screen.getByRole('option', { name: 'Beta' }))
    expect(screen.queryByText(/Only for/)).toBeNull()
  })

  test('test_label_mismatch_422_on_row', async () => {
    vaultOn()
    api.updatePreset.mockRejectedValue(new ApiError(422, 'vault_label_mismatch', 'm', { envs: ['G'] }))
    wrap(<PresetForm open preset={preset({ env: { G: GREF } }, 'alpha')} {...noop} />)
    await ready()
    await userEvent.click(button('Save'))
    await waitFor(() => expect(screen.getByText("The entry's project label does not allow this preset's project")).toBeTruthy())
    expect(screen.getByText('m')).toBeTruthy()
    expect(field('Env key 1').value).toBe('G')
  })

  test('test_vault_unavailable_marks_all_ref_rows', async () => {
    vaultOn()
    api.updatePreset.mockRejectedValue(new ApiError(503, 'vault_unavailable', 'vault down'))
    wrap(<PresetForm open preset={preset({ env: { G: GREF, H: HREF, P: { value: 'p', expand: false } } }, 'alpha')} {...noop} />)
    await ready()
    await userEvent.click(button('Save'))
    const m = 'The vault is unavailable; nothing was saved, try again'
    await waitFor(() => expect(screen.getAllByText(m)).toHaveLength(2))
    expect(field('Env key 1').value).toBe('G')
    expect(field('Env key 2').value).toBe('H')
    expect(field('Env value 3').value).toBe('p')
    expect(screen.getByText('vault down')).toBeTruthy()
  })

  test('test_unknown_entry_ref_kept_on_save', async () => {
    const unknown = { vault: 'u-9', env: 'X' }
    vaultOn()
    api.updatePreset.mockResolvedValue(preset())
    wrap(<PresetForm open preset={preset({ env: { G: unknown } })} {...noop} />)
    await ready()
    await waitFor(() => expect(screen.getByText('Entry not found in the vault')).toBeTruthy())
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalled())
    expect(api.updatePreset.mock.calls[0][1].spec.env).toEqual({ G: unknown })
  })

  test('test_vault_off_shows_short_id', async () => {
    wrap(<PresetForm open preset={preset({ env: { G: { vault: 'u-1', env: 'GITHUB_TOKEN' } } })} {...noop} />)
    await ready()
    expect(screen.getByTestId('vault-ref-0').textContent).toBe('vault u-1 / GITHUB_TOKEN')
    expect(vault.listEntries).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'From vault' })).toBeNull()
  })

  test('test_copy_keeps_refs_and_says_so', async () => {
    vaultOn()
    api.createPreset.mockResolvedValue(preset())
    wrap(<PresetForm open copyOf={preset({ env: { G: GREF } })} {...noop} />)
    await ready()
    expect(screen.getByText("Vault references are copied; each entry must allow the copy's project.")).toBeTruthy()
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalled())
    expect(api.createPreset.mock.calls[0][0].spec.env).toEqual({ G: GREF })
  })
  const pick = async (envName: string, as: string) => {
    await userEvent.click(button('From vault'))
    await userEvent.click(await screen.findByRole('button', { name: 'Entry GitHub' }))
    await userEvent.click(screen.getByLabelText(`Use ${envName}`))
    const f = screen.getByLabelText(`Preset env for ${envName}`)
    await userEvent.clear(f)
    await userEvent.type(f, as)
  }

  test('test_same_entry_env_two_names', async () => {
    vaultOn([{ ...ENTRY, labels: ['github'] }])
    api.createPreset.mockResolvedValue(preset())
    wrap(<PresetForm open {...noop} />)
    await ready()
    await type('Name', 'n')
    await pick('GITHUB_TOKEN', 'A')
    await userEvent.click(button('Add'))
    await pick('GITHUB_TOKEN', 'B')
    await userEvent.click(button('Add'))
    await userEvent.click(button('Create'))
    await waitFor(() => expect(api.createPreset).toHaveBeenCalled())
    expect(api.createPreset.mock.calls[0][0].spec.env).toEqual({ A: GREF, B: GREF })
  })

  test('test_pick_replaces_existing_key', async () => {
    vaultOn([{ ...ENTRY, labels: ['github'] }])
    api.updatePreset.mockResolvedValue(preset())
    wrap(<PresetForm open preset={preset({ env: { X: { value: '1', expand: false }, GITHUB_TOKEN: { value: 'p', expand: false } } })} {...noop} />)
    await ready()
    await waitFor(() => expect(vault.listEntries).toHaveBeenCalled())
    await pick('GITHUB_TOKEN', 'GITHUB_TOKEN')
    expect(screen.getByText('Replaces the existing variable')).toBeTruthy()
    await userEvent.click(button('Add'))
    await userEvent.click(button('Save'))
    await waitFor(() => expect(api.updatePreset).toHaveBeenCalled())
    const env = api.updatePreset.mock.calls[0][1].spec.env
    expect(Object.keys(env)).toEqual(['X', 'GITHUB_TOKEN'])
    expect(env.GITHUB_TOKEN).toEqual(GREF)
  })

  test('test_from_vault_hidden_when_off', async () => {
    wrap(<PresetForm open {...noop} />)
    await ready()
    expect(screen.queryByRole('button', { name: 'From vault' })).toBeNull()
  })
  describe('re-attach names', () => {
    const withReattach = (names: string[]): PresetView => ({ ...preset({ env: { A: { value: '1', expand: false } } }), vault_reattach: names })

    test('test_reattach_names_shown', async () => {
      wrap(<PresetForm open preset={withReattach(['GH', 'HF'])} {...noop} />)
      await ready()
      expect(screen.getByTestId('reattach').textContent).toContain('To re-attach from the vault: GH, HF')
    })

    test('test_reattach_shrinks_when_row_added', async () => {
      wrap(<PresetForm open preset={withReattach(['GH', 'HF'])} {...noop} />)
      await ready()
      await userEvent.click(button('Add env'))
      await type('Env key 2', 'HF')
      expect(screen.getByTestId('reattach').textContent).toContain('To re-attach from the vault: GH')
      expect(screen.getByTestId('reattach').textContent).not.toContain('HF')
    })

    test('test_reattach_absent_on_copy', async () => {
      wrap(<PresetForm open copyOf={withReattach(['GH', 'HF'])} {...noop} />)
      await ready()
      expect(screen.queryByTestId('reattach')).toBeNull()
    })

    test('absent when nothing to re-attach', async () => {
      wrap(<PresetForm open preset={withReattach([])} {...noop} />)
      await ready()
      expect(screen.queryByTestId('reattach')).toBeNull()
    })
  })
})
