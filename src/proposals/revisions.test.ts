import { expect, test } from 'vitest'
import { item, proposal, revision } from './proposalFixture'
import { changedPaths, orderItems } from './revisions'

test('orders grant items first, then other security items, then the rest', () => {
  const items = [item({ path: 'a' }), item({ path: 'b', security: true }), item({ path: 'c', grant: true, security: true }), item({ path: 'd' })]
  expect(orderItems(items).map((i) => i.path)).toEqual(['c', 'b', 'a', 'd'])
})

test('marks the items whose proposed value differs from the previous revision', () => {
  const p = proposal()
  expect([...changedPaths(p.revisions[1], p.revisions[0])]).toEqual(['model', 'start_prompt', 'init_scripts', 'projects.alpha'])
})

test('without a previous revision nothing is marked', () => {
  expect(changedPaths(proposal().revisions[0], undefined).size).toBe(0)
})

test('a new path or a changed after counts as changed; an equal one does not', () => {
  const prev = revision(1, [item({ path: 'env.A', after: { vault: 'u-1', env: 'T' } }), item({ path: 'env.B', after: 1 })])
  const cur = revision(2, [
    item({ path: 'env.A', after: { vault: 'u-1', env: 'T' } }),
    item({ path: 'env.B', after: { vault: 'u-2', env: 'T' } }),
    item({ path: 'env.C', after: { vault: 'u-3', env: 'T' } }),
  ])
  expect([...changedPaths(cur, prev)].sort()).toEqual(['env.B', 'env.C'])
})
