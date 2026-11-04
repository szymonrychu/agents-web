/** Typed access to the agents-app-connector admin API, over the `devices` backend's base path. */
import { requestAt } from '../api/client';
import { backendBase } from '../config/backends';

export type DeviceState = 'pending' | 'active' | 'revoked';
export type CodeStatus = 'pending' | 'redeemed' | 'expired' | 'superseded' | 'locked';

export interface DeviceView {
  device_id: string;
  name: string;
  plugin: string;
  created_at: string;
  revoked_at: string | null;
  /** `pending` = no token yet. */
  state: DeviceState;
  paired_at: string | null;
  /** Of the newest code; the code value is never listed. */
  code_expires_at: string | null;
  code_status: CodeStatus | null;
}
/** A fresh pairing code; typed on the tablet within `expires_in` seconds. */
export interface NewCode {
  code: string;
  expires_at: string;
  expires_in: number;
}
export interface PairedDevice extends NewCode {
  device_id: string;
  name: string;
  plugin: string;
}

const id = encodeURIComponent;
const req = <T>(method: string, path: string, body?: unknown) => requestAt<T>(backendBase('devices'), method, path, body);

export const listDevices = () => req<DeviceView[]>('GET', '/devices');
export const pairDevice = (name: string) => req<PairedDevice>('POST', '/devices', { name, plugin: 'sketch' });
export const revokeDevice = (deviceId: string) => req<void>('DELETE', `/devices/${id(deviceId)}`);
export const regenerateCode = (deviceId: string) => req<NewCode>('POST', `/devices/${id(deviceId)}/code`);
