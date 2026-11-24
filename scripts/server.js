// MNN-Pocket-0.3B 手机遥控台 —— 静态页 + 流式代理（零依赖）
// 手机连同一个 Wi-Fi，浏览器打开 http://<电脑局域网IP>:8472 即可
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT || 8472);
const UPSTREAM = process.env.UPSTREAM || 'http://127.0.0.1:8471';
const ROOT = __dirname;
const WEB = path.join(ROOT, 'web');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function lanIPs() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
    }
  }
  return out;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 8 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  // ---- 二维码页：地址随 DHCP 变化，这里永远是最新的 ----
  if (p === '/qr') {
    const cand = lanIPs().filter((x) => !/ZeroTier|Tailscale|vEthernet|Hyper-V/i.test(x.name));
    const pick = cand[0] || lanIPs()[0];
    const target = pick ? `http://${pick.address}:${PORT}` : `http://127.0.0.1:${PORT}`;
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>扫码打开</title><style>
body{margin:0;height:100dvh;display:grid;place-items:center;background:#08131f;color:#e8f2ff;
font:15px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;text-align:center;padding:20px}
.box{background:#fff;padding:18px;border-radius:18px;display:inline-block}
h1{font-size:17px;margin:0 0 6px}p{color:#8ba6c4;font-size:13px;margin:0 0 18px}
code{background:rgba(58,209,255,.14);padding:3px 9px;border-radius:7px;font-size:14px;color:#3ad1ff}
</style></head><body><div>
<h1>手机扫码打开</h1>
<p>手机和电脑连同一个 Wi-Fi</p>
<div class="box"><img src="/qr.gif" width="260" height="260" alt="QR"></div>
<p style="margin-top:18px">或手动输入 <code>${target}</code></p>
</div></body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(html);
  }

  if (p === '/qr.gif') {
    const gif = path.join(ROOT, 'qr.gif');
    return fs.readFile(gif, (err, data) => {
      if (err) { res.writeHead(404); return res.end('no qr'); }
      res.writeHead(200, { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  }

  // ---- 健康检查：把上游 /props 探一遍 ----
  if (p === '/api/health') {
    const alive = await new Promise((resolve) => {
      const r = http.get(UPSTREAM + '/props', { timeout: 4000 }, (up) => {
        up.resume();
        resolve(up.statusCode === 200);
      });
      r.on('error', () => resolve(false));
      r.on('timeout', () => { r.destroy(); resolve(false); });
    });
    res.writeHead(alive ? 200 : 503, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: alive, upstream: UPSTREAM }));
  }

  // ---- 聊天：SSE 直通 ----
  if (p === '/api/chat' && req.method === 'POST') {
    let body;
    try { body = await readBody(req); }
    catch (e) { res.writeHead(413); return res.end('too large'); }

    const up = new URL(UPSTREAM + '/v1/chat/completions');
    const pr = http.request({
      hostname: up.hostname, port: up.port, path: up.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length },
    }, (upRes) => {
      if (upRes.statusCode !== 200) {
        res.writeHead(upRes.statusCode || 502, { 'Content-Type': 'text/plain; charset=utf-8' });
        upRes.pipe(res);
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      upRes.pipe(res);
    });
    pr.on('error', (e) => {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('upstream error: ' + e.message);
    });
    pr.setTimeout(180000, () => pr.destroy(new Error('upstream timeout')));
    pr.end(body);
    req.on('close', () => pr.destroy());
    return;
  }

  // ---- 静态文件 ----
  let rel = decodeURIComponent(p === '/' ? '/index.html' : p);
  const file = path.normalize(path.join(WEB, rel));
  if (!file.startsWith(WEB)) { res.writeHead(403); return res.end('forbidden'); }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

server.on('error', (e) => {
  console.error('[!] 启动失败：' + e.message);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  MNN-Pocket-0.3B  手机遥控台已启动');
  console.log('  ----------------------------------------');
  for (const { name, address } of lanIPs()) {
    const tag = /ZeroTier|Tailscale|vEthernet/i.test(name) ? '  (虚拟网卡)' : '';
    console.log(`  手机打开 →  http://${address}:${PORT}${tag}`);
  }
  console.log(`  本机 →      http://127.0.0.1:${PORT}`);
  console.log(`  上游模型 →  ${UPSTREAM}`);
  console.log('  ----------------------------------------');
  console.log('  手机连同一个 Wi-Fi 后，扫 /qr 这个地址即可:');
  console.log(`  手机扫不了就用电脑浏览器开 http://127.0.0.1:${PORT}/qr 看大图`);
  console.log('');
});
