// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import { vaultRow } from '../sessions/sessionSpecForm'
import type { EntryView } from '../vault/api'
import { VaultPicker } from './VaultPicker'

const entry = (over: Partial<EntryView>): EntryView =>
  ({ id: 'u-1', name: 'GitHub', description: 'bot account', labels: ['github'], version: 1, attachments_count: 0, behind_count: 0, pinned_sessions_count: 0, created_at: '', updated_at: '',
    envs: [{ env: 'GITHUB_TOKEN', protected: true, value: null, updated_at: '' }, { env: 'GITHUB_USER', protected: false, value: 'bot', updated_at: '' }], ...over }) as EntryView
const GRAFANA = entry({ id: 'u-2', name: 'Grafana', description: 'dashboards', labels: ['obs'], envs: [{ env: 'GRAFANA_URL', protected: false, value: 'http://g', updated_at: '' }] })

const open = (over: Partial<Parameters<typeof VaultPicker>[0]> = {}) => {
  const onAdd = vi.fn()
  const onClose = vi.fn()
  render(
    <ThemeProvider theme={theme}>
      <VaultPicker entries={[entry({}), GRAFANA]} status="ready" error={null} target={['project:alpha']} existingKeys={[]} onAdd={onAdd} onClose={onClose} {...over} />
    </ThemeProvider>,
  )
  return { onAdd, onClose }
}
const btn = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
afterEach(cleanup)

describe('VaultPicker', () => {
  test('test_loading_state', () => {
    open({ entries: [], status: 'loading' })
    expect(screen.getByText('Loading vault entries...')).toBeTruthy()
    expect(screen.queryByLabelText('Search entries')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Entry / })).toBeNull()
  })

  test('test_lists_entries_with_values', async () => {
    open()
    expect(screen.getByText('GitHub')).toBeTruthy()
    expect(screen.getByText('bot account')).toBeTruthy()
    expect(screen.getByText('github')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Entry GitHub' }))
    expect(screen.getByText('bot')).toBeTruthy()
    expect(screen.getByText('protected')).toBeTruthy()
  })

  test('test_search_filters', async () => {
    open()
    await userEvent.type(screen.getByLabelText('Search entries'), 'grafana')
    expect(screen.queryByRole('button', { name: 'Entry GitHub' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Entry Grafana' })).toBeTruthy()
    await userEvent.clear(screen.getByLabelText('Search entries'))
    await userEvent.type(screen.getByLabelText('Search entries'), 'GRAFANA_URL')
    expect(screen.getByRole('button', { name: 'Entry Grafana' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Entry GitHub' })).toBeNull()
  })

  test('test_only_project_label_disables', () => {
    open({ entries: [entry({ labels: ['project:beta'] }), entry({ id: 'u-3', name: 'Admin', labels: ['admin'] })] })
    expect(screen.getByRole('button', { name: 'Entry GitHub' }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('Only for project:beta')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Entry Admin' }).getAttribute('aria-disabled')).toBeNull()
  })

  test('test_remap_entry_env', async () => {
    const { onAdd } = open()
    await userEvent.click(screen.getByRole('button', { name: 'Entry GitHub' }))
    expect(btn('Add').disabled).toBe(true)
    await userEvent.click(screen.getByLabelText('Use GITHUB_TOKEN'))
    const f = screen.getByLabelText('Preset env for GITHUB_TOKEN')
    await userEvent.clear(f)
    await userEvent.type(f, 'BOT_TOKEN')
    await userEvent.click(btn('Add'))
    expect(onAdd).toHaveBeenCalledWith([vaultRow('BOT_TOKEN', { vault: 'u-1', env: 'GITHUB_TOKEN' })])
  })

  test('test_duplicate_names_block_add', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: 'Entry GitHub' }))
    await userEvent.click(screen.getByLabelText('Use GITHUB_TOKEN'))
    await userEvent.click(screen.getByLabelText('Use GITHUB_USER'))
    for (const env of ['GITHUB_TOKEN', 'GITHUB_USER']) {
      const f = screen.getByLabelText(`Preset env for ${env}`)
      await userEvent.clear(f)
      await userEvent.type(f, 'X')
    }
    expect(screen.getAllByText('Duplicate key')).toHaveLength(2)
    expect(btn('Add').disabled).toBe(true)
  })

  test('existing key shows replace helper; Back returns to the list', async () => {
    open({ existingKeys: ['GITHUB_USER'] })
    await userEvent.click(screen.getByRole('button', { name: 'Entry GitHub' }))
    await userEvent.click(screen.getByLabelText('Use GITHUB_USER'))
    expect(screen.getByText('Replaces the existing variable')).toBeTruthy()
    await userEvent.click(btn('Back'))
    expect(screen.getByLabelText('Search entries')).toBeTruthy()
  })

  test('loading and error states', () => {
    open({ status: 'error', error: 'boom' })
    expect(screen.getByText('boom')).toBeTruthy()
  })
})
