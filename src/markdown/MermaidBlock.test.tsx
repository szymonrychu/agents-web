// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'

const m = vi.hoisted(() => ({ initialize: vi.fn(), parse: vi.fn(), render: vi.fn() }))
vi.mock('mermaid', () => ({ default: m }))

let MermaidBlock: typeof import('./MermaidBlock').MermaidBlock

beforeEach(async () => {
  vi.resetModules()
  ;({ MermaidBlock } = await import('./MermaidBlock'))
  m.initialize.mockReset()
  m.parse.mockReset().mockResolvedValue(true)
  m.render.mockReset().mockResolvedValue({ svg: '<svg data-testid="diagram"></svg>' })
})
afterEach(cleanup)

const setup = (source: string) =>
  render(
    <ThemeProvider theme={theme}>
      <MermaidBlock source={source} />
    </ThemeProvider>,
  )

describe('MermaidBlock', () => {
  test('inserts_the_rendered_svg', async () => {
    setup('graph TD; A-->B')
    expect(await screen.findByTestId('diagram')).toBeTruthy()
    expect(m.render.mock.calls[0][1]).toBe('graph TD; A-->B')
  })

  test('initializes_once_with_strict_config_and_mui_mode_theme', async () => {
    setup('graph TD; A-->B')
    await screen.findByTestId('diagram')
    setup('graph TD; B-->C')
    await waitFor(() => expect(m.render).toHaveBeenCalledTimes(2))
    expect(m.initialize).toHaveBeenCalledTimes(1)
    expect(m.initialize).toHaveBeenCalledWith({ startOnLoad: false, securityLevel: 'strict', layout: 'dagre', look: 'classic', theme: 'dark' })
  })

  test('invalid_diagram_shows_source_and_error_chip', async () => {
    m.parse.mockResolvedValue(false)
    const { container } = setup('not a diagram')
    expect(await screen.findByText('diagram error')).toBeTruthy()
    expect(container.textContent).toContain('not a diagram')
    expect(m.parse).toHaveBeenCalledWith('not a diagram', { suppressErrors: true })
    expect(m.render).not.toHaveBeenCalled()
  })

  test('render_failure_shows_source_and_error_chip', async () => {
    m.render.mockRejectedValue(new Error('boom'))
    setup('graph TD; A-->B')
    expect(await screen.findByText('diagram error')).toBeTruthy()
  })

  test('render_failure_removes_the_stray_body_node', async () => {
    m.render.mockImplementation(async (id: string) => {
      const stray = document.createElement('div')
      stray.id = `d${id}`
      document.body.appendChild(stray)
      throw new Error('boom')
    })
    setup('graph TD; A-->B')
    await screen.findByText('diagram error')
    expect(document.body.querySelector('[id^="dmermaid-"]')).toBeNull()
  })

  test('result_after_unmount_is_ignored', async () => {
    let resolve: (v: { svg: string }) => void = () => {}
    m.render.mockReturnValue(new Promise((r) => (resolve = r)))
    const { unmount, container } = setup('graph TD; A-->B')
    await waitFor(() => expect(m.render).toHaveBeenCalled())
    unmount()
    resolve({ svg: '<svg data-testid="late"></svg>' })
    await Promise.resolve()
    expect(container.querySelector('[data-testid=late]')).toBeNull()
  })
})
