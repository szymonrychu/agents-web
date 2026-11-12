// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { VersionDiff } from './VersionDiff'

vi.mock('../proposals/ValueDiff', () => ({
  default: ({ before, after, text, labels }: { before: string; after: string; text?: boolean; labels?: readonly [string, string] }) => (
    <div data-testid="value-diff" data-text={String(text)} data-before={before} data-after={after} data-labels={labels?.join(',')} />
  ),
}))

afterEach(cleanup)

describe('VersionDiff', () => {
  test('diffs the two bodies as text', async () => {
    render(<VersionDiff before="old" after="new" beforeLabel="v1" afterLabel="v2" />)
    const d = await screen.findByTestId('value-diff')
    expect(d.getAttribute('data-text')).toBe('true')
    expect(d.getAttribute('data-before')).toBe('old')
    expect(d.getAttribute('data-after')).toBe('new')
  })

  test('passes the version labels to the diff', async () => {
    render(<VersionDiff before="old" after="new" beforeLabel="v1" afterLabel="v2" />)
    expect((await screen.findByTestId('value-diff')).getAttribute('data-labels')).toBe('v1,v2')
  })

  test('the rendered toggle shows both bodies as markdown side by side', async () => {
    render(<VersionDiff before="# Old head" after="# New head" beforeLabel="v1" afterLabel="v2" />)
    await userEvent.click(screen.getByRole('button', { name: 'Rendered' }))
    expect(screen.getByTestId('rendered-before').querySelector('h1')?.textContent).toBe('Old head')
    expect(screen.getByTestId('rendered-after').querySelector('h1')?.textContent).toBe('New head')
    expect(screen.queryByTestId('value-diff')).toBeNull()
  })
})
