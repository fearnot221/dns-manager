import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { openSync, closeSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { waitForPostgres, writeManifest, verifyBackup } from '../deploy/backup.mjs';
const directory = await mkdtemp(join(tmpdir(), 'dns-backup-verification-'));
const name = `dns-backup-source-${randomUUID()}`;
const docker = args => execFileSync('docker', args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
let started = false;
try {
  docker(['run', '-d', '--rm', '--name', name, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=dns_source', 'postgres:17-alpine']);
  started = true;
  await waitForPostgres(name);
  docker(['exec', name, 'psql', '-X', '-U', 'postgres', '-d', 'dns_source', '-v', 'ON_ERROR_STOP=1', '-c', `CREATE TABLE "User" (id text PRIMARY KEY); CREATE TABLE "DnsRecordRequest" (id text PRIMARY KEY, "userId" text REFERENCES "User"(id)); CREATE TABLE "SystemSetting" (key text PRIMARY KEY); INSERT INTO "User" VALUES ('backup-fixture'); INSERT INTO "DnsRecordRequest" VALUES ('request','backup-fixture'); INSERT INTO "SystemSetting" VALUES ('fixture');`]);
  const fd = openSync(join(directory, 'database.dump'), 'wx', 0o600);
  try { execFileSync('docker', ['exec', name, 'pg_dump', '-U', 'postgres', '-d', 'dns_source', '-Fc'], { stdio: ['ignore', fd, 'pipe'] }); }
  finally { closeSync(fd); }
  for (const [file, value] of Object.entries({ 'container-environment.json': {}, 'powerdns.json': { zones: [] }, 'release.json': { fixture: true } })) await writeFile(join(directory, file), JSON.stringify(value), { mode: 0o600 });
  await writeManifest(directory);
  const result = await verifyBackup(directory);
  assert.deepEqual(result.counts, { users: 1, requests: 1, settings: 1 });
  console.log('Backup checksums and isolated PostgreSQL restore preserved fixture data and foreign keys.');
} finally {
  if (started) docker(['rm', '-f', '-v', name]);
  await rm(directory, { recursive: true, force: true });
}
