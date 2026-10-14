import { mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { checkManifest, writeManifest, powerdnsExport } from '../deploy/backup.mjs';

async function fixture(action) {
  const path = await mkdtemp(join(tmpdir(), 'dns-backup-test-'));
  try {
    for (const name of ['database.dump', 'container-environment.json', 'powerdns.json', 'release.json']) await writeFile(join(path, name), '{}', { mode: 0o600 });
    await writeManifest(path);
    await action(path);
  } finally { await rm(path, { recursive: true, force: true }); }
}
describe('backup integrity before any restore', () => {
  it('exports zone details, metadata and each private DNSSEC key through read-only API requests', async () => {
    const requests = [];
    const server = createServer((request, response) => {
      requests.push({ method: request.method, url: request.url, key: request.headers['x-api-key'] });
      const suffix = request.url.replace('/api/v1/servers/localhost', '');
      const data = { '/zones': [{ id: 'example.test.' }], '/zones/example.test.': { id: 'example.test.', rrsets: [] }, '/zones/example.test./metadata': [{ kind: 'API-RECTIFY', metadata: ['1'] }], '/zones/example.test./cryptokeys': [{ id: 1 }], '/zones/example.test./cryptokeys/1': { id: 1, privatekey: 'test-fixture-only' } }[suffix];
      response.writeHead(data ? 200 : 404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(data ?? {}));
    });
    await new Promise(ok => server.listen(0, '127.0.0.1', ok));
    try {
      const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', powerdnsExport], { env: { ...process.env, PDNS_MOCK: 'false', PDNS_API_URL: `http://127.0.0.1:${server.address().port}/api/v1`, PDNS_API_KEY: 'fixture-key', PDNS_SERVER_ID: 'localhost' }, timeout: 10000 });
      expect(JSON.parse(stdout).zones[0]).toMatchObject({ cryptokeys: [{ privatekey: 'test-fixture-only' }], metadata: [{ kind: 'API-RECTIFY' }] });
      expect(requests).toHaveLength(5);
      expect(requests.every(request => request.method === 'GET' && request.key === 'fixture-key')).toBe(true);
    } finally { await new Promise(ok => server.close(ok)); }
  });
  it('checks every required file and detects corrupted database archives', () => fixture(async path => {
    expect((await checkManifest(path)).version).toBe(1);
    await writeFile(join(path, 'database.dump'), 'corrupted');
    await expect(checkManifest(path)).rejects.toThrow('integrity');
  }));
  it('rejects incomplete sets and escaping paths', () => fixture(async path => {
    const manifest = JSON.parse(await readFile(join(path, 'manifest.json'), 'utf8'));
    delete manifest.files['database.dump'];
    await writeFile(join(path, 'manifest.json'), JSON.stringify(manifest));
    await expect(checkManifest(path)).rejects.toThrow('missing');
    await writeManifest(path);
    const unsafe = JSON.parse(await readFile(join(path, 'manifest.json'), 'utf8'));
    unsafe.files['../outside'] = { bytes: 2, sha256: 'invalid' };
    await writeFile(join(path, 'manifest.json'), JSON.stringify(unsafe));
    await expect(checkManifest(path)).rejects.toThrow('Unsafe');
  }));
  it('refuses symlinks in both archive files and manifest', () => fixture(async path => {
    await rm(join(path, 'database.dump'));
    await symlink('release.json', join(path, 'database.dump'));
    await expect(writeManifest(path)).rejects.toThrow('non-regular');
    await expect(checkManifest(path)).rejects.toThrow('integrity');
    await rm(join(path, 'manifest.json'));
    await symlink('release.json', join(path, 'manifest.json'));
    await expect(checkManifest(path)).rejects.toThrow('manifest file');
  }));
});
