/** Typed access to the session workdir file API (read-only). */
import { base, query, request } from './client'
import type { components } from './schema'

export type FileListing = components['schemas']['FileListing']
export type FileEntry = components['schemas']['FileEntry']
export type FileContent = components['schemas']['FileContent']

const id = encodeURIComponent

/** One directory of the workdir; `path` is relative to the workdir root ("" is the root), `offset` the previous page's `next_offset`. */
export const listFiles = (sessionId: string, path: string, offset?: number) =>
  request<FileListing>('GET', `/sessions/${id(sessionId)}/files${query({ path, offset })}`)

/** One file of the workdir, with its content when it is text. */
export const readFile = (sessionId: string, path: string) =>
  request<FileContent>('GET', `/sessions/${id(sessionId)}/files/content${query({ path })}`)

/** Relative URL of the raw-bytes download of one workdir file, for a plain anchor (the browser saves it; nothing is buffered here). */
export const fileDownloadUrl = (sessionId: string, path: string) => `${base()}/sessions/${id(sessionId)}/files/download${query({ path })}`
