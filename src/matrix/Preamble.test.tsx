// @vitest-environment jsdom
import { EditorView } from '@codemirror/view'
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import type { MatrixMeta } from './api'
import { PreamblePanel } from './PreamblePanel'
import { RulesPanel } from './RulesPanel'

const api = vi.hoisted(() => ({ getSettings: vi.fn(), setSettings: vi.fn(), previewTemplate: vi.fn(), listRules: vi.fn(), addRule: vi.fn(), deleteRule: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))

const rangeOriginal = { rects: Range.prototype.getClientRects, box: Range.prototype.getBoundingClientRect }
beforeAll(() => {
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
})
afterAll(() => {
  Range.prototype.getClientRects = rangeOriginal.rects
  Range.prototype.getBoundingClientRect = rangeOriginal.box
})

const meta: MatrixMeta = {
  user_id: '@bot:hs', sync: { healthy: true, last_sync_at: null }, default_policy: 'deny', group_trigger: 'mention', homeserver_url: 'h',
  rule_kinds: { allow: ['facebook', 'user'], deny: ['room'] },
}
const DEFAULT = 'Default preamble text'

const editor = async () =>
  waitFor(() => {
    const v = EditorView.findFromDOM(screen.getByTestId('file-editor'))
    if (!v) throw new Error('editor not ready')
    return v
  })
const setText = async (text: string) => {
  const view = await editor()
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
}
const wrap = (el: React.ReactNode) => render(<ThemeProvider theme={theme}>{el}</ThemeProvider>)

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset())
  api.getSettings.mockResolvedValue({ default_preset_id: 'p1', preamble: null, default_preamble: DEFAULT })
  api.setSettings.mockResolvedValue({ default_preset_id: 'p1', preamble: 'Custom {{ sender }}', default_preamble: DEFAULT })
  api.previewTemplate.mockResolvedValue({ rendered: 'Custom alice', error: null, variables: ['sender'] })
  api.listRules.mockResolvedValue({ allow: [{ id: 1, list: 'allow', kind: 'user', value: '@a:hs', note: 'friend', preamble: 'Hi', created_at: '2026-10-25T10:00:00Z' }], deny: [] })
  api.addRule.mockResolvedValue({})
})
afterEach(cleanup)

describe('global preamble', () => {
  test('shows the built-in default when none is stored', async () => {
    wrap(<PreamblePanel />)
    expect((await editor()).state.doc.toString()).toBe(DEFAULT)
    expect((screen.getByRole('button', { name: 'Reset to default' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('saves an edit with explicit preamble field', async () => {
    const u = userEvent.setup()
    wrap(<PreamblePanel />)
    await setText('Custom {{ sender }}')
    await u.click(screen.getByRole('button', { name: 'Save preamble' }))
    expect(api.setSettings).toHaveBeenCalledWith({ preamble: 'Custom {{ sender }}' })
    await waitFor(() => expect(screen.getByText('Saved.')).toBeTruthy())
  })

  test('previews through the connector with the connector preview label', async () => {
    const u = userEvent.setup()
    wrap(<PreamblePanel />)
    await setText('Custom {{ sender }}')
    await u.click(screen.getByRole('button', { name: 'Preview preamble' }))
    await waitFor(() => expect(screen.getByTestId('template-rendered').textContent).toBe('Custom alice'))
    expect(api.previewTemplate).toHaveBeenCalledWith('Custom {{ sender }}', undefined)
  })

  test('reset to default sends preamble null and shows the default again', async () => {
    const u = userEvent.setup()
    api.getSettings.mockResolvedValue({ default_preset_id: 'p1', preamble: 'Mine', default_preamble: DEFAULT })
    api.setSettings.mockResolvedValue({ default_preset_id: 'p1', preamble: null, default_preamble: DEFAULT })
    wrap(<PreamblePanel />)
    expect((await waitFor(editor)).state.doc.toString()).toBe('Mine')
    await u.click(screen.getByRole('button', { name: 'Reset to default' }))
    expect(api.setSettings).toHaveBeenCalledWith({ preamble: null })
    await waitFor(async () => expect((await editor()).state.doc.toString()).toBe(DEFAULT))
  })

  test('saving the text equal to the default stores null', async () => {
    const u = userEvent.setup()
    wrap(<PreamblePanel />)
    await setText('x')
    await setText(DEFAULT)
    await u.click(screen.getByRole('button', { name: 'Save preamble' }))
    expect(api.setSettings).toHaveBeenCalledWith({ preamble: null })
  })
})

describe('rule preamble override', () => {
  test('adds a rule with an override and previews with the note as rule_name', async () => {
    const u = userEvent.setup()
    wrap(<RulesPanel meta={meta} />)
    await waitFor(() => expect(screen.getByText('@a:hs')).toBeTruthy())
    await u.click(screen.getByRole('combobox', { name: 'Kind' }))
    await u.click(screen.getByRole('option', { name: 'user' }))
    await u.type(screen.getByRole('textbox', { name: 'Value' }), '@c:hs')
    await u.type(screen.getByRole('textbox', { name: 'Note' }), 'vip')
    await setText('Hello {{ rule_name }}')
    await u.click(screen.getByRole('button', { name: 'Preview override' }))
    await waitFor(() => expect(api.previewTemplate).toHaveBeenCalledWith('Hello {{ rule_name }}', { rule_name: 'vip' }))
    await u.click(screen.getByRole('button', { name: 'Add rule' }))
    expect(api.addRule).toHaveBeenCalledWith({ list: 'allow', kind: 'user', value: '@c:hs', note: 'vip', preamble: 'Hello {{ rule_name }}' })
  })

  test('an empty note previews with an empty rule_name and an empty override is not sent', async () => {
    const u = userEvent.setup()
    wrap(<RulesPanel meta={meta} />)
    await waitFor(() => expect(screen.getByText('@a:hs')).toBeTruthy())
    await u.click(screen.getByRole('combobox', { name: 'Kind' }))
    await u.click(screen.getByRole('option', { name: 'user' }))
    await u.type(screen.getByRole('textbox', { name: 'Value' }), '@c:hs')
    await setText('{{ rule_name }}')
    await u.click(screen.getByRole('button', { name: 'Preview override' }))
    await waitFor(() => expect(api.previewTemplate).toHaveBeenCalledWith('{{ rule_name }}', { rule_name: '' }))
    await setText('')
    await u.click(screen.getByRole('button', { name: 'Add rule' }))
    expect(api.addRule).toHaveBeenCalledWith({ list: 'allow', kind: 'user', value: '@c:hs' })
  })

  test('the rules table marks rules that carry an override', async () => {
    wrap(<RulesPanel meta={meta} />)
    await waitFor(() => expect(screen.getByText('@a:hs')).toBeTruthy())
    expect(screen.getByText('custom')).toBeTruthy()
  })
})
