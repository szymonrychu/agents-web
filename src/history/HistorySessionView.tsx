/** One stored session: header, a read-only chat rebuilt from its event records, the raw records, and the user-only delete. */
import { useEffect, useMemo, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { ChatLog } from '../chat/ChatLog'
import { filterByAgents, splitSubagents } from '../chat/chatModel'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import { TOKENS } from '../theme'
import { FormError } from '../triggers'
import { deleteSession, getSession } from './api'
import type { SessionDetail } from './api'
import { formatCounts, formatSize } from './HistoryResults'
import { RecordsList } from './RecordsList'
import { useHistoryChat } from './useHistoryChat'

export interface HistorySessionViewProps {
  /** The history session uuid. */
  sessionId: string
  onBack: () => void
  /** Called after the session was deleted. */
  onDeleted: () => void
}

const asError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)))

function HistoryChatTab({ sessionId, detail }: { sessionId: string; detail: SessionDetail }) {
  const ordinals = useMemo(() => Object.fromEntries(detail.agents.map((a) => [a.id, a.ordinal])), [detail.agents])
  const chat = useHistoryChat(sessionId, ordinals)
  const view = useMemo(() => splitSubagents(filterByAgents(chat.items, []), chat.subagents), [chat.items, chat.subagents])
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 }}>
      {chat.error ? <Alert severity="error">{chat.error}</Alert> : null}
      {chat.loading ? (
        <Typography sx={{ color: 'text.secondary', pt: 1 }}>Loading messages</Typography>
      ) : chat.items.length === 0 && !chat.hasMoreBefore && !chat.error ? (
        <Typography color="text.secondary" sx={{ pt: 1 }}>No chat messages in this session; see Records.</Typography>
      ) : (
        <ChatLog items={view.main} subagents={view} hasMoreBefore={chat.hasMoreBefore} loadingOlder={chat.loadingOlder} onLoadOlder={chat.loadOlder} />
      )}
    </Box>
  )
}

export function HistorySessionView({ sessionId, onBack, onDeleted }: HistorySessionViewProps) {
  const [detail, setDetail] = useState<SessionDetail>()
  const [error, setError] = useState<Error>()
  const [tab, setTab] = useState<'chat' | 'records'>('chat')
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<Error>()

  // The view is mounted per session (the page swaps it for the list), so the state starts empty.
  useEffect(() => {
    let active = true
    getSession(sessionId).then(
      (d) => active && setDetail(d),
      (e: unknown) => active && setError(asError(e)),
    )
    return () => {
      active = false
    }
  }, [sessionId])

  const remove = async () => {
    setDeleting(true)
    setDeleteError(undefined)
    try {
      await deleteSession(sessionId)
      setConfirming(false)
      onDeleted()
    } catch (e) {
      setDeleteError(asError(e))
    } finally {
      setDeleting(false)
    }
  }

  const closeConfirm = () => {
    setConfirming(false)
    setDeleteError(undefined)
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%', minHeight: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button onClick={onBack}>Back</Button>
        <Typography component="h1" sx={{ flexGrow: 1, fontSize: TOKENS.fontSizes.lg }}>{detail?.slug ?? ''}</Typography>
        {detail && <Button color="error" onClick={() => setConfirming(true)}>Delete</Button>}
      </Box>
      <FormError error={error} />
      {!detail && !error && <Typography sx={{ color: 'text.secondary' }}>Loading</Typography>}
      {detail && (
        <>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 3, rowGap: 0.5, color: 'text.secondary' }}>
            <Typography variant="caption">Preset: {detail.preset_name ?? 'none'}</Typography>
            {(detail.created_by_service || detail.created_by_session) && (
              <Typography variant="caption">
                Created by: {[detail.created_by_service, detail.created_by_session].filter(Boolean).join(' / ')}
              </Typography>
            )}
            <Typography variant="caption">Created: {new Date(detail.created_at).toLocaleString()}</Typography>
            <Typography variant="caption">Discarded: {new Date(detail.discarded_at).toLocaleString()}</Typography>
            <Typography variant="caption">Records: {formatCounts(detail.record_counts)}</Typography>
            <Typography variant="caption">Size: {formatSize(detail.bytes)}</Typography>
          </Box>
          <Tabs value={tab} onChange={(_e, v: 'chat' | 'records') => setTab(v)}>
            <Tab value="chat" label="Chat" />
            <Tab value="records" label="Records" />
          </Tabs>
          {tab === 'chat' ? (
            <HistoryChatTab sessionId={sessionId} detail={detail} />
          ) : (
            <RecordsList sessionId={sessionId} kindCounts={detail.record_counts} />
          )}
          <ConfirmDialog
            open={confirming}
            title={`Delete the history of ${detail.slug}?`}
            body="This cannot be undone."
            confirmLabel="Delete"
            confirmDisabled={deleting}
            onConfirm={() => void remove()}
            onCancel={closeConfirm}
          >
            <FormError error={deleteError} />
          </ConfirmDialog>
        </>
      )}
    </Box>
  )
}
