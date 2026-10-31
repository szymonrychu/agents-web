// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { theme } from '../theme'
import HooksEditor from './HooksEditor'
import type { HookEventInfo, Hooks } from './types'

afterEach(cleanup)

const events: HookEventInfo[] = [
  { name: 'onTurn', supports_matcher: false, supports_interval: false },
  { name: 'onTick', supports_matcher: false, supports_interval: true },
  { name: 'onAgentToolCall', supports_matcher: true, supports_interval: false },
]

let last: Hooks | null | undefined
function Harness({ initial }: { initial: Hooks | null }) {
  const [value, setValue] = useState<Hooks | null>(initial)
  return (
    <ThemeProvider theme={theme}>
      <HooksEditor value={value} onChange={(v) => { last = v; setValue(v) }} events={events} />
    </ThemeProvider>
  )
}
const mount = (initial: Hooks | null) => {
  last = initial
  return render(<Harness initial={initial} />)
}
const addHook = async (event: string) => {
  await userEvent.selectOptions(screen.getByLabelText('Hook event'), event)
  await userEvent.click(screen.getByRole('button', { name: 'Add hook' }))
}

describe('HooksEditor', () => {
  test('add hook creates a command hook under the chosen event', async () => {
    mount(null)
    await addHook('onTurn')
    expect(last).toEqual({ onTurn: [{ type: 'command', run: '' }] })
  })

  test('type select switches to a webhook and drops command fields', async () => {
    mount({ onTurn: [{ type: 'command', run: 'echo', env: { A: 'b' } }] })
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'webhook')
    expect(last).toEqual({ onTurn: [{ type: 'webhook', url: '' }] })
  })

  test('matcher input only on tool events', () => {
    mount({ onTurn: [{ type: 'command', run: 'x' }], onAgentToolCall: [{ type: 'command', run: 'x' }] })
    expect(screen.getAllByLabelText('Matcher')).toHaveLength(1)
    expect(within(screen.getByRole('group', { name: 'onAgentToolCall' })).getByLabelText('Matcher')).toBeTruthy()
  })

  test('interval and when only on onTick, and interval is flagged when missing', async () => {
    mount({ onTurn: [{ type: 'command', run: 'x' }], onTick: [{ type: 'command', run: 'x' }] })
    expect(screen.getAllByLabelText('Interval seconds')).toHaveLength(1)
    expect(screen.getAllByLabelText('When')).toHaveLength(1)
    expect(screen.getByText('interval_seconds: required on onTick')).toBeTruthy()
    await userEvent.type(screen.getByLabelText('Interval seconds'), '30')
    expect(last).toEqual({ onTurn: [{ type: 'command', run: 'x' }], onTick: [{ type: 'command', run: 'x', interval_seconds: 30 }] })
    expect(screen.queryByText('interval_seconds: required on onTick')).toBeNull()
  })

  test('the 21st action on an event is refused by the add button', async () => {
    mount({ onTurn: Array.from({ length: 20 }, () => ({ type: 'command', run: 'x' })) as Hooks['onTurn'] })
    await userEvent.selectOptions(screen.getByLabelText('Hook event'), 'onTurn')
    expect((screen.getByRole('button', { name: 'Add hook' }) as HTMLButtonElement).disabled).toBe(true)
  })

  test('remove drops the hook; removing the last one keeps {} distinct from unset', async () => {
    mount({ onTurn: [{ type: 'command', run: 'x' }] })
    await userEvent.click(screen.getByRole('button', { name: 'Remove hook onTurn 1' }))
    expect(last).toEqual({})
  })

  test('untouched unset stays null', () => {
    mount(null)
    expect(last).toBeNull()
  })

  test('env rows add, edit and remove', async () => {
    mount({ onTurn: [{ type: 'command', run: 'x' }] })
    await userEvent.click(screen.getByRole('button', { name: 'Add env' }))
    await userEvent.type(screen.getByLabelText('Env key 1'), 'FOO')
    await userEvent.type(screen.getByLabelText('Env value 1'), 'bar')
    expect(last).toEqual({ onTurn: [{ type: 'command', run: 'x', env: { FOO: 'bar' } }] })
    await userEvent.click(screen.getByRole('button', { name: 'Remove env 1' }))
    expect(last).toEqual({ onTurn: [{ type: 'command', run: 'x' }] })
  })

  test('webhook secret is masked and an untouched hook round-trips it unchanged', async () => {
    const hooks: Hooks = { onTurn: [{ type: 'webhook', url: 'https://h.example', secret: 's3cret', headers: { A: 'b' } }] }
    mount(hooks)
    const secret = screen.getByLabelText('Secret') as HTMLInputElement
    expect(secret.type).toBe('password')
    expect(screen.queryByDisplayValue('s3cret')).not.toBeNull()
    expect(last).toEqual(hooks)
    await userEvent.clear(screen.getByLabelText('Secret'))
    expect(last).toEqual({ onTurn: [{ type: 'webhook', url: 'https://h.example', headers: { A: 'b' } }] })
  })

  test('raw JSON toggle shows the same state and writes it back', async () => {
    const hooks: Hooks = { onTurn: [{ type: 'command', run: 'x' }] }
    mount(hooks)
    await userEvent.click(screen.getByRole('button', { name: 'Raw JSON' }))
    const raw = screen.getByLabelText('Hooks JSON') as HTMLTextAreaElement
    expect(JSON.parse(raw.value)).toEqual(hooks)
    fireEvent.change(raw, { target: { value: '{"onTick":[{"type":"command","run":"y","interval_seconds":5}]}' } })
    expect(last).toEqual({ onTick: [{ type: 'command', run: 'y', interval_seconds: 5 }] })
    fireEvent.change(raw, { target: { value: '{' } })
    expect(screen.getByRole('alert').textContent).toContain('JSON')
    expect(last).toEqual({ onTick: [{ type: 'command', run: 'y', interval_seconds: 5 }] })
    fireEvent.change(raw, { target: { value: '' } })
    expect(last).toBeNull()
    fireEvent.change(raw, { target: { value: '{}' } })
    expect(last).toEqual({})
    await userEvent.click(screen.getByRole('button', { name: 'Form' }))
    expect(screen.getByLabelText('Hook event')).toBeTruthy()
  })
})
