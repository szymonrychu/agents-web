// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import type { Filters } from './api'
import { EMPTY_FILTERS, FiltersEditor } from './FiltersEditor'

const FORGE = ['author', 'actor', 'repo', 'labels', 'title', 'body', 'comment', 'kind', 'action', 'source_branch', 'target_branch']
const GRAFANA = ['labels', 'title', 'body']
const ALLOW = 'Allow (every rule must match)'
const DENY = 'Deny (any matching rule ignores the event)'

/** A stateful parent, so the controlled editor sees its own reports; `spy` records every report. */
function Harness({ type, fields, initial, spy }: { type: string; fields: string[]; initial: Filters; spy: (f: Filters) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <ThemeProvider theme={theme}>
      <FiltersEditor type={type} fields={fields} value={value} onChange={(next) => { spy(next); setValue(next) }} />
    </ThemeProvider>
  )
}

const mount = (type: string, fields: string[], initial: Filters = EMPTY_FILTERS) => {
  const spy = vi.fn<(f: Filters) => void>()
  const view = render(<Harness type={type} fields={fields} initial={initial} spy={spy} />)
  const rerender = (nextType: string, nextFields: string[]) =>
    view.rerender(<Harness type={nextType} fields={nextFields} initial={initial} spy={spy} />)
  return { spy, rerender }
}
const last = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls[spy.mock.calls.length - 1][0] as Filters
const section = (name: string) => screen.getByRole('region', { name })
const pick = async (u: ReturnType<typeof userEvent.setup>, combo: HTMLElement, option: string) => {
  await u.click(combo)
  await u.click(await screen.findByRole('option', { name: option }))
}

afterEach(cleanup)

describe('FiltersEditor', () => {
  test('edits allow and deny rules', async () => {
    const u = userEvent.setup()
    const { spy } = mount('github-pr', FORGE)

    await u.click(screen.getByRole('button', { name: 'Add allow rule' }))
    const allow = section(ALLOW)
    await pick(u, within(allow).getByRole('combobox', { name: 'Field' }), 'author')
    await u.type(within(allow).getByLabelText('Values'), 'alice{Enter}{Enter}  {Enter}bob{Enter}')

    await u.click(screen.getByRole('button', { name: 'Add deny rule' }))
    const deny = section(DENY)
    await pick(u, within(deny).getByRole('combobox', { name: 'Field' }), 'title')
    await pick(u, within(deny).getByRole('combobox', { name: 'Match' }), 'regex')
    await u.type(within(deny).getByLabelText('Values'), '^WIP{Enter}(?i)^draft:')

    expect(last(spy)).toEqual({
      allow: [{ field: 'author', match: 'equals', values: ['alice', 'bob'] }],
      deny: [{ field: 'title', match: 'regex', values: ['^WIP', '(?i)^draft:'] }],
    })
    // The textarea keeps what was typed (blank lines included), so the cursor is not lost on Enter.
    expect(within(allow).getByLabelText('Values')).toHaveProperty('value', 'alice\n\n  \nbob\n')
  })

  test("offers only the type's fields", async () => {
    const u = userEvent.setup()
    mount('grafana-alert', GRAFANA)
    await u.click(screen.getByRole('button', { name: 'Add allow rule' }))
    await u.click(within(section(ALLOW)).getByRole('combobox', { name: 'Field' }))
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent)
    expect(options).toEqual(GRAFANA)
  })

  test('removes a rule', async () => {
    const u = userEvent.setup()
    const initial: Filters = {
      allow: [
        { field: 'author', match: 'equals', values: ['alice'] },
        { field: 'repo', match: 'equals', values: ['o/r'] },
      ],
      deny: [{ field: 'title', match: 'regex', values: ['^WIP'] }],
    }
    const { spy } = mount('github-pr', FORGE, initial)
    const removes = within(section(ALLOW)).getAllByRole('button', { name: 'Remove rule' })
    expect(removes).toHaveLength(2)
    await u.click(removes[0])
    expect(last(spy)).toEqual({ allow: [{ field: 'repo', match: 'equals', values: ['o/r'] }], deny: initial.deny })
    expect(within(section(ALLOW)).getByLabelText('Values')).toHaveProperty('value', 'o/r')
    await u.click(within(section(DENY)).getByRole('button', { name: 'Remove rule' }))
    expect(last(spy)).toEqual({ allow: [{ field: 'repo', match: 'equals', values: ['o/r'] }], deny: [] })
  })

  test('drops rules that do not apply to the new type', () => {
    const initial: Filters = {
      allow: [
        { field: 'author', match: 'equals', values: ['alice'] },
        { field: 'labels', match: 'equals', values: ['bug'] },
      ],
      deny: [
        { field: 'source_branch', match: 'regex', values: ['^tmp/'] },
        { field: 'title', match: 'regex', values: ['^WIP'] },
      ],
    }
    const { spy, rerender } = mount('github-pr', FORGE, initial)
    expect(spy).not.toHaveBeenCalled()
    rerender('grafana-alert', GRAFANA)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(last(spy)).toEqual({
      allow: [{ field: 'labels', match: 'equals', values: ['bug'] }],
      deny: [{ field: 'title', match: 'regex', values: ['^WIP'] }],
    })
    expect(within(section(ALLOW)).getAllByRole('combobox', { name: 'Field' })).toHaveLength(1)
  })

  test('shows the label and regex hints', async () => {
    const u = userEvent.setup()
    mount('grafana-alert', GRAFANA)
    await u.click(screen.getByRole('button', { name: 'Add allow rule' }))
    const allow = section(ALLOW)
    await pick(u, within(allow).getByRole('combobox', { name: 'Field' }), 'labels')
    expect(within(allow).getByText(/key=value, one per line/)).toBeTruthy()
    await pick(u, within(allow).getByRole('combobox', { name: 'Match' }), 'regex')
    expect(within(allow).getByText(/key=regex, one per line/)).toBeTruthy()
    expect(within(allow).getByText(/RE2 \(no lookaround or backreferences\)/)).toBeTruthy()

    // Forge labels are plain names; the key=value hint is Grafana-only.
    cleanup()
    mount('github-pr', FORGE)
    await u.click(screen.getByRole('button', { name: 'Add deny rule' }))
    const deny = section(DENY)
    await pick(u, within(deny).getByRole('combobox', { name: 'Field' }), 'labels')
    expect(within(deny).queryByText(/key=value/)).toBeNull()
    expect(within(deny).queryByText(/RE2/)).toBeNull()
    expect(within(deny).getByText(/One value per line/)).toBeTruthy()
  })
})
