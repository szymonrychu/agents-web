// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { HOOK_EVENTS_FIXTURE } from '../hooks/testEvents'
import { stubRangeRects } from '../editor/testEditor'
import { theme } from '../theme'
import type { Meta, PresetView } from '../api/client'
import { PresetForm } from './PresetForm'
import { PRESET_FORM_FIELDS, READ_ONLY } from './presetFormFields'

vi.mock('../projects/ProjectContext', () => ({ useProject: () => ({ project: null, projects: [{ slug: 'default', name: 'Default' }, { slug: 'infra', name: 'Infra' }], setProject: () => {} }) }))
const api = vi.hoisted(() => ({ getMeta: vi.fn() }))
vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), ...api }))

interface Schema {
  $ref?: string
  anyOf?: Schema[]
  type?: string
  properties?: Record<string, Schema>
  additionalProperties?: unknown
}
const schemas = (JSON.parse(readFileSync('openapi/orchestrator.json', 'utf8')) as { components: { schemas: Record<string, Schema> } }).components.schemas

/** Follows a $ref and unwraps `anyOf` with null. */
function resolve(node: Schema): Schema {
  if (node.$ref) return resolve(schemas[node.$ref.split('/').pop() as string])
  const nonNull = node.anyOf?.filter((n) => n.type !== 'null')
  return nonNull?.length === 1 ? resolve(nonNull[0]) : node
}

/** Dotted paths of the leaves: an object with properties is walked, an object without them or with additionalProperties is a leaf. */
function leaves(node: Schema, prefix: string[] = []): string[] {
  const n = resolve(node)
  if (n.type === 'object' && n.properties && !n.additionalProperties) return Object.entries(n.properties).flatMap(([k, v]) => leaves(v, [...prefix, k]))
  return [prefix.join('.')]
}

describe('preset form parity with the orchestrator schema', () => {
  test('every orchestrator spec field has a preset form control', () => {
    const presetColumns = Object.keys(schemas.PresetIn.properties ?? {}).filter((k) => k !== 'spec')
    const expected = [...leaves(schemas['SessionSpec-Input']), ...presetColumns, 'extra_projects']
    const readOnly = Object.keys(schemas.PresetView.properties ?? {})
    const mapped = Object.keys(PRESET_FORM_FIELDS)
    expect(expected.filter((k) => !mapped.includes(k)).sort()).toEqual([])
    expect(mapped.filter((k) => !expected.includes(k) && !(readOnly.includes(k) && PRESET_FORM_FIELDS[k] === READ_ONLY)).sort()).toEqual([])
  })

  test('preset parity includes volumes and retrospective', () => {
    expect(PRESET_FORM_FIELDS).toMatchObject({ volumes: 'Volume 1', retrospective: 'Retrospective agent', handoff_profile: 'Handoff profile' })
    expect(Object.keys(PRESET_FORM_FIELDS).filter((k) => k === 'cache' || k.startsWith('cache.'))).toEqual([])
  })

  describe('every mapped label is a control of the form', () => {
    const meta = {
      agent_image: 'img', agent_images: ['img'], credential: { expires_at: null, phase: 'unknown', refuse_hours: 24, warn_days: 7 }, cache: { available: true, max_bytes: 1 }, kube_cluster_access: { available: true },
      kube_namespace_access: { available: true, namespaces: ['media'], tiers: ['read'] }, docker: { available: true, max_cpu: '8', max_memory: '16Gi', max_storage: '100Gi', storage: '30Gi' },
      caps: { max_sessions: 8, max_pvc_size: '100Gi', max_replicas: 16, volume_default_size: '10Gi', volume_max_per_preset: 4, volume_max_size: '500Gi', volume_storage_class: 'x' }, defaults: { any_mcp_config: {}, auto_compact_pct: 80, discard_hook: 'none', effort: 'high', max_attempts: 5, model: 'opus', pvc_size: '10Gi', replicas: 1, resources: { limits: { cpu: '4', memory: '8Gi' }, requests: { cpu: '500m', memory: '1Gi' } }, storage_class: 'x', workdir: 'workdir' },
      discard_hook: 'none', hook_events: HOOK_EVENTS_FIXTURE, mindmap: false, usage: { configured: false, quota_default_pct: 100 }, inactivity: { reminder_seconds: 0, close_seconds: 0, handoff_seconds: 300 },
      permission_modes: [{ value: 'bypassPermissions', label: 'Allow all' }], models: ['opus'], efforts: ['high'],
    } as unknown as Meta
    const full = {
      id: 'p-1', name: 'full', is_default: false, project: 'default', labels: ['l'], extra_projects: ['infra'], created_at: 'x', updated_at: 'x',
      spec: {
        any_mcp_sources: ['github.com/o/r'], init_scripts: ['echo'], docker: true, volumes: [{ volume: 'v-1', mode: 'ro', backup_restore: false }], retrospective: true, handoff_profile: 'work', kube_namespace_access: { media: ['read'] },
        wrapper: { plugins: { marketplaces: [{ name: 'm', source: 'o/r' }], install: [{ plugin: 'p@m' }] } },
      },
    } as unknown as PresetView
    let restoreRange: () => void = () => {}
    beforeAll(() => { restoreRange = stubRangeRects() })
    afterAll(() => restoreRange())
    afterEach(cleanup)

    test('each non-read-only label is found with the full preset open', async () => {
      api.getMeta.mockResolvedValue(meta)
      render(<ThemeProvider theme={theme}><PresetForm open preset={full} onClose={vi.fn()} onSaved={vi.fn()} /></ThemeProvider>)
      await waitFor(() => expect(screen.getByLabelText('Max attempts')).toBeTruthy())
      await screen.findByLabelText('Hook event')
      await screen.findByLabelText('Volume 1')
      const missing = Object.entries(PRESET_FORM_FIELDS).filter(([, label]) => label !== READ_ONLY && screen.queryAllByLabelText(label).length === 0).map(([key]) => key)
      expect(missing).toEqual([])
    })
  })
})
