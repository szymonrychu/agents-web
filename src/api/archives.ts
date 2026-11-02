/** Typed access to the S3 workspace archives API: list, cleanup dry-run preview, download URL and delete. */
import { base, query, request } from './client'
import type { components } from './schema'

export type ArchiveView = components['schemas']['ArchiveView']
export type ArchivePage = components['schemas']['ArchivePage']
export type CleanupPreview = components['schemas']['CleanupPreview']
export type CleanupItem = components['schemas']['CleanupItem']
export type ArchiveDeleteResult = components['schemas']['ArchiveDeleteResult']
export type CleanupSettingsView = components['schemas']['CleanupSettingsView']
export type SweepPolicyIn = components['schemas']['SweepPolicyIn']
export type SweepPolicyView = components['schemas']['SweepPolicyView']

/** One page of archives, newest listing order as the server gives it; `cursor` is the previous page's `next_cursor`. */
export const listArchives = (opts: { prefix?: string; cursor?: string | null; limit?: number } = {}) =>
  request<ArchivePage>('GET', `/cache/archives${query({ prefix: opts.prefix || undefined, cursor: opts.cursor ?? undefined, limit: opts.limit })}`)

/** What the next cleanup sweep would delete, with the retention settings; nothing is deleted. */
export const cleanupPreview = () => request<CleanupPreview>('GET', '/cache/cleanup/preview')

/** The stored cleanup policy, its environment defaults, where it came from and the last sweep result. */
export const getCleanupSettings = () => request<CleanupSettingsView>('GET', '/cache/cleanup/settings')

/** Replaces the whole stored cleanup policy (every field is required). */
export const putCleanupSettings = (p: SweepPolicyIn) => request<CleanupSettingsView>('PUT', '/cache/cleanup/settings', p)

/** Asks the sweeper to run one sweep now; `run_pending` stays true until it has run. */
export const runCleanupNow = () => request<CleanupSettingsView>('POST', '/cache/cleanup/run')

/** Deletes archives by key; keys a live session references come back in `refused`. */
export const deleteArchives = (keys: string[]) => request<ArchiveDeleteResult>('DELETE', '/cache/archives', { keys })

/** Relative URL of an archive download, for a plain anchor: the API answers with a redirect to a short-lived presigned GET. */
export const archiveDownloadUrl = (key: string) => `${base()}/cache/archives/download${query({ key })}`
