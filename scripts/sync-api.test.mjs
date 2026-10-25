import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, "sync-api.mjs");
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function makeSource(doc, dir = mkdtempSync(join(tmpdir(), "sync-src-"))) {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t");
  git(dir, "config", "user.name", "t");
  writeFileSync(join(dir, "openapi.json"), doc);
  git(dir, "add", "openapi.json");
  git(dir, "commit", "-qm", "init");
  return dir;
}

// A scratch copy of the project layout so the real vendored files are untouched.
function makeProject(dir = mkdtempSync(join(tmpdir(), "sync-proj-"))) {
  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "openapi"));
  cpSync(script, join(dir, "scripts", "sync-api.mjs"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { "gen:api": "node -e \"require('fs').writeFileSync('gen.ran','1')\"" } }));
  return dir;
}

const run = (proj, ...args) =>
  spawnSync("node", [join(proj, "scripts", "sync-api.mjs"), ...args], { cwd: proj, encoding: "utf8" });

test("copies the document, records the agents-orchestrator commit and runs gen:api", () => {
  const doc = '{"openapi":"3.1.0","paths":{}}\n';
  const src = makeSource(doc);
  const proj = makeProject();
  const r = run(proj, "orchestrator", "--from", src);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(proj, "openapi/orchestrator.json"), "utf8"), doc);
  assert.equal(readFileSync(join(proj, "openapi/orchestrator.source"), "utf8"), `agents-orchestrator ${git(src, "rev-parse", "HEAD")}\n`);
  assert.equal(readFileSync(join(proj, "gen.ran"), "utf8"), "1");
});

test("reads the orchestrator from the sibling agents-orchestrator checkout by default", () => {
  const doc = '{"openapi":"3.1.0","paths":{"/api/v1/sessions":{}}}\n';
  const parent = mkdtempSync(join(tmpdir(), "sync-parent-"));
  const src = makeSource(doc, join(parent, "agents-orchestrator"));
  const proj = makeProject(join(parent, "agents-web"));
  const r = run(proj, "orchestrator");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(proj, "openapi/orchestrator.json"), "utf8"), doc);
  assert.equal(readFileSync(join(proj, "openapi/orchestrator.source"), "utf8"), `agents-orchestrator ${git(src, "rev-parse", "HEAD")}\n`);
});

test("refuses a dirty source with exit 1 naming the path", () => {
  const src = makeSource("{}\n");
  writeFileSync(join(src, "openapi.json"), '{"changed":true}\n');
  const proj = makeProject();
  const r = run(proj, "orchestrator", "--from", src);
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes(join(src, "openapi.json")), r.stderr);
});

test("refuses an unknown backend id with exit 2", () => {
  const src = makeSource("{}\n");
  const proj = makeProject();
  const r = run(proj, "nope", "--from", src);
  assert.equal(r.status, 2);
});

test("knows the webhooks backend and records agents-webhook", () => {
  const doc = '{"openapi":"3.1.0","paths":{}}\n';
  const src = makeSource(doc);
  const proj = makeProject();
  const r = run(proj, "webhooks", "--from", src);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(proj, "openapi/webhooks.json"), "utf8"), doc);
  assert.equal(readFileSync(join(proj, "openapi/webhooks.source"), "utf8"), `agents-webhook ${git(src, "rev-parse", "HEAD")}\n`);
});
