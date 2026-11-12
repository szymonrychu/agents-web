// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ItemCard } from './ItemCard'
import type { DiffCounts } from './diffCounts'
import { initScriptsDoc } from './diffText'
import { item } from './proposalFixture'
import { viewedKey } from './viewed'
import type { EntryView } from '../vault/api'

interface MockDiffProps { before: unknown; after: unknown; text?: boolean; expanded?: boolean; onCounts?: (c: DiffCounts) => void }
function MockDiff({ before, after, text, expanded, onCounts }: MockDiffProps) {
  useEffect(() => onCounts?.({ added: 2, removed: 1 }), [onCounts])
  return <div data-testid="diff" data-text={String(Boolean(text))} data-expanded={String(Boolean(expanded))}>{`${JSON.stringify(before)}=>${JSON.stringify(after)}`}</div>
}
vi.mock('./ValueDiff', () => ({ default: MockDiff }))
afterEach(() => {
  cleanup()
  setViewport(1200)
  vi.restoreAllMocks()
  localStorage.clear()
})

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

  it('read-only shows the verdict and note, no decision buttons', () => {
    render(<ItemCard {...base} readOnly item={item({ decision: 'rework', note: 'use haiku' })} />)
    for (const name of ['Approve', 'Rework', 'Deny']) expect(screen.queryByRole('button', { name })).toBeNull()
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

  it('narrow screens still render the diff for prompts and structured items', async () => {
    setViewport(400)
    render(<ItemCard {...base} kind="schedule" item={item({ path: 'prompt', before: 'old line', after: 'new line' })} />)
    expect((await screen.findByTestId('diff')).getAttribute('data-text')).toBe('true')
    cleanup()
    render(<ItemCard {...base} item={item({ path: 'mcp_servers.git', before: { a: 1 }, after: { a: 2 } })} />)
    expect(await screen.findByTestId('diff')).toBeTruthy()
    expect(screen.queryByTestId('stack-before')).toBeNull()
  })

  it('header shows path, chips and line counts', async () => {
    render(<ItemCard {...base} item={item({ grant: true })} />)
    const header = screen.getByTestId('item-header')
    expect(within(header).getByText('model')).toBeTruthy()
    expect(within(header).getByText('grant')).toBeTruthy()
    expect((await within(header).findByTestId('count-added')).textContent).toBe('+2')
    expect(within(header).getByTestId('count-removed').textContent).toBe('-1')
  })

  it('start_prompt diffs as text', async () => {
    render(<ItemCard {...base} kind="preset" item={item({ path: 'start_prompt', before: 'a\nb', after: 'a\nc' })} />)
    const d = await screen.findByTestId('diff')
    expect(d.getAttribute('data-text')).toBe('true')
    expect(d.textContent).toBe('"a\\nb"=>"a\\nc"')
  })

  it('init_scripts diffs per entry as text', async () => {
    const before = ['echo a']
    const after = ['echo a', 'make test']
    render(<ItemCard {...base} kind="preset" item={item({ path: 'init_scripts', before, after })} />)
    const d = await screen.findByTestId('diff')
    expect(d.getAttribute('data-text')).toBe('true')
    expect(d.textContent).toBe(`${JSON.stringify(initScriptsDoc(before))}=>${JSON.stringify(initScriptsDoc(after))}`)
  })

  it('a schedule cron stays a YAML diff', async () => {
    render(<ItemCard {...base} kind="schedule" item={item({ path: 'cron', before: '0 3 * * *', after: '0 4 * * *' })} />)
    expect((await screen.findByTestId('diff')).getAttribute('data-text')).toBe('false')
  })

  it('a project grant is one added line', async () => {
    render(<ItemCard {...base} item={item({ path: 'projects.alpha', before: null, after: true, grant: true, security: true })} />)
    expect(screen.getByTestId('grant-line').textContent).toBe('+ projects.alpha')
    expect(screen.queryByTestId('diff')).toBeNull()
    expect(screen.getByTestId('count-added').textContent).toBe('+1')
    expect(screen.getByTestId('count-removed').textContent).toBe('-0')
    expect(screen.getByText('grant')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show all lines of projects.alpha' })).toBeNull()
    cleanup()
    render(<ItemCard {...base} item={item({ path: 'projects.alpha', before: true, after: null, grant: true })} />)
    expect(screen.queryByTestId('grant-line')).toBeNull()
    expect(await screen.findByTestId('diff')).toBeTruthy()
  })

  it('collapse toggle hides and shows the body', async () => {
    render(<ItemCard {...base} item={item()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Collapse model' }))
    const toggle = screen.getByRole('button', { name: 'Expand model' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull())
    await userEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Collapse model' }).getAttribute('aria-expanded')).toBe('true')
    // role queries skip hidden elements: found means the collapsed body is shown again
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy())
  })

  it('a collapsed undecided item shows a pending chip', async () => {
    render(<ItemCard {...base} item={item()} />)
    expect(screen.queryByText('pending')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Collapse model' }))
    expect(within(screen.getByTestId('item-header')).getByText('pending')).toBeTruthy()
  })

  it('viewed collapses the item and persists per revision', async () => {
    const { unmount } = render(<ItemCard {...base} viewKey={viewedKey(7, 2, 'model')} item={item()} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Viewed' }))
    expect(screen.getByRole('button', { name: 'Expand model' }).getAttribute('aria-expanded')).toBe('false')
    expect(localStorage.getItem(viewedKey(7, 2, 'model'))).toBe('1')
    unmount()
    const again = render(<ItemCard {...base} viewKey={viewedKey(7, 2, 'model')} item={item()} />)
    expect((screen.getByRole('checkbox', { name: 'Viewed' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('button', { name: 'Expand model' })).toBeTruthy()
    again.unmount()
    render(<ItemCard {...base} viewKey={viewedKey(7, 3, 'model')} item={item()} />)
    expect((screen.getByRole('checkbox', { name: 'Viewed' }) as HTMLInputElement).checked).toBe(false)
    expect(screen.getByRole('button', { name: 'Collapse model' })).toBeTruthy()
  })

  it('unchecking Viewed opens the item', async () => {
    localStorage.setItem(viewedKey(7, 2, 'model'), '1')
    render(<ItemCard {...base} viewKey={viewedKey(7, 2, 'model')} item={item()} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Viewed' }))
    expect(screen.getByRole('button', { name: 'Collapse model' }).getAttribute('aria-expanded')).toBe('true')
    expect(localStorage.getItem(viewedKey(7, 2, 'model'))).toBeNull()
  })

  it('a viewed item reopened by the toggle stays viewed', async () => {
    render(<ItemCard {...base} viewKey={viewedKey(7, 2, 'model')} item={item()} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Viewed' }))
    await userEvent.click(screen.getByRole('button', { name: 'Expand model' }))
    expect(screen.getByRole('button', { name: 'Collapse model' }).getAttribute('aria-expanded')).toBe('true')
    expect((screen.getByRole('checkbox', { name: 'Viewed' }) as HTMLInputElement).checked).toBe(true)
    // role queries skip hidden elements: found means the collapsed body is shown again
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy())
  })

  it('a viewed item still reports its counts', async () => {
    localStorage.setItem(viewedKey(7, 2, 'model'), '1')
    render(<ItemCard {...base} viewKey={viewedKey(7, 2, 'model')} item={item()} />)
    expect((await screen.findByTestId('count-added')).textContent).toBe('+2')
  })

  it('expand context passes expanded to the diff', async () => {
    render(<ItemCard {...base} item={item()} />)
    expect((await screen.findByTestId('diff')).getAttribute('data-expanded')).toBe('false')
    const button = screen.getByRole('button', { name: 'Show all lines of model' })
    expect(button.getAttribute('aria-pressed')).toBe('false')
    await userEvent.click(button)
    expect(screen.getByTestId('diff').getAttribute('data-expanded')).toBe('true')
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })

  it('no Viewed checkbox without a viewKey', () => {
    render(<ItemCard {...base} item={item()} />)
    expect(screen.queryByRole('checkbox', { name: 'Viewed' })).toBeNull()
  })

  it('storage failures do not break the card', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<ItemCard {...base} viewKey={viewedKey(7, 2, 'model')} item={item()} />)
    const box = screen.getByRole('checkbox', { name: 'Viewed' }) as HTMLInputElement
    expect(box.checked).toBe(false)
    await userEvent.click(box)
    expect(box.checked).toBe(true)
    expect(screen.getByRole('button', { name: 'Expand model' }).getAttribute('aria-expanded')).toBe('false')
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
