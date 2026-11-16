/** Typed access to the named, versioned backups API: names, versions, manifests, download, copy, delete and the cleanup policy. */
import { base, query, request } from './client'
import type { components } from './schema'

export type BackupNameView = components['schemas']['BackupNameView']
export type BackupNamePage = components['schemas']['BackupNamePage']
export type BackupVersionView = components['schemas']['BackupVersionView']
export type BackupVersionPage = components['schemas']['BackupVersionPage']
export type BackupManifestView = components['schemas']['BackupManifestView']
export type CleanupPreview = components['schemas']['CleanupPreview']
export type CleanupItem = components['schemas']['CleanupItem']
export type CleanupSettingsView = components['schemas']['CleanupSettingsView']
export type SweepPolicyIn = components['schemas']['SweepPolicyIn']
export type SweepPolicyView = components['schemas']['SweepPolicyView']

/** A name goes into the path one segment at a time: slashes stay, everything else is percent-encoded. */
const path = (name: string) => name.split('/').map(encodeURIComponent).join('/')

/** One page of backup names; `q` filters by name, `cursor` is the previous page's `next_cursor`. */
export const listBackups = (opts: { q?: string; cursor?: string | null } = {}) =>
  request<BackupNamePage>('GET', `/backups${query({ q: opts.q || undefined, cursor: opts.cursor ?? undefined })}`)

/** One page of the versions of a name, newest first as the server gives them. */
export const listVersions = (name: string, cursor?: string | null) =>
  request<BackupVersionPage>('GET', `/backups/${path(name)}/versions${query({ cursor: cursor ?? undefined })}`)

/** The file listing of one version. */
export const getManifest = (name: string, id: string) =>
  request<BackupManifestView>('GET', `/backups/${path(name)}/versions/${encodeURIComponent(id)}/manifest`)

/** Relative URL of a version download, for a plain anchor: the API answers with a redirect to a short-lived presigned GET. */
export const downloadUrl = (name: string, id: string) => `${base()}/backups/${path(name)}/versions/${encodeURIComponent(id)}/download`

/** Copies a version (the current one when `sourceVersion` is left out) to `target`; it replaces the target, no merge. A copy into the same name makes an older version current. */
export const copyBackup = (c: { source: string; sourceVersion?: string; target: string }) =>
  request<BackupVersionView>('POST', '/backups/copy', {
    source: c.source,
    ...(c.sourceVersion === undefined ? {} : { source_version: c.sourceVersion }),
    target: c.target,
  })

/** Deletes one version; the server refuses protected ones. */
export const deleteVersion = (name: string, id: string) => request<void>('DELETE', `/backups/${path(name)}/versions/${encodeURIComponent(id)}`)

/** Deletes a name with all its versions; the server refuses a protected name. */
export const deleteName = (name: string) => request<void>('DELETE', `/backups/${path(name)}`)

/** What the next cleanup sweep would delete, with the retention settings; nothing is deleted. */
export const cleanupPreview = () => request<CleanupPreview>('GET', '/backups/cleanup/preview')

/** The stored cleanup policy, its environment defaults, where it came from and the last sweep result. */
export const getCleanupSettings = () => request<CleanupSettingsView>('GET', '/backups/cleanup/settings')

/** Replaces the whole stored cleanup policy (every field is required). */
export const putCleanupSettings = (p: SweepPolicyIn) => request<CleanupSettingsView>('PUT', '/backups/cleanup/settings', p)

/** Asks the sweeper to run one sweep now; `run_pending` stays true until it has run. */
export const runCleanupNow = () => request<CleanupSettingsView>('POST', '/backups/cleanup/run')
