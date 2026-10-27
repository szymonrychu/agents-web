/**
 * Chat message text rendered as safe GFM markdown (react-markdown, remark-gfm, remark-breaks), every element mapped to MUI.
 *
 * Safety: raw HTML stays text (react-markdown's default: no skipHtml, no rehype plugin), every URL goes through the default
 * `defaultUrlTransform` (an unsafe one becomes '' and the element gets no href), and images never render an img element.
 */
import { createContext, useContext } from 'react'
import Markdown from 'react-markdown'
import type { Components, ExtraProps } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import Link from '@mui/material/Link'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import type { SxProps, Theme } from '@mui/material/styles'
import type { CSSProperties, ReactNode } from 'react'
import { MONO_FONT, TOKENS } from '../theme'

type HastNode = NonNullable<ExtraProps['node']>['children'][number]

const inherit = { color: 'inherit', fontWeight: 'inherit' } as const
const monoSm = { fontFamily: MONO_FONT, fontSize: `${TOKENS.fontSizes.sm / 16}rem` } as const
const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' } as const
const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const
const CELL_ALIGN = ['left', 'center', 'right', 'justify'] as const

/** True below a link, so an image there labels the outer link instead of nesting a second anchor. */
const InLink = createContext(false)

const hastText = (n: HastNode): string => (n.type === 'text' ? n.value : n.type === 'element' ? n.children.map(hastText).join('') : '')

/** A link: new tab for a kept URL, in-page for a fragment (footnotes), no href when the URL transform dropped it. */
function MdLink({ href, id, label, children }: { href?: string; id?: string; label?: string; children: ReactNode }) {
  const target = href && !href.startsWith('#') ? NEW_TAB : {}
  return (
    <InLink.Provider value>
      <Link href={href || undefined} id={id} aria-label={label} underline="always" {...target}>
        {children}
      </Link>
    </InLink.Provider>
  )
}

function MdImage({ src, alt }: { src?: string; alt?: string }) {
  const inLink = useContext(InLink)
  const name = alt || src
  if (!src || inLink) return <>{name}</>
  return <MdLink href={src}>{name}</MdLink>
}

function cellAlign(style: CSSProperties | undefined): (typeof CELL_ALIGN)[number] | undefined {
  return CELL_ALIGN.find((a) => a === style?.textAlign)
}

const heading = (level: (typeof HEADINGS)[number]): Components[typeof level] =>
  function MdHeading({ id, children }) {
    return (
      <Typography variant={level} component={level} id={id} sx={{ m: 0 }}>
        {children}
      </Typography>
    )
  }

const COMPONENTS: Components = {
  ...Object.fromEntries(HEADINGS.map((h) => [h, heading(h)])),
  p: ({ children }) => (
    <Typography variant="body1" component="p" sx={{ m: 0, overflowWrap: 'anywhere', ...inherit }}>
      {children}
    </Typography>
  ),
  a: ({ href, id, children, 'aria-label': label }) => (
    <MdLink href={href} id={id} label={label}>
      {children}
    </MdLink>
  ),
  img: ({ src, alt }) => <MdImage src={typeof src === 'string' ? src : undefined} alt={alt} />,
  strong: ({ children }) => (
    <Box component="strong" sx={{ fontWeight: TOKENS.fontWeights.medium }}>
      {children}
    </Box>
  ),
  em: ({ children }) => (
    <Box component="em" sx={{ fontStyle: 'italic' }}>
      {children}
    </Box>
  ),
  del: ({ children }) => (
    <Box component="del" sx={{ textDecoration: 'line-through' }}>
      {children}
    </Box>
  ),
  ul: ({ className, children }) => (
    <Box component="ul" className={className} sx={{ m: 0, pl: 3, ...(className?.includes('contains-task-list') ? { listStyle: 'none', pl: 0 } : {}) }}>
      {children}
    </Box>
  ),
  ol: ({ start, children }) => (
    <Box component="ol" start={start} sx={{ m: 0, pl: 3 }}>
      {children}
    </Box>
  ),
  li: ({ id, className, children }) => (
    <Box component="li" id={id} className={className} sx={{ overflowWrap: 'anywhere', ...inherit }}>
      {children}
    </Box>
  ),
  input: ({ type, checked }) => (type === 'checkbox' ? <Checkbox size="small" disabled checked={Boolean(checked)} sx={{ p: 0, mr: 0.5 }} /> : null),
  blockquote: ({ children }) => (
    <Box component="blockquote" sx={{ m: 0, pl: 1, borderLeft: TOKENS.borderWidth * 2, borderColor: 'divider', color: 'text.secondary', '& > * + *': { mt: 1 } }}>
      {children}
    </Box>
  ),
  hr: () => <Divider />,
  table: ({ children }) => (
    <TableContainer sx={{ overflowX: 'auto' }}>
      <Table size="small">{children}</Table>
    </TableContainer>
  ),
  thead: ({ children }) => <TableHead>{children}</TableHead>,
  tbody: ({ children }) => <TableBody>{children}</TableBody>,
  tr: ({ children }) => <TableRow>{children}</TableRow>,
  th: ({ style, children }) => (
    <TableCell align={cellAlign(style)} sx={{ overflowWrap: 'anywhere', ...inherit }}>
      {children}
    </TableCell>
  ),
  td: ({ style, children }) => (
    <TableCell align={cellAlign(style)} sx={{ overflowWrap: 'anywhere', ...inherit }}>
      {children}
    </TableCell>
  ),
  code: ({ children }) => (
    <Box component="code" sx={{ ...monoSm, bgcolor: TOKENS.bgRaised, borderRadius: 1, px: 0.5 }}>
      {children}
    </Box>
  ),
  pre: function MdCodeBlock({ node }) {
    const code = node?.children.find((c) => c.type === 'element' && c.tagName === 'code')
    const classes = code?.type === 'element' ? code.properties.className : undefined
    const language = Array.isArray(classes) ? classes.map(String).find((c) => c.startsWith('language-'))?.slice('language-'.length) : undefined
    return (
      <Box>
        {language ? (
          <Typography variant="caption" component="div" sx={{ color: 'text.secondary', fontFamily: MONO_FONT }}>
            {language}
          </Typography>
        ) : null}
        <Box
          component="pre"
          sx={{ ...monoSm, m: 0, p: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 320, overflow: 'auto', bgcolor: TOKENS.bgRaised, border: TOKENS.borderWidth, borderColor: 'divider', borderRadius: 1 }}
        >
          <code>{code ? hastText(code) : ''}</code>
        </Box>
      </Box>
    )
  },
}

const ROOT = { minWidth: 0, typography: 'body1', overflowWrap: 'anywhere', '& > * + *': { mt: 1 }, '& li > * + *': { mt: 0.5 } } as const

/** Render one chat message's text as markdown; `sx` lands on the root, whose colour and weight the text elements inherit. */
export function ChatMarkdown({ text, sx }: { text: string; sx?: SxProps<Theme> }) {
  return (
    <Box sx={[ROOT, ...(Array.isArray(sx) ? sx : [sx])]}>
      <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} components={COMPONENTS}>
        {text}
      </Markdown>
    </Box>
  )
}
