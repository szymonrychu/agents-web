/** Typed access to the S3 workspace archives API: list, cleanup dry-run preview, download URL and delete. */
import { base, query, request } from './client'
import type { components } from './schema'

export type ArchiveView = components['schemas']['ArchiveView']
export type ArchivePage = components['schemas']['ArchivePage']
export type CleanupPreview = components['schemas']['CleanupPreview']
export type CleanupItem = components['schemas']['CleanupItem']
export type ArchiveDeleteResult = components['schemas']['ArchiveDeleteResult']

/** One page of archives, newest listing order as the server gives it; `cursor` is the previous page's `next_cursor`. */
export const listArchives = (opts: { prefix?: string; cursor?: string | null; limit?: number } = {}) =>
  request<ArchivePage>('GET', `/cache/archives${query({ prefix: opts.prefix || undefined, cursor: opts.cursor ?? undefined, limit: opts.limit })}`)

/** What the next cleanup sweep would delete, with the retention settings; nothing is deleted. */
export const cleanupPreview = () => request<CleanupPreview>('GET', '/cache/cleanup/preview')

/** Deletes archives by key; keys a live session references come back in `refused`. */
export const deleteArchives = (keys: string[]) => request<ArchiveDeleteResult>('DELETE', '/cache/archives', { keys })

/** Relative URL of an archive download, for a plain anchor: the API answers with a redirect to a short-lived presigned GET. */
export const archiveDownloadUrl = (key: string) => `${base()}/cache/archives/download${query({ key })}`
