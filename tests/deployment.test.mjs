import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startWebhook, validateDelivery } from '../deploy/webhook.mjs';
import { validateProductionEnvironment } from '../scripts/start-production.mjs';
const config = { secret: 'test-secret-with-at-least-32-characters', repository: 'test/dns-manager', branch: 'main' };
const payload = { repository: { full_name: config.repository }, ref: 'refs/heads/main', deleted: false };
const headers = (raw, extra = {}) => ({ 'x-hub-signature-256': 'sha256=' + createHmac('sha256', config.secret).update(raw).digest('hex'), 'x-github-event': 'push', 'x-github-delivery': '00000000-0000-0000-0000-000000000001', ...extra });
describe('signed deployment webhooks', () => {
  it('queues valid HTTP deliveries, executes a fixed test script, and deduplicates completed jobs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dns-webhook-test-'));
    let server;
    try {
      server = await startWebhook({ WEBHOOK_SECRET: config.secret, DEPLOY_REPOSITORY: config.repository, DEPLOY_BRANCH: config.branch, WEBHOOK_STATE_DIR: directory, WEBHOOK_PORT: '0', DEPLOY_SCRIPT: fileURLToPath(new URL('./fixtures/deploy-noop.sh', import.meta.url)) });
      const url = `http://127.0.0.1:${server.address().port}/hooks/github`;
      const raw = Buffer.from(JSON.stringify(payload));
      const send = (signed) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(signed ? headers(raw) : {}) }, body: raw });
      expect((await send(false)).status).toBe(400);
      expect((await send(true)).status).toBe(202);
      await vi.waitFor(() => access(join(directory, headers(raw)['x-github-delivery'] + '.done')));
      expect((await send(true)).status).toBe(200);
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('accepts only correctly signed pushes for the configured repository and branch', () => {
    const raw = Buffer.from(JSON.stringify(payload));
    expect(validateDelivery(raw, headers(raw), config).kind).toBe('deploy');
    expect(() => validateDelivery(raw, headers(raw), { ...config, secret: 'wrong' })).toThrow();
    expect(() => validateDelivery(raw, {}, config)).toThrow();
    expect(() => validateDelivery(Buffer.from('{}'), headers(raw), config)).toThrow();
    expect(() => validateDelivery(raw, headers(raw), { ...config, repository: 'other/repo' })).toThrow();
  });
  it('ignores unrelated branches, deletions and non-push events', () => {
    for (const body of [{ ...payload, ref: 'refs/heads/feature' }, { ...payload, deleted: true }]) {
      const raw = Buffer.from(JSON.stringify(body)); expect(validateDelivery(raw, headers(raw), config).kind).toBe('ignored');
    }
    const raw = Buffer.from(JSON.stringify(payload));
    expect(validateDelivery(raw, headers(raw, { 'x-github-event': 'pull_request' }), config).kind).toBe('ignored');
    expect(validateDelivery(raw, headers(raw, { 'x-github-event': 'ping' }), config).kind).toBe('ping');
    expect(() => validateDelivery(raw, headers(raw, { 'x-github-delivery': '../../evil' }), config)).toThrow();
  });
});
describe('production startup guard', () => {
  const env = { DATABASE_URL: 'postgresql://test:abc@postgres/db', AUTH_URL: 'https://dns.example.edu.tw', AUTH_SECRET: 'test-session-secret-with-32-characters', SETTINGS_ENCRYPTION_KEY: 'ab'.repeat(32), PDNS_MOCK: 'false' };
  it('requires durable storage, HTTPS and strong persistent secrets', () => {
    expect(() => validateProductionEnvironment(env)).not.toThrow();
    for (const bad of [{ DATABASE_URL: '' }, { AUTH_URL: 'http://dns.example.edu.tw' }, { AUTH_SECRET: 'change-me' }, { SETTINGS_ENCRYPTION_KEY: 'short' }, { AUTH_URL: 'https://dns.example.edu.tw/login' }]) expect(() => validateProductionEnvironment({ ...env, ...bad })).toThrow();
  });
  it('requires a complete Portal configuration', () => {
    expect(() => validateProductionEnvironment({ ...env, AUTH_LOGTO_SECRET: 'test' })).toThrow();
    expect(() => validateProductionEnvironment({ ...env, AUTH_PASSWORD_LOGIN_ENABLED: 'false' })).toThrow();
  });
});
