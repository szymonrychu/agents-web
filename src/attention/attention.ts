/** Sessions that need the user: open task decisions they asked, or an agent prompt waiting. Pure helpers. */
import { awaitingPrompt } from '../ribbon/sessionStatus'
import type { SessionEntry } from '../ribbon/useSessions'
import type { Decision, Task } from '../tasks/api'

export interface SessionAttention {
  /** Open decisions this session asked, across `tasks`. */
  decisions: number
  /** Tasks holding at least one of those decisions, in input order. */
  tasks: Task[]
  /** An agent waits on a permission prompt or a dialog. */
  prompt: boolean
}

export interface OpenDecisions {
  decisions: number
  tasks: Task[]
}

/** Open decisions counted per asking session; each task is listed once per session, in input order. */
export function groupOpenDecisions(tasks: readonly Task[]): Map<string, OpenDecisions> {
  const out = new Map<string, OpenDecisions>()
  for (const task of tasks) {
    for (const d of task.decisions) {
      if (d.status !== 'open') continue
      const group = out.get(d.asking_session) ?? { decisions: 0, tasks: [] }
      group.decisions++
      if (group.tasks.at(-1) !== task) group.tasks.push(task)
      out.set(d.asking_session, group)
    }
  }
  return out
}

/** Open decisions of `task` asked by `sessionId`, in task order. */
export const openDecisionsOf = (task: Task, sessionId: string): Decision[] =>
  task.decisions.filter((d) => d.status === 'open' && d.asking_session === sessionId)

/** One entry per listed, non-discarded session with an open decision or a waiting prompt. */
export function attentionOf(entries: readonly SessionEntry[], grouped: ReadonlyMap<string, OpenDecisions>): Map<string, SessionAttention> {
  const out = new Map<string, SessionAttention>()
  for (const { session, agents, discarded } of entries) {
    if (discarded) continue
    const open = grouped.get(session.id)
    const prompt = awaitingPrompt(session, Object.values(agents))
    if (!open && !prompt) continue
    out.set(session.id, { decisions: open?.decisions ?? 0, tasks: open?.tasks ?? [], prompt })
  }
  return out
}
