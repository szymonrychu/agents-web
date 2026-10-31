import type { HookEventInfo } from './types'

/** A small `/meta.hook_events` list for tests: a plain event, a tick event, and a tool event. */
export const HOOK_EVENTS_FIXTURE: HookEventInfo[] = [
  { name: 'onTurn', can_veto: true, supports_matcher: false, supports_interval: false, supports_when: false, interval_required: false },
  { name: 'onTick', can_veto: false, supports_matcher: false, supports_interval: true, supports_when: true, interval_required: true },
  { name: 'onAgentToolCall', can_veto: true, supports_matcher: true, supports_interval: false, supports_when: false, interval_required: false },
]
