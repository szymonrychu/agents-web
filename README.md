# agents-web

Part of the agents-web-component-create-agents-web-repo project (typescript).

## API types

The UI types are generated from a vendored copy of each backend's OpenAPI document, not from a sibling path. `openapi/<backend-id>.json` is byte-identical to the backend repo's `openapi.json` at the commit recorded in `openapi/<backend-id>.source`, a single line `<repo> <sha40>` (for the orchestrator: `agent-orchestrator <sha40>`). `src/api/schema.d.ts` is generated from `openapi/orchestrator.json` by `npm run gen:api`; `npm run check:api` fails when it drifts.

Every orchestrator route or schema change is followed by `npm run sync:api -- orchestrator` here (contract agents-web-openapi-vendor). It reads `../agent-orchestrator` unless `--from <checkout>` is given, refuses (exit 1) when that checkout's `openapi.json` has uncommitted changes, refuses an unknown backend id (exit 2), copies the document, writes the source line from `git rev-parse HEAD` and runs `gen:api`. Commit the changed `openapi/` files and `src/api/schema.d.ts` together. New backends add their id to the map in `scripts/sync-api.mjs`.
