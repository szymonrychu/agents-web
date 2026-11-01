/** Typed access to the webhook API, over the `webhooks` backend's base path. */
import { query, requestAt } from '../api/client';
import { backendBase } from '../config/backends';
import type { components } from '../api/webhooks-schema';

type S = components['schemas'];
export type EndpointView = S['EndpointView'];
export type EndpointIn = S['EndpointIn'];
export type EndpointCreated = S['EndpointCreated'];
export type EndpointPatch = S['EndpointPatch'];
export type CloneIn = S['CloneIn'];
export type RotateIn = S['RotateIn'];
export type EventView = S['EventView'];
export type EventDetail = S['EventDetail'];
export type WebhookMeta = S['Meta'];
export type PreviewIn = S['PreviewIn'];
export type PreviewOut = S['PreviewOut'];
export type Filters = S['Filters'];
export type FilterRule = S['FilterRule'];
export type FilterResult = S['FilterResult'];

const id = encodeURIComponent;
const req = <T>(method: string, path: string, body?: unknown) => requestAt<T>(backendBase('webhooks'), method, path, body);

export const listEndpoints = () => req<EndpointView[]>('GET', '/endpoints');
/** The answer carries the one-time password or secret; it is never shown again. */
export const createEndpoint = (body: EndpointIn) => req<EndpointCreated>('POST', '/endpoints', body);
/** Changes every field except the secret; the answer carries a new secret only when `auth_mode` changed. */
export const patchEndpoint = (endpointId: string, body: EndpointPatch) =>
  req<EndpointCreated>('PATCH', `/endpoints/${id(endpointId)}`, body);
/** Copies the config into a new endpoint with a new id, suffix and one-time secret. */
export const cloneEndpoint = (endpointId: string, body?: CloneIn) =>
  req<EndpointCreated>('POST', `/endpoints/${id(endpointId)}/clone`, body);
/** Issues a new one-time secret (or password in basic mode) for the endpoint. */
export const rotateEndpoint = (endpointId: string, body?: RotateIn) =>
  req<EndpointCreated>('POST', `/endpoints/${id(endpointId)}/rotate`, body);
/** Replaces the endpoint's allow/deny filters wholesale. */
export const setEndpointFilters = (endpointId: string, filters: Filters) =>
  req<EndpointView>('PUT', `/endpoints/${id(endpointId)}/filters`, filters);
export const deleteEndpoint = (endpointId: string) => req<void>('DELETE', `/endpoints/${id(endpointId)}`);

export interface EventsQuery {
  status?: string;
  endpointId?: string;
  limit?: number;
  beforeId?: string;
}
export const listEvents = (opts: EventsQuery = {}) =>
  req<EventView[]>('GET', `/events${query({ status: opts.status, endpoint_id: opts.endpointId, limit: opts.limit, before_id: opts.beforeId })}`);
export const getEvent = (eventId: string) => req<EventDetail>('GET', `/events/${id(eventId)}`);
export const getMeta = () => req<WebhookMeta>('GET', '/meta');
/** Renders a Jinja2 prompt template and/or evaluates filters against an example payload; nothing is stored. */
export const previewTemplate = (body: PreviewIn) => req<PreviewOut>('POST', '/templates/preview', body);
