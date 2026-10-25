#!/usr/bin/env node
// Vendor a backend's openapi.json into openapi/<id>.json and regenerate the types.
// Usage: npm run sync:api -- <backend-id> [--from <checkout>]
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// backend id -> repo name and default sibling checkout. Fixed map only.
const BACKENDS = {
  orchestrator: { repo: "agents-orchestrator", sibling: "../agents-orchestrator" },
  webhooks: { repo: "agents-webhook", sibling: "../agents-webhook" },
  schedules: { repo: "agents-schedule", sibling: "../agents-schedule" },
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const id = args[0];
const fromIdx = args.indexOf("--from");
const from = fromIdx >= 0 ? args[fromIdx + 1] : undefined;

if (!id || !Object.hasOwn(BACKENDS, id)) {
  console.error(`unknown backend id: ${id ?? "(none)"}; known: ${Object.keys(BACKENDS).join(", ")}`);
  process.exit(2);
}
if (fromIdx >= 0 && !from) {
  console.error("--from needs a checkout path");
  process.exit(2);
}

const { repo, sibling } = BACKENDS[id];
const checkout = resolve(from ?? join(root, sibling));
const doc = join(checkout, "openapi.json");
const git = (...a) => execFileSync("git", ["-C", checkout, ...a], { encoding: "utf8" });

if (git("status", "--porcelain", "--", "openapi.json").trim() !== "") {
  console.error(`refusing: ${doc} has uncommitted changes`);
  process.exit(1);
}

const sha = git("rev-parse", "HEAD").trim();
copyFileSync(doc, join(root, "openapi", `${id}.json`));
writeFileSync(join(root, "openapi", `${id}.source`), `${repo} ${sha}\n`);

const gen = spawnSync("npm", ["run", "gen:api"], { cwd: root, stdio: "inherit" });
process.exit(gen.status ?? 1);
