/** Top bar: hamburger menu, one tab per session (state mark, slug with its preset name, context gauge) and a New session button. */
import { useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import MenuIcon from '@mui/icons-material/Menu'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined'
import CloseIcon from '@mui/icons-material/Close'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { ContextGauge } from '../ribbon/ContextGauge'
import { SessionIssue } from '../ribbon/SessionIssue'
import { SessionProgress } from '../ribbon/SessionProgress'
import { sessionMarkState } from '../ribbon/sessionStatus'
import { StateMark } from '../ribbon/stateMark'
import type { SessionEntry } from '../ribbon/useSessions'
import type { SessionView } from '../api/client'
import { TOKENS } from '../theme'
import { SessionsMenu } from './SessionsMenu'
import type { SettingsCategory } from './SessionsMenu'

export interface TopBarProps {
  /** Sessions in display order (the caller passes `sortedSessions`). */
  sessions: SessionEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onInitScripts: (session: SessionView) => void
  onDiscard: (session: SessionView) => void
  /** Removes a discarded session's tab. */
  onDismiss: (id: string) => void
  settingsCategories: SettingsCategory[]
}

interface ActionsMenu {
  anchor: HTMLElement
  session: SessionView
}

export function TopBar({ sessions, selectedId, onSelect, onNew, onInitScripts, onDiscard, onDismiss, settingsCategories }: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [actions, setActions] = useState<ActionsMenu | null>(null)
  // MUI Tabs needs a value that matches a tab, or false when none is selected.
  const value = sessions.some((e) => e.session.id === selectedId) ? selectedId : false
  return (
    <Box component="header" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, borderBottom: `${TOKENS.borderWidth}px solid ${TOKENS.border}` }}>
      <IconButton aria-label="Open menu" onClick={() => setMenuOpen(true)}>
        <MenuIcon />
      </IconButton>
      <Tabs value={value} variant="scrollable" scrollButtons="auto" aria-label="Sessions" sx={{ flexGrow: 1, minWidth: 0 }}>
        {sessions.map(({ session, agents, discarded }) => {
          const mark = sessionMarkState(session, Object.values(agents), discarded === true)
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
      <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={onNew} sx={{ flexShrink: 0 }}>New session</Button>
      <Menu anchorEl={actions?.anchor ?? null} open={actions !== null} onClose={() => setActions(null)}>
        <MenuItem onClick={() => { const target = actions?.session; setActions(null); if (target) onInitScripts(target) }}>Init scripts</MenuItem>
        <MenuItem onClick={() => { const target = actions?.session; setActions(null); if (target) onDiscard(target) }}>Discard</MenuItem>
      </Menu>
      <SessionsMenu open={menuOpen} onClose={() => setMenuOpen(false)} sessions={sessions} selectedId={selectedId} onSelect={onSelect} settingsCategories={settingsCategories} />
    </Box>
  )
}
