# agents-web

The web UI of the agents system and its only TypeScript component: a React single-page app served by nginx. It talks to backends (agents-orchestrator, later the webhook and schedule services) only through relative paths listed in `config.json`, never through a hard-coded host. Sections below: `## Development`, `## Runtime config`, `## Backends and menu`, `## URL layout`, then `## API types`, `## Image` and `## Release`.

## Development

Run `pre-commit install` once per clone to enable the gitleaks hook.

- `npm ci` installs, `npm run dev` starts Vite on `http://localhost:5173`.
- The dev server proxies the first path segment of every backend in `public/config.json` to `AGENTS_WEB_PROXY_<ID>` (the id upper-cased, `-` replaced by `_`), for example `AGENTS_WEB_PROXY_ORCHESTRATOR=http://localhost:8000 npm run dev`. Put the variables in `.env.local` to keep them.
- Terminal sockets are cross-origin in dev: list `http://localhost:5173` in the orchestrator's `ORCH_ALLOWED_ORIGINS`.
- `mise run test`, `mise run lint`, `mise run fmt`, `mise run test:chart`, `mise run lint:chart`, `mise run smoke:image`.

## Runtime config

The UI fetches `/config.json` (no-store) at start. Schema:

```json
{"backends": [{"id": "orchestrator", "label": "Orchestrator", "basePath": "/api/v1"}]}
```

Rules (enforced by `src/config/backends.ts`, a violation shows a config error screen):

- `backends` is an array and must contain id `orchestrator`.
- `id` matches `^[a-z][a-z0-9-]*$` and is unique.
- `label` is a non-empty string.
- `basePath` starts with `/`, does not end with `/` and contains none of `//`, `://`, `?`, `#` (relative paths only, so the browser stays on one origin).

Default: the image ships `public/config.json` with the orchestrator at `/api/v1`. The chart sets it from its `backends` value (rendered into a ConfigMap mounted over `/usr/share/nginx/html/config.json`); see `chart/agents-web/README.md`.

## Backends and menu

A backend appears in the settings menu through `src/backends/registry.ts`. Add its entries to `BACKEND_MENUS` under its backend id:

```ts
mybackend: [{ id: 'things', label: 'Things', order: 20, backend: 'mybackend', render: (onBack) => createElement(ThingsPage, { onBack }) }],
```

An entry is listed only when its backend id is in the runtime config; a configured id with no registered entries logs a warning. Entries sort by `order`, then label. Reserved order slots: 10 Sessions, 20 Webhooks, 30 Schedules, 40 Presets (orchestrator). To add a service: add its id and `basePath` to `config.json` (chart `backends`), register its menu entries, and add its OpenAPI document (see `## API types`).

## URL layout

All services share one host: the UI owns `/`, agents-orchestrator owns `/api`, and each later service owns exactly one prefix `/<prefix>/` with its UI-facing API at `/<prefix>/api/v1` (`webhooks` and `schedules` are reserved). The contract rule and ingress details are in `chart/agents-web/README.md` (`## URL layout`). A backend's `basePath` is its `/<prefix>/api/v1`.

## API types

The UI types are generated from a vendored copy of each backend's OpenAPI document, not from a sibling path. `openapi/<backend-id>.json` is byte-identical to the backend repo's `openapi.json` at the commit recorded in `openapi/<backend-id>.source`, a single line `<repo> <sha40>` (for the orchestrator: `agents-orchestrator <sha40>`). `src/api/schema.d.ts` is generated from `openapi/orchestrator.json` by `npm run gen:api`; `npm run check:api` fails when it drifts.

Every orchestrator route or schema change is followed by `npm run sync:api -- orchestrator` here (contract agents-web-openapi-vendor). It reads `../agents-orchestrator` unless `--from <checkout>` is given, refuses (exit 1) when that checkout's `openapi.json` has uncommitted changes, refuses an unknown backend id (exit 2), copies the document, writes the source line from `git rev-parse HEAD` and runs `gen:api`. Commit the changed `openapi/` files and `src/api/schema.d.ts` together. New backends add their id to the map in `scripts/sync-api.mjs`.

## Image

`docker build -t agents-web:smoke .` builds the UI with node (`build` stage) and serves `dist/` from `nginxinc/nginx-unprivileged` (pinned version tag, non-root, no node, port 8080). Config is `nginx/default.conf`; all nginx temp and pid paths live under `/tmp`, so the image runs with a read-only root filesystem plus a writable `/tmp`.

Serving rules (the same as the orchestrator's former SPA mount, plus `/healthz` and `/config.json`):

- Only GET and HEAD; anything else is 405 with `Allow: GET, HEAD`.
- `/healthz` returns 200 `ok`. Probes use the port number 8080, not a port name.
- `/api`, `/api/...`, `/<segment>/api` and `/<segment>/api/...` return a JSON 404 (`error.code` is `not_found`), never `index.html`.
- `/assets/...` is served with `Cache-Control: public, max-age=31536000, immutable`; a missing file is 404 with no fallback.
- `/config.json` (backends list, default `public/config.json`) is served with `Cache-Control: no-cache`; mount a file over `/usr/share/nginx/html/config.json` to override it.
- `/`, `/index.html` and every other unknown path return `index.html` with `Cache-Control: no-cache`.

Smoke test: `bash scripts/image-smoke.sh agents-web:smoke` runs the image on a free local port (read-only root, tmpfs `/tmp`), once with the default `config.json` and once with a mounted override, checks every rule above and exits 1 naming the failed case. It needs docker and curl.

## Release

CI (`.github/workflows/ci.yaml`) runs on every pull request and push to main: `web` (lint, `npm test`, `npm run test:scripts`, build, `check:api`), `images` (docker build and `scripts/image-smoke.sh`) and `chart` (`mise run lint:chart`, `mise run test:chart`).

- A push to main publishes the image `harbor.szymonrichert.pl/containers/agents-web:<sha7>` (regctl, 50 MB chunks to stay under the Cloudflare 413 limit) and the chart `oci://harbor.szymonrichert.pl/charts/agents-web` at version `<Chart.version>-main.<sha7>` (app version `<sha7>`). An already published version is refused. Only main publishes a chart.
- Every green push to main then ends with the `release` job, which needs every other job of the run. `scripts/next_version.py` (a byte-identical copy of agents-orchestrator's, tested by `scripts/next_version.test.mjs`) computes the version from the conventional commits since the last `vX.Y.Z` git tag (every commit, branch commits behind merge commits included): a `type!:` subject or a `BREAKING CHANGE:` footer bumps major (also on 0.x), `feat` bumps minor, anything else bumps patch. With no `vX.Y.Z` tag yet the first release is `0.1.0`.
- The job copies `harbor.szymonrichert.pl/containers/agents-web:<sha7>` to the tags `X.Y.Z`, `X.Y` and `X` with `regctl image copy` (manifest only, no layer upload), then pushes git tag `vX.Y.Z` with the job token. When `HEAD` is already in a `vX.Y.Z` tag (a re-run, or a newer commit already released) it skips everything after the version step. Release jobs run one at a time (concurrency group `release`); retry a failed one with "Re-run failed jobs".
- agents-helmfile must pin `X.Y.Z`, never `<sha7>`: Harbor retention prunes `<sha7>` tags within hours, semver tags survive it.
- Required repo secrets: `HARBOR_USERNAME` and `HARBOR_PASSWORD` (a Harbor robot account with push rights to `containers` and `charts`). Set with `gh secret set HARBOR_USERNAME -R szymonrychu/agents-web`.
