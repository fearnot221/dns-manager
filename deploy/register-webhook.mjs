import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const endpoint = 'https://dnsmgr.ce.ncu.edu.tw/hooks/github';
const previousEndpoint = 'https://dns.ce.ncu.edu.tw/hooks/github';
const repository = 'fearnot221/dns-manager';

// Whitelist diagnostic fields instead of dumping errors/request objects containing credentials.
export function formatRegistrationError(error, secrets = []) {
  const sensitive = secrets.filter((value) => typeof value === 'string' && value.length);
  const redact = (value) => {
    let text = String(value);
    for (const secret of sensitive) {
      for (const variant of new Set([secret, encodeURIComponent(secret)])) text = text.split(variant).join('[REDACTED]');
    }
    return text.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]').replace(/sha256=[a-f0-9]{64}/gi, 'sha256=[REDACTED]');
  };
  const seen = new Set();
  const lines = [];
  const visit = (entry, depth, label) => {
    if (depth > 4 || seen.has(entry)) return;
    if (!entry || typeof entry !== 'object') { lines.push(`${label}: ${redact(entry)}`); return; }
    seen.add(entry);
    lines.push(`${label}: ${redact(typeof entry.name === 'string' ? entry.name : 'Error')}: ${redact(typeof entry.message === 'string' ? entry.message : 'Operation failed')}`);
    for (const key of ['code', 'syscall', 'hostname', 'address', 'port']) {
      if (typeof entry[key] === 'string' || typeof entry[key] === 'number') lines.push(`  ${key}: ${redact(entry[key])}`);
    }
    if (typeof entry.stack === 'string') lines.push(redact(entry.stack.split('\n').filter((line) => /^\s+at /.test(line)).slice(0, 10).join('\n')));
    if (entry.cause) visit(entry.cause, depth + 1, 'Caused by');
    if (Array.isArray(entry.errors)) entry.errors.slice(0, 5).forEach((child) => visit(child, depth + 1, 'Connection error'));
  };
  visit(error, 0, '[webhook] Registration failed');
  return lines.filter(Boolean).join('\n');
}

export async function registerWebhook(token, config, request = fetch, log = () => {}) {
  const step = async (label, operation) => {
    log(`[webhook] ${label}`);
    try { return await operation(); }
    catch (error) { throw new Error(`${label}: ${error instanceof Error ? error.message : 'Operation failed'}`, { cause: error }); }
  };
  if (!token || config.DEPLOY_REPOSITORY !== repository || config.WEBHOOK_SECRET?.length < 32 || !config.WEBHOOK_SECRET) throw new Error('Invalid registration configuration');
  // Prove the real HTTPS route reaches OUR receiver before saving a GitHub hook.
  const body = JSON.stringify({ repository: { full_name: repository } });
  await step(`Probe public webhook POST ${endpoint} (timeout 15s)`, async () => {
    const probe = await request(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: {
      'Content-Type': 'application/json', 'X-GitHub-Event': 'ping',
      'X-Hub-Signature-256': 'sha256=' + createHmac('sha256', config.WEBHOOK_SECRET).update(body).digest('hex'),
    }, body });
    if (probe.status !== 200 || (await probe.json()).message !== 'ping') throw new Error(`Public HTTPS webhook route is not ready (HTTP ${probe.status}). Configure Caddy/DNS/firewall first.`);
  });
  const api = async (suffix, method = 'GET', data) => step(`GitHub API ${method} /repos/${repository}/hooks${suffix} (timeout 15s)`, async () => {
    const response = await request(`https://api.github.com/repos/${repository}/hooks${suffix}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    if (!response.ok) throw new Error(`GitHub webhook API returned HTTP ${response.status}. Check token repository/permissions; rerun safely after an uncertain response.`);
    return response.json();
  });
  const matches = [];
  for (let page = 1; ; page++) {
    const hooks = await api(`?per_page=100&page=${page}`);
    // Reuse the old domain's hook during migration rather than leaving duplicate deployments.
    matches.push(...hooks.filter((hook) => [endpoint, previousEndpoint].includes(hook.config?.url)));
    if (hooks.length < 100) break;
  }
  if (matches.length > 1) throw new Error('Multiple existing hooks use the old/new domain URLs. Resolve duplicates in GitHub Settings first.');
  const data = { active: true, events: ['push'], config: { url: endpoint, content_type: 'json', secret: config.WEBHOOK_SECRET, insecure_ssl: '0' } };
  const result = matches.length ? await api(`/${matches[0].id}`, 'PATCH', data) : await api('', 'POST', { name: 'web', ...data });
  return result.id;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const secrets = [];
  try {
    const parts = [];
    for await (const part of process.stdin) parts.push(part);
    const token = Buffer.concat(parts).toString('utf8').trim();
    secrets.push(token);
    console.error('[webhook] Reading /etc/dns-manager/webhook.env');
    const config = parseEnv(await readFile('/etc/dns-manager/webhook.env', 'utf8'));
    secrets.push(config.WEBHOOK_SECRET);
    const id = await registerWebhook(token, config, fetch, (message) => console.error(message));
    console.info(`GitHub push webhook registered (ID ${id}). Push main, then check the server journal for Healthy deployment.`);
  } catch (error) {
    // Do not log HTTP headers, request objects or secrets.
    console.error(formatRegistrationError(error, secrets));
    process.exitCode = 1;
  }
}
