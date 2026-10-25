import Alert from '@mui/material/Alert'

/** The backend's `{error: {code, message}}` body, or any thrown error. */
export type FormErrorValue = { error: { code: string; message: string } } | { code: string; message: string } | Error | string | null | undefined

function describe(error: Exclude<FormErrorValue, null | undefined>): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code
    return typeof code === 'string' ? `${code}: ${error.message}` : error.message
  }
  if ('error' in error) return `${error.error.code}: ${error.error.message}`
  return `${error.code}: ${error.message}`
}

export function FormError({ error }: { error: FormErrorValue }) {
  if (error === null || error === undefined) return null
  return <Alert severity="error">{describe(error)}</Alert>
}
