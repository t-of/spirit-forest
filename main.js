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
const INFO = {
  sp: { name: '風', base: '#5E3F8F', dark: '#3F2766', light: '#8466B5', count: 10 },
  br: { name: '根', base: '#8C4C99', dark: '#5F2E6B', light: '#B07ABD', count: 8 },
  lv: { name: '葉', base: '#9DA383', dark: '#6C7258', light: '#C3C8AA', count: 8 },
  vi: { name: '岩', base: '#6F6F6B', dark: '#4B4B48', light: '#959590', count: 8 },
  dw: { name: '水', base: '#2C7C86', dark: '#1A5560', light: '#4FA5AD', count: 7 },
  mu: { name: '茸', base: '#C2433C', dark: '#8E2A27', light: '#DE716A', count: 7 },
  fr: { name: '木の実', base: '#7B5B40', dark: '#553C28', light: '#A1805F', count: 6 },
  fl: { name: '花', base: '#E2A82E', dark: '#C0661F', light: '#F2C85A', count: 6 },
  ms: { name: '苔', base: '#557F2F', dark: '#34541C', light: '#86A84A', count: 5 },
  fi: { name: '火' },
  mo: { name: '月' },
  su: { name: '太陽' },
};
const CATEGORIES = [...SPECIES, ...POWERS];
const POWER_ICON_COLOR = '#F7F5EE';

// INFO の色を CSS 変数に流す（style.css が参照する --sp-base / --sp-dark / --sp-light など）
SPECIES.forEach((k) => {
  document.documentElement.style.setProperty(`--${k}-base`, INFO[k].base);
  document.documentElement.style.setProperty(`--${k}-dark`, INFO[k].dark);
  document.documentElement.style.setProperty(`--${k}-light`, INFO[k].light);
});

const PLAYER_COLORS = ['#35C9D3', '#C3D62B', '#F0507A', '#9B6BFF'];

// ---- 記号（影絵）。1 か所に定義し、色とサイズだけ変えて使い回す ----
const SYMBOLS = {
  sp: '<path d="M12 4a6.5 6.5 0 1 1-6.2 8.3" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><path d="M9.3 10.2a2.4 2.4 0 1 0 2.4-2.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  br: '<path d="M12 21V9M12 13l-5-4M12 11l5-5M12 15.5l4-3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  lv: '<path d="M12 3c5 2 7 7 5 12-5 2-10 0-12-5C7 7 9 4 12 3z" fill="currentColor"/><path d="M12 5v14" stroke="currentColor" stroke-opacity="0.35" stroke-width="1.3" fill="none"/>',
  vi: '<polygon points="12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5" fill="currentColor"/>',
  dw: '<path d="M12 3c3.2 4.2 6 8.2 6 11.2a6 6 0 1 1-12 0C6 11.2 8.8 7.2 12 3z" fill="currentColor"/>',
  mu: '<path d="M4 13a8 8 0 0 1 16 0z" fill="currentColor"/><rect x="10.3" y="13" width="3.4" height="5.5" rx="1.2" fill="currentColor"/>',
  fr: '<path d="M8 10.2a4 4 0 0 1 8 0c0 1-.3 1.8-.8 2.6-.5.8-.8 2.6-1.7 3.8-.9 1.1-2.1 1.1-3 0-.9-1.2-1.2-3-1.7-3.8-.5-.8-.8-1.6-.8-2.6z" fill="currentColor"/><path d="M6.3 9.4c1.2-1.8 3.2-2.7 5.7-2.7s4.5.9 5.7 2.7c-2-.5-3.9-.8-5.7-.8s-3.7.3-5.7.8z" fill="currentColor"/>',
  fl: Array.from({ length: 5 }).map((_, i) => `<ellipse cx="12" cy="6.6" rx="2.5" ry="4" fill="currentColor" transform="rotate(${i * 72} 12 12)"/>`).join('') + '<circle cx="12" cy="12" r="2" fill="currentColor"/>',
  ms: '<circle cx="8.2" cy="15" r="3" fill="currentColor"/><circle cx="14.4" cy="15.8" r="2.5" fill="currentColor"/><circle cx="11.2" cy="10.2" r="2.7" fill="currentColor"/>',
  su: '<circle cx="12" cy="12" r="4" fill="currentColor"/>' + Array.from({ length: 8 }).map((_, i) => `<line x1="12" y1="2.2" x2="12" y2="5.6" stroke="currentColor" stroke-width="2" stroke-linecap="round" transform="rotate(${i * 45} 12 12)"/>`).join(''),
  mo: '<path fill-rule="evenodd" clip-rule="evenodd" d="M12 3a9 9 0 1 0 0 18c-3.2-1.6-5.3-5.2-5.3-9S8.8 4.6 12 3z" fill="currentColor"/>',
  fi: '<path d="M12 2c1.1 3-1 4.2-1 6.3 1-.5 2-1.6 2-3.2 2.1 2.1 3.4 5 3.4 8a6.4 6.4 0 1 1-12.8 0c0-2 .9-4 2.4-5.6-.2 1 .3 2 1 2C7.4 7.2 9.7 4.1 12 2z" fill="currentColor"/>',
  plus: '<path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z" fill="currentColor"/>',
};
function svgIcon(key, color, size = 20) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="color:${color}" aria-hidden="true">${SYMBOLS[key]}</svg>`;
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
function tokenDiscHtml(key, size = 22) {
  const color = SPECIES.includes(key) ? `var(--${key}-dark)` : '#5a5a55';
  return `<span class="token-disc" style="width:${size}px;height:${size}px">${svgIcon(key, color, Math.round(size * 0.62))}</span>`;
}
// 地紋: 角ばった葉を重ねた 1 つの形を、その精霊の 3 色だけで塗り分けて使い回す
function tilePatternSvg(sp, tileId) {
  const { base, dark, light } = INFO[sp];
  const pid = `pat${tileId}`;
  return `<svg class="tile__pattern-svg" viewBox="0 0 90 120" preserveAspectRatio="none" aria-hidden="true">
    <defs><pattern id="${pid}" width="30" height="34" patternUnits="userSpaceOnUse" patternTransform="rotate(12)">
      <rect width="30" height="34" fill="${base}"/>
      <polygon points="15,3 26,17 15,31 4,17" fill="${dark}" opacity="0.55"/>
      <polygon points="15,11 21,17 15,24 9,17" fill="${light}" opacity="0.55"/>
    </pattern></defs>
    <rect width="90" height="120" fill="url(#${pid})"/>
    ${sp === 'fl' ? `<path d="M8 104 C 28 86, 18 54, 44 44 S 68 22, 82 8" fill="none" stroke="${dark}" stroke-width="2.2" opacity="0.55"/>` : ''}
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
  const allTiles = rows.flat();

  // 恩恵トークン 14 枚（精霊 9・力の源 3・「＋」2）から 8 枚を、ランダムなタイルへ裏向きで乗せる
  const tokens = shuffle([...CATEGORIES, 'plus', 'plus']).slice(0, 8);
  const spots = shuffle(allTiles).slice(0, 8);
  spots.forEach((tile, i) => { tile.token = tokens[i]; });

  const gemsEach = numPlayers <= 2 ? 3 : 2;
  const players = Array.from({ length: numPlayers }, () => ({
    gemsHand: gemsEach,
    gemsExcluded: 0,
    tokens: {}, // category -> 枚数（'plus' も含む）
    tilesTaken: 0,
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
  const destEl = stage.querySelector('.board th.cur');
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

// 現在の形勢（タイル + トークン）で、各精霊・力の源の多数派を取っているプレイヤー
function currentLeaders(c) {
  const counts = G.players.map((_, p) => G.rows.reduce((n, row) => n + row.filter((t) => t.taken && t.owner === p && t.marks.includes(c)).length, 0) + (G.players[p].tokens[c] || 0));
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
  const sp = speciesOf(tile);
  const dark = `var(--${sp}-dark)`;
  return `<span class="tile__badges">${tile.marks.map((m) => `<span class="tile__badge">${svgIcon(m, dark, 15)}</span>`).join('')}</span>`;
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
      ${row.filter((t) => !t.taken).map((t) => {
        const clickable = canTake && endIds.has(t.id);
        const selectable = G.pendingAction === 'move-select' && t.gem === G.current;
        const placeable = G.pendingAction === 'place' && t.gem == null;
        const destable = G.pendingAction === 'move-dest' && t.gem == null;
        const active = clickable || selectable || placeable || destable;
        const sp = speciesOf(t);
        return `<button class="tile ${active ? 'active' : 'dim'}" data-id="${t.id}" ${active ? '' : 'disabled'}>
          <span class="tile__bg">${tilePatternSvg(sp, t.id)}</span>
          ${tileBadgesHtml(t)}
          <span class="tile__num">${SPECIES_TOTAL[sp]}</span>
          ${t.gem != null ? `<span class="tile__gem ${t.id === G.lastGemTile ? 'tile__gem--new' : ''}">${gemSvg(PLAYER_COLORS[t.gem], 18)}</span>` : ''}
          ${t.token ? '<span class="tile__token">?</span>' : ''}
        </button>`;
      }).join('')}
    </div>`).join('');
  G.lastGemTile = null; // 演出は 1 回の描画だけでよい

  const header = `
    <table class="board">
      <thead><tr><th></th>${G.players.map((_, p) => `<th class="${p === G.current ? 'cur' : ''}" style="color:${PLAYER_COLORS[p]}">${gemSvg(PLAYER_COLORS[p], 14)}P${p + 1}</th>`).join('')}<th class="lead-col">多数派</th></tr></thead>
      <tbody>
        ${CATEGORIES.map((c) => {
          const { counts, leaders } = currentLeaders(c);
          const iconColor = SPECIES.includes(c) ? `var(--${c}-dark)` : POWER_ICON_COLOR;
          return `<tr><td class="cat">${svgIcon(c, iconColor, 16)}<span>${INFO[c].name}</span></td>${G.players.map((_, p) => `<td>${counts[p]}</td>`).join('')}<td class="lead-col">${dotsHtml(leaders)}</td></tr>`;
        }).join('')}
        <tr><td class="cat">原石</td>${G.players.map((pl2) => `<td>${pl2.gemsHand}</td>`).join('')}<td></td></tr>
        <tr><td class="cat">${svgIcon('plus', POWER_ICON_COLOR, 16)}<span>＋</span></td>${G.players.map((pl2) => `<td>${pl2.tokens.plus || 0}</td>`).join('')}<td></td></tr>
      </tbody>
    </table>`;

  let actions = '';
  if (canTake) {
    const hasAny = ends.some((e) => !takeReason(e.tile));
    actions = hasAny
      ? `<p class="hint">${G.phase === 'take2' ? '続けて同じ精霊の 1 体タイルを取る、または「ここまで」' : '端のタイルを 1 枚タップ'}</p>
         ${G.phase === 'take2' ? '<button class="pill" id="btn-stop">ここまで</button>' : ''}`
      : `<p class="hint">取れるタイルがありません</p><button class="pill" id="btn-skip">スキップ</button>`;
  } else {
    actions = `
      <p class="hint">原石を置く・動かす（任意）、終わったら手番終了</p>
      <div class="row-actions">
        <button class="pill" id="btn-place" ${pl.gemsHand > 0 && !G.gemActionDone ? '' : 'disabled'}>${G.pendingAction === 'place' ? '置く場所をタップ' : '原石を置く'}</button>
        <button class="pill" id="btn-move" ${pl.gemsHand === 0 && hasBoardGem(G.current) && !G.gemActionDone ? '' : 'disabled'}>${G.pendingAction && G.pendingAction !== 'place' ? '原石を選択中…' : '原石を動かす'}</button>
        <button class="pill" id="btn-plus" ${pl.tokens.plus && pl.gemsExcluded > 0 ? '' : 'disabled'}>＋を使う</button>
      </div>
      <button class="pill pill--main" id="btn-end">手番終了</button>`;
  }

  stage.innerHTML = `
    <div class="game">
      <p class="turn" style="color:${PLAYER_COLORS[G.current]}">${gemSvg(PLAYER_COLORS[G.current], 18)}P${G.current + 1} の番</p>
      <div class="forest">${rowsHtml}</div>
      ${actions}
      ${G.message ? `<p class="msg">${G.lastToken ? tokenDiscHtml(G.lastToken) : ''}${G.message}</p>` : ''}
      ${header}
    </div>`;

  stage.querySelectorAll('.tile[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tile = G.rows.flat().find((t) => t.id === Number(btn.dataset.id));
      clickBoardTile(tile, btn);
    });
  });
  const by = (id) => stage.querySelector('#' + id);
  by('btn-stop')?.addEventListener('click', () => { G.phase = 'gem'; render(); });
  by('btn-skip')?.addEventListener('click', skipTake);
  by('btn-place')?.addEventListener('click', startPlace);
  by('btn-move')?.addEventListener('click', startMove);
  by('btn-plus')?.addEventListener('click', usePlus);
  by('btn-end')?.addEventListener('click', endTurn);
}

function renderSetup() {
  stage.innerHTML = `
    <div class="setup">
      <h2>精霊たちの森</h2>
      <p>Spirits of the Forest を遊べる最小版。1 台を回して遊びます。</p>
      <p>人数を選んでください</p>
      <div class="row-actions">
        ${[2, 3, 4].map((n) => `<button class="pill pill--main" data-n="${n}">${n} 人</button>`).join('')}
      </div>
    </div>`;
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
      <button class="pill pill--main" id="btn-again">もう一度</button>
    </div>`;
  stage.querySelector('#btn-again').addEventListener('click', () => { G = null; render(); });
}

render();
