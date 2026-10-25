#!/usr/bin/env bash
# Smoke test for the agents-web image: serving rules, default and overridden config.json.
# Usage: scripts/image-smoke.sh <image>
set -euo pipefail

image="${1:?usage: image-smoke.sh <image>}"
tmp="$(mktemp -d)"
containers=()
current="setup"

cleanup() {
  local c
  for c in "${containers[@]:-}"; do
    [ -n "$c" ] && docker rm -f "$c" >/dev/null 2>&1 || true
  done
  rm -rf "$tmp"
}
trap cleanup EXIT

fail() {
  echo "FAIL [$current]: $*" >&2
  exit 1
}

# start_container <name> [extra docker args...]; sets $base to http://127.0.0.1:<port>
start_container() {
  local name="$1" id port i
  shift
  id="$(docker run -d --rm --read-only --tmpfs /tmp -p 127.0.0.1::8080 "$@" "$image")" || fail "docker run failed"
  containers+=("$id")
  port="$(docker port "$id" 8080/tcp | head -n1 | sed 's/.*://')"
  [ -n "$port" ] || fail "no mapped port for $name"
  base="http://127.0.0.1:${port}"
  for i in $(seq 1 30); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$base/healthz" || true)" = "200" ]; then
      return 0
    fi
    sleep 1
  done
  fail "$name did not become healthy within 30s"
}

# req <curl args...>: writes headers to $tmp/h and body to $tmp/b, prints status code
req() {
  curl -s --max-time 5 -D "$tmp/h" -o "$tmp/b" -w '%{http_code}' "$@"
}

header() { # header <name>: value of a response header, lowercase match
  { grep -i "^$1:" "$tmp/h" || true; } | head -n1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'
}

expect_status() { # expect_status <want> <curl args...>
  local want="$1" got
  shift
  got="$(req "$@")"
  [ "$got" = "$want" ] || fail "$* -> status $got, want $want"
}

expect_header() { # expect_header <name> <want>
  local got
  got="$(header "$1")"
  [ "$got" = "$2" ] || fail "header $1 is '$got', want '$2'"
}

expect_body_has() {
  grep -q "$1" "$tmp/b" || fail "body lacks '$1'"
}

immutable="public, max-age=31536000, immutable"

# Default config.json
current="default config"
start_container default

current="index no-cache, assets immutable"
expect_status 200 "$base/"
expect_body_has "<html"
expect_header cache-control "no-cache"
expect_status 200 "$base/index.html"
expect_header cache-control "no-cache"
asset="$(docker exec "${containers[0]}" sh -c 'ls /usr/share/nginx/html/assets | head -n1')"
[ -n "$asset" ] || fail "image has no files under /assets"
expect_status 200 "$base/assets/$asset"
expect_header cache-control "$immutable"

current="client route fallback"
expect_status 200 "$base/sessions/abc/agents/1"
expect_body_has "<html"
expect_header cache-control "no-cache"
expect_status 404 "$base/assets/missing.js"

current="unknown api path is json 404"
for p in /api /api/v1/nope /orchestrator/api /orchestrator/api/v1/nope; do
  expect_status 404 "$base$p"
  header content-type | grep -q '^application/json' || fail "$p content-type is not json"
  expect_body_has '"code"[ ]*:[ ]*"not_found"'
done
expect_status 404 -I "$base/api/v1/unknown"

current="healthz"
expect_status 200 "$base/healthz"
expect_body_has "ok"

current="methods"
expect_status 405 -X PATCH -H 'Content-Type: application/json' -d '{}' "$base/api/v1/sessions/1"
expect_header allow "GET, HEAD"
expect_status 405 -X POST -d '{}' "$base/api/v1/nope"
expect_status 405 -X POST -d '{}' "$base/"
expect_header allow "GET, HEAD"
expect_status 200 -I "$base/"

current="default config.json"
expect_status 200 "$base/config.json"
expect_header cache-control "no-cache"
expect_body_has '"orchestrator"'

current="server tokens off"
expect_status 200 "$base/"
header server | grep -q '[0-9]' && fail "server header leaks a version"

# Mounted override
current="override config.json"
cat >"$tmp/config.json" <<'JSON'
{"backends": [{"id": "override-backend", "label": "Override", "basePath": "/other/v9"}]}
JSON
chmod 644 "$tmp/config.json"
start_container override -v "$tmp/config.json:/usr/share/nginx/html/config.json:ro"
expect_status 200 "$base/config.json"
expect_header cache-control "no-cache"
expect_body_has '"override-backend"'
grep -q '"orchestrator"' "$tmp/b" && fail "override still lists default backend"


echo "OK: all image smoke cases passed"
