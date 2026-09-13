import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, copyFile, chmod, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { registerWebhook } from '../deploy/register-webhook.mjs';

describe('Ubuntu installer release selection', () => {
  it('leaves the caller private directory before switching user and runs Compose from the checkout', async () => {
    const source = await readFile(new URL('../deploy/install-vm.sh', import.meta.url), 'utf8');
    const safeRoot = source.indexOf('\ncd /\n');
    const checkout = source.indexOf('\ncd /opt/dns-manager\n');
    expect(safeRoot).toBeGreaterThan(0);
    expect(safeRoot).toBeLessThan(source.indexOf('runuser -u dnsdeploy'));
    expect(checkout).toBeGreaterThan(source.indexOf('git clone'));
    expect(checkout).toBeLessThan(source.indexOf('compose=(runuser'));
  });
  it.each([
    ['ubuntu', '22.04', 'jammy'], ['ubuntu', '24.04', 'noble'],
    ['ubuntu', '20.04', null], ['debian', '22.04', null], ['ubuntu', '22.04; echo unsafe', null],
  ])('selects a trusted suite for %s %s', async (id, version, expected) => {
    const source = await readFile(new URL('../deploy/install-vm.sh', import.meta.url), 'utf8');
    // Exercise the exact pure function without running privileged installer operations.
    const definition = source.match(/^ubuntu_suite\(\) \{[\s\S]*?^\}/m)?.[0];
    expect(definition).toBeTruthy();
    const result = spawnSync('/bin/bash', ['-c', `${definition}\nubuntu_suite "$1" "$2"`, 'installer-test', id, version], { encoding: 'utf8' });
    if (expected) {
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(expected);
    } else expect(result.status).not.toBe(0);
    expect(source).toContain('"$ubuntu_codename" > /etc/apt/sources.list.d/dns-manager-docker.list');
  });
});

async function deploy(overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'dns-deploy-flow-'));
  try {
    const bin = join(directory, 'bin');
    await mkdir(bin);
    for (const name of ['git', 'docker', 'flock']) {
      await copyFile(new URL('./fixtures/deploy-command.sh', import.meta.url), join(bin, name));
      await chmod(join(bin, name), 0o755);
    }
    const result = spawnSync('/bin/bash', [fileURLToPath(new URL('../deploy/deploy.sh', import.meta.url))], { encoding: 'utf8', env: {
      ...process.env, PATH: `${bin}:${process.env.PATH}`, DEPLOY_DIR: directory,
      DEPLOY_ENV_FILE: join(directory, 'app.env'), DEPLOY_STATE_DIR: join(directory, 'state'),
      DEPLOY_REPOSITORY: 'fearnot221/dns-manager', DEPLOY_BRANCH: 'main',
      DEPLOY_TEST_LOG: join(directory, 'commands'), ...overrides,
    } });
    const commands = await readFile(join(directory, 'commands'), 'utf8').catch(() => '');
    const deployed = await readFile(join(directory, 'state', 'last-successful-commit'), 'utf8').catch(() => null);
    return { result, commands, deployed };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

describe('VM full-stack restart deployment', () => {
  it('builds first, then down/up with health waiting and without deleting volumes', async () => {
    const { result, commands, deployed } = await deploy();
    expect(result.status, result.stderr).toBe(0);
    expect(commands.indexOf(' build --pull web migrate')).toBeLessThan(commands.indexOf(' down --timeout 30'));
    expect(commands.indexOf(' down --timeout 30')).toBeLessThan(commands.indexOf(' up -d --wait --wait-timeout 180'));
    expect(commands).not.toMatch(/--volumes|down -v|prune|db:seed/);
    expect(deployed?.trim()).toBe('a'.repeat(40));
  });
  it('keeps the running stack when build fails', async () => {
    const { result, commands, deployed } = await deploy({ TEST_FAIL_BUILD: '1' });
    expect(result.status).not.toBe(0);
    expect(commands).not.toContain(' down ');
    expect(commands).not.toContain(' up ');
    expect(deployed).toBeNull();
  });
  it('does not report a failed restart as healthy', async () => {
    const { result, deployed } = await deploy({ TEST_FAIL_UP: '1' });
    expect(result.status).not.toBe(0);
    expect(deployed).toBeNull();
  });
  it('refuses to overwrite checkout changes', async () => {
    const { result, commands } = await deploy({ TEST_DIRTY: '1' });
    expect(result.status).not.toBe(0);
    expect(commands).toBe('');
  });
});

describe('one-time GitHub webhook registration', () => {
  const config = { DEPLOY_REPOSITORY: 'fearnot221/dns-manager', WEBHOOK_SECRET: 'ab'.repeat(32) };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
  it('probes signed HTTPS before creating a push-only webhook; sends PAT only to GitHub', async () => {
    const request = vi.fn().mockResolvedValueOnce(json({ message: 'ping' })).mockResolvedValueOnce(json([])).mockResolvedValueOnce(json({ id: 42 }, 201));
    expect(await registerWebhook('test-token', config, request)).toBe(42);
    expect(request.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(request.mock.calls[0][1].headers['X-Hub-Signature-256']).toMatch(/^sha256=[a-f0-9]{64}$/);
    const [url, options] = request.mock.calls[2];
    expect(url).toBe('https://api.github.com/repos/fearnot221/dns-manager/hooks');
    expect(options.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(options.body)).toMatchObject({ events: ['push'], active: true, config: { secret: config.WEBHOOK_SECRET, insecure_ssl: '0' } });
  });
  it('updates the existing URL without creating a duplicate', async () => {
    const request = vi.fn().mockResolvedValueOnce(json({ message: 'ping' })).mockResolvedValueOnce(json([{ id: 42, config: { url: 'https://dns.ce.ncu.edu.tw/hooks/github' } }])).mockResolvedValueOnce(json({ id: 42 }));
    await registerWebhook('test-token', config, request);
    expect(request.mock.calls[2][0]).toMatch(/\/hooks\/42$/);
    expect(request.mock.calls[2][1].method).toBe('PATCH');
  });
  it('does not register when the external proxy is not ready', async () => {
    const request = vi.fn().mockResolvedValueOnce(json({}, 403));
    await expect(registerWebhook('test-token', config, request)).rejects.toThrow('not ready');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('fails clearly on insufficient GitHub token permissions', async () => {
    const request = vi.fn().mockResolvedValueOnce(json({ message: 'ping' })).mockResolvedValueOnce(json({}, 403));
    await expect(registerWebhook('test-token', config, request)).rejects.toThrow('HTTP 403');
  });
});
