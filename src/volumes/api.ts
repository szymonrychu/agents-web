/** Typed access to the orchestrator volumes API (/api/v1/volumes) and the volume caps of /meta. */
import { ApiError, query, request } from '../api/client'
import type { components } from '../api/schema'

type S = components['schemas']
export type VolumeView = S['VolumeView']
export type VolumeDetail = S['VolumeDetail']
export type VolumeCreateIn = S['VolumeCreateIn']
export type VolumePatchIn = S['VolumePatchIn']
export type VolumeEventView = S['VolumeEventView']
export type VolumeEventPage = S['VolumeEventPage']
export type MetaCaps = S['MetaCaps']

const id = encodeURIComponent

export const listVolumes = (project?: string) => request<VolumeView[]>('GET', `/volumes${query({ project: project || undefined })}`)
export const getVolume = (volumeId: string) => request<VolumeDetail>('GET', `/volumes/${id(volumeId)}`)
export const createVolume = (body: VolumeCreateIn) => request<VolumeView>('POST', '/volumes', body)
export const patchVolume = (volumeId: string, body: VolumePatchIn) => request<VolumeDetail>('PATCH', `/volumes/${id(volumeId)}`, body)
export const deleteVolume = (volumeId: string) => request<VolumeView>('DELETE', `/volumes/${id(volumeId)}`)
export const volumeEvents = (volumeId: string, before?: number, limit = 20) =>
  request<VolumeEventPage>('GET', `/volumes/${id(volumeId)}/events${query({ before, limit })}`)
export const saveVolume = (volumeId: string) => request<VolumeView>('POST', `/volumes/${id(volumeId)}/save`)
export const restoreVolume = (volumeId: string, version: string) => request<VolumeView>('POST', `/volumes/${id(volumeId)}/restore`, { version })

/** Readable text for the error codes the volume routes answer; anything else keeps the server message. */
const REASONS: Record<string, string> = {
  volume_attached: 'A preset attaches this volume. Detach it from every preset first.',
  volume_mounted: 'A session has this volume mounted. Wait until the sessions end.',
  project_in_use: 'A preset or session of a project you are removing still uses this volume.',
  shrink_refused: 'A volume can only grow, never shrink.',
  volume_busy: 'The volume is not ready (a restore, save or resize is running). Try again shortly.',
  volume_not_found: 'This volume no longer exists.',
  version_not_found: 'This backup version no longer exists.',
  volume_exists: 'A volume with this name already exists.',
}
export const volumeErrorText = (e: unknown): string =>
  e instanceof ApiError && REASONS[e.code] ? REASONS[e.code] : e instanceof Error ? e.message : String(e)

/** The Backups page filter for the S3 backups of a volume (backup name volume-<name>). */
export const backupsLink = (name: string) => `/?view=backups&name=${encodeURIComponent(`volume-${name}`)}`

const UNITS: Record<string, number> = { '': 1, K: 1e3, M: 1e6, G: 1e9, T: 1e12, Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4 }
/** Bytes of a Kubernetes quantity such as "10Gi" or "500M"; NaN when it does not parse. */
export function parseSize(s: string): number {
  const m = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|K|M|G|T)?$/.exec(s.trim())
  return m ? Number(m[1]) * UNITS[m[2] ?? ''] : NaN
}

export const parseLines = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter((x) => x !== '')
