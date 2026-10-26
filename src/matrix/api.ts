/** Typed access to the matrix connector API, over the `matrix` backend's base path. */
import { query, requestAt } from '../api/client';
import { backendBase } from '../config/backends';
import type { components } from '../api/matrix-schema';

type S = components['schemas'];
export type MatrixMeta = S['MetaView'];
export type RoomView = S['RoomView'];
export type RoomDetail = S['RoomDetail'];
export type RoomSettingsIn = S['RoomSettingsIn'];
export type MessageView = S['MessageView'];
export type UserView = S['UserView'];
export type RuleIn = S['RuleIn'];
export type RuleView = S['RuleView'];
export type RulesView = S['RulesView'];
export type SettingsIn = S['SettingsIn'];
export type SettingsView = S['SettingsView'];

const id = encodeURIComponent;
const req = <T>(method: string, path: string, body?: unknown) => requestAt<T>(backendBase('matrix'), method, path, body);

export const getMeta = () => req<MatrixMeta>('GET', '/meta');

export interface RoomsQuery {
  kind?: string;
  access?: string;
}
export const listRooms = (opts: RoomsQuery = {}) => req<RoomView[]>('GET', `/rooms${query({ kind: opts.kind, access: opts.access })}`);
export const getRoom = (roomId: string) => req<RoomDetail>('GET', `/rooms/${id(roomId)}`);
export const setRoomSettings = (roomId: string, body: RoomSettingsIn) => req<RoomDetail>('PUT', `/rooms/${id(roomId)}/settings`, body);

export interface PageQuery {
  limit?: number;
  beforeId?: string;
}
export const listRoomMessages = (roomId: string, opts: PageQuery = {}) =>
  req<MessageView[]>('GET', `/rooms/${id(roomId)}/messages${query({ limit: opts.limit, before_id: opts.beforeId })}`);

export interface UsersQuery {
  q?: string;
  limit?: number;
}
export const listUsers = (opts: UsersQuery = {}) => req<UserView[]>('GET', `/users${query({ q: opts.q, limit: opts.limit })}`);

export const listRules = () => req<RulesView>('GET', '/rules');
export const addRule = (body: RuleIn) => req<RuleView>('POST', '/rules', body);
export const deleteRule = (ruleId: string | number) => req<void>('DELETE', `/rules/${id(String(ruleId))}`);

export const getSettings = () => req<SettingsView>('GET', '/settings');
export const setSettings = (body: SettingsIn) => req<SettingsView>('PUT', '/settings', body);

export interface MessagesQuery extends PageQuery {
  status?: string;
  roomId?: string;
}
export const listMessages = (opts: MessagesQuery = {}) =>
  req<MessageView[]>('GET', `/messages${query({ status: opts.status, room_id: opts.roomId, limit: opts.limit, before_id: opts.beforeId })}`);
