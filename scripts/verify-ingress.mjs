// Isolated Docker smoke test for the private Caddy gateway; no production services/data.
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const prefix = `dns-ingress-verify-${randomBytes(5).toString('hex')}`;
const directory = await mkdtemp(join(tmpdir(), prefix));
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 120000 });
try {
  const template = await readFile(new URL('../deploy/ingress.Caddyfile.template', import.meta.url), 'utf8');
  // For this isolated container, allow only its own loopback client; the published port must deny us.
  await writeFile(join(directory, 'Caddyfile'), template.replaceAll('VM_PRIVATE_IP', '0.0.0.0').replaceAll('CADDY_PRIVATE_IP', '127.0.0.1'), { mode: 0o644 });
  docker('run', '--rm', '-v', `${directory}/Caddyfile:/etc/caddy/Caddyfile:ro`, 'caddy:2-alpine', 'caddy', 'validate', '--config', '/etc/caddy/Caddyfile');
  docker('run', '-d', '--name', prefix, '--user', '1000:1000', '--read-only', '--cap-drop', 'ALL', '--cap-add', 'NET_BIND_SERVICE', '--security-opt', 'no-new-privileges:true', '--tmpfs', '/data:uid=1000,gid=1000', '--tmpfs', '/config:uid=1000,gid=1000', '-p', '127.0.0.1::8080', '-v', `${directory}/Caddyfile:/etc/caddy/Caddyfile:ro`, 'caddy:2-alpine');
  const mock = "const http=require('node:http'); for(const port of [3000,9000]) http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({port,path:req.url,host:req.headers.host,proto:req.headers['x-forwarded-proto'],client:req.headers['x-forwarded-for']}))}).listen(port,'127.0.0.1');";
  docker('run', '-d', '--name', `${prefix}-backend`, '--network', `container:${prefix}`, 'node:22-bookworm-slim', 'node', '-e', mock);
  const published = docker('port', prefix, '8080/tcp').trim();
  let denied;
  // Docker Desktop can take longer to expose a freshly allocated host port on cold start.
  for (let attempt = 0; attempt < 150; attempt++) {
    try { denied = await fetch(`http://${published}/login`); break; } catch { await new Promise((resolve) => setTimeout(resolve, 200)); }
  }
  if (denied?.status !== 403) throw new Error('Private gateway failed to block non-Caddy source');
  if ((await fetch(`http://${published}/hooks/github`, { method: 'POST' })).status !== 403) throw new Error('Webhook gateway failed to block non-Caddy source');
  const probe = "(async()=>{for(let i=0;i<30;i++){try{const a=await fetch('http://127.0.0.1:8080/login',{headers:{'Host':'untrusted.invalid','X-Forwarded-Proto':'http','X-Forwarded-For':'198.51.100.12'}});const b=await fetch('http://127.0.0.1:8080/hooks/github',{method:'POST'});if(!a.ok||!b.ok)throw Error();const web=await a.json(),hook=await b.json();if(web.port!==3000||web.host!=='dnsmgr.ce.ncu.edu.tw'||web.proto!=='https'||web.client!=='198.51.100.12'||hook.port!==9000||hook.path!=='/hooks/github')process.exit(2);console.log('Private ingress routing, HTTPS headers, client IP and webhook path verified');return}catch{await new Promise(r=>setTimeout(r,200))}}process.exit(1)})()";
  console.info(docker('exec', `${prefix}-backend`, 'node', '-e', probe).trim());
  console.info('Non-Caddy source denied: HTTP 403');
} catch (error) {
  try { execFileSync('docker', ['logs', prefix], { stdio: 'inherit' }); } catch { /* no container was started */ }
  throw error;
} finally {
  for (const name of [`${prefix}-backend`, prefix]) { try { docker('rm', '-f', name); } catch { /* only this test's uniquely named containers */ } }
  await rm(directory, { recursive: true, force: true });
}
