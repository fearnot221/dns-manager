#!/usr/bin/env node
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, rename, rm, readdir, lstat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const required = ['database.dump', 'container-environment.json', 'powerdns.json', 'release.json'];
function command(args) { return execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
export async function waitForPostgres(name) {
  for (let i = 0; i < 60; i++) {
    try {
      // pg_isready alone also accepts the entrypoint's temporary init server,
      // which stops before the final server starts. Wait for postgres as PID 1.
      command(['exec', name, 'sh', '-c', 'test "$(cat /proc/1/comm)" = postgres && pg_isready -U postgres']);
      return;
    } catch { await new Promise(ok => setTimeout(ok, 500)); }
  }
  throw Error('Restore database did not start');
}
async function save(file, value) { await writeFile(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); }
async function hash(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
async function toFile(executable, args, file, input) {
  const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  // Never relay tool stderr: it can contain SQL, addresses or configuration.
  child.stderr.resume();
  const completed = new Promise((ok, fail) => {
    child.once('error', fail);
    child.once('exit', code => code === 0 ? ok() : fail(new Error('Backup subprocess failed')));
  });
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  await Promise.all([pipeline(child.stdout, createWriteStream(file, { mode: 0o600, flags: 'wx' })), completed]);
}
export async function writeManifest(directory) {
  const files = {};
  for (const name of (await readdir(directory)).sort()) {
    if (name === 'manifest.json') continue;
    const info = await lstat(join(directory, name));
    if (!info.isFile() || info.isSymbolicLink()) throw Error('Backup contains a non-regular file');
    files[name] = { bytes: info.size, sha256: await hash(join(directory, name)) };
  }
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({ version: 1, files }, null, 2) + '\n', { mode: 0o600 });
}
export async function checkManifest(directory) {
  const manifestInfo = await lstat(join(directory, 'manifest.json'));
  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink()) throw Error('Invalid backup manifest file');
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  if (manifest.version !== 1 || !manifest.files) throw Error('Unsupported backup manifest');
  for (const name of required) if (!manifest.files[name]) throw Error('Required backup file missing');
  for (const [name, expected] of Object.entries(manifest.files)) {
    if (name !== basename(name) || name === '.' || name === '..') throw Error('Unsafe backup manifest path');
    const file = join(directory, name), info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size !== expected.bytes || await hash(file) !== expected.sha256) throw Error('Backup integrity check failed');
  }
  return manifest;
}
export async function verifyBackup(directory) {
  await checkManifest(directory);
  if (!Array.isArray(JSON.parse(await readFile(join(directory, 'powerdns.json'), 'utf8')).zones)) throw Error('Invalid PowerDNS snapshot');
  const name = `dns-backup-drill-${randomUUID()}`;
  const image = process.env.DNS_BACKUP_POSTGRES_IMAGE || 'postgres:17-alpine';
  let started = false;
  try {
    // No host ports, host mounts or production network. --rm removes its own data volume.
    command(['run', '-d', '--rm', '--name', name, '--network', 'none', '--label', 'dns-manager.backup-drill=true', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=dns_restore', image]);
    started = true;
    await waitForPostgres(name);
    const restore = spawn('docker', ['exec', '-i', name, 'pg_restore', '-U', 'postgres', '-d', 'dns_restore', '--no-owner', '--no-privileges', '--exit-on-error'], { stdio: ['pipe', 'ignore', 'pipe'] });
    restore.stderr.resume();
    const completed = new Promise((ok, fail) => { restore.once('error', fail); restore.once('exit', code => code === 0 ? ok() : fail(Error('Isolated database restore failed'))); });
    await Promise.all([pipeline(createReadStream(join(directory, 'database.dump')), restore.stdin), completed]);
    const tables = command(['exec', name, 'psql', '-X', '-U', 'postgres', '-d', 'dns_restore', '-Atc', `SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('User','DnsRecordRequest','SystemSetting')`]).trim();
    if (tables !== '3') throw Error('Restored application schema is incomplete');
    const counts = JSON.parse(command(['exec', name, 'psql', '-X', '-U', 'postgres', '-d', 'dns_restore', '-Atc', `SELECT json_build_object('users',(SELECT count(*) FROM "User"),'requests',(SELECT count(*) FROM "DnsRecordRequest"),'settings',(SELECT count(*) FROM "SystemSetting"))`]));
    return { verifiedAt: new Date().toISOString(), databaseRestored: true, isolated: true, postgresImage: image, counts };
  } finally { if (started) command(['rm', '-f', '-v', name]); }
}

export const powerdnsExport = String.raw`
const e=process.env;
if(e.PDNS_MOCK==='true'||!e.PDNS_API_URL||!e.PDNS_API_KEY)throw Error('Live PowerDNS configuration required');
const base=e.PDNS_API_URL.replace(/\/$/,'')+'/servers/'+encodeURIComponent(e.PDNS_SERVER_ID||'localhost');
async function get(path){const r=await fetch(base+path,{headers:{'X-API-Key':e.PDNS_API_KEY},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('PowerDNS export failed');return r.json();}
const startedAt=new Date().toISOString(),zones=[];
for(const zone of await get('/zones')){const path='/zones/'+encodeURIComponent(zone.id),cryptokeys=[];for(const key of await get(path+'/cryptokeys'))cryptokeys.push(await get(path+'/cryptokeys/'+encodeURIComponent(key.id)));zones.push({zone:await get(path),metadata:await get(path+'/metadata'),cryptokeys});}
process.stdout.write(JSON.stringify({version:1,startedAt,completedAt:new Date().toISOString(),zones}));
`;

export async function backup() {
  process.umask(0o077);
  const root = resolve(process.env.DNS_BACKUP_DIR || '/home/snmg/backups/dns-manager-v1');
  if (root === '/' || root === '/home/snmg') throw Error('Unsafe backup directory');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink() || rootInfo.uid !== process.getuid() || (rootInfo.mode & 0o077)) throw Error('Backup directory must be private and owned by this user');
  const id = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z') + '-' + randomUUID();
  const staging = join(root, `.incomplete-${id}`), destination = join(root, id);
  await mkdir(staging, { mode: 0o700 });
  try {
    const pg = process.env.DNS_BACKUP_POSTGRES_CONTAINER || 'dns-manager-postgres-1';
    const web = process.env.DNS_BACKUP_WEB_CONTAINER || 'dns-manager-web-1';
    const worker = process.env.DNS_BACKUP_WORKER_CONTAINER || 'dns-manager-mail-worker-1';
    const containers = [pg, web, worker].map(name => JSON.parse(command(['inspect', name]))[0]);
    const environment = Object.fromEntries(containers.map(container => [container.Name.slice(1), container.Config.Env]));
    await save(join(staging, 'container-environment.json'), environment);
    await save(join(staging, 'release.json'), { createdAt: new Date().toISOString(), hostConfigurationIncluded: process.getuid() === 0, images: containers.map(c => ({ container: c.Name, reference: c.Config.Image, id: c.Image })) });
    const pgEnvironment = Object.fromEntries(containers[0].Config.Env.map(value => { const at = value.indexOf('='); return [value.slice(0, at), value.slice(at + 1)]; }));
    await toFile('docker', ['exec', pg, 'pg_dump', '-U', pgEnvironment.POSTGRES_USER || 'aegis', '-d', pgEnvironment.POSTGRES_DB || 'aegis_dns', '-Fc'], join(staging, 'database.dump'));
    await toFile('docker', ['exec', '-i', '-u', 'node', web, 'node', '--input-type=module'], join(staging, 'powerdns.json'), powerdnsExport);
    if (process.getuid() === 0) {
      await toFile('tar', ['-C', '/home/snmg', '-czf', '-', 'config', 'deploy'], join(staging, 'host-configuration.tar.gz'));
    }
    await writeManifest(staging);
    await save(join(staging, 'restore-check.json'), await verifyBackup(staging));
    await writeManifest(staging);
    await rename(staging, destination);
    // An optional already-initialized encrypted repository is configured by its operator.
    if (process.env.RESTIC_REPOSITORY) {
      const receipt = join(root, `.offsite-${id}.json`);
      await toFile('restic', ['backup', '--json', destination], receipt);
      await rm(receipt);
    }
    const status = { completedAt: new Date().toISOString(), backup: id, restoreVerified: true, hostConfigurationIncluded: process.getuid() === 0, offsiteUploaded: !!process.env.RESTIC_REPOSITORY };
    const temporary = join(root, `.last-successful-${randomUUID()}`);
    await save(temporary, status); await rename(temporary, join(root, 'last-successful.json'));
    // Remove only this format's complete, verified bundles older than 14 days.
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^\d{8}T\d{6}Z-[a-f0-9-]{36}$/.test(entry.name)) continue;
      const path = join(root, entry.name);
      if (Date.now() - (await lstat(path)).mtimeMs > 14 * 86400000) { await checkManifest(path); await rm(path, { recursive: true }); }
    }
    return status;
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args.length === 2 && args[0] === '--verify') console.log(JSON.stringify(await verifyBackup(resolve(args[1]))));
    else if (!args.length) console.log(JSON.stringify(await backup()));
    else throw Error('Usage: backup.mjs [--verify BUNDLE]');
  } catch { console.error('DNS backup/restore verification failed; no successful checkpoint was recorded. Inspect restricted backup files and service status.'); process.exitCode = 1; }
}
