# agents-web

Part of the agents-web-component-create-agents-web-repo project (typescript).

## API types

The UI types are generated from a vendored copy of each backend's OpenAPI document, not from a sibling path. `openapi/<backend-id>.json` is byte-identical to the backend repo's `openapi.json` at the commit recorded in `openapi/<backend-id>.source`, a single line `<repo> <sha40>` (for the orchestrator: `agent-orchestrator <sha40>`). `src/api/schema.d.ts` is generated from `openapi/orchestrator.json` by `npm run gen:api`; `npm run check:api` fails when it drifts.

Every orchestrator route or schema change is followed by `npm run sync:api -- orchestrator` here (contract agents-web-openapi-vendor). It reads `../agent-orchestrator` unless `--from <checkout>` is given, refuses (exit 1) when that checkout's `openapi.json` has uncommitted changes, refuses an unknown backend id (exit 2), copies the document, writes the source line from `git rev-parse HEAD` and runs `gen:api`. Commit the changed `openapi/` files and `src/api/schema.d.ts` together. New backends add their id to the map in `scripts/sync-api.mjs`.

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

CI (`.github/workflows/ci.yaml`) runs on every pull request, push to main and `v*` tag: `web` (lint, test, build, `check:api`), `images` (docker build and `scripts/image-smoke.sh`) and `chart` (`mise run lint:chart`, `mise run test:chart`).

- A push to main publishes the image `harbor.szymonrichert.pl/containers/agents-web:<sha7>` (regctl, 50 MB chunks to stay under the Cloudflare 413 limit) and the chart `oci://harbor.szymonrichert.pl/charts/agents-web` at version `<Chart.version>-main.<sha7>` (app version `<sha7>`). An already published version is refused.
- A tag `vX.Y.Z` publishes the chart at `X.Y.Z`. The tag must equal `version` in `chart/agents-web/Chart.yaml` and the image for that commit's `<sha7>` must already exist in Harbor, so tag a commit main CI has built.
- Required repo secrets: `HARBOR_USERNAME` and `HARBOR_PASSWORD` (a Harbor robot account with push rights to `containers` and `charts`). Set with `gh secret set HARBOR_USERNAME -R szymonrychu/agents-web`.
