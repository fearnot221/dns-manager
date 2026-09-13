import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const endpoint = 'https://dnsmgr.ce.ncu.edu.tw/hooks/github';
const previousEndpoint = 'https://dns.ce.ncu.edu.tw/hooks/github';
const repository = 'fearnot221/dns-manager';

export async function registerWebhook(token, config, request = fetch) {
  if (!token || config.DEPLOY_REPOSITORY !== repository || config.WEBHOOK_SECRET?.length < 32 || !config.WEBHOOK_SECRET) throw new Error('Invalid registration configuration');
  // Prove the real HTTPS route reaches OUR receiver before saving a GitHub hook.
  const body = JSON.stringify({ repository: { full_name: repository } });
  const probe = await request(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: {
    'Content-Type': 'application/json', 'X-GitHub-Event': 'ping',
    'X-Hub-Signature-256': 'sha256=' + createHmac('sha256', config.WEBHOOK_SECRET).update(body).digest('hex'),
  }, body });
  if (probe.status !== 200 || (await probe.json()).message !== 'ping') throw new Error('Public HTTPS webhook route is not ready. Configure Caddy/DNS/firewall first.');
  const api = async (suffix, method = 'GET', data) => {
    const response = await request(`https://api.github.com/repos/${repository}/hooks${suffix}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    if (!response.ok) throw new Error(`GitHub webhook API returned HTTP ${response.status}. Check token repository/permissions; rerun safely after an uncertain response.`);
    return response.json();
  };
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
  try {
    const parts = [];
    for await (const part of process.stdin) parts.push(part);
    const token = Buffer.concat(parts).toString('utf8').trim();
    const config = parseEnv(await readFile('/etc/dns-manager/webhook.env', 'utf8'));
    const id = await registerWebhook(token, config);
    console.info(`GitHub push webhook registered (ID ${id}). Push main, then check the server journal for Healthy deployment.`);
  } catch (error) {
    // Do not log HTTP headers, request objects or secrets.
    console.error(error.message);
    process.exitCode = 1;
  }
}
