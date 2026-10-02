'use strict';

// localStorage はほかのアプリと共有される（同じ t-of.github.io のため）。
// キーは必ず 'spirit-forest.' で始める。今回は保存データなし（1 回の対局を遊ぶだけ）。
const STORE = 'spirit-forest.';

WebAppKit.init({ title: 'spirit-forest', text: 'Spirits of the Forest を遊べる最小版' });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

// 音を鳴らす前にマナーモードでも聞こえるようにする（RULES.md §5）
function setAudioSession(soundOn) {
  try { if (navigator.audioSession) navigator.audioSession.type = soundOn ? 'playback' : 'auto'; } catch { /* 対応していない */ }
}
let audioCtx = null;
function beep(freq) {
  try {
    if (!audioCtx) { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); setAudioSession(true); }
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.08;
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.15);
  } catch { /* 音が出せなくても遊べる */ }
}

function reducedMotion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---- ここからアプリ本体（ルール・得点は変えていない） ----

// 精霊 9 種・力の源 3 種
const SPECIES = ['sp', 'br', 'lv', 'vi', 'dw', 'mu', 'fr', 'fl', 'ms'];
const POWERS = ['fi', 'mo', 'su'];
// 色は 1 か所（ここ）だけで決め、起動時に CSS 変数へ流し込む（style.css は var(--xx-dark) 等を参照するだけ）。
// Claude Design の見本帳（.audit/spirit-forest-design.dc.html）どおりの 9 系統
const INFO = {
  sp: { name: '風', base: '#6E6488', dark: '#4A4260', light: '#9C93B2', count: 10 },
  br: { name: '根', base: '#94697F', dark: '#664457', light: '#BF9AAB', count: 8 },
  lv: { name: '葉', base: '#8C9473', dark: '#5E654B', light: '#B5BC9C', count: 8 },
  vi: { name: '岩', base: '#8A8378', dark: '#5D574F', light: '#B3ADA2', count: 8 },
  dw: { name: '水', base: '#4D7C7D', dark: '#2E5354', light: '#7FA6A4', count: 7 },
  mu: { name: '茸', base: '#A95F4A', dark: '#743D2F', light: '#CD8D76', count: 7 },
  fr: { name: '木の実', base: '#9C7650', dark: '#6B4F34', light: '#C4A27C', count: 6 },
  fl: { name: '花', base: '#C0954A', dark: '#8A6630', light: '#DDBD7E', count: 6 },
  ms: { name: '苔', base: '#5D6B40', dark: '#3C4729', light: '#8C9A68', count: 5 },
  fi: { name: '火' },
  mo: { name: '月' },
  su: { name: '太陽' },
};
const CATEGORIES = [...SPECIES, ...POWERS];
const IV = '#EFE7D4'; // アイボリー（見本帳の IV）
const POWER_ICON_COLOR = IV;

// プレイヤーの原石の色。P1・P2 は見本帳どおり、3・4 人目は同じくすみのトーンを足す
const PLAYER_COLORS = ['#7E3B3F', '#3E5F7A', '#8A6630', '#5E654B'];

// ---- デザインの切り替え: 森（版画ふう）/ 幾何（はっきりした色と正多角形のマーク） ----
// 幾何のマーク: 正 3〜8 角形を 2 向きずつ（0 = 頂点が上、1 = π/n 回す）で 12 種
const GEO_MARK = {
  sp: [3, 0], br: [3, 1], lv: [4, 0], vi: [4, 1], dw: [5, 0], mu: [5, 1],
  fr: [6, 0], fl: [6, 1], ms: [7, 0], fi: [7, 1], mo: [8, 0], su: [8, 1],
};
const GEO_INK = '#16182B';
// 力の源（火・月・太陽）の色。精霊と見分けるため、こちらだけ墨の縁どりを付ける
const GEO_POWER = { fi: '#E8202A', mo: '#3FA9F5', su: '#FFD000' };
const THEMES = {
  forest: {
    paper: '#E9E0CA',
    players: PLAYER_COLORS.slice(),
    colors: Object.fromEntries(SPECIES.map((k) => [k, [INFO[k].base, INFO[k].dark, INFO[k].light]])),
  },
  geo: {
    paper: '#F4EEE1',
    players: ['#E4573D', '#2F57E0', '#F2B632', '#1E9E6A'],
    colors: {
      sp: ['#7446D8', '#5E33BD', '#8A5CF0'], br: ['#D63A7A', '#B02A62', '#EC6A9C'],
      lv: ['#6FAE3A', '#558C2A', '#94C966'], vi: ['#5F6577', '#474C5C', '#80869A'],
      dw: ['#2F57E0', '#2548C0', '#4C7BFF'], mu: ['#E4573D', '#C2402A', '#F07A62'],
      fr: ['#9A5B2E', '#7A4620', '#B97C4C'], fl: ['#E89A1C', '#C47D0E', '#F2B632'],
      ms: ['#1E9E6A', '#16825A', '#3CBB86'],
    },
  },
};
let theme = 'forest';
try { theme = localStorage.getItem(STORE + 'theme') || 'forest'; } catch { /* 読めなくてもよい */ }
if (!THEMES[theme]) theme = 'forest';
function geoPoly(key) {
  const [n, flip] = GEO_MARK[key];
  const r = 9.5;
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (flip * Math.PI) / n + (i * 2 * Math.PI) / n;
    return `${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}
// INFO の色と原石の色を差し替え、CSS 変数（--sp-base / --sp-dark / --sp-light など）に流す
function applyTheme(t) {
  theme = t;
  const T = THEMES[t];
  SPECIES.forEach((k) => {
    [INFO[k].base, INFO[k].dark, INFO[k].light] = T.colors[k];
    document.documentElement.style.setProperty(`--${k}-base`, INFO[k].base);
    document.documentElement.style.setProperty(`--${k}-dark`, INFO[k].dark);
    document.documentElement.style.setProperty(`--${k}-light`, INFO[k].light);
  });
  T.players.forEach((c, i) => { PLAYER_COLORS[i] = c; });
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]').content = T.paper;
  const btn = document.getElementById('btn-theme');
  btn.textContent = t === 'geo' ? '森にする' : '幾何にする';
}
applyTheme(theme);
document.getElementById('btn-theme').addEventListener('click', () => {
  applyTheme(theme === 'geo' ? 'forest' : 'geo');
  try { localStorage.setItem(STORE + 'theme', theme); } catch { /* 保存できなくてもよい */ }
  render();
});

// ---- 紋章（見本帳の E）。9 種の生き物は曲線の輪郭を数色で塗り分け、火・月・太陽は石板の印にする ----
function dot(x, y, r) { return `M${x} ${y}m-${r} 0a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 -${2 * r} 0`; }
function petals(n, len, wid, off) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = off + (i * 2 * Math.PI) / n;
    const cx = Math.cos(a), sy = Math.sin(a);
    const tx = 12 + len * cx, ty = 12 + len * sy;
    const mx = 12 + len * 0.5 * cx, my = 12 + len * 0.5 * sy;
    const px = -sy * wid, py = cx * wid;
    d += `M12 12Q${(mx + px).toFixed(2)} ${(my + py).toFixed(2)} ${tx.toFixed(2)} ${ty.toFixed(2)}Q${(mx - px).toFixed(2)} ${(my - py).toFixed(2)} 12 12Z`;
  }
  return d;
}
function petalsAt(n, len, wid, off, ox, oy) {
  return petals(n, len, wid, off).replace(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g, (_, x, y) => `${(+x - 12 + ox).toFixed(2)} ${(+y - 12 + oy).toFixed(2)}`);
}
function rays(n, r1, r2) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n;
    d += `M${(12 + r1 * Math.cos(a)).toFixed(2)} ${(12 + r1 * Math.sin(a)).toFixed(2)}L${(12 + r2 * Math.cos(a)).toFixed(2)} ${(12 + r2 * Math.sin(a)).toFixed(2)}`;
  }
  return d;
}
// 太陽・月・火: アイボリーのコインの中に、縦長六角形の石板。印はそこに彫る
function slab(sym, rayed) {
  const STONE = '#8B887F', SIDE = '#69665E', CARVE = '#46443F', LIT = '#BDB9AE';
  return [
    { d: 'M12 2L19 6.5V17.5L12 22L5 17.5V6.5Z', f: STONE },
    { d: 'M19 6.5V17.5L12 22V20.4L17.7 16.7V7.3ZM5 17.5L12 22V20.4L6.3 16.7Z', f: SIDE },
    { d: sym(0.5), f: LIT, s: rayed ? LIT : 'none' },
    { d: sym(0), f: CARVE, s: rayed ? CARVE : 'none' },
  ];
}
const E = {
  // 風: 触角のある、霧のような小さな精霊
  sp: [
    { d: 'M12 4.5c3.6 0 6 2.6 6 6.2 0 2.6-1.2 4.6-3 5.6 1 1.4 2.6 2.4 4.6 2.6-2.8 1.2-5.4.8-7-.6-1.6 1.6-4.2 2.2-7 1.4 2-.6 3.4-1.8 4-3.2C7.2 15.4 6 13.4 6 10.7c0-3.6 2.4-6.2 6-6.2z', f: 'C' },
    { d: 'M10.2 5L8.6 2.2M13.8 5l1.6-2.8M1.6 9c1.2-.9 2.5-.9 3.6 0M18.8 13.4c1.2-.9 2.5-.9 3.6 0', s: 'C' },
    { d: dot(10, 10.2, 1.1) + dot(14, 10.2, 1.1), f: 'I' },
  ],
  // 根: 細長い甲虫
  br: [
    { d: 'M12 4c2.4 0 3.6 2.6 3.6 5.6v5.8c0 3.6-1.6 6.1-3.6 6.1s-3.6-2.5-3.6-6.1V9.6C8.4 6.6 9.6 4 12 4z', f: 'C' },
    { d: 'M8.6 10.5L5 8.5M8.4 13.6H4.4M8.6 16.6L5 19M15.4 10.5L19 8.5M15.6 13.6h4M15.4 16.6L19 19M10.6 4.6L9.2 2M13.4 4.6L14.8 2', s: 'C' },
    { d: dot(10.8, 7, 0.9) + dot(13.2, 7, 0.9), f: 'I' },
    { d: 'M12 10v10', s: 'I' },
  ],
  // 葉: 葉の翼をもつ小鳥
  lv: [
    { d: 'M3.5 15.5C3.5 10.5 7.5 7 12.5 7c4 0 7 2.8 7 6.6 0 4-3.2 6.4-7.5 6.4H8l-4.5 2.2 1.8-3.6C4.2 17.8 3.5 16.8 3.5 15.5zM19.2 11.6l3.3 1.2-3 1.4z', f: 'C' },
    { d: dot(16, 11.2, 1.1), f: 'I' },
    { d: 'M7.5 15.5c2-3.4 5.5-4.6 8.6-3.2-1.8 3.4-5.2 4.6-8.6 3.2zM8.5 15.2l6.5-2.4', s: 'I' },
  ],
  // 岩: ずんぐりした岩の番人
  vi: [
    { d: 'M4.5 21l.8-9.2L8.6 5.5h6.8l3.3 6.3.8 9.2h-4.5v-3h-6v3z', f: 'C' },
    { d: 'M8.6 11.5h2.2v1.4H8.6zM13.2 11.5h2.2v1.4h-2.2z', f: 'I' },
    { d: 'M12 6l-.8 2.4 1.4 1.4M6.8 16.8h2', s: 'I' },
  ],
  // 水: 炎のような房の頭、葉の腕と葉の裾をもつ細身の精霊
  dw: [
    { d: 'M11.6 5.6C11 4.4 11.3 3 12.4 2c.1 1 .6 1.6 1.2 2-.1-.7.1-1.3.5-1.7.3 1.4-.1 2.6-1.3 3.5z'
      + 'M12 4.9c1.4 0 2.3 1.1 2.3 2.4 0 1.4-1 2.6-2.3 3-1.3-.4-2.3-1.6-2.3-3 0-1.3.9-2.4 2.3-2.4z'
      + 'M11.55 10h.9v1.3h-.9z'
      + 'M12 11c1.3 0 2 .8 2 2 0 1-.4 1.8-1 2.4h-2c-.6-.6-1-1.4-1-2.4 0-1.2.7-2 2-2z'
      + 'M10.5 11.5c-1.6.9-2.4 2.6-2.3 4.8.7-.9 1.4-2.2 2.1-3.7zM13.5 11.5c1.6.9 2.4 2.6 2.3 4.8-.7-.9-1.4-2.2-2.1-3.7z'
      + 'M10.6 15C9.6 16.2 8.8 17.8 8.6 19.6L9.8 19L10.4 20L11.2 19.2L12 20L12.8 19.2L13.6 20L14.2 19L15.4 19.6C15.2 17.8 14.4 16.2 13.4 15Z'
      + 'M10.9 19.8h.6v1.7l-1 .5-.2-.4.6-.3zM12.5 19.8h.6v1.4l.6.3-.2.4-1-.5z', f: 'C' },
    { d: 'M11.85 15.6h.3v3.8h-.3zM10.9 16.3l.28.1-.9 2.4-.28-.1zM13.1 16.3l-.28.1.9 2.4.28-.1zM11.9 11.8h.2v2.8h-.2z', f: 'L' },
    { d: dot(11.2, 7.5, 0.42) + dot(12.8, 7.5, 0.42), f: 'I' },
  ],
  // 茸: 歩くきのこ
  mu: [
    { d: 'M2.5 11.5a9.5 7.2 0 0 1 19 0zM8.6 11.5h6.8v5.6a3.4 3.4 0 0 1-6.8 0z', f: 'C' },
    { d: 'M9.6 20.2L8.6 22M14.4 20.2l1 1.8', s: 'C' },
    { d: dot(7.8, 8.6, 1.2) + dot(12.4, 6.4, 1.1) + dot(16.4, 9, 1) + dot(10.6, 14.4, 0.9) + dot(13.4, 14.4, 0.9), f: 'I' },
  ],
  // 木の実: どんぐりの子
  fr: [
    { d: 'M4.5 9.2c0-3.6 3.3-5.7 7.5-5.7s7.5 2.1 7.5 5.7zM6.2 9.2h11.6c0 6.2-2.6 11.3-5.8 11.3S6.2 15.4 6.2 9.2z', f: 'C' },
    { d: 'M12 3.5c0-1 .6-1.8 1.6-2', s: 'C' },
    { d: 'M6.5 7.6h11M9 5.2l1 2.4M15 5.2l-1 2.4', s: 'I' },
    { d: dot(10, 12.8, 1) + dot(14, 12.8, 1), f: 'I' },
  ],
  // 花: 花の妖精
  fl: [
    { d: petalsAt(6, 6.8, 2.8, 0, 12, 9), f: 'C' },
    { d: 'M12 15.6V22M12 19.5c-1.8-.4-3-1.6-3.6-3.2M12 18.2c1.8-.4 3-1.6 3.6-3.2', s: 'C' },
    { d: dot(12, 9, 2.6), f: 'I' },
    { d: dot(11.1, 8.7, 0.55) + dot(12.9, 8.7, 0.55), f: 'C' },
  ],
  // 苔: 背に草が生えた大きな獣
  ms: [
    { d: 'M2.5 18c0-5.8 4.5-9.2 10-9.2 5 0 9 2.8 9 7.6V18h-2.4v2.6h-2.6V18H9.4v2.6H6.8V18z', f: 'C' },
    { d: 'M8 9.2V5.4M8 6.8c-1.2-1.4-2.8-1.4-3.6-.8M8 6.8c1.2-1.6 2.8-1.4 3.6-.8M13.5 8.9V6.6c.9-1 2-1.1 2.8-.6', s: 'C' },
    { d: dot(17.2, 13.2, 1), f: 'I' },
    { d: dot(7, 13.2, 0.7) + dot(10, 12, 0.6) + dot(12.6, 14, 0.6), f: 'I' },
  ],
  fi: slab((dy) => `M12 ${7.4 + dy}c.5 2 3.2 3 3.2 5.8a3.2 3.2 0 0 1-6.4 0c0-1.5.9-2.5 1.6-3.1 0 1 .4 1.7 1 1.9-.2-1.5.1-3 .6-4.6z`, false),
  mo: slab((dy) => `M13.4 ${7.6 + dy}a4.6 4.6 0 1 0 3 6.6a3.6 3.6 0 0 1-3-6.6z`, false),
  su: slab((dy) => dot(12, 12 + dy, 2.2) + rays(8, 3.4, 4.8).replace(/(\d+\.\d+) (\d+\.\d+)/g, (_, x, y) => `${x} ${(+y + dy).toFixed(2)}`), true),
};
const EMPTY_SLOT = { d: 'M0 0', f: 'none', s: 'none' };
// 'C' は精霊の色、'I' はアイボリー、'L' は light、'#...' はそのまま、slab() は色を自分で持つ
function slotsOf(key, color) {
  const pick = (v) => (v && v[0] === '#' ? v : v === 'C' ? color : v === 'I' ? IV : v === 'L' ? INFO[key].light : 'none');
  const s = E[key].map((p) => ({ d: p.d, f: pick(p.f), s: pick(p.s) }));
  return [0, 1, 2, 3].map((i) => s[i] || EMPTY_SLOT);
}
function embPathsHtml(key) {
  if (theme === 'geo') {
    return SPECIES.includes(key)
      ? `<polygon points="${geoPoly(key)}" fill="${INFO[key].base}"/>`
      : `<polygon points="${geoPoly(key)}" fill="${GEO_POWER[key]}" stroke="${GEO_INK}" stroke-width="1.4" stroke-linejoin="round"/>`;
  }
  const color = SPECIES.includes(key) ? INFO[key].dark : null; // 火・月・太陽は slab() が自分で色を持つので使わない
  return slotsOf(key, color).map((p) => `<path d="${p.d}" fill="${p.f}" stroke="${p.s}"/>`).join('');
}
// 集計表・メッセージで使う、紋章だけの小さいアイコン（コインなし）
const SYMBOLS = {
  plus: '<path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z" fill="currentColor"/>',
};
function svgIcon(key, color, size = 20) {
  if (key === 'plus') return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="color:${color}" aria-hidden="true">${SYMBOLS.plus}</svg>`;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${embPathsHtml(key)}</svg>`;
}
// アイボリーの紋章コイン。細い輪 + 紙の粒子（grain フィルタ）
function coinHtml(key, size = 22) {
  return `<span class="coin" style="width:${size}px;height:${size}px">${coinInnerSvg(key)}</span>`;
}
let gemSeq = 0;
function gemSvg(color, size = 20) {
  const id = 'gemg' + (gemSeq++);
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="filter:drop-shadow(0 2px 3px ${color}88)">
    <defs><radialGradient id="${id}" cx="35%" cy="28%" r="75%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="45%" stop-color="${color}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="${color}"/>
    </radialGradient></defs>
    <polygon points="12,2.5 18.5,8 17,20 7,20 5.5,8" fill="url(#${id})" stroke="rgba(255,255,255,0.55)" stroke-width="0.6"/>
  </svg>`;
}
// 裏向きの恩恵トークン（見本帳どおり）。アイボリーの輪に、六角形の印
function tokenBackHtml() {
  return `<span class="tile__token" aria-hidden="true">
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10.5" fill="none" stroke="#6B4F34" stroke-width="0.6"/>
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="#6B4F34" stroke-width="0.4" stroke-dasharray="1.2 1.2"/>
      <path d="M12 6.5L16.8 9.25V14.75L12 17.5L7.2 14.75V9.25Z" fill="#9C7650" opacity="0.8"/>
      <rect width="24" height="24" filter="url(#grain)"/>
    </svg>
  </span>`;
}
function tokenDiscHtml(key, size = 22) {
  return coinHtml(key === 'plus' ? 'plus' : key, size);
}
// 札の地紋（見本帳どおり）: 角ばった葉の重なり + 縦線とひし形の線 + 星の点 + 紙の粒子
function tilePatternSvg() {
  // 幾何: 角の扇形・小さな三角・点の格子（ホーム画面の geo アイコンと同じ作り）
  if (theme === 'geo') {
    return `<svg class="tile__pattern-svg" viewBox="0 0 60 90" preserveAspectRatio="none" aria-hidden="true">
    <path d="M60 0V34A34 34 0 0 1 26 0z" fill="var(--t-dark)"/>
    <path d="M0 90V62A28 28 0 0 1 28 90z" fill="var(--t-light)"/>
    <path d="M0 0H14L0 14z" fill="var(--t-light)"/>
    ${Array.from({ length: 12 }, (_, i) => `<circle cx="${7.5 + (i % 4) * 15}" cy="${7.5 + Math.floor(i / 4) * 30 + 15}" r="0.9" fill="#F4EEE1" opacity="0.35"/>`).join('')}
  </svg>`;
  }
  return `<svg class="tile__pattern-svg" viewBox="0 0 60 90" preserveAspectRatio="none" aria-hidden="true">
    <path d="M-10 30C10 10 30 8 46 -6C40 20 22 34 -10 30Z" fill="var(--t-light)" opacity="0.35"/>
    <path d="M20 -4C26 8 24 20 12 28C8 16 12 6 20 -4Z" fill="var(--t-dark)" opacity="0.32"/>
    <path d="M70 10C50 14 36 34 40 60C54 46 64 30 70 10Z" fill="var(--t-dark)" opacity="0.35"/>
    <path d="M52 -6C46 6 50 16 64 20C62 8 58 0 52 -6Z" fill="var(--t-light)" opacity="0.3"/>
    <path d="M4 70C2 54 10 42 26 38C24 54 18 64 4 70Z" fill="var(--t-light)" opacity="0.3"/>
    <path d="M-8 50C2 40 14 40 22 48C12 54 2 56 -8 50Z" fill="var(--t-dark)" opacity="0.28"/>
    <path d="M-6 92C4 66 24 56 50 58C36 72 18 86 -6 92Z" fill="var(--t-dark)" opacity="0.3"/>
    <path d="M64 96C50 84 46 66 56 48C64 62 68 80 64 96Z" fill="var(--t-light)" opacity="0.32"/>
    <path d="M26 56C34 50 44 50 50 58C42 64 32 64 26 56Z" fill="var(--t-light)" opacity="0.22"/>
    <circle cx="44" cy="72" r="8" fill="var(--t-dark)" opacity="0.22"/>
    <circle cx="14" cy="80" r="6" fill="var(--t-light)" opacity="0.18"/>
    <path d="M60 92C56 78 56 64 58 50M-6 28C10 20 26 12 42 -2M6 68C10 56 16 46 24 40" fill="none" stroke="var(--t-light)" stroke-width="0.3" opacity="0.6"/>
    <path d="M10 40C20 46 26 56 24 70M34 8C42 14 46 24 44 34" fill="none" stroke="#EFE7D4" stroke-width="0.25" stroke-dasharray="0.6 0.9" opacity="0.4"/>
    <path d="M30 0V90M8.4 54V81M51.6 54V81M0 22L30 43L60 22M0 64L30 43L60 64M8.4 54L30 43L51.6 54M30 0L60 18M30 0L0 18" fill="none" stroke="#EFE7D4" stroke-width="0.22" opacity="0.4"/>
    <path d="M30 41l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5zM8.4 52.6l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4zM51.6 52.6l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4z" fill="#EFE7D4" opacity="0.75"/>
    <rect width="60" height="90" filter="url(#grain)"/>
  </svg>`;
}

// 48 枚の書き起こし（各行 12 枚、| で区切り、+ でマーク 2 つ）
const TILE_TEXT = `
sp|mu+mo|ms+fi|sp+su|fr+fi|dw+dw|lv+mo|vi+fi|ms+mo|lv|dw+dw|fr+fr
sp+sp|ms+ms|br+fi|ms+su|vi+vi|fr+su|mu+mu|sp+sp|lv+fi|vi|br|br+su
br+br|fl+mo|lv+su|vi+su|sp+sp|lv+lv|dw+fi|mu+fi|dw+su|fl+fl|vi+mo|sp+mo
fl+fl|dw+mo|br+br|lv+lv|fl+su|mu+mu|fr+fi|sp+fi|vi+vi|br+mo|mu+su|fr+mo
`.trim().split('\n').map((row) => row.trim().split('|').map((cell) => cell.split('+')));

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let G = null; // ゲーム状態（1 対局分）

function newGame(numPlayers) {
  let id = 0;
  const rows = TILE_TEXT.map((row) => row.map((marks) => ({ id: id++, marks, taken: false, gem: null, token: null })));

  // 恩恵トークン 14 枚（精霊 9・力の源 3・「＋」2）から 8 枚を裏向きで、決まったマスへ V の字に乗せる
  // 各段の左から 2・11、3・10、4・9、5・8 枚目（0 始まりの添字）
  const tokens = shuffle([...CATEGORIES, 'plus', 'plus']).slice(0, 8);
  const spots = [[1, 10], [2, 9], [3, 8], [4, 7]].flatMap((cols, r) => cols.map((c) => rows[r][c]));
  spots.forEach((tile, i) => { tile.token = tokens[i]; });

  const gemsEach = numPlayers <= 2 ? 3 : 2;
  const players = Array.from({ length: numPlayers }, (_, i) => ({
    gemsHand: gemsEach,
    gemsExcluded: 0,
    tokens: {}, // category -> 枚数（'plus' も含む）
    tilesTaken: 0,
    cpu: playMode === 'watch' || (playMode === 'cpu' && i > 0),
  }));

  return {
    numPlayers,
    rows,
    players,
    current: 0,
    firstMove: true,
    phase: 'take', // 'take'（1 枚目）→ 'take2'（続けて同じ精霊）→ 'gem'（原石の操作、任意）
    firstSpecies: null, // take2 のときの対象精霊
    takenCount: 0,
    pendingAction: null, // null | 'place' | 'move-select' | 'move-dest'
    moveFrom: null,
    lastGemTile: null, // 直前に原石を置いた・動かした先のタイル id（演出用）
    lastToken: null, // 直前に取った恩恵トークン（演出用）
    message: '',
    over: false,
  };
}

function rowEnds(row) {
  let l = -1, r = -1;
  for (let i = 0; i < row.length; i++) if (!row[i].taken) { l = i; break; }
  for (let i = row.length - 1; i >= 0; i--) if (!row[i].taken) { r = i; break; }
  return { l, r };
}

function allEnds() {
  // { tile, row, idx } の一覧（行ごとに 1〜2 個）
  const out = [];
  G.rows.forEach((row, r) => {
    const { l, r: rr } = rowEnds(row);
    if (l === -1) return;
    out.push({ tile: row[l], row: r, idx: l });
    if (rr !== l) out.push({ tile: row[rr], row: r, idx: rr });
  });
  return out;
}

// 札の下の数字＝その精霊の記号が 48 枚全体にいくつあるか（風 10 … 苔 5）
const SPECIES_TOTAL = {};
TILE_TEXT.flat(2).forEach((m) => { SPECIES_TOTAL[m] = (SPECIES_TOTAL[m] || 0) + 1; });

function speciesOf(tile) { return tile.marks.find((m) => SPECIES.includes(m)); }
function isPair(tile) { return tile.marks.length === 2 && SPECIES.includes(tile.marks[0]) && tile.marks[0] === tile.marks[1]; }

// 現在のプレイヤーがこのタイルを取れるか。取れなければ理由を返す。
function takeReason(tile) {
  const pl = G.players[G.current];
  if (tile.gem != null && tile.gem !== G.current) {
    if (pl.gemsHand === 0 && !hasBoardGem(G.current)) return '自分の原石が残っていないので、他人の原石があるタイルは取れません';
  }
  if (G.phase === 'take2') {
    if (speciesOf(tile) !== G.firstSpecies || isPair(tile)) return `同じ精霊（${INFO[G.firstSpecies].name}）の 1 体だけのタイルしか続けて取れません`;
  }
  return null;
}

function hasBoardGem(playerIdx) {
  return G.rows.some((row) => row.some((t) => t.gem === playerIdx));
}

function payGemToTake(tile) {
  const pl = G.players[G.current];
  if (tile.gem == null) return;
  if (tile.gem === G.current) {
    pl.gemsHand++; // 自分の原石は手元に戻る
    tile.gem = null;
    return;
  }
  // 他人の原石：自分の原石を 1 個除外して払う
  const owner = G.players[tile.gem];
  owner.gemsHand++; // 相手の原石は相手の手元に戻る
  tile.gem = null;
  if (pl.gemsHand > 0) { pl.gemsHand--; pl.gemsExcluded++; return; }
  for (const row of G.rows) {
    for (const t of row) {
      if (t.gem === G.current) { t.gem = null; pl.gemsExcluded++; return; }
    }
  }
}

function takeTile(tile) {
  const reason = takeReason(tile);
  if (reason) { G.message = reason; render(); return; }
  payGemToTake(tile);
  beep(440);
  tile.taken = true;
  tile.owner = G.current;
  G.players[G.current].tilesTaken++;
  if (tile.token) {
    const key = tile.token;
    const pl = G.players[G.current];
    pl.tokens[key] = (pl.tokens[key] || 0) + 1;
    G.message = `恩恵トークン「${key === 'plus' ? '＋' : INFO[key].name}」を獲得`;
    G.lastToken = key;
    tile.token = null;
  } else {
    G.message = '';
    G.lastToken = null;
  }
  G.takenCount++;

  if (G.phase === 'take' && !isPair(tile) && !G.firstMove) {
    G.phase = 'take2';
    G.firstSpecies = speciesOf(tile);
  } else {
    G.phase = 'gem';
  }
  G.firstMove = false;

  if (allTaken()) { finishGame(); return; }
  render();
}

// 取る動き: 持ち上がって手元（自分の列の見出し）へ飛んでから消える
function animateTakeAndCommit(btnEl, tile) {
  if (reducedMotion() || !btnEl || !btnEl.animate) { takeTile(tile); return; }
  const startRect = btnEl.getBoundingClientRect();
  const destEl = stage.querySelector('.hand.cur');
  const destRect = destEl ? destEl.getBoundingClientRect() : { left: startRect.left, top: startRect.top - 80, width: startRect.width, height: startRect.height };
  const dx = (destRect.left + destRect.width / 2) - (startRect.left + startRect.width / 2);
  const dy = (destRect.top + destRect.height / 2) - (startRect.top + startRect.height / 2);
  const ghost = btnEl.cloneNode(true);
  Object.assign(ghost.style, {
    position: 'fixed', left: startRect.left + 'px', top: startRect.top + 'px',
    width: startRect.width + 'px', height: startRect.height + 'px', margin: '0', zIndex: '50', pointerEvents: 'none',
  });
  document.body.appendChild(ghost);
  btnEl.style.visibility = 'hidden';
  const anim = ghost.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: 'translate(0,-16px) scale(1.08)', opacity: 1, offset: 0.3 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0.15 },
  ], { duration: 300, easing: 'ease-in' });
  anim.onfinish = () => { ghost.remove(); takeTile(tile); };
}

function allTaken() { return G.rows.every((row) => row.every((t) => t.taken)); }

function skipTake() { G.phase = 'gem'; G.message = ''; render(); }

function usePlus() {
  const pl = G.players[G.current];
  if (!pl.tokens.plus) return;
  if (pl.gemsExcluded <= 0) { G.message = '除外した原石がありません'; render(); return; }
  pl.tokens.plus--;
  pl.gemsExcluded--;
  pl.gemsHand++;
  render();
}

function startPlace() {
  const pl = G.players[G.current];
  if (pl.gemsHand <= 0) return;
  G.pendingAction = G.pendingAction === 'place' ? null : 'place';
  render();
}
function startMove() {
  G.pendingAction = G.pendingAction === 'move-select' ? null : 'move-select';
  G.moveFrom = null;
  render();
}

function clickBoardTile(tile, btnEl) {
  if (G.phase === 'take' || G.phase === 'take2') {
    const ends = allEnds();
    const end = ends.find((e) => e.tile.id === tile.id);
    if (!end) { G.message = '端のタイルしか取れません'; render(); return; }
    const reason = takeReason(tile);
    if (reason) { G.message = reason; render(); return; }
    animateTakeAndCommit(btnEl, tile);
    return;
  }
  if (G.pendingAction === 'place') {
    if (tile.taken || tile.gem != null) { G.message = '原石のないタイルに置いてください'; render(); return; }
    G.players[G.current].gemsHand--;
    tile.gem = G.current;
    G.pendingAction = null;
    G.gemActionDone = true;
    G.lastGemTile = tile.id;
    beep(520);
    render();
    return;
  }
  if (G.pendingAction === 'move-select') {
    if (tile.gem !== G.current) { G.message = '自分の原石を選んでください'; render(); return; }
    G.moveFrom = tile;
    G.pendingAction = 'move-dest';
    render();
    return;
  }
  if (G.pendingAction === 'move-dest') {
    if (tile.taken || tile.gem != null) { G.message = '空いているタイルへ動かしてください'; render(); return; }
    G.moveFrom.gem = null;
    tile.gem = G.current;
    G.pendingAction = null;
    G.moveFrom = null;
    G.gemActionDone = true;
    G.lastGemTile = tile.id;
    beep(520);
    render();
  }
}

function endTurn() {
  beep(260);
  G.phase = 'take';
  G.firstSpecies = null;
  G.pendingAction = null;
  G.moveFrom = null;
  G.message = '';
  G.lastToken = null;
  G.gemActionDone = false;
  G.current = (G.current + 1) % G.numPlayers;
  render();
}

function finishGame() {
  G.over = true;
  G.score = computeScore();
  render();
}

function computeScore() {
  // 集計のため、各タイルに「誰が取ったか」を記録していなかったので、取得時に owner を持たせる。
  const totals = G.players.map(() => ({}));
  CATEGORIES.forEach((c) => G.players.forEach((_, p) => { totals[p][c] = 0; }));
  G.rows.forEach((row) => row.forEach((tile) => {
    if (tile.owner == null) return;
    tile.marks.forEach((m) => { totals[tile.owner][m]++; });
  }));
  G.players.forEach((pl, p) => CATEGORIES.forEach((c) => { totals[p][c] += (pl.tokens[c] || 0); }));

  const perCat = {};
  const scores = G.players.map(() => 0);
  CATEGORIES.forEach((c) => {
    const tileOnly = G.players.map((_, p) => totals[p][c] - (G.players[p].tokens[c] || 0));
    const penalized = G.players.map((_, p) => p).filter((p) => tileOnly[p] === 0);
    penalized.forEach((p) => { scores[p] -= 3; });
    const max = Math.max(...G.players.map((_, p) => totals[p][c]));
    const winners = G.players.map((_, p) => p).filter((p) => totals[p][c] === max && max > 0);
    winners.forEach((p) => { scores[p] += max; });
    perCat[c] = { max, winners, penalized };
  });
  return { totals, scores, perCat };
}

// 恩恵トークンは持ち主にしか見せない（裏向きで持つ）。観戦なら全員、CPU 戦なら P1 に見せる。
// みんなで遊ぶときは画面をみんなで見ているので、誰のも出さない（手番の人が自分の分を長押ししたときだけ見える）
function canSeeTokens(p) {
  if (playMode === 'watch') return true;
  if (playMode === 'cpu') return p === 0;
  return false;
}
function canPeekTokens(p) { return playMode === 'human' && p === G.current; }
// 画面に出す数と多数派（ほかの人のトークンは数えない。見えない分で多数派がばれないように）
function shownLeaders(c) {
  const counts = G.players.map((_, p) => G.rows.reduce((n, row) => n + row.reduce((k, t) => k + (t.taken && t.owner === p ? t.marks.filter((m) => m === c).length : 0), 0), 0) + (canSeeTokens(p) ? (G.players[p].tokens[c] || 0) : 0));
  const max = Math.max(...counts);
  const leaders = max > 0 ? counts.map((v, p) => (v === max ? p : -1)).filter((p) => p >= 0) : [];
  return { counts, leaders };
}

function dotsHtml(players) {
  return players.map((p) => `<span class="dot" style="background:${PLAYER_COLORS[p]}"></span>`).join('');
}

// ---- 描画 ----
const stage = document.getElementById('stage');

function tileBadgesHtml(tile) {
  const single = tile.marks.length === 1 ? ' single' : '';
  return `<span class="tile__badges${single}">${tile.marks.map((m) => `<span class="tile__badge">${coinInnerSvg(m)}</span>`).join('')}</span>`;
}
// coinHtml は <span class="coin"> で包むが、札の紋章は .tile__badge が同じ役目を持つので中身の svg だけ使う
function coinInnerSvg(key) {
  // '＋' は生き物の紋章ではなく、原石を 1 個取り戻せるおまけの印
  const inner = key === 'plus'
    ? `<path d="M11.1 8h1.8v3.1h3.1v1.8h-3.1v3.1h-1.8v-3.1H8v-1.8h3.1z" fill="#5C5045"/>`
    : `<g transform="translate(3.6 3.6) scale(0.7)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${embPathsHtml(key)}</g>`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10.8" fill="none" stroke="#5C5045" stroke-width="0.5" opacity="0.75"/>
    ${inner}
    <rect width="24" height="24" filter="url(#grain)"/>
  </svg>`;
}

function render() {
  if (!G) { renderSetup(); return; }
  if (G.over) { renderResult(); return; }

  const pl = G.players[G.current];
  const ends = allEnds();
  const endIds = new Set(ends.map((e) => e.tile.id));
  const canTake = G.phase === 'take' || G.phase === 'take2';

  const rowsHtml = G.rows.map((row) => `
    <div class="forest-row">
      ${row.map((t) => {
        // 取られた札は空きマスとして残し、ほかの札が詰めて動かないようにする
        if (t.taken) return '<span class="tile tile--gone" aria-hidden="true"></span>';
        const clickable = canTake && endIds.has(t.id);
        const selectable = G.pendingAction === 'move-select' && t.gem === G.current;
        const placeable = G.pendingAction === 'place' && t.gem == null;
        const destable = G.pendingAction === 'move-dest' && t.gem == null;
        const active = clickable || selectable || placeable || destable;
        const sp = speciesOf(t);
        const { base, dark, light } = INFO[sp];
        const tileStyle = `background:${base};--t-dark:${dark};--t-light:${light}`;
        return `<button class="tile ${active ? 'active' : 'dim'}" style="${tileStyle}" data-id="${t.id}" ${active ? '' : 'disabled'}>
          <span class="tile__bg">${tilePatternSvg()}</span>
          ${tileBadgesHtml(t)}
          <span class="tile__num">${SPECIES_TOTAL[sp]}</span>
          ${t.gem != null ? `<span class="tile__gem ${t.id === G.lastGemTile ? 'tile__gem--new' : ''}">${gemSvg(PLAYER_COLORS[t.gem], 18)}</span>` : ''}
          ${t.token ? tokenBackHtml() : ''}
        </button>`;
      }).join('')}
    </div>`).join('');
  G.lastGemTile = null; // 演出は 1 回の描画だけでよい

  // 各プレイヤーの、マークごとの数（札に描かれたマーク＋恩恵トークン）。多数派は金の下線
  const header = `
    <div class="hands">
      ${G.players.map((pl2, p) => {
        const tokens = Object.entries(pl2.tokens).filter(([, n]) => n > 0);
        return `<section class="hand ${p === G.current ? 'cur' : ''}">
          <h3 class="hand__name" style="color:${PLAYER_COLORS[p]}">${gemSvg(PLAYER_COLORS[p], 14)}P${p + 1}<span class="hand__gems">原石 ${pl2.gemsHand}</span></h3>
          <div class="hand__counts">${CATEGORIES.map((c) => {
            const { counts, leaders } = shownLeaders(c);
            const cls = counts[p] === 0 ? ' zero' : leaders.includes(p) ? ' lead' : '';
            return `<span class="hand__count${cls}" title="${INFO[c].name}">${coinHtml(c, 16)}<b>${counts[p]}</b></span>`;
          }).join('')}</div>
          ${!tokens.length ? '' : canSeeTokens(p)
            ? `<div class="hand__tokens">${tokens.map(([k, n]) => `<span class="hand__token">${coinHtml(k, 22)}${n > 1 ? `×${n}` : ''}</span>`).join('')}</div>`
            : canPeekTokens(p)
              ? `<div class="hand__tokens"><button class="hand__token hand__token--back hand__peek" type="button" aria-label="長押しで自分の恩恵トークンを見る">${tokenBackHtml()}×${tokens.reduce((n, [, v]) => n + v, 0)}<span class="hand__peek-hint">長押しで見る</span>
                  <span class="hand__peek-faces">${tokens.map(([k, n]) => `<span class="hand__token">${coinHtml(k, 26)}${n > 1 ? `×${n}` : ''}</span>`).join('')}</span></button></div>`
              : `<div class="hand__tokens"><span class="hand__token hand__token--back">${tokenBackHtml()}×${tokens.reduce((n, [, v]) => n + v, 0)}</span></div>`}
        </section>`;
      }).join('')}
    </div>`;

  // ボタンはいつも同じ並びで出し、使えないときは押せなくするだけ（出たり消えたりして画面が動かないように）
  const hasAny = canTake && ends.some((e) => !takeReason(e.tile));
  const gemPhase = G.phase === 'gem';
  const hint = G.pendingAction === 'place' ? '原石を置く札をタップ'
    : G.pendingAction === 'move-select' ? '動かす自分の原石をタップ'
    : G.pendingAction === 'move-dest' ? '動かし先の札をタップ'
    : gemPhase ? '原石を置く・動かす（任意）、終わったら手番終了'
    : !hasAny ? '取れる札がありません。「取らずに進む」'
    : G.phase === 'take2' ? '続けて同じ精霊の 1 体の札を取る、または「取らずに進む」'
    : '端の札を 1 枚タップ';
  const dis = (ok) => (ok ? '' : 'disabled');
  const actions = `
      <p class="hint">${hint}</p>
      <div class="row-actions">
        <button class="pill" id="btn-stop" ${dis(G.phase === 'take2' || (canTake && !hasAny))}>取らずに進む</button>
        <button class="pill ${G.pendingAction === 'place' ? 'pill--on' : ''}" id="btn-place" ${dis(gemPhase && pl.gemsHand > 0 && !G.gemActionDone)}>原石を置く</button>
        <button class="pill ${G.pendingAction && G.pendingAction !== 'place' ? 'pill--on' : ''}" id="btn-move" ${dis(gemPhase && pl.gemsHand === 0 && hasBoardGem(G.current) && !G.gemActionDone)}>原石を動かす</button>
        <button class="pill" id="btn-plus" ${dis(gemPhase && pl.tokens.plus && pl.gemsExcluded > 0)}>＋を使う</button>
        <button class="pill pill--main" id="btn-end" ${dis(gemPhase)}>手番終了</button>
      </div>`;

  stage.innerHTML = `
    <div class="game ${pl.cpu ? 'cpu-turn' : ''}">
      <div class="game__main">
      <div class="turn-row">
        <button class="pill back-btn" id="btn-back" aria-label="最初の画面に戻る">戻る</button>
        <p class="turn" style="color:${PLAYER_COLORS[G.current]}">${gemSvg(PLAYER_COLORS[G.current], 18)}P${G.current + 1}${pl.cpu ? '（CPU）' : ''} の番</p>
      </div>
      <div class="forest">${rowsHtml}</div>
      ${actions}
      <p class="msg">${G.lastToken && !canSeeTokens(G.current) ? '恩恵トークンを 1 枚獲得' : `${G.lastToken ? tokenDiscHtml(G.lastToken) : ''}${G.message || ''}`}</p>
      ${G.players.some((x) => x.cpu) ? speedPillsHtml() : ''}
      </div>
      <aside class="game__side" aria-label="持っている札">${header}</aside>
    </div>`;

  stage.querySelectorAll('.tile[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tile = G.rows.flat().find((t) => t.id === Number(btn.dataset.id));
      clickBoardTile(tile, btn);
    });
  });
  const by = (id) => stage.querySelector('#' + id);
  by('btn-stop')?.addEventListener('click', skipTake);
  by('btn-place')?.addEventListener('click', startPlace);
  by('btn-move')?.addEventListener('click', startMove);
  by('btn-plus')?.addEventListener('click', usePlus);
  by('btn-end')?.addEventListener('click', endTurn);
  by('btn-back')?.addEventListener('click', () => goSetup(true));
  bindSpeedPills(render);
  // 押している間だけ表を見せる
  stage.querySelectorAll('.hand__peek').forEach((el) => {
    const on = (e) => { e.preventDefault(); el.classList.add('peeking'); };
    const off = () => el.classList.remove('peeking');
    el.addEventListener('pointerdown', on);
    ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach((ev) => el.addEventListener(ev, off));
    el.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') on(e); });
    el.addEventListener('keyup', off);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  });
  clearTimeout(cpuTimer);
  if (pl.cpu) cpuTimer = setTimeout(cpuStep, CPU_SPEEDS[cpuSpeed].ms);
}

// ---- テスト用 CPU（雑: 取れる端の札から適当に選び、原石はたまに置く） ----
const CPU_SPEEDS = {
  slow: { label: 'ゆっくり', ms: 1200 },
  normal: { label: 'ふつう', ms: 600 },
  fast: { label: '速い', ms: 150 },
  instant: { label: '一瞬', ms: 0 },
};
// 遊び方: みんなで遊ぶ / P2 から先を CPU / 全員 CPU で観戦
const PLAY_MODES = { human: 'みんなで遊ぶ', cpu: 'P2 から先を CPU', watch: '観戦（全員 CPU）' };
let playMode = 'human';
let cpuSpeed = 'normal';
try { cpuSpeed = localStorage.getItem(STORE + 'cpuSpeed') || 'normal'; } catch { /* 読めなくてもよい */ }
if (!CPU_SPEEDS[cpuSpeed]) cpuSpeed = 'normal';
let cpuTimer = null;
function speedPillsHtml() {
  return `<div class="setup__speed" role="group" aria-label="CPU の速さ">
    ${Object.entries(CPU_SPEEDS).map(([k, v]) => `<button class="pill ${k === cpuSpeed ? 'pill--on' : ''}" data-speed="${k}" aria-pressed="${k === cpuSpeed}">${v.label}</button>`).join('')}
  </div>`;
}
function bindSpeedPills(redraw) {
  stage.querySelectorAll('[data-speed]').forEach((btn) => {
    btn.addEventListener('click', () => {
      cpuSpeed = btn.dataset.speed;
      try { localStorage.setItem(STORE + 'cpuSpeed', cpuSpeed); } catch { /* 保存できなくてもよい */ }
      redraw();
    });
  });
}
const pickRandom = (a) => a[Math.floor(Math.random() * a.length)];

function cpuStep() {
  cpuTimer = null;
  if (!G || G.over || !G.players[G.current].cpu) return;
  const pl = G.players[G.current];
  if (G.phase === 'take' || G.phase === 'take2') {
    const ok = allEnds().filter((e) => !takeReason(e.tile));
    if (G.phase === 'take2' && (ok.length === 0 || Math.random() < 0.4)) { G.phase = 'gem'; render(); return; }
    if (ok.length === 0) { skipTake(); return; }
    // 自分が多く持っている精霊を少しだけ優先する
    const have = (t) => G.rows.flat().filter((x) => x.owner === G.current && speciesOf(x) === speciesOf(t)).length;
    const best = Math.max(...ok.map((e) => have(e.tile)));
    const pool = Math.random() < 0.6 ? ok.filter((e) => have(e.tile) === best) : ok;
    takeTile(pickRandom(pool).tile);
    return;
  }
  if (pl.gemsHand > 0 && !G.gemActionDone && Math.random() < 0.3) {
    const free = G.rows.flat().filter((t) => !t.taken && t.gem == null);
    if (free.length) {
      const tile = pickRandom(free);
      pl.gemsHand--;
      tile.gem = G.current;
      G.gemActionDone = true;
      G.lastGemTile = tile.id;
      render();
      return;
    }
  }
  endTurn();
}

// スタート画面に戻る。対局の途中なら確認する
function goSetup(confirmFirst) {
  if (confirmFirst && !confirm('ゲームをやめて最初の画面に戻りますか？')) return;
  clearTimeout(cpuTimer);
  G = null;
  render();
}

function renderSetup() {
  const decoCoins = ['sp', 'dw', 'su', 'lv'];
  stage.innerHTML = `
    <div class="setup">
      <p class="setup__kicker">SPIRITS OF THE FOREST</p>
      <h2 class="setup__title">精霊たちの森</h2>
      <div class="setup__coins">${decoCoins.map((k) => coinHtml(k, 44)).join('')}</div>
      <p>Spirits of the Forest を遊べる最小版。1 台を回して遊びます。</p>
      <div class="setup__speed" role="group" aria-label="遊び方">
        ${Object.entries(PLAY_MODES).map(([k, v]) => `<button class="pill ${k === playMode ? 'pill--on' : ''}" data-mode="${k}" aria-pressed="${k === playMode}">${v}</button>`).join('')}
      </div>
      <p class="setup__label">CPU の速さ</p>
      ${speedPillsHtml()}
      <p>人数を選んでください</p>
      <div class="row-actions">
        ${[2, 3, 4].map((n) => `<button class="pill pill--main" data-n="${n}">${n} 人</button>`).join('')}
      </div>
    </div>`;
  stage.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => { playMode = btn.dataset.mode; renderSetup(); });
  });
  bindSpeedPills(renderSetup);
  stage.querySelectorAll('[data-n]').forEach((btn) => {
    btn.addEventListener('click', () => { G = newGame(Number(btn.dataset.n)); render(); });
  });
}

function renderResult() {
  const { scores, perCat } = G.score;
  const best = Math.max(...scores);
  let winners = G.players.map((_, p) => p).filter((p) => scores[p] === best);
  if (winners.length > 1) {
    const minTiles = Math.min(...winners.map((p) => G.players[p].tilesTaken));
    const fewer = winners.filter((p) => G.players[p].tilesTaken === minTiles);
    winners = fewer;
  }
  const rows = CATEGORIES.map((c, i) => {
    const iconColor = SPECIES.includes(c) ? `var(--${c}-dark)` : POWER_ICON_COLOR;
    return `<tr class="score-row" style="animation-delay:${i * 160}ms"><td class="cat">${svgIcon(c, iconColor, 16)}<span>${INFO[c].name}</span></td>${G.players.map((_, p) => `<td>${(perCat[c].winners.includes(p) ? perCat[c].max : 0) - (perCat[c].penalized.includes(p) ? 3 : 0)}</td>`).join('')}<td class="lead-col">${dotsHtml(perCat[c].winners)}</td></tr>`;
  }).join('');
  stage.innerHTML = `
    <div class="result">
      <h2>終了</h2>
      <table class="board">
        <thead><tr><th></th>${G.players.map((_, p) => `<th style="color:${PLAYER_COLORS[p]}">${gemSvg(PLAYER_COLORS[p], 14)}P${p + 1}</th>`).join('')}<th class="lead-col">多数派</th></tr></thead>
        <tbody>
          ${rows}
          <tr class="total"><td>合計</td>${scores.map((s) => `<td>${s}</td>`).join('')}<td></td></tr>
        </tbody>
      </table>
      <p class="hint">${winners.length > 1 ? '引き分け: ' : '勝ち: '}${winners.map((p) => 'P' + (p + 1)).join('・')}</p>
      <div class="row-actions">
        <button class="pill pill--main" id="btn-again">もう一度</button>
        <button class="pill" id="btn-result-back">最初の画面に戻る</button>
      </div>
    </div>`;
  stage.querySelector('#btn-again').addEventListener('click', () => { G = null; render(); });
  stage.querySelector('#btn-result-back').addEventListener('click', () => goSetup(false));
}

document.getElementById('btn-rules').addEventListener('click', () => document.getElementById('rules').showModal());

render();
