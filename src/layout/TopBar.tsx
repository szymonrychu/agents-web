/**
 * Top bar: hamburger menu, one tab per session (state mark, slug with its preset name, context gauge) and a New session button.
 * On a phone the tabs give way to one current-session button that opens the sessions drawer, and the buttons become icons.
 */
import { useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import MenuIcon from '@mui/icons-material/Menu'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined'
import CloseIcon from '@mui/icons-material/Close'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import ReviewsIcon from '@mui/icons-material/RateReviewOutlined'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { Link as RouterLink } from 'react-router'
import { ContextGauge } from '../ribbon/ContextGauge'
import { SessionIssue } from '../ribbon/SessionIssue'
import { SessionProgress } from '../ribbon/SessionProgress'
import { sessionMarkState } from '../ribbon/sessionStatus'
import { StateMark } from '../ribbon/stateMark'
import type { SessionEntry } from '../ribbon/useSessions'
import type { SessionView } from '../api/client'
import { SessionLabels } from '../sessions/SessionLabels'
import { TOKENS } from '../theme'
import type { ProposalView } from '../proposals/api'
import { useActiveProposals } from '../proposals/useActiveProposals'
import { ProjectSelect } from '../projects/ProjectSelect'
import { AttentionBubble } from '../attention/AttentionBubble'
import type { SessionAttention } from '../attention/attention'
import { safeArea } from './safeArea'
import { SessionsMenu } from './SessionsMenu'
import type { SettingsCategory } from './SessionsMenu'
import { useLayout } from './useLayout'

export interface TopBarProps {
  /** Sessions in display order, already derived by the caller (pins over the alphabetical list); never re-sorted here. */
  sessions: SessionEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onInitScripts: (session: SessionView) => void
  onPermissions: (session: SessionView) => void
  onDiscard: (session: SessionView) => void
  /** Asks to restart every agent pod of the session. */
  onRestart: (session: SessionView) => void
  /** Removes a discarded session's tab. */
  onDismiss: (id: string) => void
  /** A session returned by a REST call (the label edit), to show before the stream catches up. */
  onSessionUpdated: (session: SessionView) => void
  settingsCategories: SettingsCategory[]
  /**
   * Opens a proposal's review dialog (a new open revision, or the chip when exactly one waits) or, with
   * none, the proposals page. Returns false when it declines an auto-open (a review is already open).
   */
  onOpenProposals?: (proposal?: ProposalView) => boolean | void
  /** Changing it refetches the proposals at once (after a review was submitted). */
  proposalsRefreshKey?: unknown
  /** Sessions that need the user (open decisions or a waiting prompt), by id. */
  attention: Map<string, SessionAttention>
  /** Opens the preview of the open decisions a session asked. */
  onOpenDecisions: (session: SessionView) => void
}

interface ActionsMenu {
  anchor: HTMLElement
  session: SessionView
}

export function TopBar({ sessions, selectedId, onSelect, onNew, onInitScripts, onPermissions, onRestart, onDiscard, onDismiss, onSessionUpdated, settingsCategories, onOpenProposals, proposalsRefreshKey, attention, onOpenDecisions }: TopBarProps) {
  const { proposals, count: proposalCount } = useActiveProposals(onOpenProposals, proposalsRefreshKey)
  const waiting = proposals.filter((p) => p.status === 'open' || p.status === 'stale')
  const [menuOpen, setMenuOpen] = useState(false)
  const [actions, setActions] = useState<ActionsMenu | null>(null)
  // MUI Tabs needs a value that matches a tab, or false when none is selected.
  const value = sessions.some((e) => e.session.id === selectedId) ? selectedId : false
  const labelled = sessions.find((e) => e.session.id === selectedId && !e.discarded)
  const openDecisions = actions ? (attention.get(actions.session.id)?.decisions ?? 0) : 0
  const phone = useLayout() === 'phone'
  const current = sessions.find((e) => e.session.id === selectedId)
  const currentNeeds = current ? attention.get(current.session.id) : undefined
  const openProposals = () => (waiting.length === 1 ? onOpenProposals?.(waiting[0]) : onOpenProposals?.())
  return (
    <Box component="header" sx={{ borderBottom: `${TOKENS.borderWidth}px solid ${TOKENS.border}`, ...safeArea(['top', 'left', 'right']) }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1 }}>
      <IconButton aria-label="Open menu" onClick={() => setMenuOpen(true)}>
        <MenuIcon />
      </IconButton>
      <ProjectSelect />
      {phone ? (
        <>
          <ButtonBase
            aria-label={current ? `Switch session, current ${current.session.slug}` : 'Choose session'}
            onClick={() => setMenuOpen(true)}
            sx={{ flexGrow: 1, minWidth: 0, justifyContent: 'flex-start', gap: 1, px: 1, alignSelf: 'stretch' }}
          >
            {current ? <StateMark state={sessionMarkState(current.session, Object.values(current.agents), current.discarded === true)} /> : null}
            <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: TOKENS.fontWeights.medium }}>
              {current ? current.session.slug : 'Choose session'}
            </Box>
          </ButtonBase>
          {current && currentNeeds ? (
            <AttentionBubble slug={current.session.slug} attention={currentNeeds} onOpen={() => (currentNeeds.decisions > 0 ? onOpenDecisions(current.session) : onSelect(current.session.id))} />
          ) : null}
          {current && current.discarded ? (
            <IconButton aria-label={`Dismiss ${current.session.slug}`} onClick={() => onDismiss(current.session.id)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          ) : current ? (
            <IconButton aria-haspopup="menu" aria-label="Session actions" onClick={(e) => setActions({ anchor: e.currentTarget, session: current.session })}>
              <MoreVertIcon fontSize="small" />
            </IconButton>
          ) : null}
          {proposalCount > 0 && (
            <IconButton color="warning" aria-label={`Proposals, ${proposalCount} waiting`} onClick={openProposals}>
              <Badge badgeContent={proposalCount} color="warning"><ReviewsIcon fontSize="small" /></Badge>
            </IconButton>
          )}
          <IconButton aria-label="New session" onClick={onNew}>
            <AddIcon />
          </IconButton>
        </>
      ) : (
      <>
      <Tabs value={value} variant="scrollable" scrollButtons="auto" aria-label="Sessions" sx={{ flexGrow: 1, minWidth: 0 }}>
        {sessions.map(({ session, agents, discarded }) => {
          const mark = sessionMarkState(session, Object.values(agents), discarded === true)
          const needs = attention.get(session.id)
          return (
          <Tab
            key={session.id}
            component="div"
            value={session.id}
            onClick={() => onSelect(session.id)}
            label={
              <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <StateMark state={mark} />
                <Box component="span" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
                  <Box component="span" sx={{ fontWeight: TOKENS.fontWeights.medium, textDecoration: discarded ? 'line-through' : 'none', color: discarded ? 'text.disabled' : undefined }}>{session.slug}</Box>
                  {session.preset_name ? <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 160, textTransform: 'none' }}>{session.preset_name}</Typography> : null}
                </Box>
                {needs ? <AttentionBubble slug={session.slug} attention={needs} onOpen={() => (needs.decisions > 0 ? onOpenDecisions(session) : onSelect(session.id))} /> : null}
                {session.status.discard_hook_failed ? (
                  <Tooltip title="discard hook failed">
                    <ErrorOutlineIcon fontSize="small" color="error" role="img" aria-label="discard hook failed" />
                  </Tooltip>
                ) : null}
                {discarded ? (
                  <IconButton size="small" component="span" role="button" aria-label={`Dismiss ${session.slug}`} onClick={(e) => { e.stopPropagation(); onDismiss(session.id) }}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                ) : (
                  <>
                    <Tooltip title={`${session.summary.ready} of ${session.summary.replicas} pods ready`}>
                      <Box component="span" sx={{ fontSize: `${TOKENS.fontSizes.sm / 16}rem`, color: 'text.secondary' }}>{`${session.summary.ready}/${session.summary.replicas}`}</Box>
                    </Tooltip>
                    <ContextGauge value={session.summary.context_pct_max} autoCompactPct={session.summary.auto_compact_pct} state={mark} />
                    <IconButton
                      size="small"
                      component="span"
                      role="button"
                      aria-haspopup="menu"
                      aria-label="Session actions"
                      onClick={(e) => { e.stopPropagation(); setActions({ anchor: e.currentTarget, session }) }}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </>
                )}
              </Box>
              {discarded ? null : <SessionProgress session={session} agents={Object.values(agents)} />}
              {discarded ? null : <SessionIssue session={session} agents={Object.values(agents)} />}
              </Box>
            }
          />
          )
        })}
      </Tabs>
      {proposalCount > 0 && (
        <Button size="small" color="warning" variant="outlined" aria-label={`Proposals, ${proposalCount} waiting`} onClick={openProposals} sx={{ flexShrink: 0 }}>
          <Badge badgeContent={proposalCount} color="warning" sx={{ pr: 1 }}>Proposals</Badge>
        </Button>
      )}
      <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={onNew} sx={{ flexShrink: 0 }}>New session</Button>
      </>
      )}
      <Menu anchorEl={actions?.anchor ?? null} open={actions !== null} onClose={() => setActions(null)}>
        <MenuItem onClick={() => { const target = actions?.session; setActions(null); if (target) onInitScripts(target) }}>Init scripts</MenuItem>
        <MenuItem onClick={() => { const target = actions?.session; setActions(null); if (target) onPermissions(target) }}>Permissions</MenuItem>
        <MenuItem component={RouterLink} to={`/tasks?session=${encodeURIComponent(actions?.session.id ?? '')}`} onClick={() => setActions(null)}>Tasks</MenuItem>
        {openDecisions > 0 && <MenuItem onClick={() => { const target = actions?.session; setActions(null); if (target) onOpenDecisions(target) }}>{`Decisions (${openDecisions})`}</MenuItem>}
        <MenuItem disabled={actions?.session.desired === 'deleting'} onClick={() => { const target = actions?.session; setActions(null); if (target) onRestart(target) }}>Restart</MenuItem>
        <MenuItem onClick={() => { const target = actions?.session; setActions(null); if (target) onDiscard(target) }}>Discard</MenuItem>
      </Menu>
      <SessionsMenu open={menuOpen} onClose={() => setMenuOpen(false)} sessions={sessions} selectedId={selectedId} onSelect={onSelect} settingsCategories={settingsCategories} />
    </Box>
    {labelled && (
      <Box sx={{ px: 1, pb: 1 }}>
        <SessionLabels key={labelled.session.id} session={labelled.session} onUpdated={onSessionUpdated} />
      </Box>
    )}
    </Box>
  )
}
