'use strict';
// Spirits of the Forest のルール・盤面・得点計算（画面・音・localStorage に触らない）。
// main.js（画面）と ai.js・tools/（CPU の思考・自己対局）の両方から、同じコードを使う。
// プレーンな ESM なので Node からもブラウザからも import できる（sw.js の SHELL にも入れてある）。

// 精霊 9 種・力の源 3 種
export const SPECIES = ['sp', 'br', 'lv', 'vi', 'dw', 'mu', 'fr', 'fl', 'ms'];
export const POWERS = ['fi', 'mo', 'su'];
export const CATEGORIES = [...SPECIES, ...POWERS];
// 名前（色は main.js の INFO が持つ。ここは文章に使う名前だけ）
export const NAMES = {
  sp: '風', br: '根', lv: '葉', vi: '岩', dw: '水', mu: '茸', fr: '木の実', fl: '花', ms: '苔',
  fi: '火', mo: '月', su: '太陽',
};

// 48 枚の書き起こし（各行 12 枚、| で区切り、+ でマーク 2 つ）
const TILE_TEXT = `
sp|mu+mo|ms+fi|sp+su|fr+fi|dw+dw|lv+mo|vi+fi|ms+mo|lv|dw+dw|fr+fr
sp+sp|ms+ms|br+fi|ms+su|vi+vi|fr+su|mu+mu|sp+sp|lv+fi|vi|br|br+su
br+br|fl+mo|lv+su|vi+su|sp+sp|lv+lv|dw+fi|mu+fi|dw+su|fl+fl|vi+mo|sp+mo
fl+fl|dw+mo|br+br|lv+lv|fl+su|mu+mu|fr+fi|sp+fi|vi+vi|br+mo|mu+su|fr+mo
`.trim().split('\n').map((row) => row.trim().split('|').map((cell) => cell.split('+')));

// 札の下の数字＝その精霊の記号が 48 枚全体にいくつあるか（風 10 … 苔 5）
export const SPECIES_TOTAL = {};
TILE_TEXT.flat(2).forEach((m) => { SPECIES_TOTAL[m] = (SPECIES_TOTAL[m] || 0) + 1; });

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function speciesOf(tile) { return tile.marks.find((m) => SPECIES.includes(m)); }
export function isPair(tile) { return tile.marks.length === 2 && SPECIES.includes(tile.marks[0]) && tile.marks[0] === tile.marks[1]; }

export function newGame(numPlayers, rng = Math.random) {
  let id = 0;
  const rows = TILE_TEXT.map((row) => row.map((marks) => ({ id: id++, marks, taken: false, gem: null, token: null, owner: null })));

  // 恩恵トークン 14 枚（精霊 9・力の源 3・「＋」2）から 8 枚を裏向きで、決まったマスへ V の字に乗せる
  // 各段の左から 2・11、3・10、4・9、5・8 枚目（0 始まりの添字）
  const tokens = shuffle([...CATEGORIES, 'plus', 'plus'], rng).slice(0, 8);
  const spots = [[1, 10], [2, 9], [3, 8], [4, 7]].flatMap((cols, r) => cols.map((c) => rows[r][c]));
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
    over: false,
  };
}

export function rowEnds(row) {
  let l = -1, r = -1;
  for (let i = 0; i < row.length; i++) if (!row[i].taken) { l = i; break; }
  for (let i = row.length - 1; i >= 0; i--) if (!row[i].taken) { r = i; break; }
  return { l, r };
}

export function allEnds(state) {
  // { tile, row, idx } の一覧（行ごとに 1〜2 個）
  const out = [];
  state.rows.forEach((row, r) => {
    const { l, r: rr } = rowEnds(row);
    if (l === -1) return;
    out.push({ tile: row[l], row: r, idx: l });
    if (rr !== l) out.push({ tile: row[rr], row: r, idx: rr });
  });
  return out;
}

export function hasBoardGem(state, playerIdx) {
  return state.rows.some((row) => row.some((t) => t.gem === playerIdx));
}

// 現在のプレイヤーがこのタイルを取れるか。取れなければ理由（日本語の文章）を返す。
export function takeReason(state, tile) {
  const pl = state.players[state.current];
  if (tile.gem != null && tile.gem !== state.current) {
    if (pl.gemsHand === 0 && !hasBoardGem(state, state.current)) return '自分の原石が残っていないので、他人の原石があるタイルは取れません';
  }
  if (state.phase === 'take2') {
    if (speciesOf(tile) !== state.firstSpecies || isPair(tile)) return `同じ精霊（${NAMES[state.firstSpecies]}）の 1 体だけのタイルしか続けて取れません`;
  }
  return null;
}

export function payGemToTake(state, tile) {
  const pl = state.players[state.current];
  if (tile.gem == null) return;
  if (tile.gem === state.current) {
    pl.gemsHand++; // 自分の原石は手元に戻る
    tile.gem = null;
    return;
  }
  // 他人の原石：自分の原石を 1 個除外して払う
  const owner = state.players[tile.gem];
  owner.gemsHand++; // 相手の原石は相手の手元に戻る
  tile.gem = null;
  if (pl.gemsHand > 0) { pl.gemsHand--; pl.gemsExcluded++; return; }
  for (const row of state.rows) {
    for (const t of row) {
      if (t.gem === state.current) { t.gem = null; pl.gemsExcluded++; return; }
    }
  }
}

export function allTaken(state) { return state.rows.every((row) => row.every((t) => t.taken)); }

// タイルを 1 枚取る。取れなければ { reason } だけを返して状態は変えない。
// 取れたら { reason: null, token, over } を返す（token は獲得した恩恵トークンの種類か null）。
export function takeTile(state, tile) {
  const reason = takeReason(state, tile);
  if (reason) return { reason };
  payGemToTake(state, tile);
  tile.taken = true;
  tile.owner = state.current;
  state.players[state.current].tilesTaken++;
  let token = null;
  if (tile.token) {
    token = tile.token;
    const pl = state.players[state.current];
    pl.tokens[token] = (pl.tokens[token] || 0) + 1;
    tile.token = null;
  }
  state.takenCount++;

  if (state.phase === 'take' && !isPair(tile) && !state.firstMove) {
    state.phase = 'take2';
    state.firstSpecies = speciesOf(tile);
  } else {
    state.phase = 'gem';
  }
  state.firstMove = false;

  if (allTaken(state)) {
    state.over = true;
    state.score = computeScore(state);
  }
  return { reason: null, token, over: state.over };
}

export function skipTake(state) { state.phase = 'gem'; }

// 恩恵トークン「＋」を 1 枚使う（除外した原石を 1 個手元に戻す）
export function usePlus(state) {
  const pl = state.players[state.current];
  if (!pl.tokens.plus) return { ok: false };
  if (pl.gemsExcluded <= 0) return { ok: false, reason: '除外した原石がありません' };
  pl.tokens.plus--;
  pl.gemsExcluded--;
  pl.gemsHand++;
  return { ok: true };
}

export function placeGem(state, tile) {
  const pl = state.players[state.current];
  if (tile.taken || tile.gem != null) return { ok: false, reason: '原石のないタイルに置いてください' };
  if (pl.gemsHand <= 0) return { ok: false };
  pl.gemsHand--;
  tile.gem = state.current;
  return { ok: true };
}

export function moveGem(state, fromTile, toTile) {
  if (fromTile.gem !== state.current) return { ok: false, reason: '自分の原石を選んでください' };
  if (toTile.taken || toTile.gem != null) return { ok: false, reason: '空いているタイルへ動かしてください' };
  fromTile.gem = null;
  toTile.gem = state.current;
  return { ok: true };
}

export function endTurn(state) {
  state.phase = 'take';
  state.firstSpecies = null;
  state.current = (state.current + 1) % state.numPlayers;
}

export function computeScore(state) {
  // 集計のため、各タイルに「誰が取ったか」を記録していなかったので、取得時に owner を持たせる。
  const totals = state.players.map(() => ({}));
  CATEGORIES.forEach((c) => state.players.forEach((_, p) => { totals[p][c] = 0; }));
  state.rows.forEach((row) => row.forEach((tile) => {
    if (tile.owner == null) return;
    tile.marks.forEach((m) => { totals[tile.owner][m]++; });
  }));
  state.players.forEach((pl, p) => CATEGORIES.forEach((c) => { totals[p][c] += (pl.tokens[c] || 0); }));

  const perCat = {};
  const scores = state.players.map(() => 0);
  CATEGORIES.forEach((c) => {
    const tileOnly = state.players.map((_, p) => totals[p][c] - (state.players[p].tokens[c] || 0));
    const penalized = state.players.map((_, p) => p).filter((p) => tileOnly[p] === 0);
    penalized.forEach((p) => { scores[p] -= 3; });
    const max = Math.max(...state.players.map((_, p) => totals[p][c]));
    const winners = state.players.map((_, p) => p).filter((p) => totals[p][c] === max && max > 0);
    winners.forEach((p) => { scores[p] += max; });
    perCat[c] = { max, winners, penalized };
  });
  return { totals, scores, perCat };
}

// ---- ここから CPU（ai.js）・自己対局（tools/）向け: 状態の複製・合法手・適用 ----

export function clone(state) { return structuredClone(state); }

function findTile(state, id) {
  for (const row of state.rows) { const t = row.find((x) => x.id === id); if (t) return t; }
  return null;
}

// 原石の置き先・動かし先の候補を絞る: 各列の両端から 2 つずつ（じき端になる札）＋
// 上位 2 人の差が僅かなカテゴリの残り札（多数派争いに関わる札）。全 48 枚は見ない。
// ponytail: 均等な絞り込みで近似。隣接度や手番順までは見ない。
function candidateGemTiles(state) {
  const out = new Map();
  state.rows.forEach((row) => {
    const idxs = [];
    row.forEach((t, i) => { if (!t.taken) idxs.push(i); });
    [...idxs.slice(0, 2), ...idxs.slice(-2)].forEach((i) => {
      const t = row[i];
      if (t && !t.taken && t.gem == null) out.set(t.id, t);
    });
  });
  const totals = {};
  CATEGORIES.forEach((c) => { totals[c] = state.players.map(() => 0); });
  state.rows.forEach((row) => row.forEach((t) => {
    if (!t.taken) return;
    t.marks.forEach((m) => { totals[m][t.owner]++; });
  }));
  CATEGORIES.forEach((c) => {
    const sorted = totals[c].slice().sort((a, b) => b - a);
    if (sorted.length > 1 && sorted[0] - sorted[1] <= 2) {
      state.rows.forEach((row) => row.forEach((t) => {
        if (!t.taken && t.gem == null && t.marks.includes(c)) out.set(t.id, t);
      }));
    }
  });
  return [...out.values()];
}

// 手番の終わりの原石アクション候補（なし／置く／動かす）。＋トークンはいつでも使うほうが得なので
// apply() が自動で使い切る（手として選ばない）。
function gemActionOptions(state) {
  const pl = state.players[state.current];
  const options = [null];
  const dests = candidateGemTiles(state);
  if (pl.gemsHand > 0) {
    dests.forEach((t) => options.push({ type: 'place', tileId: t.id }));
  } else if (hasBoardGem(state, state.current)) {
    const sources = state.rows.flat().filter((t) => t.gem === state.current);
    sources.forEach((from) => dests.forEach((to) => {
      if (to.id !== from.id) options.push({ type: 'move', from: from.id, to: to.id });
    }));
  }
  return options;
}

// 手番の開始（phase 'take'）から見た、打てる手の一覧。
// 1 手 = { takes: [取る札の id, (続けて取るなら 2 枚目も)], gemAction: null|{type:'place',tileId}|{type:'move',from,to} }
export function legalMoves(state) {
  const moves = [];
  const ends1 = allEnds(state).filter((e) => !takeReason(state, e.tile));
  if (!ends1.length) {
    // 端の札が 1 枚も取れない（他人の原石ばかりで、払う原石も無い）。何も取らずに原石の操作へ進む。
    gemActionOptions(state).forEach((gemAction) => moves.push({ takes: [], gemAction }));
    return moves;
  }
  for (const e1 of ends1) {
    const afterT1 = clone(state);
    const r1 = takeTile(afterT1, findTile(afterT1, e1.tile.id));
    if (r1.over) { moves.push({ takes: [e1.tile.id], gemAction: null }); continue; }
    if (afterT1.phase === 'take2') {
      // 2 枚目を取らずに止める
      const stopState = clone(afterT1);
      skipTake(stopState);
      gemActionOptions(stopState).forEach((gemAction) => moves.push({ takes: [e1.tile.id], gemAction }));
      // 続けて 2 枚目
      const ends2 = allEnds(afterT1).filter((e) => !takeReason(afterT1, e.tile));
      for (const e2 of ends2) {
        const afterT2 = clone(afterT1);
        const r2 = takeTile(afterT2, findTile(afterT2, e2.tile.id));
        if (r2.over) { moves.push({ takes: [e1.tile.id, e2.tile.id], gemAction: null }); continue; }
        gemActionOptions(afterT2).forEach((gemAction) => moves.push({ takes: [e1.tile.id, e2.tile.id], gemAction }));
      }
    } else {
      gemActionOptions(afterT1).forEach((gemAction) => moves.push({ takes: [e1.tile.id], gemAction }));
    }
  }
  return moves;
}

// legalMoves() が返した 1 手を状態へ適用し、次の人の手番まで進める（state を直接書き換える）。
export function applyMove(state, move) {
  for (const id of move.takes) {
    const r = takeTile(state, findTile(state, id));
    if (r.over) return state;
  }
  const pl = state.players[state.current];
  while (pl.tokens.plus > 0 && pl.gemsExcluded > 0) usePlus(state); // 使わない理由がないので使い切る
  if (move.gemAction) {
    if (move.gemAction.type === 'place') placeGem(state, findTile(state, move.gemAction.tileId));
    else moveGem(state, findTile(state, move.gemAction.from), findTile(state, move.gemAction.to));
  }
  endTurn(state);
  return state;
}
