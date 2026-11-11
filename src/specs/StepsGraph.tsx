import type { Step } from './api'

const label = (s: Step) => `${s.step} ${s.title}`.replace(/"/g, '#quot;').replace(/\s+/g, ' ')

/**
 * Mermaid `graph TD` text of the plan: one node per step (`s<n>`), one edge per dependency, a node written out in full
 * the first time it appears. A step without edges is still listed, in step order.
 */
export function stepsGraph(steps: Step[]): string {
  const byKey = new Map(steps.map((s) => [s.key, s]))
  const dependedOn = new Set(steps.flatMap((s) => s.deps.filter((d) => byKey.has(d))))
  const seen = new Set<string>()
  const node = (s: Step) => {
    if (seen.has(s.key)) return `s${s.step}`
    seen.add(s.key)
    return `s${s.step}["${label(s)}"]`
  }
  const lines: string[] = []
  for (const s of steps) {
    const deps = s.deps.map((d) => byKey.get(d)).filter((d): d is Step => d !== undefined)
    for (const d of deps) lines.push(`  ${node(d)} --> ${node(s)}`)
    if (deps.length === 0 && !dependedOn.has(s.key)) lines.push(`  ${node(s)}`)
  }
  return ['graph TD', ...lines].join('\n')
}
