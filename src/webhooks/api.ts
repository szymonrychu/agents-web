/** Typed access to the webhook API, over the `webhooks` backend's base path. */
import { query, requestAt } from '../api/client';
import { backendBase } from '../config/backends';
import type { components } from '../api/webhooks-schema';

type S = components['schemas'];
export type EndpointView = S['EndpointView'];
export type EndpointIn = S['EndpointIn'];
export type EndpointCreated = S['EndpointCreated'];
export type RotateIn = S['RotateIn'];
export type EventView = S['EventView'];
export type EventDetail = S['EventDetail'];
export type WebhookMeta = S['Meta'];

const id = encodeURIComponent;
const req = <T>(method: string, path: string, body?: unknown) => requestAt<T>(backendBase('webhooks'), method, path, body);

export const listEndpoints = () => req<EndpointView[]>('GET', '/endpoints');
/** The answer carries the one-time password; it is never shown again. */
export const createEndpoint = (body: EndpointIn) => req<EndpointCreated>('POST', '/endpoints', body);
/** Issues a new one-time password for the endpoint. */
export const rotateEndpoint = (endpointId: string, body?: RotateIn) =>
  req<EndpointCreated>('POST', `/endpoints/${id(endpointId)}/rotate`, body);
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
