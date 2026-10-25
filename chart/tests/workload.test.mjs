import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseAllDocuments } from 'yaml';

const chart = fileURLToPath(new URL('../agents-web', import.meta.url));

function helm(...sets) {
  const args = ['template', 'rel', chart];
  for (const s of sets) args.push('--set-json', s);
  return spawnSync('helm', args, { encoding: 'utf8' });
}

function render(...sets) {
  const r = helm('image={"tag":"x"}', ...sets);
  assert.equal(r.status, 0, r.stderr);
  return parseAllDocuments(r.stdout).map((d) => d.toJS()).filter(Boolean);
}

const kind = (docs, k) => docs.find((d) => d.kind === k);
const pod = (docs) => kind(docs, 'Deployment').spec.template.spec;

test('render fails without image.tag and names it', () => {
  const r = spawnSync('helm', ['template', 'rel', chart], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /image\.tag/);
});

test('deployment uses the image and the named 8080 port', () => {
  const c = pod(render()).containers;
  assert.equal(c.length, 1);
  assert.equal(c[0].name, 'web');
  assert.equal(c[0].image, 'harbor.szymonrichert.pl/containers/agents-web:x');
  assert.deepEqual(c[0].ports.map((p) => [p.name, p.containerPort]), [['http', 8080]]);
});

test('probes are httpGet /healthz on numeric port 8080', () => {
  const c = pod(render()).containers[0];
  for (const p of [c.livenessProbe, c.readinessProbe]) {
    assert.equal(p.httpGet.path, '/healthz');
    assert.strictEqual(p.httpGet.port, 8080);
  }
});

test('hardened: non-root, read-only root, /tmp writable', () => {
  const p = pod(render());
  assert.equal(p.securityContext.runAsNonRoot, true);
  const sc = p.containers[0].securityContext;
  assert.equal(sc.allowPrivilegeEscalation, false);
  assert.deepEqual(sc.capabilities.drop, ['ALL']);
  assert.equal(sc.readOnlyRootFilesystem, true);
  assert.ok(p.containers[0].volumeMounts.some((m) => m.mountPath === '/tmp'));
  const vol = p.volumes.find((v) => v.name === p.containers[0].volumeMounts.find((m) => m.mountPath === '/tmp').name);
  assert.deepEqual(vol.emptyDir, {});
});

test('pod annotations pass through', () => {
  const d = kind(render('podAnnotations={"a/b":"c"}'), 'Deployment');
  assert.equal(d.spec.template.metadata.annotations['a/b'], 'c');
});

test('service targets the named http port', () => {
  const s = kind(render(), 'Service');
  assert.equal(s.spec.type, 'ClusterIP');
  assert.equal(s.spec.ports[0].port, 8080);
  assert.equal(s.spec.ports[0].targetPort, 'http');
  const d = kind(render(), 'Deployment');
  assert.deepEqual(s.spec.selector, d.spec.selector.matchLabels);
});

test('imagePullSecrets from values and from global', () => {
  assert.deepEqual(pod(render('imagePullSecrets=[{"name":"a"}]')).imagePullSecrets, [{ name: 'a' }]);
  assert.deepEqual(pod(render('global={"imagePullSecrets":[{"name":"g"}]}')).imagePullSecrets, [{ name: 'g' }]);
  const both = pod(render('imagePullSecrets=[{"name":"a"}]', 'global={"imagePullSecrets":[{"name":"g"}]}')).imagePullSecrets;
  assert.deepEqual(both.map((s) => s.name).sort(), ['a', 'g']);
});
