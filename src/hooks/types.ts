import type { components } from '../api/schema'

export type CommandHook = components['schemas']['CommandHook']
export type WebhookHook = components['schemas']['WebhookHook']
export type HookAction = CommandHook | WebhookHook
/** The hooks of a session spec: event name to its actions. */
export type Hooks = Record<string, HookAction[]>

/** One hook event as the orchestrator's `/meta.hook_events` lists it. */
export interface HookEventInfo {
  name: string
  /** The event carries a tool name a `matcher` can test (onAgentToolCall, onToolResult). */
  supports_matcher: boolean
  /** The event is periodic: `interval_seconds` is required and `when` is allowed (onTick). */
  supports_interval: boolean
}

export interface HookError {
  /** `<event>` or `<event>.<index>[.<field>]`, the shape of the orchestrator's error paths. */
  path: string
  message: string
}

/** Limits mirrored from the orchestrator spec module; the server stays authoritative. */
export const HOOK_ACTIONS_MAX = 20
export const HOOK_RUN_MAX_CHARS = 16384
