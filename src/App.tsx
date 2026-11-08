import { useEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { Route, Routes, useSearchParams } from 'react-router'
import { ChatView } from './chat/ChatView'
import { DiscardSessionDialog } from './sessions/DiscardSessionDialog'
import { InitScriptsDialog } from './sessions/InitScriptsDialog'
import { PermissionModeDialog } from './sessions/PermissionModeDialog'
import { NewSessionDialog } from './sessions/NewSessionDialog'
import { FilesPanel } from './files/FilesPanel'
import type { SessionView } from './api/client'
import { TopBar } from './layout/TopBar'
import { Workspace } from './layout/Workspace'
import { sortedAgents, useSessions } from './ribbon/useSessions'
import { menuEntries } from './backends/registry'
import { getConfig } from './config/backends'
import { TerminalPanel } from './terminal/TerminalPanel'
import { TOKENS } from './theme'
import { ProposalReviewDialog } from './proposals/ProposalReviewDialog'
import type { ProposalView } from './proposals/api'
import { TasksRoute } from './tasks/routes'

export const APP_NAME = 'Agent Orchestrator';

function SessionsShell() {
  const { state, sessions, select, dismiss, update } = useSessions()
  // `/?session=<id>` (the Tasks page links waiting sessions this way) selects that session once it is known, once.
  const wanted = useSearchParams()[0].get('session')
  const applied = useRef<string | null>(null)
  useEffect(() => {
    if (wanted === null || applied.current === wanted || !(wanted in state.sessions)) return
    applied.current = wanted
    select(wanted)
  }, [wanted, state.sessions, select])
  const [creating, setCreating] = useState(false)
  // The main area shows the selected session or a settings page; only /tasks is routed.
  const [view, setView] = useState<string>('session')
  const [discarding, setDiscarding] = useState<SessionView | null>(null)
  const [initScripts, setInitScripts] = useState<SessionView | null>(null)
  const [permissions, setPermissions] = useState<SessionView | null>(null)
  const [proposal, setProposal] = useState<ProposalView | null>(null)
  const [proposalsRefresh, setProposalsRefresh] = useState(0)
  // an open review is never replaced: a declined auto-open stays unseen and opens on a later poll
  const openProposal = (p?: ProposalView) => {
    if (!p) return setView('proposals')
    if (proposal) return false
    setProposal(p)
  }
  // The first session by slug is selected until a tab is chosen, and again when the chosen one disappears.
  const selectedId = state.selectedId !== null && state.selectedId in state.sessions ? state.selectedId : (sessions[0]?.session.id ?? null)
  const selected = selectedId === null ? null : state.sessions[selectedId]
  const config = getConfig()
  const entries = useMemo(() => menuEntries(config), [config])
  const openEntry = entries.find((e) => e.id === view)
  const show = (id: string) => {
    setView('session')
    select(id)
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <TopBar
        sessions={sessions}
        selectedId={selectedId}
        onSelect={show}
        onNew={() => setCreating(true)}
        onInitScripts={setInitScripts}
        onPermissions={setPermissions}
        onDiscard={setDiscarding}
        onDismiss={dismiss}
        onSessionUpdated={update}
        onOpenProposals={openProposal}
        proposalsRefreshKey={proposalsRefresh}
        settingsCategories={entries.map((e) => ({ id: e.id, label: e.label, onOpen: () => setView(e.id) }))}
      />
      <Box component="main" aria-label={APP_NAME} sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', p: 2 }}>
        {state.error && (
          <Box role="alert" sx={{ fontSize: TOKENS.fontSizes.sm, color: 'error.main' }}>
            {state.error}
          </Box>
        )}
        {openEntry ? (
          openEntry.render(() => setView('session'), show)
        ) : selected?.discarded ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography color="text.secondary">{`Session ${selected.session.slug} was discarded`}</Typography>
            <Button size="small" onClick={() => dismiss(selected.session.id)}>Dismiss</Button>
          </Box>
        ) : selected ? (
          <Box sx={{ flexGrow: 1, minHeight: 0 }}>
            <Workspace
              sessionId={selected.session.id}
              files={<FilesPanel sessionId={selected.session.id} />}
              chat={<ChatView session={selected.session} agents={sortedAgents(selected)} />}
              terminal={<TerminalPanel session={selected.session} agents={sortedAgents(selected)} />}
            />
          </Box>
        ) : (
          state.loaded && !state.error && <Typography color="text.secondary">No sessions yet</Typography>
        )}
      </Box>
      <NewSessionDialog open={creating} onClose={() => setCreating(false)} onCreated={(c) => { setCreating(false); show(c.id) }} />
      {proposal && <ProposalReviewDialog key={`${proposal.id}:${proposal.revision}`} proposal={proposal} onClose={() => setProposal(null)} onChanged={() => setProposalsRefresh((n) => n + 1)} />}
      {initScripts && <InitScriptsDialog open session={initScripts} onClose={() => setInitScripts(null)} />}
      {permissions && <PermissionModeDialog open session={permissions} onClose={() => setPermissions(null)} />}
      {discarding && <DiscardSessionDialog open session={discarding} onClose={() => setDiscarding(null)} onDiscarded={() => setDiscarding(null)} />}
    </Box>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/tasks/*" element={<TasksRoute />} />
      <Route path="*" element={<SessionsShell />} />
    </Routes>
  )
}
