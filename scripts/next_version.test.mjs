// scripts/next_version.py, a byte-identical copy of agents-orchestrator's, run with python3.
// The cases mirror agents-orchestrator's tests/test_next_version.py by name. Every case builds a
// real temporary git repository; git output is never mocked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "next_version.py");
const env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_"))),
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.com",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

const git = (repo, ...args) => execFileSync("git", args, { cwd: repo, env, encoding: "utf8" }).trim();

const newRepo = (path = mkdtempSync(join(tmpdir(), "next-version-"))) => {
  mkdirSync(path, { recursive: true });
  git(path, "init", "-q", "-b", "main");
  return path;
};

const commit = (repo, message, tag = "") => {
  git(repo, "commit", "-q", "--allow-empty", "-m", message);
  if (tag) git(repo, "tag", tag);
  return git(repo, "rev-parse", "HEAD");
};

const next = (repo) => {
  const r = spawnSync("python3", [script], { cwd: repo, env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
};

const released = (base, ...messages) => {
  const repo = newRepo();
  commit(repo, "chore: init", base);
  for (const message of messages) commit(repo, message);
  return next(repo);
};

test("test_no_tag_gives_0_1_0", () => {
  const repo = newRepo();
  commit(repo, "feat!: drop the old api");
  commit(repo, "fix: a bug");
  assert.equal(next(repo), "0.1.0\n");
});

test("test_fix_chore_docs_bump_patch", () => {
  const messages = ["fix: a bug", "chore: deps", "docs: readme", "Merge pull request #5 from x/y"];
  assert.equal(released("v1.2.3", ...messages), "1.2.4\n");
});

test("test_feat_bumps_minor", () => {
  assert.equal(released("v1.2.3", "fix: a bug", "feat(scope): a thing"), "1.3.0\n");
});

test("test_feat_type_is_case_insensitive", () => {
  for (const subject of ["Feat: a thing", "FEAT(x): a thing"]) {
    assert.equal(released("v1.2.3", subject), "1.3.0\n", subject);
  }
});

test("test_bang_bumps_major", () => {
  for (const subject of ["feat!: a", "fix!: b", "refactor(api)!: c"]) {
    assert.equal(released("v1.2.3", "fix: a bug", subject), "2.0.0\n", subject);
  }
});

test("test_breaking_change_footer_bumps_major", () => {
  for (const message of ["fix: a\n\nBREAKING CHANGE: the api moved", "chore: b\n\nBREAKING-CHANGE: gone"]) {
    assert.equal(released("v1.2.3", message), "2.0.0\n", message);
  }
});

test("test_breaking_on_0x_bumps_major", () => {
  assert.equal(released("v0.3.1", "feat!: a"), "1.0.0\n");
});

test("test_merge_commit_branch_commits_counted", () => {
  const repo = newRepo();
  commit(repo, "chore: init", "v1.0.0");
  git(repo, "checkout", "-q", "-b", "feature");
  commit(repo, "feat: a thing");
  git(repo, "checkout", "-q", "main");
  git(repo, "merge", "-q", "--no-ff", "feature", "-m", "Merge pull request #1 from x/y");
  assert.equal(next(repo), "1.1.0\n");
});

test("test_highest_semver_tag_is_base", () => {
  const repo = newRepo();
  commit(repo, "chore: one", "v0.9.0");
  commit(repo, "chore: two", "v0.10.0");
  commit(repo, "chore: three");
  for (const name of ["v1.2", "vfoo", "v2.0.0-rc1"]) git(repo, "tag", name);
  commit(repo, "fix: a bug", "v3");
  assert.equal(next(repo), "0.10.1\n");
});

test("test_head_tagged_prints_nothing", () => {
  const repo = newRepo();
  commit(repo, "feat: a thing", "v1.0.0");
  assert.equal(next(repo), "");
});

test("test_head_contained_in_newer_tag_prints_nothing", () => {
  const repo = newRepo();
  commit(repo, "chore: init", "v1.0.0");
  const c1 = commit(repo, "fix: a bug");
  commit(repo, "feat: a thing", "v1.1.0");
  git(repo, "checkout", "-q", "--detach", c1);
  assert.equal(next(repo), "");
});
