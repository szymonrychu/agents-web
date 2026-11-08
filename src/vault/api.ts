/** Typed access to the agents-vault user API, over the `vault` backend's base path. */
import { ApiError, query } from '../api/client';
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

/** An API error that keeps the `attachments` list a 409 carries inside `error`. */
export class VaultApiError extends ApiError {
  readonly attachments: DeleteAttachment[];
  constructor(status: number, code: string, message: string, attachments: DeleteAttachment[]) {
    super(status, code, message);
    this.name = 'VaultApiError';
    this.attachments = attachments;
  }
}

async function toError(res: Response): Promise<VaultApiError> {
  let code = 'http_error';
  let message = res.statusText || `HTTP ${res.status}`;
  let attachments: DeleteAttachment[] = [];
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string; attachments?: DeleteAttachment[] } };
    if (body.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      if (Array.isArray(body.error.attachments)) attachments = body.error.attachments;
    }
  } catch {
    // non-JSON error body: keep the defaults
  }
  return new VaultApiError(res.status, code, message, attachments);
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${backendBase('vault')}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const id = encodeURIComponent;

/** True when the runtime config lists a `vault` backend. */
export const vaultEnabled = () => isConfigured('vault');

export const listEntries = (q?: { q?: string; label?: string }) =>
  req<EntryView[]>('GET', `/entries${query({ q: q?.q || undefined, label: q?.label || undefined })}`);
export const getEntry = (entryId: string) => req<EntryDetail>('GET', `/entries/${id(entryId)}`);
export const createEntry = (entry: EntryIn) => req<EntryView>('POST', '/entries', entry);
export const patchEntry = (entryId: string, patch: EntryPatch) => req<EntryDetail>('PATCH', `/entries/${id(entryId)}`, patch);
/** Rotates every protected env at once: `values` holds exactly the protected env names. */
export const rotateEntry = (entryId: string, values: Record<string, string>) => req<EntryView>('PUT', `/entries/${id(entryId)}/value`, { values });
export const deleteEntry = (entryId: string) => req<void>('DELETE', `/entries/${id(entryId)}`);
export const listPins = (entryId: string) => req<PinView[]>('GET', `/entries/${id(entryId)}/pins`);
export const listEvents = (entryId: string, limit = 20) => req<EventView[]>('GET', `/events${query({ entry: entryId, limit })}`);
