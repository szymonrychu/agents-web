/** Typed access to the agents-vault user API, over the `vault` backend's base path. */
import { ApiError, query, requestAt } from '../api/client';
import { backendBase, isConfigured } from '../config/backends';
import type { components } from '../api/vault-schema';

type S = components['schemas'];
export type EntryView = S['EntryView'];
export type EntryDetail = S['EntryDetail'];
export type EntryIn = S['EntryIn'];
export type EntryPatch = S['EntryPatch'];
export type EnvIn = S['EnvIn'];
export type EnvView = S['EnvView'];
export type AttachmentView = S['AttachmentView'];
export type PinView = S['PinView'];
export type EventView = S['EventView'];

/** An attachment as the 409 `vault_entry_attached` body lists it. */
export interface DeleteAttachment {
  preset_id: string;
  preset_name: string;
  env: string;
  entry_env: string;
}

const req = <T>(method: string, path: string, body?: unknown) => requestAt<T>(backendBase('vault'), method, path, body);

/** The attachments a 409 `vault_entry_attached` error lists (empty for any other error). */
export const errorAttachments = (e: unknown): DeleteAttachment[] =>
  e instanceof ApiError && Array.isArray(e.details.attachments) ? (e.details.attachments as DeleteAttachment[]) : [];

/** True for the 503 `orchestrator_unavailable` answer: attachments could not be checked and nothing changed. */
export const isOrchestratorUnavailable = (e: unknown) => e instanceof ApiError && e.status === 503 && e.code === 'orchestrator_unavailable';

const id = encodeURIComponent;

/** True when the runtime config lists a `vault` backend. */
export const vaultEnabled = () => isConfigured('vault');

export const listEntries = (q?: { q?: string; label?: string }) =>
  req<EntryView[]>('GET', `/entries${query({ q: q?.q || undefined, label: q?.label || undefined })}`);
export const getEntry = (entryId: string) => req<EntryDetail>('GET', `/entries/${id(entryId)}`);
export const createEntry = (entry: EntryIn) => req<EntryView>('POST', '/entries', entry);
/** `force` confirms a label change that touches a `project:` label of an attached entry. */
export const patchEntry = (entryId: string, patch: EntryPatch, force = false) =>
  req<EntryDetail>('PATCH', `/entries/${id(entryId)}${force ? query({ force: 'true' }) : ''}`, patch);
/** Rotates every protected env at once: `values` holds exactly the protected env names. */
export const rotateEntry = (entryId: string, values: Record<string, string>) => req<EntryView>('PUT', `/entries/${id(entryId)}/value`, { values });
export const deleteEntry = (entryId: string) => req<void>('DELETE', `/entries/${id(entryId)}`);
export const listPins = (entryId: string) => req<PinView[]>('GET', `/entries/${id(entryId)}/pins`);
export const listEvents = (entryId: string, limit = 20) => req<EventView[]>('GET', `/events${query({ entry: entryId, limit })}`);
