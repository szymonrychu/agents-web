/**
 * Phone smoke of every admin screen at 375px in WebKit, against the mocked backends of fixtures.ts. jsdom cannot
 * measure layout, so this is where horizontal overflow, Switch geometry and a clipped first card are caught.
 */
import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './mockApi'

const WIDTH = 375

interface Screen {
  name: string
  /** Menu label under Settings, or a URL for the routed pages. */
  open: { menu: string } | { url: string }
  /** Extra steps after opening (History needs a search to list anything). */
  then?: (page: Page) => Promise<void>
  /** The screen has no card list: wait for this text instead of the first article. */
  readyText?: string
  /** Switches in both states are expected on this screen. */
  bothSwitchStates?: boolean
}

const SCREENS: Screen[] = [
  { name: 'Sessions', open: { menu: 'Sessions' } },
  { name: 'Schedules', open: { menu: 'Schedules' }, bothSwitchStates: true },
  { name: 'Backups', open: { menu: 'Backups' }, bothSwitchStates: true },
  { name: 'Projects', open: { menu: 'Projects' } },
  { name: 'Proposals', open: { menu: 'Proposals' } },
  { name: 'Webhooks', open: { menu: 'Webhooks' } },
  { name: 'Chats', open: { menu: 'Chats' } },
  { name: 'History', open: { menu: 'History' }, then: (page) => page.getByRole('button', { name: 'Search' }).click() },
  { name: 'Devices', open: { menu: 'Devices' } },
  { name: 'Vault', open: { menu: 'Vault' } },
  { name: 'Usage', open: { menu: 'Usage' }, readyText: 'No usage history in this range' },
  { name: 'Tasks', open: { url: '/tasks' } },
  { name: 'Specs', open: { url: '/specs' } },
]

let unmatched: string[] = []

test.beforeEach(async ({ page }) => {
  unmatched = await mockApi(page)
})

async function openScreen(page: Page, screen: Screen) {
  if ('url' in screen.open) {
    await page.goto(screen.open.url)
  } else {
    await page.goto('/')
    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.getByRole('region', { name: 'Settings' }).getByRole('button', { name: screen.open.menu, exact: true }).click()
  }
  await screen.then?.(page)
  if (screen.readyText) await expect(page.getByText(screen.readyText)).toBeVisible()
  else await expect(page.locator('article').first()).toBeVisible()
}

interface Layout {
  documentScrollWidth: number
  mainOverflow: number | null
  scrollerOverflow: number | null
  tables: number
  switches: { insideRoot: boolean; trackVisible: boolean; checked: boolean }[]
  article: { hasHeader: boolean; belowHeader: boolean; inScroller: boolean } | null
  coarse: boolean
}

/** Everything measured in one page.evaluate so the numbers belong to the same frame. */
function measure(): Layout {
  const box = (e: Element) => e.getBoundingClientRect()
  const visible = (e: Element) => box(e).width > 0 && box(e).height > 0
  const main = document.querySelector('main')
  const first = document.querySelector('article')
  const scrollerOf = (e: Element): Element => {
    for (let p = e.parentElement; p; p = p.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p
    }
    return main ?? document.documentElement
  }
  const scroller = first ? scrollerOf(first) : null
  const overflow = (e: Element | null) => (e ? e.scrollWidth - e.clientWidth : null)
  const switches = [...document.querySelectorAll('.MuiSwitch-root')].filter(visible).map((root) => {
    const r = box(root)
    const t = root.querySelector('.MuiSwitch-thumb')
    const k = root.querySelector('.MuiSwitch-track')
    const tb = t ? box(t) : null
    const kb = k ? box(k) : null
    const tol = 1
    return {
      insideRoot: tb !== null && tb.left >= r.left - tol && tb.right <= r.right + tol && tb.top >= r.top - tol && tb.bottom <= r.bottom + tol,
      trackVisible: kb !== null && kb.width > 0 && kb.height > 0,
      checked: root.querySelector('.Mui-checked') !== null,
    }
  })
  let article: Layout['article'] = null
  if (first && scroller) {
    const h1 = main?.querySelector('h1') ?? document.querySelector('h1')
    const header = h1?.parentElement ?? null
    const c = box(scroller)
    const side = (r: DOMRect) => r.left >= -1 && r.right <= window.innerWidth + 1
    // Top and sides are checked at the initial scroll position: a card cut at the top by the header or the sides by
    // the scroller is clipped whatever the scroll offset. Content above the card (settings, filters) may legitimately
    // push it below the fold, so the bottom is checked after scrolling the card's top to the scroller's top, which
    // also catches a scroller whose padding or height leaves the end of the card unreachable.
    const before = box(first)
    const topOk = before.top >= c.top - 1 && side(before)
    scroller.scrollTop += before.top - c.top
    const a = box(first)
    const fits = a.height <= c.height
    const inScroller = topOk && a.top >= c.top - 1 && (!fits || a.bottom <= c.bottom + 1) && side(a)
    const belowHeader = header !== null && before.top >= box(header).bottom - 1
    article = { hasHeader: header !== null, belowHeader, inScroller }
  }
  return {
    documentScrollWidth: document.documentElement.scrollWidth,
    mainOverflow: overflow(main),
    scrollerOverflow: overflow(scroller),
    tables: document.querySelectorAll('table').length,
    switches,
    article,
    coarse: matchMedia('(pointer: coarse)').matches,
  }
}

for (const screen of SCREENS) {
  test(`${screen.name} at 375px`, async ({ page }) => {
    await openScreen(page, screen)
    const m = await page.evaluate(measure)

    expect(m.documentScrollWidth).toBeLessThanOrEqual(WIDTH)
    if (m.mainOverflow !== null) expect(m.mainOverflow).toBeLessThanOrEqual(0)
    if (m.scrollerOverflow !== null) expect(m.scrollerOverflow).toBeLessThanOrEqual(0)
    expect(m.tables).toBe(0)
    expect(m.coarse, 'WebKit emulates a coarse pointer (hasTouch), else Switch checks are vacuous').toBe(true)

    for (const s of m.switches) {
      expect(s.insideRoot, 'switch thumb inside its root').toBe(true)
      expect(s.trackVisible, 'switch track has a size').toBe(true)
    }
    if (screen.bothSwitchStates) {
      expect(m.switches.some((s) => s.checked), 'a checked switch').toBe(true)
      expect(m.switches.some((s) => !s.checked), 'an unchecked switch').toBe(true)
    }

    if (m.article) {
      expect(m.article.hasHeader, 'screen has an h1 page header').toBe(true)
      expect(m.article.belowHeader, 'first card starts below the page header').toBe(true)
      expect(m.article.inScroller, 'first card is not clipped by its scroll container').toBe(true)
    }
    expect(unmatched, `requests without a fixture:\n${unmatched.join('\n')}`).toEqual([])
  })
}

test('Backups cleanup fields keep their labels', async ({ page }) => {
  await openScreen(page, SCREENS.find((s) => s.name === 'Backups')!)
  const region = page.getByRole('region', { name: 'Cleanup settings' })
  await expect(region.getByLabel('Retention')).toBeVisible()
  const labels = await region.locator('.MuiInputLabel-root').evaluateAll((els) =>
    els.map((e) => ({ text: e.textContent ?? '', overflow: e.scrollWidth - e.clientWidth })),
  )
  expect(labels.length).toBeGreaterThanOrEqual(4)
  for (const l of labels) expect(l.overflow, `label "${l.text}" is ellipsized`).toBeLessThanOrEqual(0)
})
