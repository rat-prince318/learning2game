import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DemoService, ServiceError } from './demo-service.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = resolve(root, 'public');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png' };
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
async function readBody(req) {
  const max = 21 * 1024 * 1024;
  if (Number(req.headers['content-length']) > max) throw new ServiceError('FILE_TOO_LARGE', '上传超出大小限制。', 413);
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > max) throw new ServiceError('FILE_TOO_LARGE', '上传超出大小限制。', 413); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

export async function createAppServer({ dataDir = resolve(root, '.data'), backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000', demoEnabled = process.env.DEMO_MODE !== 'false', jobDelay = 450 } = {}) {
  const service = demoEnabled ? await new DemoService(dataDir, jobDelay).init() : null;
  let queue = Promise.resolve();
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/config.json') { json(res, 200, { demoEnabled, defaultMode: demoEnabled ? 'demo' : 'real', realApiBase: '/api', demoApiBase: '/demo-api', backendUrl, uploadLimitMb: 20 }); return; }
      if (url.pathname.startsWith('/api/')) {
        const buffer = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
        const target = `${backendUrl.replace(/\/$/, '')}${url.pathname.slice(4)}${url.search}`;
        const headers = {};
        for (const name of ['content-type', 'accept', 'idempotency-key', 'authorization', 'cookie']) if (req.headers[name]) headers[name] = req.headers[name];
        try {
          const upstream = await fetch(target, { method: req.method, headers, body: buffer, signal: AbortSignal.timeout(20000), redirect: 'manual' });
          res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' }); res.end(Buffer.from(await upstream.arrayBuffer()));
        } catch { json(res, 502, { error: { code: 'NETWORK_ERROR', message: '真实后端不可达，请启动成员 D 的服务并检查 BACKEND_URL。' } }); }
        return;
      }
      if (url.pathname.startsWith('/demo-api/')) {
        if (!service) { json(res, 404, { error: { code: 'NOT_FOUND', message: '演示接口已关闭。' } }); return; }
        const buffer = ['GET', 'HEAD', 'DELETE'].includes(req.method) ? null : await readBody(req);
        let body = {};
        if (buffer) {
          const type = req.headers['content-type'] || '';
          if (type.startsWith('multipart/form-data')) body = await new Request('http://localhost/upload', { method: 'POST', headers: { 'Content-Type': type }, body: buffer }).formData();
          else try { body = JSON.parse(buffer.toString('utf8')); } catch { throw new ServiceError('INVALID_REQUEST', 'JSON 无效。'); }
        }
        const path = url.pathname.slice('/demo-api'.length);
        const operation = queue.then(() => service.handle(req.method, path, body, req.headers['idempotency-key'] || body.event_id));
        queue = operation.catch(() => {});
        json(res, 200, await operation); return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { json(res, 405, { error: { code: 'INVALID_REQUEST', message: '不支持此请求方法。' } }); return; }
      let pathname; try { pathname = decodeURIComponent(url.pathname); } catch { json(res, 400, { error: { code: 'INVALID_REQUEST', message: '路径无效。' } }); return; }
      const filename = resolve(publicRoot, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!filename.startsWith(publicRoot + sep)) { json(res, 403, { error: { code: 'INVALID_REQUEST', message: '路径无效。' } }); return; }
      try {
        const content = await readFile(filename);
        res.writeHead(200, { 'Content-Type': mime[extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
        res.end(req.method === 'HEAD' ? undefined : content);
      } catch { json(res, 404, { error: { code: 'NOT_FOUND', message: '文件不存在。' } }); }
    } catch (error) {
      if (!res.headersSent) json(res, error.status || 400, { error: { code: error.code || 'INVALID_REQUEST', message: error instanceof ServiceError ? error.message : '请求无法完成，请检查参数。' } });
      else res.end();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 5173), host = process.env.HOST || '127.0.0.1';
  const server = await createAppServer();
  server.listen(port, host, () => console.log(`Learning2Game: http://${host}:${port}\nReal backend: ${process.env.BACKEND_URL || 'http://127.0.0.1:8000'}\nDemo: ${process.env.DEMO_MODE !== 'false' ? 'enabled (pre-authored sample)' : 'disabled'}`));
  server.on('error', error => { console.error(`服务启动失败：${error.message}`); process.exitCode = 1; });
}
