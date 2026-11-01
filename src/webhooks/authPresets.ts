/** Webhook auth modes and the sender presets that pre-fill them; every pre-filled field stays editable. */
import type { EndpointView } from './api'

export type AuthMode = EndpointView['auth_mode']

export interface AuthFields {
  mode: AuthMode
  header: string
  prefix: string
  timestampHeader: string
}

export interface AuthPreset extends AuthFields {
  id: string
  label: string
}

export const AUTH_MODES: { value: AuthMode; label: string }[] = [
  { value: 'basic', label: 'Basic (user and password)' },
  { value: 'header', label: 'Header token' },
  { value: 'bearer', label: 'Bearer token' },
  { value: 'hmac', label: 'HMAC signature (sha256)' },
]

const preset = (id: string, label: string, mode: AuthMode, header = '', prefix = '', timestampHeader = ''): AuthPreset =>
  ({ id, label, mode, header, prefix, timestampHeader })

export const AUTH_PRESETS: AuthPreset[] = [
  preset('gitlab', 'GitLab (secret token, X-Gitlab-Token)', 'header', 'X-Gitlab-Token'),
  preset('github', 'GitHub (HMAC sha256)', 'hmac', 'X-Hub-Signature-256', 'sha256='),
  preset('grafana-bearer', 'Grafana (bearer token)', 'bearer'),
  preset('grafana-hmac', 'Grafana (HMAC signature)', 'hmac', 'X-Grafana-Alerting-Signature'),
  preset('basic', 'Basic (user and password)', 'basic'),
  preset('custom', 'Custom', 'header'),
]

export const presetById = (id: string): AuthPreset => AUTH_PRESETS.find((p) => p.id === id) ?? AUTH_PRESETS[AUTH_PRESETS.length - 1]

/** The preset a stored config matches exactly, else Custom. */
export function presetFor(f: AuthFields): AuthPreset {
  const same = (p: AuthPreset) => p.mode === f.mode && p.header === f.header && p.prefix === f.prefix && p.timestampHeader === f.timestampHeader
  return AUTH_PRESETS.find((p) => p.id !== 'custom' && same(p)) ?? presetById('custom')
}

/** Request fields for a mode: those that do not belong to it are null, which the backend requires (and PATCH clears). */
export function authPayload(f: AuthFields) {
  const header = f.mode === 'header' || f.mode === 'hmac'
  const hmac = f.mode === 'hmac'
  return {
    auth_mode: f.mode,
    auth_header: header ? f.header : null,
    hmac_algorithm: hmac ? ('sha256' as const) : null,
    hmac_prefix: hmac ? f.prefix : null,
    hmac_timestamp_header: hmac && f.timestampHeader ? f.timestampHeader : null,
  }
}

export interface HintSubject {
  auth_mode: AuthMode
  auth_header: string | null
  type: string
}

/** How to configure the sender once the secret is known. */
export function setupHint(e: HintSubject): string {
  const grafana = e.type === 'grafana-alert'
  switch (e.auth_mode) {
    case 'bearer':
      return 'Send "Authorization: Bearer <secret>". In Grafana, set the webhook contact point Authorization header scheme to Bearer and its credentials to the secret.'
    case 'header':
      return e.auth_header === 'X-Gitlab-Token'
        ? 'In GitLab, open the webhook and paste the secret into "Secret token"; GitLab sends it as X-Gitlab-Token.'
        : `Send the secret in the ${e.auth_header} request header.`
    case 'hmac':
      return e.auth_header === 'X-Hub-Signature-256'
        ? 'In GitHub, paste the secret into the webhook "Secret" field. Set "Content type: application/json" (GitHub defaults to application/x-www-form-urlencoded, which is not parsed).'
        : `Sign the raw request body with HMAC-SHA256 using the secret and send the hex digest in the ${e.auth_header} header (with the configured prefix and timestamp header, if any).`
    default:
      return grafana
        ? 'In Grafana, add a webhook contact point with this URL and enter the username and password in its basic auth fields.'
        : 'Use https://<user>:<password>@<host>/webhook/<suffix> as the webhook URL in GitHub or GitLab (user and password from below). Set "Content type: application/json" (GitHub defaults to application/x-www-form-urlencoded, which is not parsed).'
  }
}
