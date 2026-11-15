/** Virtualised chat log: older pages prepend without moving the view, new items stick to the bottom. */
import { useCallback, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { ChatEntry } from './entries'
import type { ChatItem } from './chatModel'
import type { SubagentIndex } from './SubagentPane'

export const START_INDEX = 1_000_000
/** Distance from the bottom within which new items keep the view pinned. */
export const FOLLOW_PX = 48

interface Track {
  items: ChatItem[]
  index: number
}

/** Virtuoso's firstItemIndex after the list changed: down by items added in front, up by items trimmed off the front. */
export function nextFirstIndex(prev: Track, items: ChatItem[]): number {
  if (prev.items.length === 0 || items.length === 0) return prev.index
  const oldFirst = prev.items[0].eventId
  if (items.some((i) => i.eventId === oldFirst)) return prev.index - items.filter((i) => i.eventId < oldFirst).length
  const newFirst = items[0].eventId
  return prev.index + prev.items.filter((i) => i.eventId < newFirst).length
}

export interface ChatLogProps {
  items: ChatItem[]
  hasMoreBefore: boolean
  loadingOlder: boolean
  onLoadOlder: () => void
  /** Subagent panes placed in the main log at their anchors. */
  subagents?: SubagentIndex
}

interface HeaderContext {
  older: boolean
}

/** Module-level so Virtuoso does not remount it on every render; state arrives through the context prop. */
function LogHeader({ context }: { context?: HeaderContext }) {
  return (
    <Box sx={{ px: 2, py: 1 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {context?.older ? 'Loading older messages' : 'Start of history'}
      </Typography>
    </Box>
  )
}

const COMPONENTS = { Header: LogHeader }

export function ChatLog({ items, hasMoreBefore, loadingOlder, onLoadOlder, subagents }: ChatLogProps) {
  const [track, setTrack] = useState<Track>({ items, index: START_INDEX })
  let index = track.index
  if (track.items !== items) {
    index = nextFirstIndex(track, items)
    setTrack({ items, index })
  }
  // Own the at-bottom state: Virtuoso passes followOutput `isAtBottom || scrollingInProgress`, and on iOS its own scroll
  // corrections (older pages prepending, rows above being measured) count as "at bottom" and pulled the view to the newest message.
  const atBottom = useRef(true)
  const [scrolledUp, setScrolledUp] = useState(false)
  const virtuoso = useRef<VirtuosoHandle>(null)
  const follow = useCallback(() => (atBottom.current ? 'auto' : false), [])
  const onAtBottom = useCallback((b: boolean) => {
    atBottom.current = b
    setScrolledUp(!b)
  }, [])
  return (
    <Box sx={{ position: 'relative', flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Virtuoso
        ref={virtuoso}
        style={{ flexGrow: 1, minHeight: 0 }}
        data={items}
        firstItemIndex={index}
        initialTopMostItemIndex={Math.max(items.length - 1, 0)}
        followOutput={follow}
        atBottomStateChange={onAtBottom}
        atBottomThreshold={FOLLOW_PX}
        startReached={onLoadOlder}
        computeItemKey={(_i, item) => item.eventId}
        itemContent={(_i, item) => <ChatEntry item={item} subagents={subagents} />}
        context={{ older: hasMoreBefore || loadingOlder }}
        components={COMPONENTS}
      />
      {scrolledUp && (
        <Button
          variant="contained"
          size="small"
          onClick={() => virtuoso.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'smooth' })}
          sx={{ position: 'absolute', right: 16, bottom: 16, borderRadius: 4 }}
        >
          Jump to latest
        </Button>
      )}
    </Box>
  )
}
