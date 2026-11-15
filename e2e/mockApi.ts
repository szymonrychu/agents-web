/** Installs the mocked backends on a page: /config.json, fixtures by method and path, SSE streams, 404 for the rest. */
import type { Page, Route } from '@playwright/test'
import { BASES, routes } from './fixtures'

const bases = Object.values(BASES)

const underBase = (path: string) => bases.some((b) => path === b || path.startsWith(`${b}/`))

const config = {
  backends: Object.entries(BASES).map(([id, basePath]) => ({ id, label: id, basePath })),
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

/** Returns a live array of the requests no fixture answered ("METHOD path"); the caller asserts it stays empty. */
export async function mockApi(page: Page): Promise<string[]> {
  const unmatched: string[] = []
  await page.route(
    (url) => url.pathname === '/config.json' || underBase(url.pathname),
    async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.pathname === '/config.json') return json(route, 200, config)
      // EventSource streams: an open, empty stream (the app reconnects on its own backoff).
      if (url.pathname.endsWith('/stream')) {
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': ok\n\n' })
      }
      const hit = routes.find((r) => r.method === request.method() && (typeof r.path === 'string' ? r.path === url.pathname : r.path.test(url.pathname)))
      if (!hit) {
        unmatched.push(`${request.method()} ${url.pathname}${url.search}`)
        return json(route, 404, { error: { code: 'not_found', message: 'no fixture' } })
      }
      return json(route, 200, typeof hit.body === 'function' ? hit.body(url) : hit.body)
    },
  )
  return unmatched
}
