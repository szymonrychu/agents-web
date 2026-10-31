import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";
import { parse } from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wf = parse(readFileSync(join(root, ".github/workflows/ci.yaml"), "utf8"));
const MAIN = "github.event_name == 'push' && github.ref == 'refs/heads/main'";
const runs = (job) => (wf.jobs[job].steps ?? []).map((s) => s.run ?? "").join("\n");
const stepsWith = (job, re) => wf.jobs[job].steps.filter((s) => re.test(s.run ?? ""));

test("triggers: push main and pull requests, no tags", () => {
  const on = wf.on;
  assert.deepEqual(on.push, { branches: ["main"] });
  assert.ok("pull_request" in on);
});

test("exactly the five jobs", () => {
  assert.deepEqual(Object.keys(wf.jobs).sort(), ["chart", "chart-publish", "images", "release", "web"]);
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

test("test_scripts_tests_are_wired", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.scripts["test:scripts"], "node --test 'scripts/*.test.mjs'");
  assert.equal(pkg.scripts.test, "vitest run");
  const webRuns = wf.jobs.web.steps.map((s) => s.run ?? "");
  const vitest = webRuns.indexOf("npm test");
  assert.ok(vitest >= 0);
  assert.equal(webRuns[vitest + 1], "npm run test:scripts");
  const mise = parseToml(readFileSync(join(root, ".mise.toml"), "utf8"));
  assert.deepEqual(mise.tasks.test.run, ["npm test", "npm run test:scripts"]);
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

test("images job needs web", () => {
  assert.deepEqual([wf.jobs.images.needs].flat(), ["web"]);
});

test("chart-publish: main only, needs chart, images and web, versions and pushes", () => {
  const j = wf.jobs["chart-publish"];
  assert.deepEqual([...j.needs].sort(), ["chart", "images", "web"]);
  assert.equal(j.if, MAIN);
  const r = runs("chart-publish");
  assert.ok(r.includes('scripts/chart-version.sh branch "$GITHUB_REF_NAME" "$GITHUB_SHA"'));
  assert.ok(r.includes('helm show chart "$CHART_REPO/agents-web" --version "$VERSION"'));
  assert.ok(r.includes('helm package chart/agents-web --version "$VERSION" --app-version "$SHA7"'));
  assert.ok(r.includes('helm push "agents-web-$VERSION.tgz" "$CHART_REPO"'));
  assert.equal(j.env.CHART_REPO, "oci://harbor.szymonrichert.pl/charts");
});

test("workflow token is read-only at the top level, only release may push tags", () => {
  assert.deepEqual(wf.permissions, { contents: "read" });
  for (const [name, j] of Object.entries(wf.jobs)) {
    if (name === "release") continue;
    assert.equal(j.permissions, undefined, `${name} must not raise permissions`);
  }
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

test("chart-version.sh: tag refs publish nothing", () => {
  for (const ref of [`v${chartVersion}`, "v9.9.9"]) {
    const r = run("tag", ref, "0123456789abcdef");
    assert.equal(r.status, 2, ref);
    assert.equal(r.stdout, "", ref);
  }
});

test("chart-version.sh: other refs publish nothing", () => {
  assert.equal(run("branch", "feature", "0123456789abcdef").status, 2);
});

test("every regctl-installer use is pinned to a 40-hex commit SHA", () => {
  const uses = Object.values(wf.jobs).flatMap((j) => (j.steps ?? []).map((s) => s.uses ?? "")).filter((u) => /regctl-installer/.test(u));
  assert.ok(uses.length >= 3);
  for (const u of uses) assert.match(u, /^regclient\/actions\/regctl-installer@[0-9a-f]{40}$/);
});

const RELEASED = "steps.version.outputs.version != ''";
const release = () => wf.jobs.release;
const copySteps = (steps) => steps.flatMap((s, i) => (/regctl image copy/.test(s.run ?? "") ? [i] : []));

test("test_release_job_runs_last_on_main_push", () => {
  const j = release();
  assert.equal(j.if, MAIN);
  const others = Object.keys(wf.jobs).filter((n) => n !== "release").sort();
  assert.deepEqual([...j.needs].sort(), others);
  assert.deepEqual([...j.needs].sort(), ["chart", "chart-publish", "images", "web"]);
  assert.deepEqual(j.permissions, { contents: "write" });
  assert.deepEqual(j.concurrency, { group: "release", "cancel-in-progress": false });
});

test("test_release_job_fetches_full_history_and_tags", () => {
  const checkout = release().steps[0];
  assert.match(checkout.uses, /^actions\/checkout@/);
  assert.equal(checkout.with["fetch-depth"], 0);
  assert.equal(checkout.with["fetch-tags"], true);
});

test("test_release_job_computes_version_with_script", () => {
  const steps = release().steps;
  const version = steps.findIndex((s) => s.id === "version");
  assert.ok(version >= 0);
  assert.equal(steps[version].run, 'echo "version=$(python3 scripts/next_version.py)" >> "$GITHUB_OUTPUT"');
  const later = steps.slice(version + 1);
  assert.ok(later.length > 0);
  for (const s of later) assert.equal(s.if, RELEASED, JSON.stringify(s));
});

test("test_release_job_retags_manifest_only", () => {
  const j = release();
  assert.equal(j.env.IMAGE, "harbor.szymonrichert.pl/containers/agents-web");
  assert.equal(j.env.HARBOR_URL, "harbor.szymonrichert.pl");
  const copies = j.steps
    .flatMap((s) => (s.run ?? "").split("\n"))
    .filter((l) => l.includes("regctl image copy"))
    .map((l) => l.trim());
  assert.deepEqual(copies, [
    'regctl image copy "$IMAGE:$SHORTSHA" "$IMAGE:$VERSION"',
    'regctl image copy "$IMAGE:$SHORTSHA" "$IMAGE:$VERSION_MINOR"',
    'regctl image copy "$IMAGE:$SHORTSHA" "$IMAGE:$VERSION_MAJOR"',
  ]);
  const tag = j.steps[copySteps(j.steps)[0]].run;
  for (const line of ['SHORTSHA="${GITHUB_SHA::7}"', 'VERSION_MINOR="${VERSION%.*}"', 'VERSION_MAJOR="${VERSION%%.*}"']) {
    assert.ok(tag.includes(line), line);
  }
  const installers = j.steps.map((s) => s.uses ?? "").filter((u) => /regctl-installer/.test(u));
  assert.equal(installers.length, 1);
  assert.match(installers[0], /^regclient\/actions\/regctl-installer@[0-9a-f]{40}$/);
  const logins = j.steps.filter((s) => /regctl registry login/.test(s.run ?? ""));
  assert.equal(logins.length, 1);
  assert.deepEqual(logins[0].env, {
    HARBOR_USERNAME: "${{ secrets.HARBOR_USERNAME }}",
    HARBOR_PASSWORD: "${{ secrets.HARBOR_PASSWORD }}",
  });
  const text = JSON.stringify(j);
  for (const banned of ["docker", "regctl image import", "--blob-chunk"]) assert.ok(!text.includes(banned), banned);
});

test("test_release_job_pushes_git_tag_last", () => {
  const steps = release().steps;
  const last = steps.at(-1);
  assert.deepEqual(
    last.run.trim().split("\n").map((l) => l.trim()),
    ['git tag "v$VERSION" "$GITHUB_SHA"', 'git push origin "refs/tags/v$VERSION"'],
  );
  assert.ok(Math.max(...copySteps(steps)) < steps.length - 1);
  assert.equal(last.env.VERSION, "${{ steps.version.outputs.version }}");
  for (const s of steps) assert.doesNotMatch(s.run ?? "", /(^|\s)(--force|-f)(\s|$)/);
  assert.ok(!readFileSync(join(root, ".github/workflows/ci.yaml"), "utf8").includes("secrets.GITHUB_TOKEN"));
});

test("test_no_tag_trigger_or_tag_publish_job", () => {
  assert.equal(wf.on.push.tags, undefined);
  assert.equal(wf.jobs["chart-publish-tag"], undefined);
  assert.ok(!readFileSync(join(root, ".github/workflows/ci.yaml"), "utf8").includes("startsWith(github.ref, 'refs/tags"));
});
