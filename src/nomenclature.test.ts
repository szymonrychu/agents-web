/**
 * Nomenclature guard (design D12): the orchestrator's unit is the session. Every tracked file under src/, its path
 * included and this guard among them, must not name the retired unit or the retired project, except for the literal
 * phrases below: Kubernetes objects (ALLOWED) and the old names that retirement tests pin as gone (RETIRED).
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const GUARDED = ['src']

/** Kubernetes, CNPG or kind phrases, never the orchestrator's unit. */
const ALLOWED = ['cluster.local', 'ClusterIP', 'clusterIP', 'ClusterIssuer', 'cluster-issuer', 'ClusterRole', 'in-cluster', 'cluster-internal', 'cluster node', 'cluster-info']

/** Old names exactly as the retirement tests that pin them as gone spell them. */
const RETIRED = [
  "statusEventFromFrame('cluster_status', { cluster: { id: 's1' } })",
  "statusEventFromFrame('cluster_removed', { cluster_id: 's1' })",
  "!url.includes('/clusters')",
  "'src/clusters/ClusterForm.tsx'",
  "'src/clusters/ClusterForm.test.tsx'",
  "not.toContain('patchCluster')",
  "not.toContain('PatchCluster')",
  "'./ribbon/ClusterRow.tsx'",
]

const FORBIDDEN = /c[l]uster|agent[-_]orchestrator/i

/** The retired unit, spelled so that this guard does not name it. */
const unit = 'clu' + 'ster'

const tracked = (...paths: string[]) => execFileSync('git', ['ls-files', '--', ...paths], { encoding: 'utf8' }).split('\n').filter(Boolean)

const offends = (text: string) => FORBIDDEN.test([...ALLOWED, ...RETIRED].reduce((rest, phrase) => rest.split(phrase).join(''), text))

/** `path:line: text` for every offending line, and `path` alone for an offending file name. */
function offenders(paths: string[]): string[] {
  return tracked(...paths).flatMap((file) => [
    ...(offends(file) ? [file] : []),
    ...readFileSync(file, 'utf8').split('\n').flatMap((line, i) => (offends(line) ? [`${file}:${i + 1}: ${line.trim()}`] : [])),
  ])
}

describe('nomenclature', () => {
  test('the guard covers all of src, the webhooks UI included', () => {
    const guarded = tracked(...GUARDED)
    expect(guarded).toEqual(tracked('src'))
    for (const file of ['src/App.tsx', 'src/nomenclature.test.ts', 'src/chat/Composer.tsx', 'src/api/client.ts', 'src/webhooks/EventsTable.tsx', 'src/webhooks/WebhooksPage.test.tsx', 'src/api/webhooks-schema.d.ts']) {
      expect(guarded, file).toContain(file)
    }
  })

  test('guarded paths name the unit session only', () => {
    expect(offenders(GUARDED)).toEqual([])
  })

  test('kubernetes phrases and retirement pins are allowed, the unit is not', () => {
    expect(offends(`svc.${unit}.local and a ClusterIP`)).toBe(false)
    expect(offends(`New ${unit}`)).toBe(true)
    expect(offends('agent' + '_orchestrator')).toBe(true)
    expect(offends(`a ${unit}.local ${unit.toUpperCase()}`)).toBe(true)
    expect(offends(`expect(client).not.toContain('patch${unit[0].toUpperCase()}${unit.slice(1)}')`)).toBe(false)
    expect(offends(`patch${unit[0].toUpperCase()}${unit.slice(1)}(id)`)).toBe(true)
  })

  test('the retired unit directory is untracked', () => {
    expect(tracked(`src/${unit}s`)).toEqual([])
  })
})
