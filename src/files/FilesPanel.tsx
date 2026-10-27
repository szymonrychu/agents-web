/** Filesystem panel: the session's shared workdir as a lazily loaded tree on the left and the open files as tabs on the right (a resizable split, stacked on a phone). */
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined'
import Folder from '@mui/icons-material/Folder'
import FolderOpen from '@mui/icons-material/FolderOpen'
import InsertDriveFileOutlined from '@mui/icons-material/InsertDriveFileOutlined'
import Link from '@mui/icons-material/Link'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView'
import { TreeItem } from '@mui/x-tree-view/TreeItem'
import { useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Group, Panel } from 'react-resizable-panels'
import { eventStreamUrl } from '../api/client'
import { fileDownloadUrl } from '../api/files'
import type { FileEntry } from '../api/files'
import { openStream } from '../api/stream'
import { Divider, DIVIDER_WIDTH } from '../layout/Workspace'
import { useLayout } from '../layout/useLayout'
import { MONO_FONT, TOKENS } from '../theme'
import { createFileEvents } from './fileEvents'
import { FileTabs } from './FileTabs'
import { useFileTabs } from './useFileTabs'
import { joinPath, useFileTree } from './useFileTree'

const WATCHED_EVENTS = ['tool_call', 'tool_result']
const POLL_MS = 3000

const entryId = (path: string) => `e:${path}`
const moreId = (dir: string) => `more:${dir}`
const loadingId = (dir: string) => `loading:${dir}`
const emptyId = (dir: string) => `empty:${dir}`
const errorId = (dir: string) => `error:${dir}`

const noteSx = { fontSize: `${TOKENS.fontSizes.sm / 16}rem`, color: 'text.secondary' } as const

/** One tree row: icon, the name (it grows, so a trailing action sits on the right edge), then an optional action. */
function Row({ icon, action, children }: { icon?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      {icon}
      <Box component="span" sx={{ flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {children}
      </Box>
      {action}
    </Box>
  )
}

/** A plain anchor to the download route: the browser saves the file, so no click handler may open the preview or select the row. */
function DownloadLink({ sessionId, path, name }: { sessionId: string; path: string; name: string }) {
  return (
    <IconButton component="a" href={fileDownloadUrl(sessionId, path)} download={name} size="small" aria-label={`Download ${name}`} onClick={(e) => e.stopPropagation()}>
      <FileDownloadOutlined fontSize="small" />
    </IconButton>
  )
}

/** A file, or a symlink that resolves to a file inside the workdir, can be downloaded. */
const downloadable = (e: FileEntry) => e.type === 'file' || (e.type === 'symlink' && e.target_type === 'file')

export function FilesPanel({ sessionId }: { sessionId: string }) {
  const tree = useFileTree(sessionId)
  const { state, setExpanded, loadMore, refresh, refreshExpanded, pollExpanded, isLoaded, root } = tree
  const tabs = useFileTabs(sessionId)
  const { open, observe, written } = tabs
  const phone = useLayout() === 'phone'

  // Live tail of tool events (no history replay): a finished write refreshes its parent directory (and applies the live refresh rules to an open tab of the file), a shell result the expanded tree.
  useEffect(() => {
    const events = createFileEvents({
      root,
      isLoaded,
      refresh,
      refreshExpanded,
      written,
    })
    const stream = openStream(eventStreamUrl(sessionId), { eventNames: WATCHED_EVENTS, onEvent: (data) => events.handle(data), onOpen: pollExpanded })
    return () => {
      stream.close()
      events.dispose()
    }
  }, [sessionId, root, isLoaded, refresh, refreshExpanded, pollExpanded, written])

  // Safety net for writers the hooks never see (terminal shells, check jobs) and for a tree that loaded in error: poll while the tab is visible, plus one pass on return.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const stop = () => {
      clearInterval(timer)
      timer = undefined
    }
    const sync = () => {
      stop()
      if (document.visibilityState !== 'visible') return
      pollExpanded()
      timer = setInterval(pollExpanded, POLL_MS)
    }
    if (document.visibilityState === 'visible') timer = setInterval(pollExpanded, POLL_MS)
    document.addEventListener('visibilitychange', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      stop()
    }
  }, [pollExpanded])

  // A file open in a tab changed on disk (mtime or size in its parent listing): the tabs decide whether to refetch it or only say so.
  useEffect(() => {
    observe((path) => {
      const slash = path.lastIndexOf('/')
      const name = path.slice(slash + 1)
      const e = state.dirs[slash < 0 ? '' : path.slice(0, slash)]?.entries.find((x) => x.name === name)
      return e ? `${e.mtime}|${e.size}` : null
    })
  }, [state.dirs, observe])

  const types = useMemo(() => {
    const out = new Map<string, FileEntry['type']>()
    for (const [dir, d] of Object.entries(state.dirs)) for (const e of d.entries) out.set(joinPath(dir, e.name), e.type)
    return out
  }, [state.dirs])

  const onItemClick = (_event: unknown, id: string) => {
    if (id.startsWith('more:')) return loadMore(id.slice('more:'.length))
    if (!id.startsWith('e:')) return
    const path = id.slice(2)
    const type = types.get(path)
    if (type) open(path, type)
  }

  const children = (dir: string): ReactNode[] => {
    const d = state.dirs[dir]
    if (!d || (dir !== '' && !state.expanded.includes(dir))) return [<TreeItem key={loadingId(dir)} itemId={loadingId(dir)} disabled label={<Row>loading</Row>} />]
    if (d.loading && d.entries.length === 0 && !d.error) return [<TreeItem key={loadingId(dir)} itemId={loadingId(dir)} disabled label={<Row>loading</Row>} />]
    const rows = d.entries.map((e) => {
      const path = joinPath(dir, e.name)
      if (e.type === 'dir') {
        const open = state.expanded.includes(path)
        return (
          <TreeItem key={entryId(path)} itemId={entryId(path)} label={<Row icon={open ? <FolderOpen fontSize="small" /> : <Folder fontSize="small" />}>{e.name}</Row>}>
            {children(path)}
          </TreeItem>
        )
      }
      const icon = e.type === 'symlink' ? <Link fontSize="small" /> : <InsertDriveFileOutlined fontSize="small" />
      const action = downloadable(e) ? <DownloadLink sessionId={sessionId} path={path} name={e.name} /> : undefined
      return <TreeItem key={entryId(path)} itemId={entryId(path)} label={<Row icon={icon} action={action}>{e.name}</Row>} />
    })
    if (d.error && dir !== '') {
      rows.push(
        <TreeItem key={errorId(dir)} itemId={errorId(dir)} label={<Box role="alert" sx={{ color: 'error.main' }}>{d.error}</Box>} />,
      )
    }
    if (d.nextOffset !== null) rows.push(<TreeItem key={moreId(dir)} itemId={moreId(dir)} label={<Row>Load more</Row>} />)
    if (rows.length === 0 && dir !== '' && !d.loading) rows.push(<TreeItem key={emptyId(dir)} itemId={emptyId(dir)} disabled label={<Row>empty</Row>} />)
    return rows
  }

  const top = state.dirs['']
  const orientation = phone ? 'vertical' : 'horizontal'
  return (
    <Group key={orientation} data-testid="files-split" data-orientation={orientation} orientation={orientation} style={{ height: '100%' }}>
      <Panel id="files-tree" minSize="15" defaultSize={phone ? '40' : '30'}>
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1 }}>
            <Typography noWrap sx={{ flexGrow: 1, fontFamily: MONO_FONT, ...noteSx }}>
              {state.root ?? ''}
            </Typography>
          </Box>
          {top?.error && (
            <Box role="alert" sx={{ ...noteSx, color: 'error.main', px: 1 }}>
              {top.error}
            </Box>
          )}
          {state.missing && <Typography sx={{ ...noteSx, px: 1 }}>workdir not created yet</Typography>}
          <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'auto' }}>
            <SimpleTreeView
              aria-label="Files"
              expandedItems={state.expanded.map(entryId)}
              selectedItems={tabs.active ? entryId(tabs.active) : null}
              onExpandedItemsChange={(_e, ids) => setExpanded(ids.filter((i) => i.startsWith('e:')).map((i) => i.slice(2)))}
              onItemClick={onItemClick}
            >
              {top ? children('') : null}
            </SimpleTreeView>
          </Box>
        </Box>
      </Panel>
      <Divider style={{ flexBasis: DIVIDER_WIDTH }} />
      <Panel id="files-editor" minSize="20" defaultSize={phone ? '60' : '70'}>
        {tabs.tabs.length === 0 ? <Typography sx={{ ...noteSx, p: 2 }}>Open a file from the tree</Typography> : <FileTabs tabs={tabs} />}
      </Panel>
    </Group>
  )
}
