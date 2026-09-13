// Build from an isolated 0600/0700 checkout, matching install-vm.sh's umask 077.
// Git-tracked files only: never copy local envs, demo data or node_modules.
import { mkdtemp, mkdir, copyFile, chmod, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'dns-private-build-'));
try {
  const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const path of paths) {
    if (path.startsWith('/') || path.split('/').includes('..')) throw new Error('Invalid tracked path');
    const target = join(directory, path);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await copyFile(path, target);
    await chmod(target, 0o600);
  }
  for (const [target, image] of [['runner', 'dns-manager-web:verification'], ['tools', 'dns-manager-tools:verification']]) {
    execFileSync('docker', ['build', '--target', target, '-t', image, directory], { stdio: 'inherit', timeout: 900000 });
  }
  console.info('Verification images built from restrictive installer-style source permissions.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
