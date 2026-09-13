// Reproduce permission-restricted cwd with the real Linux Docker Compose CLI.
// No Docker socket, daemon access, production env or application data is mounted.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script = `
set -eu
adduser -D dnsdeploy
mkdir -p /root/caller-private /work
chmod 0700 /root/caller-private
chmod 0755 /work
cd /root/caller-private
if su -s /bin/sh dnsdeploy -c 'docker compose --env-file /dev/null -f /work/compose.yml config --quiet' >/tmp/private-cwd.log 2>&1; then
  echo 'This Compose version permits a private cwd; safe cwd is still checked below.'
else
  grep -i 'permission denied' /tmp/private-cwd.log
fi
cd /work
su -s /bin/sh dnsdeploy -c 'docker compose --env-file /dev/null -f /work/compose.yml config --quiet'
echo 'Unprivileged Compose configuration passed from readable checkout directory.'
`;
execFileSync('docker', [
  'run', '--rm', '--entrypoint', '/bin/sh',
  '-e', 'POSTGRES_PASSWORD=test-password-not-a-production-secret',
  '-e', 'AUTH_SECRET=test-session-secret-not-used-for-authentication',
  '-e', 'SETTINGS_ENCRYPTION_KEY=' + 'ab'.repeat(32),
  '-e', 'AUTH_URL=https://dnsmgr.ce.ncu.edu.tw',
  '-v', `${fileURLToPath(new URL('../docker-compose.yml', import.meta.url))}:/work/compose.yml:ro`,
  'docker:cli', '-c', script,
], { stdio: 'inherit', timeout: 120000 });
