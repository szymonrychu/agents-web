// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { MONO_FONT, TOKENS, theme } from '../theme'
import { ChatMarkdown } from './Markdown'

afterEach(cleanup)

function setup(text: string) {
  return render(
    <ThemeProvider theme={theme}>
      <ChatMarkdown text={text} />
    </ThemeProvider>,
  )
}

const all = (root: ParentNode, selector: string): Element[] => Array.from(root.querySelectorAll(selector))
const one = (root: ParentNode, selector: string): Element => {
  const found = all(root, selector)
  expect(found, selector).toHaveLength(1)
  return found[0]
}
const font = (el: Element): string => getComputedStyle(el).fontFamily

describe('ChatMarkdown', () => {
  test('renders_gfm_elements_as_mui', () => {
    const text = [
      '# h1', '## h2', '### h3', '#### h4', '##### h5', '###### h6',
      '',
      '- one',
      '- two',
      '',
      '1. first',
      '2. second',
      '',
      'some *em* and **strong** and ~~gone~~ and [site](https://example.com) and `inline`',
      '',
      '> quoted',
      '',
      '---',
      '',
      '| left | centre | right |',
      '| :--- | :----: | ----: |',
      '| a | b | c |',
      '',
      '- [x] done',
      '- [ ] todo',
    ].join('\n')
    const { container } = setup(text)

    for (const n of [1, 2, 3, 4, 5, 6]) {
      const h = screen.getByRole('heading', { level: n, name: `h${n}` })
      expect(h.tagName).toBe(`H${n}`)
      expect(h.classList.contains('MuiTypography-root')).toBe(true)
      expect(h.classList.contains(`MuiTypography-h${n}`)).toBe(true)
    }

    const ul = all(container, 'ul')[0]
    expect(all(ul, 'li').map((li) => li.textContent)).toEqual(['one', 'two'])
    const ol = one(container, 'ol')
    expect(all(ol, 'li').map((li) => li.textContent)).toEqual(['first', 'second'])

    expect(one(container, 'em').textContent).toBe('em')
    expect(getComputedStyle(one(container, 'em')).fontStyle).toBe('italic')
    const strong = one(container, 'strong')
    expect(strong.textContent).toBe('strong')
    expect(getComputedStyle(strong).fontWeight).toBe(String(TOKENS.fontWeights.medium))
    const del = one(container, 'del')
    expect(del.textContent).toBe('gone')
    expect(getComputedStyle(del).textDecoration).toContain('line-through')

    const link = screen.getByRole('link', { name: 'site' })
    expect(link.classList.contains('MuiLink-root')).toBe(true)
    expect(link.getAttribute('href')).toBe('https://example.com')

    const code = one(container, 'code')
    expect(code.textContent).toBe('inline')
    expect(font(code)).toBe(MONO_FONT)

    const quote = one(container, 'blockquote')
    expect(quote.textContent?.trim()).toBe('quoted')
    expect(one(quote, 'p').classList.contains('MuiTypography-body1')).toBe(true)

    const hr = one(container, 'hr')
    expect(hr.classList.contains('MuiDivider-root')).toBe(true)

    const table = screen.getByRole('table')
    expect(table.classList.contains('MuiTable-root')).toBe(true)
    expect(table.parentElement?.classList.contains('MuiTableContainer-root')).toBe(true)
    expect(one(table, 'thead').classList.contains('MuiTableHead-root')).toBe(true)
    expect(one(table, 'tbody').classList.contains('MuiTableBody-root')).toBe(true)
    const heads = screen.getAllByRole('columnheader')
    expect(heads.map((h) => h.textContent)).toEqual(['left', 'centre', 'right'])
    expect(heads.every((h) => h.tagName === 'TH' && h.classList.contains('MuiTableCell-head'))).toBe(true)
    const cells = screen.getAllByRole('cell')
    expect(cells.map((c) => c.textContent)).toEqual(['a', 'b', 'c'])
    expect(cells.every((c) => c.tagName === 'TD' && c.classList.contains('MuiTableCell-body'))).toBe(true)
    expect(all(table, 'tr').every((r) => r.classList.contains('MuiTableRow-root'))).toBe(true)
    expect([...heads, ...cells].every((c) => c.classList.contains('MuiTableCell-sizeSmall'))).toBe(true)
    expect(heads[0].classList.contains('MuiTableCell-alignLeft')).toBe(true)
    expect(heads[1].classList.contains('MuiTableCell-alignCenter')).toBe(true)
    expect(heads[2].classList.contains('MuiTableCell-alignRight')).toBe(true)
    expect(cells[2].classList.contains('MuiTableCell-alignRight')).toBe(true)

    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes).toHaveLength(2)
    expect(boxes.map((b) => b.checked)).toEqual([true, false])
    expect(boxes.every((b) => b.disabled)).toBe(true)
    expect(boxes.every((b) => b.closest('.MuiCheckbox-root')?.classList.contains('MuiCheckbox-sizeSmall'))).toBe(true)
  })

  test('raw_html_renders_as_text', () => {
    const { container } = setup('hello <b>\n\n<b>x</b>\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>')
    expect(all(container, 'b, script, img')).toHaveLength(0)
    expect(container.textContent).toContain('hello <b>')
    expect(container.textContent).toContain('<b>x</b>')
    expect(container.textContent).toContain('<script>alert(1)</script>')
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  test('links_open_in_new_tab_and_unsafe_urls_drop', () => {
    const { container } = setup(
      ['[safe](https://example.com/a)', 'see www.example.org now', '[js](javascript:alert(1))', '[data](data:text/html,hi)', 'with a note[^1]', '', '[^1]: the note'].join('\n'),
    )
    for (const name of ['safe', 'www.example.org']) {
      const a = screen.getByText(name).closest('a')!
      expect(a.getAttribute('target'), name).toBe('_blank')
      expect(a.getAttribute('rel'), name).toBe('noopener noreferrer')
      expect(a.getAttribute('href'), name).toMatch(/^https?:\/\//)
    }
    for (const name of ['js', 'data']) {
      const a = screen.getByText(name).closest('a')!
      expect(a.hasAttribute('href'), name).toBe(false)
      expect(a.hasAttribute('target'), name).toBe(false)
    }
    const fragments = all(container, 'a[href^="#"]')
    expect(fragments.length).toBeGreaterThanOrEqual(2)
    for (const a of fragments) {
      expect(a.hasAttribute('target')).toBe(false)
      expect(a.hasAttribute('rel')).toBe(false)
    }
    expect(all(container, 'a').every((a) => a.classList.contains('MuiLink-root'))).toBe(true)
  })

  test('images_render_as_links', () => {
    const { container } = setup('![logo](https://example.com/a.png)\n\n![](https://example.com/b.png)\n\n![x](javascript:alert(1))\n\n[![inner](https://example.com/c.png)](https://example.com/page)')
    expect(all(container, 'img')).toHaveLength(0)
    const logo = screen.getByRole('link', { name: 'logo' })
    expect(logo.getAttribute('href')).toBe('https://example.com/a.png')
    expect(logo.getAttribute('target')).toBe('_blank')
    expect(logo.getAttribute('rel')).toBe('noopener noreferrer')
    const bare = screen.getByRole('link', { name: 'https://example.com/b.png' })
    expect(bare.getAttribute('href')).toBe('https://example.com/b.png')
    expect(bare.getAttribute('target')).toBe('_blank')
    const x = screen.getByText('x')
    expect(x.closest('a')).toBeNull()
    expect(screen.queryByRole('link', { name: 'x' })).toBeNull()
    // An image inside a link keeps the outer link and nests no second anchor.
    const outer = screen.getByRole('link', { name: 'inner' })
    expect(outer.getAttribute('href')).toBe('https://example.com/page')
    expect(all(outer, 'a')).toHaveLength(0)
  })

  test('single_newline_is_a_line_break', () => {
    const { container } = setup('line one\nline two')
    const p = one(container, 'p')
    expect(all(p, 'br')).toHaveLength(1)
    expect(p.textContent).toBe('line one\nline two')
    expect(p.childNodes[0].textContent).toBe('line one')
    expect((p.childNodes[1] as Element).tagName).toBe('BR')
  })

  test('fenced_code_block_shows_language_without_highlighting', () => {
    const src = 'def f(x):\n    return x  # <b>'
    const { container } = setup('```python\n' + src + '\n```')
    const pre = one(container, 'pre')
    expect(font(pre)).toBe(MONO_FONT)
    const code = one(pre, 'code')
    expect(code.textContent).toBe(src + '\n')
    expect(code.children).toHaveLength(0)
    const label = screen.getByText('python')
    expect(pre.contains(label)).toBe(false)
    expect(label.compareDocumentPosition(pre) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    cleanup()

    const plain = setup('```\nplain text\n```').container
    const plainPre = one(plain, 'pre')
    expect(one(plainPre, 'code').textContent).toBe('plain text\n')
    expect(plain.textContent).toBe('plain text\n')
  })
})
