import { readFileSync } from 'node:fs';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Proxy the first path segment of every backend in public/config.json to AGENTS_WEB_PROXY_<ID>. */
function backendProxies(mode: string) {
  const envs = loadEnv(mode, '.', 'AGENTS_WEB_PROXY_');
  const cfg = JSON.parse(readFileSync('public/config.json', 'utf8')) as {
    backends: { id: string; basePath: string }[];
  };
  const proxy: Record<string, { target: string; ws: boolean }> = {};
  for (const b of cfg.backends) {
    const env = `AGENTS_WEB_PROXY_${b.id.toUpperCase().replace(/-/g, '_')}`;
    const target = envs[env] ?? (b.id === 'orchestrator' ? 'http://localhost:8000' : undefined);
    if (!target) continue;
    proxy[`/${b.basePath.split('/')[1]}`] = { target, ws: true };
  }
  return proxy;
}

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: { outDir: 'dist' },
  server: { proxy: backendProxies(mode) },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
