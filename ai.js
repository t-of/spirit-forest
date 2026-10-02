'use strict';
// CPU の頭（評価関数つき貪欲、1 手先だけ）。rules.js の legalMoves()/clone()/applyMove() だけを使う。
// 隠れた情報はズルしない: 森の裏向きトークンの中身・他人がすでに取ったトークンの中身は見ない。
// 他人のトークンは「合計の枚数」だけ画面にも出ている公開情報なので、それだけ使って見積もる。

import { CATEGORIES, legalMoves, clone, applyMove } from './rules.js';

// 重みはここにまとめる（評価関数の唯一のつまみ）。
const W = {
  riskPenalty: 3.2, // 実際のルールは「そのマークがタイル上で 0 枚」だと −3点。やや重めに見て手堅く避ける
};

// 自分以外の持つトークン枚数は内訳までは見えない（画面でも合計しか出ない）ので、12 種に均等に散らして見積もる。
// ponytail: 実際の分布は均等ではない。見積もりが大きく外れるようなら、もう少し賢い割り振りに変える。
function knownTokenTotal(pl) {
  let n = 0;
  for (const k in pl.tokens) if (k !== 'plus') n += pl.tokens[k] || 0;
  return n;
}

// カテゴリ c について、プレイヤー p が最後に持っていそうな枚数（タイルの印だけの分 tileOnly と、トークン込みの total）
function projectCategory(state, p, c, self) {
  const n = state.numPlayers;
  let tileOnly = 0;
  state.rows.forEach((row) => row.forEach((t) => {
    const mult = t.marks.filter((m) => m === c).length;
    if (!mult) return;
    if (t.taken) {
      if (t.owner === p) tileOnly += mult;
      return;
    }
    if (t.gem === p) tileOnly += mult; // 自分の原石が乗っている札はほぼ自分の取り分
    else if (t.gem == null) tileOnly += mult / n; // 誰の原石もない札は人数で均等割り（ponytail: 近さ・手番順は見ない）
    // 他人の原石が乗っている札はその人の取り分として扱い、ここでは数えない
  }));
  const pl = state.players[p];
  const tokenPart = p === self ? (pl.tokens[c] || 0) : knownTokenTotal(pl) / CATEGORIES.length;
  return { tileOnly, total: tileOnly + tokenPart };
}

// 状態の良さを player の視点で見積もる。3〜4 人では、自分と一番強い相手の差だけを見る。
export function evaluate(state, player) {
  let score = 0;
  for (const c of CATEGORIES) {
    const proj = state.players.map((_, p) => projectCategory(state, p, c, player));
    const mine = proj[player];
    const bestOpp = Math.max(0, ...proj.filter((_, p) => p !== player).map((x) => x.total));
    score += mine.total - bestOpp;
    if (mine.tileOnly < 1) score -= W.riskPenalty * (1 - mine.tileOnly);
  }
  return score;
}

// 1 手番ぶんの手（legalMoves() の形）を、評価関数つきの 1 手先読みで選ぶ。
export function chooseMove(state, player, rng = Math.random) {
  const moves = legalMoves(state);
  if (!moves.length) return null;
  let best = null, bestValue = -Infinity;
  for (const move of moves) {
    const after = clone(state);
    applyMove(after, move);
    const value = evaluate(after, player) + rng() * 1e-6; // 同点はごく僅かな乱数で割る
    if (value > bestValue) { bestValue = value; best = move; }
  }
  return best;
}

// 比較用の雑 CPU（旧版）。取れる端の札から、自分が多く持っている精霊を少しだけ優先してランダムに選ぶ。
// 原石は 3 割くらいの確率でどこかに置く。arena で greedy と比べるために残してある。
export function legacyMove(state, player, rng = Math.random) {
  const moves = legalMoves(state);
  if (!moves.length) return null;
  const takeLens = {};
  moves.forEach((m) => { takeLens[m.takes.length] = (takeLens[m.takes.length] || 0) + 1; });
  const maxTakes = Math.max(...moves.map((m) => m.takes.length));
  // 旧 CPU は take2 を 6 割の確率でやめていたので、それに寄せる（2 枚取る手を優先しすぎない）
  const wantsTwo = maxTakes > 1 && rng() < 0.4;
  const pool = wantsTwo ? moves.filter((m) => m.takes.length === maxTakes) : moves.filter((m) => m.takes.length === Math.min(...moves.map((x) => x.takes.length)));
  const picked = pool[Math.floor(rng() * pool.length)];
  // 原石操作: 3 割だけ、候補からランダムに選ぶ（旧 CPU は「空いている全タイル」からだったが、
  // legalMoves が絞った候補の中からで近似する）
  if (rng() < 0.3) {
    const withGem = moves.filter((m) => m.takes.length === picked.takes.length && m.gemAction);
    if (withGem.length) return withGem[Math.floor(rng() * withGem.length)];
  }
  return { takes: picked.takes, gemAction: null };
}

export const BOTS = { greedy: chooseMove, legacy: legacyMove, random: (state) => {
  const moves = legalMoves(state);
  return moves.length ? moves[Math.floor(Math.random() * moves.length)] : null;
} };
