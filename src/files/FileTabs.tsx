/**
 * The open files of one session as tabs, styled like the terminal tabs: a scrollable strip of closable tabs, every
 * panel mounted and only the active one shown. A text tab has its path, the RO/RW toggle, Save and the editor (loaded
 * lazily, its own build chunk); binary, too large, other and failed tabs show a note instead.
 */
import Close from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { lazy, Suspense, useState } from 'react'
import type { JSX, MouseEvent, ReactNode } from 'react'
import { ConfirmDialog } from '../layout/ConfirmDialog'
import { MONO_FONT, TOKENS } from '../theme'
import type { FileTab, FileTabs as FileTabsApi, TabMode } from './useFileTabs'

const CodeEditor = lazy(() => import('../editor/CodeEditor'))

const FONT_SM = `${TOKENS.fontSizes.sm / 16}rem`
const noteSx = { p: 2, fontSize: FONT_SM, color: 'text.secondary' } as const

/** Save (button or Ctrl/Cmd+S) only in RW, with unsaved changes and no save running. */
const canSave = (t: FileTab) => t.kind === 'text' && t.mode === 'rw' && t.dirty && !t.saving

function Note({ children }: { children: ReactNode }) {
  return (
    <Typography data-testid="file-preview-note" sx={noteSx}>
      {children}
    </Typography>
  )
}

/** A notice above the editor with its actions. */
function Notice({ color, children, actions }: { color: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <Box role="alert" sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, px: 2, py: 0.5, fontSize: FONT_SM, color }}>
      <span>{children}</span>
      {actions}
    </Box>
  )
}

/** The panel's top line: the full relative path, then the text tab's controls on the right. */
function Toolbar({ path, children }: { path: string; children?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider', minWidth: 0 }}>
      <Typography
        data-testid="file-tab-path"
        sx={{ flexGrow: 1, minWidth: 0, fontFamily: MONO_FONT, fontSize: FONT_SM, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {path}
      </Typography>
      {children}
    </Box>
  )
}

function TextPanel({ tab, tabs }: { tab: FileTab; tabs: FileTabsApi }) {
  const { path } = tab
  const save = () => {
    if (canSave(tab)) tabs.save(path)
  }
  return (
    <>
      <Toolbar path={path}>
        <ToggleButtonGroup exclusive size="small" aria-label="Editor mode" value={tab.mode} onChange={(_e, next: TabMode | null) => next && tabs.setMode(path, next)}>
          <ToggleButton value="ro" disabled={tab.dirty}>
            RO
          </ToggleButton>
          <ToggleButton value="rw">RW</ToggleButton>
        </ToggleButtonGroup>
        <Button size="small" variant="outlined" disabled={!canSave(tab)} onClick={save}>
          Save
        </Button>
      </Toolbar>
      {tab.conflict && (
        <Notice
          color="warning.main"
          actions={
            <>
              <Button size="small" onClick={() => tabs.reload(path)}>
                Reload
              </Button>
              <Button size="small" color="error" onClick={() => tabs.overwrite(path)}>
                Overwrite
              </Button>
            </>
          }
        >
          The file changed on disk since it was loaded: reload it (your changes are dropped) or overwrite it with your version.
        </Notice>
      )}
      {tab.dirty && tab.changedOnDisk && (
        <Notice
          color="warning.main"
          actions={
            <>
              <Button size="small" onClick={() => tabs.reload(path)}>
                Reload
              </Button>
              <Button size="small" onClick={() => tabs.keepEditing(path)}>
                Keep editing
              </Button>
            </>
          }
        >
          The file changed on disk while you were editing.
        </Notice>
      )}
      {tab.saveError && <Notice color="error.main">{tab.saveError}</Notice>}
      <Box sx={{ flexGrow: 1, minHeight: 0 }}>
        <Suspense fallback={<Typography sx={noteSx}>loading</Typography>}>
          <CodeEditor path={path} doc={tab.doc} docVersion={tab.docVersion} readOnly={tab.mode === 'ro'} onChange={(text) => tabs.edit(path, text)} onSave={save} />
        </Suspense>
      </Box>
    </>
  )
}

/** What a tab without an editor shows below its path. */
function NoteBody({ tab }: { tab: FileTab }) {
  switch (tab.kind) {
    case 'loading':
    case 'text':
      return <Typography sx={noteSx}>loading</Typography>
    case 'binary':
      return <Note>{`Binary file, ${tab.file?.size ?? 0} bytes, ${tab.file?.mime ?? 'unknown type'}`}</Note>
    case 'too_large':
      return <Note>{`${tab.file?.size ?? 0} bytes, too large to preview`}</Note>
    case 'other':
      return <Note>Type: other. No preview.</Note>
    case 'error':
      return (
        <Box role="alert" data-testid="file-preview-error" sx={{ ...noteSx, color: 'error.main' }}>
          {tab.error}
        </Box>
      )
  }
}

export function FileTabs({ tabs }: { tabs: FileTabsApi }): JSX.Element {
  // the tab a discard is asked for; it stays set while the dialog closes, so the title does not change during the fade
  const [confirming, setConfirming] = useState<{ tab: FileTab; open: boolean } | null>(null)

  const requestClose = (t: FileTab) => (t.dirty ? setConfirming({ tab: t, open: true }) : tabs.close(t.path))
  const dismiss = () => setConfirming((c) => c && { ...c, open: false })

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider', minWidth: 0 }}>
        <Tabs value={tabs.active ?? false} onChange={(_e, path: string) => tabs.focus(path)} variant="scrollable" scrollButtons="auto" sx={{ flexGrow: 1, minWidth: 0 }}>
          {tabs.tabs.map((t) => (
            <Tab
              key={t.path}
              value={t.path}
              component="div"
              data-dirty={t.dirty ? 'true' : undefined}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <span>{t.dirty ? `${t.name} *` : t.name}</span>
                  <IconButton
                    component="span"
                    size="small"
                    aria-label={`Close ${t.name}`}
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation()
                      requestClose(t)
                    }}
                  >
                    <Close fontSize="inherit" />
                  </IconButton>
                </Box>
              }
            />
          ))}
        </Tabs>
      </Box>
      {tabs.tabs.length === 0 && (
        <Typography color="text.secondary" sx={{ p: 2 }}>
          No open files
        </Typography>
      )}
      <Box sx={{ position: 'relative', flexGrow: 1, minHeight: 0 }}>
        {tabs.tabs.map((t) => (
          <Box
            key={t.path}
            role="tabpanel"
            aria-label={t.path}
            hidden={t.path !== tabs.active}
            sx={{ position: 'absolute', inset: 0, display: t.path === tabs.active ? 'flex' : 'none', flexDirection: 'column', minWidth: 0 }}
          >
            {t.kind === 'text' ? (
              <TextPanel tab={t} tabs={tabs} />
            ) : (
              <>
                <Toolbar path={t.path} />
                <NoteBody tab={t} />
              </>
            )}
          </Box>
        ))}
      </Box>
      <ConfirmDialog
        open={confirming?.open ?? false}
        title={`Discard unsaved changes to ${confirming?.tab.name ?? ''}?`}
        confirmLabel="Discard"
        onConfirm={() => {
          if (confirming) tabs.close(confirming.tab.path)
          dismiss()
        }}
        onCancel={dismiss}
      />
    </Box>
  )
}
