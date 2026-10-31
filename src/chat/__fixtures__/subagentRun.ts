/**
 * Stored orchestrator event rows of one turn in which the main agent runs a Task subagent.
 * Shapes follow claude-code-wrapper router.py: hook events carry `agent_id`/`agent_type`
 * (null on the main agent), transcript events carry the sidechain `agent_id`, and
 * `subagent_started` carries `parent_tool_use_id` = the Task tool_use id (E1/E2 link).
 * `row.agent_id` is the orchestrator pod, never the subagent.
 */
import type { EventRow } from '../chatModel'

export const POD = '6f0c2a9e-3b1d-4c55-9a7e-1f2b3c4d5e6f'
export const TASK_ID = 'toolu_01L1douhGrKCtucQYEnEdowj'
export const SUB_ID = 'af58f2e158e12f254'

const at = (id: number, type: string, data: Record<string, unknown>): EventRow => ({
  id,
  agent_id: POD,
  type,
  ts: `2026-10-31T10:00:${String(id).padStart(2, '0')}Z`,
  turn_id: 'turn-1',
  data,
})

const main = { agent_id: null, agent_type: null }
const sub = { agent_id: SUB_ID, agent_type: 'Explore' }

/** @param linked false drops parent_tool_use_id, as a wrapper before E2 emits it. */
export function subagentRun(linked = true): EventRow[] {
  return [
    at(1, 'user_message', { text: 'find the config loader', origin: 'user', message_id: 'm1' }),
    at(2, 'assistant_text', { text: 'Delegating the search.', message_id: 'msg_a1', model: 'claude-opus', agent_id: null }),
    at(3, 'tool_call', {
      tool_use_id: TASK_ID,
      tool_name: 'Task',
      tool_input: { subagent_type: 'Explore', description: 'Find config loader', prompt: 'Where is the config loaded?' },
      ...main,
    }),
    at(4, 'subagent_started', linked ? { ...sub, parent_tool_use_id: TASK_ID } : { ...sub }),
    at(5, 'thinking', { text: 'grep for load_config', message_id: 'msg_s1', agent_id: SUB_ID }),
    at(6, 'tool_call', { tool_use_id: 'toolu_sub_read', tool_name: 'Read', tool_input: { file_path: 'src/config.py' }, ...sub }),
    at(7, 'tool_result', { tool_use_id: 'toolu_sub_read', tool_name: 'Read', is_error: false, response: 'def load_config(): ...', ...sub }),
    at(8, 'assistant_text', { text: 'It is in src/config.py.', message_id: 'msg_s2', model: 'claude-haiku', agent_id: SUB_ID }),
    at(9, 'subagent_stopped', { ...sub, last_assistant_message: 'It is in src/config.py.' }),
    at(10, 'tool_result', { tool_use_id: TASK_ID, tool_name: 'Task', is_error: false, response: 'It is in src/config.py.', ...main }),
    at(11, 'assistant_text', { text: 'Found it: src/config.py.', message_id: 'msg_a2', model: 'claude-opus', agent_id: null }),
    at(12, 'turn_completed', { record: { usage: { input_tokens: 10, output_tokens: 5 } } }),
  ]
}
