/** Client-side hook rules, mirroring the orchestrator's session spec validators; the server stays authoritative. */
import { HOOK_ACTIONS_MAX, HOOK_RUN_MAX_CHARS, type HookAction, type HookError, type HookEventInfo, type Hooks } from './types'

const ENV_KEY = /^[A-Z_][A-Z0-9_]*$/
const HTTP_URL = /^https?:\/\/[^/\s]+/

/** Every rule violation in `hooks` against the known `events`; unset (`null`) and `{}` have none. */
export function validateHooks(hooks: Hooks | null, events: HookEventInfo[]): HookError[] {
  const out: HookError[] = []
  const known = new Map(events.map((e) => [e.name, e]))
  const toolEvents = events.filter((e) => e.supports_matcher).map((e) => e.name)
  for (const [event, actions] of Object.entries(hooks ?? {})) {
    const info = known.get(event)
    if (!info) {
      out.push({ path: event, message: 'unknown hook event' })
      continue
    }
    if (actions.length > HOOK_ACTIONS_MAX) {
      out.push({ path: event, message: `has ${actions.length} actions, at most ${HOOK_ACTIONS_MAX}` })
    }
    actions.forEach((action, i) => {
      const add = (field: string, message: string) => out.push({ path: `${event}.${i}.${field}`, message })
      if (action.matcher != null && !info.supports_matcher) add('matcher', `only allowed on ${toolEvents.join(', ')}`)
      if (!info.supports_interval) {
        if (action.interval_seconds != null) add('interval_seconds', 'only allowed on onTick')
        if (action.when != null) add('when', 'only allowed on onTick')
      } else if (action.interval_seconds == null) {
        add('interval_seconds', 'required on onTick')
      }
      if (action.type === 'command') commandRules(action, add)
      else if (!HTTP_URL.test(action.url)) add('url', 'must be an http or https URL')
    })
  }
  return out
}

function commandRules(action: Extract<HookAction, { type: 'command' }>, add: (field: string, message: string) => void): void {
  if (action.run === '') add('run', 'required')
  else if (action.run.length > HOOK_RUN_MAX_CHARS) add('run', `at most ${HOOK_RUN_MAX_CHARS} characters`)
  const bad = Object.keys(action.env ?? {}).filter((k) => !ENV_KEY.test(k))
  if (bad.length > 0) add('env', `keys must match [A-Z_][A-Z0-9_]*: ${bad.sort().join(', ')}`)
}
