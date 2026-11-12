/** Amber count in a session tab: open decisions the session asked, or `!` when only an agent prompt waits. */
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { TOKENS } from '../theme'
import type { SessionAttention } from './attention'

export interface AttentionBubbleProps {
  slug: string
  attention: SessionAttention
  onOpen: () => void
}

export function AttentionBubble({ slug, attention, onOpen }: AttentionBubbleProps) {
  const n = attention.decisions
  return (
    <IconButton
      size="small"
      component="span"
      role="button"
      aria-label={n > 0 ? `${n} open ${n === 1 ? 'decision' : 'decisions'} for ${slug}` : `${slug} is waiting for input`}
      // Tab fires onChange before a child's onClick and ignores preventDefault: only stopPropagation keeps the tab as it is.
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
    >
      <Box
        component="span"
        sx={{
          minWidth: 18,
          height: 18,
          px: 0.5,
          borderRadius: 9,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'warning.main',
          color: 'warning.contrastText',
          fontSize: `${TOKENS.fontSizes.xs / 16}rem`,
          fontWeight: TOKENS.fontWeights.medium,
          lineHeight: 1,
        }}
      >
        {n > 0 ? n : '!'}
      </Box>
    </IconButton>
  )
}
