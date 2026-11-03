/** Typed access to the agents-app-connector admin API, over the `devices` backend's base path. */
import { requestAt } from '../api/client';
import { backendBase } from '../config/backends';

export interface DeviceView {
  device_id: string;
  name: string;
  plugin: string;
  created_at: string;
  revoked_at: string | null;
}
/** The pairing answer; `token` is shown by the server exactly once. */
export interface PairedDevice {
  device_id: string;
  name: string;
  plugin: string;
  token: string;
}

const id = encodeURIComponent;
const req = <T>(method: string, path: string, body?: unknown) => requestAt<T>(backendBase('devices'), method, path, body);

export const listDevices = () => req<DeviceView[]>('GET', '/devices');
export const pairDevice = (name: string) => req<PairedDevice>('POST', '/devices', { name, plugin: 'sketch' });
export const revokeDevice = (deviceId: string) => req<void>('DELETE', `/devices/${id(deviceId)}`);
