// 本地生成 SVG 徽章 —— 绕开 GitHub camo 代理，离线可用，国内秒开
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets', 'badges');
fs.mkdirSync(OUT, { recursive: true });

// shields.io 风格配色
const COLORS = {
  blueviolet: '#8a2be2',
  brightgreen: '#4c1',
  green: '#97ca00',
  yellowgreen: '#a4a61d',
  yellow: '#dfb317',
  orange: '#fe7d37',
  red: '#e05d44',
  blue: '#007ec6',
  lightgrey: '#9f9f9f',
  critical: '#e05d44',
  success: '#4c1',
  important: '#fe7d37',
  informational: '#007ec6',
  dark: '#0d1117',
  teal: '#00a4ef',
  purple: '#6f42c1',
  pink: '#ff69b4',
};

// 估算文字宽度（Verdana 11px，中英文分别处理）
function textWidth(s, size = 11) {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code > 0x2e80) w += size * 1.05;      // CJK 全角
    else if (/[A-Z0-9]/.test(ch)) w += size * 0.68;
    else if (/[a-z]/.test(ch)) w += size * 0.58;
    else w += size * 0.42;
  }
  return w;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 生成 flat / flat-square 风格徽章
function badge({ label, message, color, style = 'flat-square', labelColor = '#555' }) {
  const PAD = 6;
  const lw = textWidth(label) + PAD * 2;
  const mw = textWidth(message) + PAD * 2;
  const total = Math.round(lw + mw);
  const h = style === 'for-the-badge' ? 28 : 20;
  const fill = COLORS[color] || color;
  const rx = style === 'flat' ? 3 : 0;

  const labelEl = label
    ? `<rect width="${Math.round(lw)}" height="${h}" fill="${labelColor}"/>`
    : '';
  const labelText = label
    ? `<text x="${Math.round(lw / 2)}" y="${h / 2 + 4}" fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">${esc(label)}</text>`
    : '';
  const msgX = Math.round(lw + mw / 2);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${h}" role="img" aria-label="${esc(label)}: ${esc(message)}">
  <title>${esc(label)}: ${esc(message)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${total}" height="${h}" rx="${rx}" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    ${labelEl}
    <rect x="${Math.round(lw)}" width="${Math.round(mw)}" height="${h}" fill="${fill}"/>
    <rect width="${total}" height="${h}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">
    ${labelText}
    <text x="${msgX}" y="${h / 2 + 4}">${esc(message)}</text>
  </g>
</svg>`;
}

// ===== 徽章定义 =====
const BADGES = [
  // 第一排：核心数据
  { file: 'benchmark.svg',  label: 'benchmark',  message: '291 calls',      color: 'blueviolet' },
  { file: 'models.svg',     label: 'models',     message: '4 compared',     color: 'pink' },
  { file: 'speed.svg',      label: 'decode',     message: '483 tok/s',      color: 'brightgreen' },
  { file: 'verdict.svg',    label: 'verdict',    message: '手不是脑',        color: 'critical' },

  // 第二排：模型属性
  { file: 'mnn.svg',        label: 'MNN',        message: 'Pocket-0.3B',    color: 'teal' },
  { file: 'params.svg',     label: 'params',     message: '300M',           color: 'orange' },
  { file: 'size.svg',       label: 'INT4',       message: '183 MB',         color: 'success' },
  { file: 'license.svg',    label: 'license',    message: 'Apache-2.0',     color: 'blue' },
  { file: 'platform.svg',   label: 'platform',   message: 'Windows | CUDA', color: 'dark' },
  { file: 'engine.svg',     label: 'engine',     message: 'llama.cpp',      color: '#000000' },

  // 第三排：可信度
  { file: 'reproducible.svg', label: 'reproducible', message: '100%',       color: 'success' },
  { file: 'rawdata.svg',      label: 'raw data',     message: 'JSON',       color: 'informational' },
  { file: 'nobullshit.svg',   label: 'no bullshit',  message: 'yes',        color: 'red' },
  { file: 'chinese.svg',      label: 'docs',         message: '中文',        color: '#ff4d4f' },
];

let count = 0;
for (const b of BADGES) {
  const svg = badge({ label: b.label, message: b.message, color: b.color, style: 'for-the-badge' });
  fs.writeFileSync(path.join(OUT, b.file), svg, 'utf8');
  count++;
  console.log(`  ✓ ${b.file.padEnd(20)} ${b.label}: ${b.message}`);
}

console.log(`\n生成 ${count} 个徽章 → assets/badges/`);
