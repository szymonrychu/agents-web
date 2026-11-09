// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ItemCard } from './ItemCard'
import { toYaml } from './diffText'
import { item } from './proposalFixture'
import type { EntryView } from '../vault/api'

vi.mock('./ValueDiff', () => ({ default: ({ before, after, text }: { before: unknown; after: unknown; text?: boolean }) => <div data-testid="diff" data-text={String(Boolean(text))}>{`${JSON.stringify(before)}=>${JSON.stringify(after)}`}</div> }))
afterEach(cleanup)

/** Installs a matchMedia that evaluates min-width / max-width queries against `width`. */
function setViewport(width: number) {
  window.matchMedia = ((query: string) => {
    const min = /min-width:\s*([\d.]+)px/.exec(query)
    const max = /max-width:\s*([\d.]+)px/.exec(query)
    const matches = (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]))
    return { matches, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }
  }) as typeof window.matchMedia
}

const base = { choice: undefined, note: '', readOnly: false, stale: false, changed: false, onChoice: vi.fn(), onNote: vi.fn() }

describe('ItemCard', () => {
  it('shows the path, the chips and the lazy diff', async () => {
    render(<ItemCard {...base} item={item({ path: 'kube_access', before: false, after: true, grant: true, security: true })} />)
    expect(screen.getByText('kube_access')).toBeTruthy()
    expect(screen.getByText('grant')).toBeTruthy()
    expect(screen.getByText('security')).toBeTruthy()
    expect((await screen.findByTestId('diff')).textContent).toBe('false=>true')
  })

  it('a secret item says value set and never renders a value or an input for one', async () => {
    const { container } = render(<ItemCard {...base} item={item({ path: 'env.K', secret: 'set', security: true, before: null, after: { name: 'K' } })} />)
    expect(screen.getByText('secret')).toBeTruthy()
    expect(screen.getByText('value set')).toBeTruthy()
    expect(container.querySelector('input[type=password], input[type=text], textarea')).toBeNull()
    render(<ItemCard {...base} item={item({ path: 'env.K', secret: 'changed', after: { name: 'K' } })} />)
    expect(screen.getByText('value changed')).toBeTruthy()
    cleanup()
    render(<ItemCard {...base} choice="rework" item={item({ path: 'env.K', secret: 'set', after: { name: 'K' } })} />)
    expect(screen.getAllByRole('textbox').length).toBe(1)
    expect(screen.getByRole('textbox').getAttribute('type')).not.toBe('password')
  })

  it('a secret item diffs the declarations without the base-only set and version keys', async () => {
    render(<ItemCard {...base} item={item({ path: 'env.K', secret: 'changed', before: { protected: true, expand: false, set: true, version: 3 }, after: { protected: true, expand: false } })} />)
    expect((await screen.findByTestId('diff')).textContent).toBe('{"protected":true,"expand":false}=>{"protected":true,"expand":false}')
  })

  it('the changed chip names the previous revision', () => {
    render(<ItemCard {...base} changed previous={1} item={item()} />)
    expect(screen.getByText('changed since r1')).toBeTruthy()
  })

  it('offers Approve, Rework and Deny, and only Rework and Deny when stale', async () => {
    const onChoice = vi.fn()
    const { rerender } = render(<ItemCard {...base} onChoice={onChoice} item={item()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Rework' }))
    expect(onChoice).toHaveBeenCalledWith('rework')
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
    rerender(<ItemCard {...base} stale item={item()} />)
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Deny' })).toBeTruthy()
  })

  it('rework shows a required note field, deny an optional one, approve none', () => {
    const { rerender } = render(<ItemCard {...base} choice="approve" item={item()} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    rerender(<ItemCard {...base} choice="rework" item={item()} />)
    expect((screen.getByRole('textbox') as HTMLInputElement).required).toBe(true)
    rerender(<ItemCard {...base} choice="deny" item={item()} />)
    expect((screen.getByRole('textbox') as HTMLInputElement).required).toBe(false)
  })

  it('read-only shows the verdict and note, no buttons', () => {
    render(<ItemCard {...base} readOnly item={item({ decision: 'rework', note: 'use haiku' })} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('rework')).toBeTruthy()
    expect(screen.getByText('use haiku')).toBeTruthy()
  })

  it('a schedule prompt is diffed as text and cron as a plain value', async () => {
    const { rerender } = render(<ItemCard {...base} kind="schedule" item={item({ path: 'prompt', before: 'a\nb', after: 'a\nc' })} />)
    expect((await screen.findByTestId('diff')).getAttribute('data-text')).toBe('true')
    rerender(<ItemCard {...base} kind="schedule" item={item({ path: 'cron', before: '0 3 * * *', after: '0 4 * * *' })} />)
    expect((await screen.findByTestId('diff')).getAttribute('data-text')).toBe('false')
    rerender(<ItemCard {...base} kind="preset" item={item({ path: 'prompt', before: 'a', after: 'b' })} />)
    expect((await screen.findByTestId('diff')).getAttribute('data-text')).toBe('false')
  })

  describe('narrow screens', () => {
    const prompt = item({ path: 'prompt', before: 'old line one\nold line two', after: 'new prompt text' })

    it('a schedule prompt stacks Current and Proposed with both full texts, no diff', () => {
      setViewport(400)
      render(<ItemCard {...base} kind="schedule" item={prompt} />)
      expect(screen.getByText('Current')).toBeTruthy()
      expect(screen.getByText('Proposed')).toBeTruthy()
      expect(screen.getByTestId('stack-before').textContent).toBe('old line one\nold line two')
      expect(screen.getByTestId('stack-after').textContent).toBe('new prompt text')
      expect(screen.queryByTestId('diff')).toBeNull()
    })

    it('an empty or missing prompt value shows a placeholder', () => {
      setViewport(400)
      render(<ItemCard {...base} kind="schedule" item={item({ path: 'prompt', before: null, after: '' })} />)
      expect(screen.getAllByText('(empty)').length).toBe(2)
    })

    it('a structured item stacks the YAML of before and after, no diff', () => {
      setViewport(400)
      const before = { url: 'http://a', args: ['x'] }
      const after = { url: 'http://b', args: ['x', 'y'] }
      render(<ItemCard {...base} item={item({ path: 'mcp_servers.git', before, after })} />)
      expect(screen.getByText('Current')).toBeTruthy()
      expect(screen.getByText('Proposed')).toBeTruthy()
      expect(screen.getByTestId('stack-before').textContent).toBe(toYaml(before))
      expect(screen.getByTestId('stack-after').textContent).toBe(toYaml(after))
      expect(screen.queryByTestId('diff')).toBeNull()
    })

    it('a secret item keeps the diff and never stacks values', async () => {
      setViewport(400)
      render(<ItemCard {...base} item={item({ path: 'env.K', secret: 'set', before: null, after: { name: 'K' } })} />)
      expect(await screen.findByTestId('diff')).toBeTruthy()
      expect(screen.queryByTestId('stack-after')).toBeNull()
    })

    it('scalar items keep the diff', async () => {
      setViewport(400)
      render(<ItemCard {...base} kind="schedule" item={item({ path: 'cron', before: 'a', after: 'b' })} />)
      expect(await screen.findByTestId('diff')).toBeTruthy()
    })

    it('wide screens keep the diff for prompts and structured items', async () => {
      setViewport(1200)
      render(<ItemCard {...base} kind="schedule" item={prompt} />)
      expect((await screen.findByTestId('diff')).getAttribute('data-text')).toBe('true')
      cleanup()
      render(<ItemCard {...base} item={item({ path: 'mcp_servers.git', before: { a: 1 }, after: { a: 2 } })} />)
      expect(await screen.findByTestId('diff')).toBeTruthy()
      expect(screen.queryByTestId('stack-before')).toBeNull()
    })
  })

  describe('vault references', () => {
    const ref = { vault: 'u-1', env: 'GITHUB_TOKEN' }
    const entries = new Map([['u-1', { id: 'u-1', name: 'GitHub' } as EntryView]])

    it('test_ref_item_shows_entry_name', async () => {
      render(<ItemCard {...base} entries={entries} item={item({ path: 'env.G', before: null, after: ref })} />)
      expect((await screen.findByTestId('diff')).textContent).toBe('null=>"vault GitHub / GITHUB_TOKEN"')
      expect(screen.getByText('vault')).toBeTruthy()
    })

    it('test_ref_item_unknown_entry_short_id', async () => {
      render(<ItemCard {...base} item={item({ path: 'env.G', before: { vault: '0123456789abcdef', env: 'T' }, after: { vault: 'ffffffffeeee', env: 'T' } })} />)
      expect((await screen.findByTestId('diff')).textContent).toBe('"vault 01234567 / T"=>"vault ffffffff / T"')
      expect(screen.getByText('vault')).toBeTruthy()
    })

    it('test_plain_item_unchanged', async () => {
      render(<ItemCard {...base} entries={entries} item={item({ path: 'env.P', before: { value: 'a', expand: false }, after: { value: 'b', expand: false } })} />)
      expect((await screen.findByTestId('diff')).textContent).toBe('{"value":"a","expand":false}=>{"value":"b","expand":false}')
      expect(screen.queryByText('vault')).toBeNull()
    })
  })
})
