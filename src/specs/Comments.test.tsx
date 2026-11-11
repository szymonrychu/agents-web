// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiError } from '../api/client'
import { Comments } from './Comments'
import { comment } from './testUtils'

const api = vi.hoisted(() => ({ createComment: vi.fn(), resolveComment: vi.fn(), acceptSuggestion: vi.fn(), dismissSuggestion: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))
vi.mock('./VersionDiff', () => ({
  VersionDiff: ({ before, after }: { before: string; after: string }) => <div data-testid="version-diff" data-before={before} data-after={after} />,
}))

const onChanged = vi.fn()
const mount = (comments = [comment()], version = 3, body = 'current body') =>
  render(<Comments specKey="S-1" path="plan.md" currentVersion={version} currentBody={body} comments={comments} onChanged={onChanged} />)

beforeEach(() => {
  for (const f of [...Object.values(api), onChanged]) f.mockReset()
  api.createComment.mockResolvedValue({})
  api.resolveComment.mockResolvedValue({})
  api.acceptSuggestion.mockResolvedValue({})
  api.dismissSuggestion.mockResolvedValue({})
})
afterEach(cleanup)

describe('spec comments', () => {
  test('renders the body as markdown with the anchor chip', () => {
    mount([comment({ body: '**bold** note', anchor: 'intro' })])
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.getByText('#intro')).toBeTruthy()
  })

  test('a comment is posted against the document, its version and an optional heading id', async () => {
    mount([])
    await userEvent.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'hello')
    await userEvent.type(screen.getByRole('textbox', { name: 'Heading id' }), 'h-intro')
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }))
    expect(api.createComment).toHaveBeenCalledWith('S-1', { body: 'hello', path: 'plan.md', version: 3, anchor: 'h-intro' })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  test('a suggestion starts from the current body', async () => {
    mount([])
    await userEvent.click(screen.getByRole('button', { name: 'Suggest an edit' }))
    const box = screen.getByRole('textbox', { name: 'Proposed document' })
    expect((box as HTMLTextAreaElement).value).toBe('current body')
    await userEvent.type(screen.getByRole('textbox', { name: 'Add a comment' }), 'why')
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }))
    expect(api.createComment).toHaveBeenCalledWith('S-1', { body: 'why', path: 'plan.md', version: 3, suggestion: 'current body' })
  })

  test('resolve', async () => {
    mount()
    await userEvent.click(screen.getByRole('button', { name: 'Resolve' }))
    expect(api.resolveComment).toHaveBeenCalledWith('S-1', 7)
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  test('an open suggestion shows before and after with Accept and Dismiss', async () => {
    mount([comment({ suggestion: 'new body', suggestion_status: 'open' })])
    const d = screen.getByTestId('version-diff')
    expect(d.getAttribute('data-before')).toBe('current body')
    expect(d.getAttribute('data-after')).toBe('new body')
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(api.acceptSuggestion).toHaveBeenCalledWith('S-1', 7, 3)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(api.dismissSuggestion).toHaveBeenCalledWith('S-1', 7)
  })

  test('Accept 412 refetches and tells the user to review the new diff', async () => {
    api.acceptSuggestion.mockRejectedValue(new ApiError(412, 'stale_version', 'moved', { current_version: 4 }))
    mount([comment({ suggestion: 'new body', suggestion_status: 'open' })])
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }))
    expect(await screen.findByText(/document changed since you opened it/)).toBeTruthy()
    expect(onChanged).toHaveBeenCalled()
  })

  test('a decided suggestion has no actions', () => {
    mount([comment({ suggestion: 'x', suggestion_status: 'accepted', resolved_at: '2026-11-04T10:00:00Z' })])
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull()
    expect(screen.getByText('suggestion accepted')).toBeTruthy()
  })
})
