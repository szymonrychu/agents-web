// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { theme } from '../theme'
import PluginsEditor, { type PluginsValue } from './PluginsEditor'

afterEach(cleanup)

let last: PluginsValue | null | undefined
let invalid: (string | null)[] = []
function Harness({ initial }: { initial: PluginsValue | null }) {
  const [value, setValue] = useState<PluginsValue | null>(initial)
  return (
    <ThemeProvider theme={theme}>
      <PluginsEditor value={value} onChange={(v) => { last = v; setValue(v) }} onInvalid={(m) => invalid.push(m)} />
    </ThemeProvider>
  )
}
const mount = (initial: PluginsValue | null) => {
  last = initial
  invalid = []
  return render(<Harness initial={initial} />)
}
const click = (name: string) => userEvent.click(screen.getByRole('button', { name }))
const type = (label: string, text: string) => userEvent.type(screen.getByLabelText(label), text)

describe('PluginsEditor', () => {
  test('adds a github marketplace', async () => {
    mount(null)
    await click('Add marketplace')
    await type('Marketplace name 1', 'acme')
    await type('Marketplace repo 1', 'acme/tools')
    await type('Marketplace ref 1', 'v1')
    expect(last).toEqual({ marketplaces: [{ name: 'acme', source: 'acme/tools#v1' }] })
  })

  test('source type switches fields', async () => {
    mount(null)
    await click('Add marketplace')
    await userEvent.selectOptions(screen.getByLabelText('Marketplace type 1'), 'url')
    await type('Marketplace url 1', 'https://x.io/m.json')
    await type('Marketplace name 1', 'm')
    expect(last).toEqual({ marketplaces: [{ name: 'm', source: 'https://x.io/m.json' }] })
    await userEvent.selectOptions(screen.getByLabelText('Marketplace type 1'), 'directory')
    expect(screen.getByLabelText('Marketplace path 1')).toBeTruthy()
  })

  test('shows stored marketplaces by kind', () => {
    mount({ marketplaces: [{ name: 'a', source: '/opt/m' }] })
    expect((screen.getByLabelText('Marketplace type 1') as HTMLSelectElement).value).toBe('directory')
    expect((screen.getByLabelText('Marketplace path 1') as HTMLInputElement).value).toBe('/opt/m')
  })

  test('install picks from listed marketplaces and the built-in one', async () => {
    mount({ marketplaces: [{ name: 'acme', source: 'acme/tools' }] })
    await click('Add install')
    const sel = screen.getByLabelText('Install marketplace 1') as HTMLSelectElement
    expect([...sel.options].map((o) => o.value)).toEqual(['claude-plugins-official', 'acme'])
    await type('Install plugin 1', 'jira')
    await userEvent.selectOptions(sel, 'acme')
    await userEvent.selectOptions(screen.getByLabelText('Install scope 1'), 'project')
    await userEvent.click(screen.getByLabelText('Install required 1'))
    expect(last?.install).toEqual([{ plugin: 'jira@acme', scope: 'project', required: false }])
  })

  test('required is omitted when left on', async () => {
    mount(null)
    await click('Add install')
    await type('Install plugin 1', 'p')
    expect(last).toEqual({ install: [{ plugin: 'p@claude-plugins-official' }] })
  })

  test('removing rows prunes empty arrays and returns null when empty', async () => {
    mount({ install: [{ plugin: 'p@claude-plugins-official' }] })
    await click('Remove install 1')
    expect(last).toBeNull()
  })

  test('reports validation problems through onInvalid', async () => {
    mount({ marketplaces: [{ name: 'acme', source: 'acme/tools' }], install: [{ plugin: 'p@gone' }] })
    expect(screen.getByText(/marketplace "gone" is not listed/)).toBeTruthy()
    expect(invalid.at(-1)).not.toBeNull()
    await click('Add marketplace')
    await type('Marketplace name 2', 'acme')
    expect(screen.getAllByText(/duplicate/).length).toBe(2)
  })

  test('raw JSON toggle edits, and invalid JSON blocks', async () => {
    mount({ install: [{ plugin: 'p@claude-plugins-official' }] })
    await click('Plugins raw JSON')
    const box = screen.getByLabelText('Plugins JSON') as HTMLTextAreaElement
    expect(JSON.parse(box.value)).toEqual({ install: [{ plugin: 'p@claude-plugins-official' }] })
    await userEvent.clear(box)
    await userEvent.click(box)
    await userEvent.paste('{nope')
    expect(screen.getByText(/Invalid JSON/)).toBeTruthy()
    expect(invalid.at(-1)).not.toBeNull()
    expect((screen.getByRole('button', { name: 'Plugins form' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.clear(box)
    expect(invalid.at(-1)).toBeNull()
    expect(last).toBeNull()
    await userEvent.click(box)
    await userEvent.paste('[1]')
    expect(screen.getByText(/JSON object/)).toBeTruthy()
  })

  test('a github: prefixed source shows an inline error and blocks Save until fixed', async () => {
    mount(null)
    await click('Add marketplace')
    await type('Marketplace name 1', 'acme')
    await type('Marketplace repo 1', 'github:owner/repo')
    expect(screen.getByText(/owner\/repo/)).toBeTruthy()
    expect(invalid.at(-1)).toMatch(/owner\/repo/)
    await userEvent.clear(screen.getByLabelText('Marketplace repo 1'))
    await type('Marketplace repo 1', 'owner/repo')
    expect(screen.queryByText(/must be owner\/repo/)).toBeNull()
    expect(invalid.at(-1)).toBeNull()
  })

  test('a stored invalid source is flagged on load', () => {
    mount({ marketplaces: [{ name: 'acme', source: 'github:owner/repo' }] })
    expect(invalid.at(-1)).not.toBeNull()
  })

  test('raw JSON with a bad marketplace source blocks too', async () => {
    mount(null)
    await click('Plugins raw JSON')
    await userEvent.click(screen.getByLabelText('Plugins JSON'))
    await userEvent.paste('{"marketplaces":[{"name":"a","source":"github:owner/repo"}]}')
    expect(screen.getByText(/marketplace "a"/)).toBeTruthy()
    expect(invalid.at(-1)).not.toBeNull()
  })
})
