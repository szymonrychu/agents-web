import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wf = parse(readFileSync(join(root, ".github/workflows/ci.yaml"), "utf8"));
const MAIN = "github.event_name == 'push' && github.ref == 'refs/heads/main'";
const runs = (job) => (wf.jobs[job].steps ?? []).map((s) => s.run ?? "").join("\n");
const stepsWith = (job, re) => wf.jobs[job].steps.filter((s) => re.test(s.run ?? ""));

test("triggers: push main, tags v*, pull requests", () => {
  const on = wf.on;
  assert.deepEqual(on.push.branches, ["main"]);
  assert.deepEqual(on.push.tags, ["v*"]);
  assert.ok("pull_request" in on);
});

test("exactly the five jobs", () => {
  assert.deepEqual(Object.keys(wf.jobs).sort(), ["chart", "chart-publish", "chart-publish-tag", "images", "web"]);
});

test("web job: node 24 with npm cache and the four npm scripts", () => {
  const node = wf.jobs.web.steps.find((s) => /setup-node/.test(s.uses ?? ""));
  assert.equal(String(node.with["node-version"]), "24");
  assert.equal(node.with.cache, "npm");
  const r = runs("web");
  for (const c of ["npm ci", "npm run lint", "npm test", "npm run build", "npm run check:api"]) {
    assert.ok(r.includes(c), c);
  }
});

test("images job: build, smoke, push only on main with 50MB chunks", () => {
  const r = runs("images");
  assert.ok(r.includes("docker build -t agents-web:ci ."));
  assert.ok(r.includes("bash scripts/image-smoke.sh agents-web:ci"));
  assert.ok(r.includes("--blob-chunk 52428800"));
  assert.ok(r.includes("--blob-max 52428800"));
  assert.ok(r.includes("harbor.szymonrichert.pl/containers/agents-web") || JSON.stringify(wf.jobs.images.env).includes("containers/agents-web"));
  assert.ok(r.includes("$SHORTSHA"));
  const push = wf.jobs.images.steps.find((s) => /regctl image import/.test(s.run ?? ""));
  assert.equal(push.if, MAIN);
  const login = wf.jobs.images.steps.find((s) => /registry login/.test(s.run ?? ""));
  assert.equal(login.if, MAIN);
  for (const s of wf.jobs.images.steps.filter((s) => /build|smoke/.test(s.run ?? ""))) assert.equal(s.if, undefined);
});

test("chart job: mise lint and test", () => {
  const r = runs("chart");
  assert.ok(wf.jobs.chart.steps.some((s) => /mise-action/.test(s.uses ?? "")));
  assert.ok(r.includes("mise run lint:chart"));
  assert.ok(r.includes("mise run test:chart"));
});

test("chart-publish: main only, needs chart and images, versions and pushes", () => {
  const j = wf.jobs["chart-publish"];
  assert.deepEqual([...j.needs].sort(), ["chart", "images"]);
  assert.equal(j.if, MAIN);
  const r = runs("chart-publish");
  assert.ok(r.includes('scripts/chart-version.sh branch "$GITHUB_REF_NAME" "$GITHUB_SHA"'));
  assert.ok(r.includes('helm show chart "$CHART_REPO/agents-web" --version "$VERSION"'));
  assert.ok(r.includes('helm package chart/agents-web --version "$VERSION" --app-version "$SHA7"'));
  assert.ok(r.includes('helm push "agents-web-$VERSION.tgz" "$CHART_REPO"'));
  assert.equal(j.env.CHART_REPO, "oci://harbor.szymonrichert.pl/charts");
});

test("chart-publish-tag: tags only, requires the image, versions and pushes", () => {
  const j = wf.jobs["chart-publish-tag"];
  assert.equal(j.if, "startsWith(github.ref, 'refs/tags/v')");
  const r = runs("chart-publish-tag");
  assert.ok(r.includes('scripts/chart-version.sh tag "$GITHUB_REF_NAME" "$GITHUB_SHA"'));
  assert.ok(r.includes('helm show chart "$CHART_REPO/agents-web" --version "$VERSION"'));
  assert.ok(r.includes("containers/agents-web:$SHA7"));
  assert.ok(r.includes("regctl image digest"));
  assert.ok(r.includes('helm package chart/agents-web --version "$VERSION" --app-version "$SHA7"'));
  assert.ok(r.includes('helm push "agents-web-$VERSION.tgz" "$CHART_REPO"'));
});

test("every Harbor login step is in a push-only job or guarded", () => {
  for (const [name, j] of Object.entries(wf.jobs)) {
    for (const s of j.steps.filter((s) => JSON.stringify(s).includes("secrets.HARBOR"))) {
      assert.ok(s.if === MAIN || j.if, `${name}: ${s.name}`);
    }
  }
});

const script = join(root, "scripts/chart-version.sh");
const run = (...args) => spawnSync("bash", [script, ...args], { encoding: "utf8" });
const chartVersion = execFileSync("sed", ["-n", "s/^version: *//p", join(root, "chart/agents-web/Chart.yaml")], { encoding: "utf8" }).trim();

test("chart-version.sh: main gives <version>-main.<sha7>", () => {
  const r = run("branch", "main", "0123456789abcdef");
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), `${chartVersion}-main.0123456`);
});

test("chart-version.sh: matching tag gives X.Y.Z", () => {
  const r = run("tag", `v${chartVersion}`, "0123456789abcdef");
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), chartVersion);
});

test("chart-version.sh: mismatched tag is refused", () => {
  const r = run("tag", "v9.9.9", "0123456789abcdef");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /does not match/);
});

test("chart-version.sh: other refs publish nothing", () => {
  assert.equal(run("branch", "feature", "0123456789abcdef").status, 2);
});

test("every regctl-installer use is pinned to a 40-hex commit SHA", () => {
  const uses = Object.values(wf.jobs).flatMap((j) => (j.steps ?? []).map((s) => s.uses ?? "")).filter((u) => /regctl-installer/.test(u));
  assert.ok(uses.length >= 3);
  for (const u of uses) assert.match(u, /^regclient\/actions\/regctl-installer@[0-9a-f]{40}$/);
});
