/** Small copy-to-clipboard icon-less button shared by the endpoint views. */
import Button from '@mui/material/Button'

export function CopyButton({ label, value }: { label: string; value: string }) {
  return (
    <Button size="small" aria-label={label} onClick={() => void navigator.clipboard?.writeText(value)}>
      Copy
    </Button>
  )
}
