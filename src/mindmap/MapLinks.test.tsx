// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { theme } from '../theme'
import { MapLinks } from './MapLinks'
import { link } from './testUtils'

const api = vi.hoisted(() => ({ listLinks: vi.fn(), deleteLink: vi.fn() }))
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }))

const onChanged = vi.fn()
const mount = () => render(<MemoryRouter><ThemeProvider theme={theme}><MapLinks mapKey="M-1" refreshKey={0} onChanged={onChanged} /></ThemeProvider></MemoryRouter>)
const lookup = async (u: ReturnType<typeof userEvent.setup>, key = 'T-12') => {
  await u.type(screen.getByLabelText('Task or spec key'), key)
  await u.click(screen.getByRole('button', { name: 'Show links' }))
}

beforeEach(() => {
  for (const m of Object.values(api)) m.mockReset()
  api.listLinks.mockResolvedValue([
    link({ id: 1, map: 'M-1', node: null, ref_key: 'T-12', relation: 'uses' }),
    link({ id: 2, map: 'M-1', node: 'N-2', ref_key: 'T-12' }),
    link({ id: 3, map: 'M-9', node: null, ref_key: 'T-12' }),
  ])
  api.deleteLink.mockResolvedValue(undefined)
  onChanged.mockReset()
})
afterEach(cleanup)

describe('MapLinks', () => {
  test('looks a key up and lists only the map-level links of this map', async () => {
    const u = userEvent.setup()
    mount()
    await lookup(u)
    await waitFor(() => expect(api.listLinks).toHaveBeenCalledWith('T-12'))
    const list = await screen.findByRole('list', { name: 'Map links' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(within(list).getByRole('link', { name: 'T-12' }).getAttribute('href')).toBe('/tasks/T-12')
  })

  test('says so when the key has no link on this map', async () => {
    api.listLinks.mockResolvedValue([link({ map: 'M-9', node: null })])
    const u = userEvent.setup()
    mount()
    await lookup(u)
    await screen.findByText('No link from this map to T-12')
  })

  test('deletes a link after confirming and refreshes the list', async () => {
    const u = userEvent.setup()
    mount()
    await lookup(u)
    await u.click(await screen.findByRole('button', { name: 'Delete link T-12' }))
    await u.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.deleteLink).toHaveBeenCalledWith(1))
    await waitFor(() => expect(api.listLinks).toHaveBeenCalledTimes(2))
    expect(onChanged).toHaveBeenCalled()
  })
})
