import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, rename, access, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

export function validateDelivery(raw, headers, config) {
  const signature = headers['x-hub-signature-256'];
  if (typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature)) throw new Error('Invalid signature');
  const expected = createHmac('sha256', config.secret).update(raw).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) throw new Error('Invalid signature');
  const event = headers['x-github-event'];
  const payload = JSON.parse(raw.toString('utf8'));
  if (payload.repository?.full_name !== config.repository) throw new Error('Wrong repository');
  if (event === 'ping') return { kind: 'ping' };
  if (event !== 'push' || payload.ref !== `refs/heads/${config.branch}` || payload.deleted) return { kind: 'ignored' };
  const delivery = headers['x-github-delivery'];
  if (typeof delivery !== 'string' || !/^[a-f0-9-]{36}$/i.test(delivery)) throw new Error('Invalid delivery ID');
  return { kind: 'deploy', delivery };
}

export async function startWebhook(env = process.env) {
  const config = { secret: env.WEBHOOK_SECRET || '', repository: env.DEPLOY_REPOSITORY || '', branch: env.DEPLOY_BRANCH || '' };
  if (config.secret.length < 32 || !/^[\w.-]+\/[\w.-]+$/.test(config.repository) || !/^[\w/-]+$/.test(config.branch)) throw new Error('Configure WEBHOOK_SECRET, DEPLOY_REPOSITORY and DEPLOY_BRANCH');
  const queue = env.WEBHOOK_STATE_DIR;
  const script = env.DEPLOY_SCRIPT;
  if (!queue || !script || !isAbsolute(queue) || !isAbsolute(script)) throw new Error('State directory and deploy script must be absolute paths');
  await mkdir(queue, { recursive: true, mode: 0o700 });
  await access(script);
  let running = false;
  const exists = async (file) => access(file).then(() => true, () => false);
  async function drain() {
    if (running) return;
    running = true;
    try {
      for (;;) {
        const next = (await readdir(queue)).filter((name) => /^[a-f0-9-]{36}\.json$/i.test(name)).sort()[0];
        if (!next) break;
        console.info('Starting deployment', next.slice(0, -5));
        // No request content, commit message, repository URL or shell command is executed.
        const ok = await new Promise((resolve) => {
          const child = spawn('/bin/bash', [script], { shell: false, stdio: 'inherit', env: {
            PATH: env.PATH, HOME: env.HOME, SSH_AUTH_SOCK: env.SSH_AUTH_SOCK,
            DEPLOY_DIR: env.DEPLOY_DIR, DEPLOY_ENV_FILE: env.DEPLOY_ENV_FILE,
            DEPLOY_BRANCH: config.branch, DEPLOY_REPOSITORY: config.repository,
            DEPLOY_STATE_DIR: queue, GIT_TERMINAL_PROMPT: '0',
          } });
          child.once('error', () => resolve(false)); child.once('exit', (code) => resolve(code === 0));
        });
        await rename(join(queue, next), join(queue, next.replace(/\.json$/, ok ? '.done' : '.failed')));
        console.info(ok ? 'Deployment healthy' : 'Deployment failed; inspect journal and redeliver', next.slice(0, -5));
      }
    } finally { running = false; }
  }
  const server = createServer(async (req, res) => {
    const respond = (status, message) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ message })); };
    if (req.method !== 'POST' || req.url !== '/hooks/github') return respond(404, 'Not found');
    if (!req.headers['content-type']?.startsWith('application/json')) return respond(415, 'Use application/json');
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 2 * 1024 * 1024) { respond(413, 'Payload too large'); req.destroy(); return; } chunks.push(chunk); }
      const delivery = validateDelivery(Buffer.concat(chunks), req.headers, config);
      if (delivery.kind !== 'deploy') return respond(200, delivery.kind);
      const base = join(queue, delivery.delivery);
      if (await exists(base + '.done')) return respond(200, 'Already deployed');
      if (await exists(base + '.failed')) await rename(base + '.failed', base + '.json');
      else { try { await writeFile(base + '.json', '{}', { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; } }
      respond(202, 'Queued; completion is reported in the server journal');
      void drain().catch(() => { console.error('Queue failure; restarting for recovery'); server.close(); process.exitCode = 1; });
    } catch (error) {
      const badRequest = ['Invalid signature', 'Wrong repository', 'Invalid delivery ID'].includes(error.message) || error instanceof SyntaxError;
      respond(badRequest ? 400 : 503, badRequest ? 'Invalid delivery' : 'Unable to queue deployment');
    }
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000;
  // Recover a job even if it arrived exactly as a previous drain was finishing.
  const recovery = setInterval(() => { void drain().catch(() => { console.error('Queue failure'); server.close(); process.exitCode = 1; }); }, 10_000);
  recovery.unref();
  server.once('close', () => clearInterval(recovery));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(env.WEBHOOK_PORT || 9000), '127.0.0.1', resolve); });
  void drain().catch(() => { console.error('Queue recovery failed'); server.close(); process.exitCode = 1; });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startWebhook().catch(() => { console.error('Webhook startup failed; check configuration and file permissions'); process.exitCode = 1; });
}
