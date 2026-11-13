/**
 * Shared "session expired" state. A 401 from any API call (the SSO proxy answers 401 to requests that accept
 * JSON once the login is gone) sets it; polls and stream reconnects stop and the app shows a banner. It is
 * cleared only by a page reload, which signs in again.
 */
import { useSyncExternalStore } from 'react';

let expired = false;
const listeners = new Set<() => void>();

export const isSessionExpired = () => expired;

export function markSessionExpired(): void {
  if (expired) return;
  expired = true;
  for (const l of [...listeners]) l();
}

export function subscribeSessionExpired(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export const useSessionExpired = () => useSyncExternalStore(subscribeSessionExpired, isSessionExpired);

/** Test helper: back to the signed-in state. */
export function resetSessionExpired(): void {
  expired = false;
}
