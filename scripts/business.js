// 第二轮：真实业务场景压测（QQ 消息 / 日志 / 客服 / 风控）
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8471;

function chat(messages, opts = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      messages, max_tokens: opts.max_tokens ?? 512,
      temperature: opts.temperature ?? 0.1, top_p: 0.9, stream: false,
    });
    const req = http.request({
      host: '127.0.0.1', port: PORT, path: '/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (b += c));
      res.on('end', () => { try { const j = JSON.parse(b); j.error ? reject(new Error(j.error.message)) : resolve(j); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.setTimeout(300000, () => req.destroy(new Error('timeout')));
    req.end(payload);
  });
}

// 真实业务场景：QQ 群消息分流
const QQ_MSGS = [
  { msg: '有没有人知道这个报错咋解决：TypeError: Cannot read property of undefined', want: '求助' },
  { msg: '今晚八点开黑，缺一个打野', want: '组队' },
  { msg: '哈哈哈哈这个表情包太搞笑了', want: '闲聊' },
  { msg: '管理员在吗？这人一直在刷屏', want: '举报' },
  { msg: '【重金求子】加微信详聊', want: '广告' },
  { msg: '请问这个插件的配置文件放哪个目录', want: '求助' },
  { msg: '我明天可能来不了，抱歉', want: '通知' },
  { msg: '新版本更新了，快去升级', want: '通知' },
  { msg: '优惠券领取链接 https://x.co/a 限时三天', want: '广告' },
  { msg: '这道题谁会做？求解', want: '求助' },
];

const LOGS = [
  { log: '2026-11-24 08:12:01 ERROR db connect timeout after 5000ms host=10.0.0.5', want: '数据库' },
  { log: '2026-11-24 09:30:22 WARN memory usage 87% exceeds threshold 80%', want: '内存' },
  { log: '2026-11-24 10:01:10 INFO user login uid=10231 ip=1.2.3.4', want: '登录' },
  { log: '2026-11-24 11:45:33 ERROR 401 unauthorized token expired', want: '认证' },
  { log: '2026-11-24 12:00:00 CRIT disk /dev/sda1 98% full', want: '磁盘' },
];

const TICKETS = [
  { t: '我买的鞋子尺码不对，想换大一码', want: '换货' },
  { t: '快递显示已签收但我没收到', want: '物流' },
  { t: '这个手机用了三天屏幕就花了，我要退款', want: '退款' },
  { t: '请问这个支持无线充电吗', want: '咨询' },
  { t: '你们客服态度太差了，我要投诉', want: '投诉' },
];

(async () => {
  const out = { qq: [], log: [], ticket: [], extra: [] };

  console.log('=== 1. QQ 群消息分流（10 条）===');
  const CATS = ['求助', '组队', '闲聊', '举报', '广告', '通知'];
  for (const x of QQ_MSGS) {
    try {
      const r = await chat([
        { role: 'system', content: `你是群消息分类器。只输出一个类别名，从这些里选：${CATS.join('/')}。不要解释。` },
        { role: 'user', content: x.msg },
      ], { max_tokens: 20, temperature: 0.01 });
      const got = r.choices[0].message.content.trim();
      const ok = got.includes(x.want);
      out.qq.push({ msg: x.msg.slice(0, 40), want: x.want, got, ok });
      console.log(`${ok ? '✅' : '❌'} 期望[${x.want}] 得到[${got}]`);
    } catch (e) { out.qq.push({ msg: x.msg.slice(0, 40), want: x.want, got: 'ERR', ok: false }); console.log('❌ ERR ' + e.message); }
  }

  console.log('\n=== 2. 日志归类（5 条）===');
  for (const x of LOGS) {
    try {
      const r = await chat([
        { role: 'system', content: '你是日志分析器。用 5 个字以内说出这条日志属于哪类问题（如：数据库/内存/登录/认证/磁盘/网络）。只输出类别。' },
        { role: 'user', content: x.log },
      ], { max_tokens: 20, temperature: 0.01 });
      const got = r.choices[0].message.content.trim();
      const ok = got.includes(x.want);
      out.log.push({ log: x.log.slice(0, 50), want: x.want, got, ok });
      console.log(`${ok ? '✅' : '❌'} 期望[${x.want}] 得到[${got}]`);
    } catch (e) { console.log('❌ ERR'); }
  }

  console.log('\n=== 3. 客服工单分类（5 条）===');
  for (const x of TICKETS) {
    try {
      const r = await chat([
        { role: 'system', content: '把工单分类到：换货/物流/退款/咨询/投诉 之一。只输出类别名。' },
        { role: 'user', content: x.t },
      ], { max_tokens: 20, temperature: 0.01 });
      const got = r.choices[0].message.content.trim();
      const ok = got.includes(x.want);
      out.ticket.push({ t: x.t.slice(0, 40), want: x.want, got, ok });
      console.log(`${ok ? '✅' : '❌'} 期望[${x.want}] 得到[${got}]`);
    } catch (e) { console.log('❌ ERR'); }
  }

  console.log('\n=== 4. 结构化输出（真实字段）===');
  const structTests = [
    { name: 'QQ 消息 JSON', sys: '只输出 JSON，不要代码块。', user: '把这条消息转 JSON，键为 type/text/priority："报错：连接超时，很急！"', check: (t) => { try { const o = JSON.parse(t.replace(/```json|```/g, '').trim()); return o.text && o.type; } catch { return false; } } },
    { name: '日志摘要', sys: '一句话摘要，不超过 20 字。', user: '2026-11-24 08:12 ERROR db connect timeout host=10.0.0.5 retry 3 times failed', check: (t) => t.length > 0 && t.length <= 40 },
    { name: '多字段抽取', sys: '只输出 JSON。', user: '从"订单号 A12345，金额 89.9 元，2026-11-20 下单"抽取 order_id/amount/date', check: (t) => { try { const o = JSON.parse(t.replace(/```json|```/g, '').trim()); return /A12345/.test(JSON.stringify(o)) && /89\.9/.test(JSON.stringify(o)); } catch { return false; } } },
    { name: '批量标签', sys: '输出 JSON 数组。', user: '给这些消息打标签（咨询/投诉/售后）：["这个多少钱","你们服务太差了","我要退货"]', check: (t) => { try { const a = JSON.parse(t.replace(/```json|```/g, '').trim()); return Array.isArray(a) && a.length === 3; } catch { return false; } } },
  ];
  for (const x of structTests) {
    try {
      const r = await chat([{ role: 'system', content: x.sys }, { role: 'user', content: x.user }], { max_tokens: 200, temperature: 0.01 });
      const txt = r.choices[0].message.content.trim();
      const ok = x.check(txt);
      out.extra.push({ name: x.name, ok, output: txt.replace(/\s+/g, ' ').slice(0, 200) });
      console.log(`${ok ? '✅' : '❌'} ${x.name} → ${txt.replace(/\s+/g, ' ').slice(0, 100)}`);
    } catch (e) { console.log(`❌ ${x.name} ERR`); }
  }

  const qqPass = out.qq.filter((x) => x.ok).length;
  const logPass = out.log.filter((x) => x.ok).length;
  const tkPass = out.ticket.filter((x) => x.ok).length;
  const exPass = out.extra.filter((x) => x.ok).length;

  console.log('\n================================');
  console.log(`QQ 分流: ${qqPass}/${out.qq.length}`);
  console.log(`日志归类: ${logPass}/${out.log.length}`);
  console.log(`工单分类: ${tkPass}/${out.ticket.length}`);
  console.log(`结构化输出: ${exPass}/${out.extra.length}`);
  const total = out.qq.length + out.log.length + out.ticket.length + out.extra.length;
  console.log(`合计: ${qqPass + logPass + tkPass + exPass}/${total}`);

  fs.writeFileSync(path.join(__dirname, 'business-result.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log('\n→ business-result.json');
})();
