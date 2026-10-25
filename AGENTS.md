# agents-web

Component `agents-web` (typescript) of the agents system. Its own tests, `MEMORY.md` and `ROADMAP.md` live here.

## Commands

- `mise run test`, `mise run lint`, `mise run fmt` from this directory.
- `mise run test:chart`, `mise run lint:chart` for the helm chart.
- `mise run smoke:image` builds the image and runs `scripts/image-smoke.sh`.
- `npm run sync:api -- orchestrator` after every orchestrator route or schema change (vendors `openapi/orchestrator.json`, regenerates `src/api/schema.d.ts`).

## Rule

The UI calls backends only through relative paths from `config.json` (`basePath` per backend). Never hard-code a host, port or absolute URL.
