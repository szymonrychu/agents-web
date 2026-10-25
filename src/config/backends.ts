/** Runtime backend configuration, read from /config.json (design D3). */

export interface Backend {
  id: string;
  label: string;
  basePath: string;
}
export interface RuntimeConfig {
  backends: Backend[];
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const ID_RE = /^[a-z][a-z0-9-]*$/;
const DEFAULT_CONFIG: RuntimeConfig = {
  backends: [{ id: 'orchestrator', label: 'Orchestrator', basePath: '/api/v1' }],
};

let current: RuntimeConfig = DEFAULT_CONFIG;

function parseBackend(raw: unknown, index: number, seen: Set<string>): Backend {
  const at = `backends[${index}]`;
  if (typeof raw !== 'object' || raw === null) throw new ConfigError(`${at} must be an object`);
  const { id, label, basePath } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new ConfigError(`${at}.id must match ${ID_RE.source}`);
  if (seen.has(id)) throw new ConfigError(`${at}.id "${id}" is repeated`);
  seen.add(id);
  if (typeof label !== 'string' || label === '') throw new ConfigError(`${at}.label must be a non-empty string`);
  if (
    typeof basePath !== 'string' ||
    !basePath.startsWith('/') ||
    basePath.endsWith('/') ||
    ['//', '://', '?', '#'].some((bad) => basePath.includes(bad))
  ) {
    throw new ConfigError(`${at}.basePath must start with "/", not end with "/" and contain none of "//", "://", "?", "#"`);
  }
  return { id, label, basePath };
}

export function parseConfig(json: unknown): RuntimeConfig {
  const list = typeof json === 'object' && json !== null ? (json as Record<string, unknown>).backends : undefined;
  if (!Array.isArray(list)) throw new ConfigError('backends must be an array');
  const seen = new Set<string>();
  const backends = list.map((b, i) => parseBackend(b, i, seen));
  if (!seen.has('orchestrator')) throw new ConfigError('backends must include id "orchestrator"');
  return { backends };
}

export async function loadConfig(fetchFn: typeof fetch = fetch): Promise<RuntimeConfig> {
  const res = await fetchFn('/config.json', { cache: 'no-store' });
  if (!res.ok) throw new ConfigError(`/config.json answered HTTP ${res.status}`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ConfigError('/config.json is not valid JSON');
  }
  current = parseConfig(body);
  return current;
}

/** Back to the built-in default (orchestrator at /api/v1); for tests. */
export function resetConfig(): void {
  current = DEFAULT_CONFIG;
}

export function isConfigured(id: string): boolean {
  return current.backends.some((b) => b.id === id);
}

export function backendBase(id: string): string {
  const b = current.backends.find((x) => x.id === id);
  if (!b) throw new ConfigError(`backend "${id}" is not configured`);
  return b.basePath;
}

/** The active runtime configuration (the default until loadConfig succeeds). */
export function getConfig(): RuntimeConfig {
  return current;
}
