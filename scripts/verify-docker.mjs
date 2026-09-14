// Disposable, isolated Compose project. Never targets production or local demo data.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const project = 'dns-manager-verify-' + randomBytes(4).toString('hex');
const env = { ...process.env, DEPLOY_TAG: 'verification', POSTGRES_PASSWORD: randomBytes(32).toString('hex'), AUTH_SECRET: randomBytes(32).toString('hex'), SETTINGS_ENCRYPTION_KEY: randomBytes(32).toString('hex'), AUTH_URL: 'https://dns-test.example.invalid', WEB_PORT: '0', PDNS_MOCK: 'true', PDNS_API_URL: '', PDNS_API_KEY: '', AUTH_LOGTO_SECRET: '', LOGTO_OWNER_SUB: '', NCU_PORTAL_CLIENT_ID: '', NCU_PORTAL_CLIENT_SECRET: '', NCU_OWNER_IDENTIFIER: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', OWNER_INITIAL_PASSWORD: randomBytes(24).toString('hex') };
const args = ['compose', '--project-name', project, '--env-file', '/dev/null', '-f', 'docker-compose.yml'];
function compose(command, capture = false) { return execFileSync('docker', [...args, ...command], { env, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8', timeout: 300_000 }); }
try {
  compose(['config', '--quiet']);
  compose(['up', '-d', '--no-build', '--wait', '--wait-timeout', '120']);
  compose(['--profile', 'maintenance', 'run', '--rm', '--no-deps', 'seed']);
  compose(['exec', '-T', 'web', 'node', '-e', "Promise.all(['/healthz','/login'].map(async p=>{const r=await fetch('http://127.0.0.1:3000'+p);if(!r.ok)throw Error(p+' '+r.status);console.log(p,r.status)})).catch(e=>{console.error(e.message);process.exit(1)})"]);
  compose(['exec', '-T', 'postgres', 'psql', '-U', 'aegis', '-d', 'aegis_dns', '-c', 'SELECT email, "globalRole" FROM "User";']);
  // Exercise the requested down/up path on real PostgreSQL and prove named-volume durability.
  compose(['down', '--timeout', '30']);
  compose(['up', '-d', '--no-build', '--wait', '--wait-timeout', '180']);
  const ownerCount = compose(['exec', '-T', 'postgres', 'psql', '-U', 'aegis', '-d', 'aegis_dns', '-tAc', 'SELECT count(*) FROM "User" WHERE email=\'fearnot@ce.ncu.edu.tw\' AND "globalRole"=\'SUPER_ADMIN\';'], true).trim();
  if (ownerCount !== '1') throw new Error('Owner record did not survive compose down/up');
  compose(['exec', '-T', 'web', 'node', '-e', "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]);
  console.info('Compose down/up preserved PostgreSQL owner record and restored healthy web');
  console.info('Docker smoke test passed:', project);
} finally {
  // Only this script-created disposable project's containers and test volume are removed.
  compose(['down', '--volumes', '--remove-orphans']);
}
