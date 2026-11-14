// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import { ChainTargetsSelect } from './ChainTargetsSelect'

const api = vi.hoisted(() => ({ listSchedules: vi.fn() }))
vi.mock('../schedules/api', async (orig) => ({ ...(await orig<typeof import('../schedules/api')>()), ...api }))

afterEach(cleanup)

const all = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, name: `sched-${i}` }))

describe('ChainTargetsSelect cap', () => {
  test('disables further options once 10 targets are selected and says so', async () => {
    api.listSchedules.mockResolvedValue(all)
    render(<ThemeProvider theme={theme}><ChainTargetsSelect value={all.slice(0, 10).map((s) => s.id)} onChange={() => {}} /></ThemeProvider>)
    await userEvent.click(await screen.findByRole('combobox'))
    const opt = await screen.findByRole('option', { name: 'sched-10' })
    expect(opt.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText(/At most 10 targets/)).toBeTruthy()
  })

  test('keeps options enabled below the cap', async () => {
    api.listSchedules.mockResolvedValue(all)
    render(<ThemeProvider theme={theme}><ChainTargetsSelect value={['s0']} onChange={() => {}} /></ThemeProvider>)
    await userEvent.click(await screen.findByRole('combobox'))
    expect((await screen.findByRole('option', { name: 'sched-1' })).getAttribute('aria-disabled')).not.toBe('true')
  })
})
