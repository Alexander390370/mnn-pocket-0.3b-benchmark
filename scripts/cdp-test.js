// 极简 CDP 驱动：无第三方依赖，用 Node 内置 WebSocket
// 用法: node cdp-test.js <url> <outPng> [clickText] [waitMs]
const http = require('http');
const fs = require('fs');

const URL_ = process.argv[2] || 'http://127.0.0.1:8472/';
const OUT = process.argv[3] || 'shot.png';
const CLICK = process.argv[4] || '';
const WAIT = Number(process.argv[5] || 6000);
const PORT = Number(process.env.CDP_PORT || 9334);

function getJSON(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (r) => {
      let b = '';
      r.on('data', (c) => (b += c));
      r.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

(async () => {
  const ver = await getJSON('/json/version');
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const listeners = [];

  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    } else if (m.method) {
      for (const l of listeners) l(m);
    }
  });

  await new Promise((r) => ws.addEventListener('open', r));

  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const msg = { id: ++id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, { resolve, reject });
    ws.send(JSON.stringify(msg));
  });

  // 新建一个 target（独立标签页）
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 412, height: 915, deviceScaleFactor: 2, mobile: true,
  }, sessionId);

  const logs = [];
  listeners.push((m) => {
    if (m.method === 'Runtime.consoleAPICalled' && m.sessionId === sessionId) {
      logs.push('[console] ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown' && m.sessionId === sessionId) {
      logs.push('[ERROR] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    }
  });

  await send('Page.navigate', { url: URL_ }, sessionId);
  await new Promise((r) => setTimeout(r, 2500));

  if (CLICK) {
    const r = await send('Runtime.evaluate', {
      expression: `(() => { const c=[...document.querySelectorAll('.chip')].find(e=>e.textContent.includes(${JSON.stringify(CLICK)})); if(!c) return 'chip-not-found'; c.click(); return 'clicked'; })()`,
      returnByValue: true,
    }, sessionId);
    logs.push('[click] ' + r.result.value);
  }

  await new Promise((r) => setTimeout(r, WAIT));

  const text = await send('Runtime.evaluate', {
    expression: `document.querySelector('#log').innerText`, returnByValue: true,
  }, sessionId);

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));

  console.log('=== 页面文字 ===');
  console.log(text.result.value);
  console.log('=== 控制台 ===');
  console.log(logs.join('\n') || '(无)');
  console.log('=== 截图 ===');
  console.log(OUT);

  await send('Target.closeTarget', { targetId });
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
