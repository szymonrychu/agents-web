// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import TemplateEditor, { type TemplatePreview } from './TemplateEditor'

const original = { rects: Range.prototype.getClientRects, box: Range.prototype.getBoundingClientRect }
beforeAll(() => {
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
})
afterAll(() => {
  Range.prototype.getClientRects = original.rects
  Range.prototype.getBoundingClientRect = original.box
})
afterEach(cleanup)

const ok: TemplatePreview = { rendered: 'hello world', error: null, variables: ['session_slug', 'now'] }

function mount(value: string, preview: (t: string) => Promise<TemplatePreview>) {
  return render(
    <ThemeProvider theme={theme}>
      <TemplateEditor label="Prompt" value={value} onChange={vi.fn()} preview={preview} />
    </ThemeProvider>,
  )
}

describe('TemplateEditor', () => {
  test('preview ok shows the rendered text', async () => {
    const preview = vi.fn().mockResolvedValue(ok)
    mount('hello {{ x }}', preview)
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    await waitFor(() => expect(screen.getByTestId('template-rendered').textContent).toBe('hello world'))
    expect(preview).toHaveBeenCalledWith('hello {{ x }}')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('preview error shows the line and message', async () => {
    mount('{{ x', vi.fn().mockResolvedValue({ rendered: null, error: { line: 3, message: 'unexpected end' }, variables: [] }))
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect((await screen.findByRole('alert')).textContent).toContain('line 3: unexpected end')
    expect(screen.queryByTestId('template-rendered')).toBeNull()
  })

  test('shows variable chips from the preview', async () => {
    mount('x', vi.fn().mockResolvedValue(ok))
    expect(screen.queryByText('session_slug')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(await screen.findByText('session_slug')).toBeTruthy()
    expect(screen.getByText('now')).toBeTruthy()
  })

  test('a failing request is shown as an error', async () => {
    mount('x', vi.fn().mockRejectedValue(new Error('boom')))
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect((await screen.findByRole('alert')).textContent).toContain('boom')
  })

  test('preview is disabled when the template is empty', () => {
    const preview = vi.fn()
    mount('   ', preview)
    expect((screen.getByRole('button', { name: 'Preview' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
