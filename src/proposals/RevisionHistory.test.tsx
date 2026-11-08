// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import { item, revision } from './proposalFixture'
import { RevisionHistory } from './RevisionHistory'

afterEach(cleanup)

it('renders nothing without earlier revisions', () => {
  const { container } = render(<RevisionHistory revisions={[]} />)
  expect(container.textContent).toBe('')
})

it('is collapsed, then lists reason, outcome and each item verdict and note', async () => {
  const r1 = revision(1, [item({ path: 'model', decision: 'rework', note: 'use haiku' }), item({ path: 'x', decision: 'approved' })], { outcome: 'rework' })
  render(<RevisionHistory revisions={[r1]} />)
  expect(screen.queryByText('reason r1')).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: /earlier revisions/i }))
  expect(screen.getByText('reason r1')).toBeTruthy()
  expect(screen.getByText(/outcome: rework/)).toBeTruthy()
  expect(screen.getByText('use haiku')).toBeTruthy()
  expect(screen.getByText('approved')).toBeTruthy()
})
