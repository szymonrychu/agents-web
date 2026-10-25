/**
 * Nomenclature guard (design D12): the orchestrator's unit is the session. Every tracked file under the
 * guarded paths, its path included, must not name a cluster or the agent-orchestrator project, except for
 * the literal phrases below that name Kubernetes clusters. Each rename task widens GUARDED, red first.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const GUARDED = ['src/sessions', 'src/backends']

/** Kubernetes, CNPG or kind cluster phrases, never the orchestrator's unit. */
const ALLOWED = ['cluster.local', 'ClusterIP', 'clusterIP', 'ClusterIssuer', 'cluster-issuer', 'ClusterRole', 'in-cluster', 'cluster-internal', 'cluster node', 'cluster-info']

const FORBIDDEN = /cluster|agent[-_]orchestrator/i

const tracked = (...paths: string[]) => execFileSync('git', ['ls-files', '--', ...paths], { encoding: 'utf8' }).split('\n').filter(Boolean)

const offends = (text: string) => FORBIDDEN.test(ALLOWED.reduce((rest, phrase) => rest.split(phrase).join(''), text))

/** `path:line: text` for every offending line, and `path` alone for an offending file name. */
function offenders(paths: string[]): string[] {
  return tracked(...paths).flatMap((file) => [
    ...(offends(file) ? [file] : []),
    ...readFileSync(file, 'utf8').split('\n').flatMap((line, i) => (offends(line) ? [`${file}:${i + 1}: ${line.trim()}`] : [])),
  ])
}

describe('nomenclature', () => {
  test('every guarded path is tracked', () => {
    for (const path of GUARDED) expect(tracked(path), path).not.toEqual([])
  })

  test('guarded paths name the unit session only', () => {
    expect(offenders(GUARDED)).toEqual([])
  })

  test('kubernetes phrases are allowed, the unit is not', () => {
    expect(offends('svc.cluster.local and a ClusterIP')).toBe(false)
    expect(offends('New Cluster')).toBe(true)
    expect(offends('agent_orchestrator')).toBe(true)
    expect(offends('a cluster.local Cluster')).toBe(true)
  })

  test('the clusters directory is retired', () => {
    expect(tracked('src/clusters')).toEqual([])
  })
})
