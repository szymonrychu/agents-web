/** Small square mark of an agent or session state, and the colour the context gauge ring takes from it. */
import Box from '@mui/material/Box'
import { TOKENS } from '../theme'

/**
 * Mark states. `idle` is the old "waiting" of summary.state (all agents idle); `attention` is an agent waiting for
 * input (dialog, permission, question) and is fed only by the agent state value 'waiting', which no backend sends yet.
 */
export type MarkState = 'working' | 'idle' | 'attention' | 'booting' | 'error' | 'deleting' | 'discarded'

/** Agent states the web understands; 'waiting' is the typed hook for the coming backend field. */
export type AgentState = 'unknown' | 'booting' | 'idle' | 'busy' | 'dead' | 'waiting'

const MARK_PX = 8
const COLOUR: Record<MarkState, string> = {
  working: TOKENS.info,
  idle: TOKENS.textSecondary,
  attention: TOKENS.attention,
  booting: TOKENS.warning,
  error: TOKENS.error,
  deleting: TOKENS.textDisabled,
  discarded: TOKENS.textDisabled,
}
const LABEL: Record<MarkState, string> = {
  working: 'working',
  idle: 'idle',
  attention: 'waiting for input',
  booting: 'booting',
  error: 'error',
  deleting: 'deleting',
  discarded: 'discarded',
}

export const markColour = (state: MarkState): string => COLOUR[state]
export const markLabel = (state: MarkState): string => LABEL[state]

/** Maps a wrapper-reported agent state to a mark: a dead agent is an error, otherwise a pod that is not ready is booting. */
export function agentMarkState(state: string, ready: boolean): MarkState {
  if (state === 'dead') return 'error'
  if (!ready) return 'booting'
  if (state === 'idle') return 'idle'
  if (state === 'waiting') return 'attention'
  if (state === 'busy' || state === 'working') return 'working'
  if (state === 'error' || state === 'failed') return 'error'
  return 'booting'
}

export function StateMark({ state }: { state: MarkState }) {
  return <Box role="img" aria-label={`state ${state}`} sx={{ width: MARK_PX, height: MARK_PX, flexShrink: 0, bgcolor: COLOUR[state], opacity: state === 'deleting' || state === 'discarded' ? 0.6 : 1 }} />
}
