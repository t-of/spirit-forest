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

// ---- ここからアプリ本体 ----

// 精霊 9 種・力の源 3 種
const SPECIES = ['sp', 'br', 'lv', 'vi', 'dw', 'mu', 'fr', 'fl', 'ms'];
const POWERS = ['fi', 'mo', 'su'];
const INFO = {
  sp: { label: '蜘', name: '蜘蛛', color: '#5b5b7a' },
  br: { label: '枝', name: '枝', color: '#8a5a33' },
  lv: { label: '葉', name: '葉', color: '#4c9a4c' },
  vi: { label: '蔓', name: 'つる', color: '#6fae3e' },
  dw: { label: '滴', name: 'しずく', color: '#3a8fb7' },
  mu: { label: '茸', name: 'きのこ', color: '#b5533c' },
  fr: { label: '実', name: '果実', color: '#c0392b' },
  fl: { label: '花', name: '花', color: '#c77bb0' },
  ms: { label: '苔', name: '苔', color: '#5a7a4a' },
  fi: { label: '炎', name: '炎', color: '#e67e22' },
  mo: { label: '月', name: '月', color: '#d8d8e8' },
  su: { label: '陽', name: '太陽', color: '#f1c40f' },
};
const CATEGORIES = [...SPECIES, ...POWERS];

// 48 枚の書き起こし（各行 12 枚、| で区切り、+ でマーク 2 つ）
const TILE_TEXT = `
sp|mu+mo|ms+fi|sp+su|fr+fi|dw+dw|lv+mo|vi+fi|ms+mo|lv|dw+dw|fr+fr
sp+sp|ms+ms|br+fi|ms+su|vi+vi|fr+su|mu+mu|sp+sp|lv+fi|vi|br|br+su
br+br|fl+mo|lv+su|vi+su|sp+sp|lv+lv|dw+fi|mu+fi|dw+su|fl+fl|vi+mo|sp+mo
fl+fl|dw+mo|br+br|lv+lv|fl+su|mu+mu|fr+fi|sp+fi|vi+vi|br+mo|mu+su|fr+mo
`.trim().split('\n').map((row) => row.trim().split('|').map((cell) => cell.split('+')));

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f'];

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
    const pl = G.players[G.current];
    pl.tokens[tile.token] = (pl.tokens[tile.token] || 0) + 1;
    G.message = `恩恵トークン「${tile.token === 'plus' ? '＋' : INFO[tile.token].name}」を獲得`;
    tile.token = null;
  } else {
    G.message = '';
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

function clickBoardTile(tile) {
  if (G.phase === 'take' || G.phase === 'take2') {
    const ends = allEnds();
    const end = ends.find((e) => e.tile.id === tile.id);
    if (!end) { G.message = '端のタイルしか取れません'; render(); return; }
    takeTile(tile);
    return;
  }
  if (G.pendingAction === 'place') {
    if (tile.taken || tile.gem != null) { G.message = '原石のないタイルに置いてください'; render(); return; }
    G.players[G.current].gemsHand--;
    tile.gem = G.current;
    G.pendingAction = null;
    G.gemActionDone = true;
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
    const totalTileMarks = tileOnly.reduce((a, b) => a + b, 0);
    if (totalTileMarks === 0) {
      G.players.forEach((_, p) => { scores[p] -= 3; });
      perCat[c] = { max: 0, winners: [], penalty: true };
      return;
    }
    const max = Math.max(...G.players.map((_, p) => totals[p][c]));
    const winners = G.players.map((_, p) => p).filter((p) => totals[p][c] === max && max > 0);
    winners.forEach((p) => { scores[p] += max; });
    perCat[c] = { max, winners, penalty: false };
  });
  return { totals, scores, perCat };
}

// ---- 描画 ----
const stage = document.getElementById('stage');

function tileLabel(tile) {
  const sp = speciesOf(tile);
  const pw = tile.marks.find((m) => POWERS.includes(m));
  if (isPair(tile)) return `${INFO[sp].label}${INFO[sp].label}`;
  return `${INFO[sp].label}${pw ? INFO[pw].label : ''}`;
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
        if (t.taken) return `<div class="tile taken" style="background:${t.owner != null ? PLAYER_COLORS[t.owner] + '33' : 'transparent'}"></div>`;
        const clickable = canTake && endIds.has(t.id);
        const selectable = G.pendingAction === 'move-select' && t.gem === G.current;
        const placeable = G.pendingAction === 'place' && t.gem == null;
        const destable = G.pendingAction === 'move-dest' && t.gem == null;
        const active = clickable || selectable || placeable || destable;
        const sp = speciesOf(t);
        return `<button class="tile ${active ? 'active' : ''}" data-id="${t.id}" style="background:${INFO[sp].color}" ${active ? '' : 'disabled'}>
          <span class="tile__mark">${tileLabel(t)}</span>
          ${t.gem != null ? `<span class="tile__gem" style="background:${PLAYER_COLORS[t.gem]}"></span>` : ''}
          ${t.token ? '<span class="tile__token">?</span>' : ''}
        </button>`;
      }).join('')}
    </div>`).join('');

  const header = `
    <table class="board">
      <thead><tr><th></th>${G.players.map((_, p) => `<th class="${p === G.current ? 'cur' : ''}" style="color:${PLAYER_COLORS[p]}">P${p + 1}</th>`).join('')}</tr></thead>
      <tbody>
        ${CATEGORIES.map((c) => `<tr><td>${INFO[c].label}</td>${G.players.map((pl2) => `<td>${
          G.rows.reduce((n, row) => n + row.filter((t) => t.taken && t.owner === G.players.indexOf(pl2) && t.marks.includes(c)).length, 0) + (pl2.tokens[c] || 0)
        }</td>`).join('')}</tr>`).join('')}
        <tr><td>原石</td>${G.players.map((pl2) => `<td>${pl2.gemsHand}</td>`).join('')}</tr>
        <tr><td>＋</td>${G.players.map((pl2) => `<td>${pl2.tokens.plus || 0}</td>`).join('')}</tr>
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
      <p class="turn" style="color:${PLAYER_COLORS[G.current]}">P${G.current + 1} の番</p>
      <div class="forest">${rowsHtml}</div>
      ${actions}
      ${G.message ? `<p class="msg">${G.message}</p>` : ''}
      ${header}
    </div>`;

  stage.querySelectorAll('.tile[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tile = G.rows.flat().find((t) => t.id === Number(btn.dataset.id));
      clickBoardTile(tile);
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
  stage.innerHTML = `
    <div class="result">
      <h2>終了</h2>
      <table class="board">
        <thead><tr><th></th>${G.players.map((_, p) => `<th style="color:${PLAYER_COLORS[p]}">P${p + 1}</th>`).join('')}</tr></thead>
        <tbody>
          ${CATEGORIES.map((c) => `<tr><td>${INFO[c].label}${perCat[c].penalty ? '(−3)' : ''}</td>${G.players.map((_, p) => `<td>${perCat[c].winners.includes(p) ? perCat[c].max : (perCat[c].penalty ? -3 : 0)}</td>`).join('')}</tr>`).join('')}
          <tr class="total"><td>合計</td>${scores.map((s) => `<td>${s}</td>`).join('')}</tr>
        </tbody>
      </table>
      <p class="hint">${winners.length > 1 ? '引き分け: ' : '勝ち: '}${winners.map((p) => 'P' + (p + 1)).join('・')}</p>
      <button class="pill pill--main" id="btn-again">もう一度</button>
    </div>`;
  stage.querySelector('#btn-again').addEventListener('click', () => { G = null; render(); });
}

render();
