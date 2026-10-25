import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseAllDocuments } from 'yaml';

const chart = fileURLToPath(new URL('../agents-web', import.meta.url));

function helm(...sets) {
  const args = ['template', 'rel', chart, '--set', 'image.tag=x'];
  for (const s of sets) args.push('--set-json', s);
  return spawnSync('helm', args, { encoding: 'utf8' });
}

function render(...sets) {
  const r = helm(...sets);
  assert.equal(r.status, 0, r.stderr);
  return parseAllDocuments(r.stdout).map((d) => d.toJS()).filter(Boolean);
}

const kind = (docs, k) => docs.find((d) => d.kind === k);
const config = (docs) => JSON.parse(kind(docs, 'ConfigMap').data['config.json']);
const podOf = (docs) => kind(docs, 'Deployment').spec.template;

const orch = { id: 'orchestrator', label: 'Orchestrator', basePath: '/api/v1' };
const sched = { id: 'schedules', label: 'Schedules', basePath: '/schedules/api/v1' };

test('default config.json carries the orchestrator backend', () => {
  const docs = render();
  assert.equal(kind(docs, 'ConfigMap').metadata.name, 'rel-agents-web-config');
  assert.deepEqual(config(docs), { backends: [orch] });
});

test('two backends render in order', () => {
  assert.deepEqual(config(render(`backends=${JSON.stringify([orch, sched])}`)), { backends: [orch, sched] });
});

for (const [name, backends, re] of [
  ['missing id', [{ ...orch, id: undefined }, sched], /backends\[0\].*id/],
  ['missing label', [orch, { id: 'schedules', basePath: '/s/api/v1' }], /backends\[1\].*label/],
  ['missing basePath', [orch, { id: 'schedules', label: 'S' }], /backends\[1\].*basePath/],
  ['basePath without slash', [{ ...orch, basePath: 'api/v1' }], /backends\[0\].*basePath.*start with/],
  ['no orchestrator', [sched], /orchestrator/],
]) {
  test(`refuses ${name}`, () => {
    const r = helm(`backends=${JSON.stringify(backends)}`);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, re);
  });
}

test('deployment mounts config.json read-only by subPath', () => {
  const t = podOf(render()).spec;
  const m = t.containers[0].volumeMounts.find((v) => v.mountPath === '/usr/share/nginx/html/config.json');
  assert.equal(m.subPath, 'config.json');
  assert.equal(m.readOnly, true);
  const vol = t.volumes.find((v) => v.name === m.name);
  assert.equal(vol.configMap.name, 'rel-agents-web-config');
});

test('checksum/config changes with backends', () => {
  const a = podOf(render()).metadata.annotations['checksum/config'];
  const b = podOf(render(`backends=${JSON.stringify([orch, sched])}`)).metadata.annotations['checksum/config'];
  assert.ok(a);
  assert.notEqual(a, b);
  assert.equal(a, podOf(render()).metadata.annotations['checksum/config']);
});

test('ingress absent by default', () => {
  assert.equal(kind(render(), 'Ingress'), undefined);
});

test('ingress renders hosts, paths, tls and source-range annotations', () => {
  const ing = kind(
    render(
      'ingress=' +
        JSON.stringify({
          enabled: true,
          className: 'nginx',
          annotations: { foo: 'bar' },
          denySourceRanges: ['10.0.0.1/32', '10.0.0.2/32'],
          allowSourceRanges: ['192.168.0.0/16'],
          hosts: [{ host: 'agents.example', paths: [{ path: '/', pathType: 'Prefix' }] }],
          tls: [{ secretName: 'agents-tls', hosts: ['agents.example'] }],
        }),
    ),
    'Ingress',
  );
  assert.equal(ing.spec.ingressClassName, 'nginx');
  assert.equal(ing.metadata.annotations.foo, 'bar');
  assert.equal(ing.metadata.annotations['nginx.ingress.kubernetes.io/denylist-source-range'], '10.0.0.1/32,10.0.0.2/32');
  assert.equal(ing.metadata.annotations['nginx.ingress.kubernetes.io/whitelist-source-range'], '192.168.0.0/16');
  assert.deepEqual(ing.spec.tls, [{ secretName: 'agents-tls', hosts: ['agents.example'] }]);
  const rule = ing.spec.rules[0];
  assert.equal(rule.host, 'agents.example');
  assert.deepEqual(rule.http.paths, [
    { path: '/', pathType: 'Prefix', backend: { service: { name: 'rel-agents-web', port: { number: 8080 } } } },
  ]);
});

test('helm test pod GETs /healthz and /config.json', () => {
  const r = spawnSync('helm', ['template', 'rel', chart, '--set', 'image.tag=x', '--show-only', 'templates/tests/test-connection.yaml'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /helm.sh\/hook": test/);
  assert.match(r.stdout, /rel-agents-web:8080\/healthz/);
  assert.match(r.stdout, /rel-agents-web:8080\/config\.json/);
});

test('helm test pod is pinned, hardened and pulls with the same secrets', () => {
  const r = spawnSync(
    'helm',
    ['template', 'rel', chart, '--set', 'image.tag=x', '--set-json', 'imagePullSecrets=[{"name":"reg"}]', '--set-json', 'global={"imagePullSecrets":[{"name":"g"}]}', '--show-only', 'templates/tests/test-connection.yaml'],
    { encoding: 'utf8' },
  );
  assert.equal(r.status, 0, r.stderr);
  const p = parseAllDocuments(r.stdout)[0].toJS();
  const c = p.spec.containers[0];
  assert.equal(c.image, 'busybox:1.37.0');
  assert.deepEqual(p.spec.imagePullSecrets, [{ name: 'reg' }, { name: 'g' }]);
  assert.equal(p.spec.securityContext.runAsNonRoot, true);
  assert.equal(p.spec.securityContext.runAsUser, 65534);
  assert.equal(p.spec.securityContext.seccompProfile.type, 'RuntimeDefault');
  assert.equal(c.securityContext.allowPrivilegeEscalation, false);
  assert.equal(c.securityContext.readOnlyRootFilesystem, true);
  assert.deepEqual(c.securityContext.capabilities.drop, ['ALL']);
});
