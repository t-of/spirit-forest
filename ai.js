'use strict';
// CPU の頭（評価関数つき貪欲、1 手先だけ）。rules.js の legalMoves()/clone()/applyMove() だけを使う。
// 隠れた情報はズルしない: 森の裏向きトークンの中身・他人がすでに取ったトークンの中身は見ない。
// 他人のトークンは「合計の枚数」だけ画面にも出ている公開情報なので、それだけ使って見積もる。

import { CATEGORIES, legalMoves, clone, applyMove, computeScore, shuffle } from './rules.js';

// 重みはここにまとめる（評価関数の唯一のつまみ）。
const W = {
  riskPenalty: 3.2, // 実際のルールは「そのマークがタイル上で 0 枚」だと −3点。やや重めに見て手堅く避ける
};

// 自分以外の持つトークン枚数は内訳までは見えない（画面でも合計しか出ない）ので、12 種に均等に散らして見積もる。
// ponytail: 実際の分布は均等ではない。見積もりが大きく外れるようなら、もう少し賢い割り振りに変える。
function knownTokenTotal(pl) {
  let n = 0;
  for (const k in pl.tokens) if (k !== 'plus' && k !== '?') n += pl.tokens[k] || 0;
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
  // '?' は先読みの中で取った裏向きトークン（14 枚のどれか分からないので 1/14 ずつ）
  const tokenPart = p === self ? (pl.tokens[c] || 0) + (pl.tokens['?'] || 0) / 14 : knownTokenTotal(pl) / CATEGORIES.length;
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
  // 森の裏向きトークンは見えないので、中身を伏せた複製で読む
  const masked = clone(state);
  masked.rows.forEach((row) => row.forEach((t) => { if (t.token) t.token = '?'; }));
  let best = null, bestValue = -Infinity;
  for (const move of moves) {
    const after = clone(masked);
    applyMove(after, move);
    const value = evaluate(after, player) + rng() * 1e-6; // 同点はごく僅かな乱数で割る
    if (value > bestValue) { bestValue = value; best = move; }
  }
  return best;
}

// ---------- ISMCTS ----------
// 隠れている情報は 2 つ: ① 森の裏向きトークンの中身 ② 他人が取ったトークンの内訳（画面には合計しか出ない）。
// viewer 自身が確実に知っていること（自分のトークンの中身・公開されている盤面）はそのまま、それ以外を
// まとめて「袋」に戻し、くじ引きし直す（決定化）。legalMoves() はトークンの中身を見ないので、手の一覧は
// 決定化の前後で変わらない。
function determinize(state, viewerIdx, rng) {
  const s = clone(state);
  const spots = [];
  s.rows.forEach((row) => row.forEach((t) => { if (!t.taken && t.token) spots.push(t); }));
  const pool = spots.map((t) => t.token);
  const others = [];
  s.players.forEach((pl, p) => {
    if (p === viewerIdx) return;
    let total = 0;
    for (const k in pl.tokens) { total += pl.tokens[k] || 0; pool.push(...Array(pl.tokens[k] || 0).fill(k)); pl.tokens[k] = 0; }
    others.push({ p, total });
  });
  const bag = shuffle(pool, rng);
  let i = 0;
  spots.forEach((t) => { t.token = bag[i++]; });
  others.forEach(({ p, total }) => {
    for (let k = 0; k < total; k++) {
      const cat = bag[i++];
      s.players[p].tokens[cat] = (s.players[p].tokens[cat] || 0) + 1;
    }
  });
  return s;
}

// state.players[p].score を 0〜1 の報酬にする。2 人は勝敗（引き分け 0.5）、3〜4 人は順位（1 位 1、最下位 0 の線形。
// 同点は順位を平均する）。点差そのものは見ない（勝ちを狙う）。
function rankReward(scores, viewerIdx) {
  const n = scores.length;
  const mine = scores[viewerIdx];
  if (n === 2) {
    const other = scores[1 - viewerIdx];
    return mine > other ? 1 : mine < other ? 0 : 0.5;
  }
  const better = scores.filter((v) => v > mine).length;
  const tiedOthers = scores.filter((v) => v === mine).length - 1;
  const rankPos = better + tiedOthers / 2; // 0 = 単独 1 位
  return 1 - rankPos / (n - 1);
}

// 手の候補から、評価関数で一番良いものを選ぶ（state は伏せていない具体的な盤面という前提）。
// chooseMove の中身と同じ選び方だが、渡された候補 moves の中だけで比べる（根の絞り込み・ロールアウトの両方で使う）。
function pickBest(state, moves, viewerIdx, rng) {
  let best = null, bestValue = -Infinity;
  for (const move of moves) {
    const after = clone(state);
    applyMove(after, move);
    const value = evaluate(after, viewerIdx) + rng() * 1e-6;
    if (value > bestValue) { bestValue = value; best = move; }
  }
  return best;
}

// legalMoves() は「取る 1〜2 枚」×「原石の操作（置く／動かす先の候補いくつか）」の組み合わせを全部返すので、
// 盤面によっては数百手になる（原石の操作の有無・場所がほとんど）。ISMCTS が本当に読みたい分岐は
// 「どれを取るか」なので、同じ takes ごとに原石の操作案をまとめて 1 グループにする。
function groupByTakes(moves) {
  const map = new Map();
  for (const m of moves) {
    const key = m.takes.join(',');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }
  return [...map.values()];
}

// 打ち切り（ロールアウト）: 乱数で手を選ばず、既存の評価関数で「取る」だけ軽く貪欲に進める。
// ponytail: 原石の操作はロールアウト中は見ない（各 takes グループの代表＝gemAction なしの案を使う）。
// 深く何手も進めるので、ここで原石の操作まで毎回評価し直すと重すぎる。本番の 1 手（chooseMove）はいまどおり
// 原石の操作も含めて評価する。
function cheapRolloutMove(state, viewerIdx, rng) {
  const moves = legalMoves(state);
  if (!moves.length) return null;
  const groups = groupByTakes(moves);
  return pickBest(state, groups.map((g) => g[0]), viewerIdx, rng);
}

// 終局 or 打ち切り時点の得点（computeScore、終局していない盤面にもそのまま使える）を順位の報酬にする。
function rollout(state, viewerIdx, depth, rng) {
  let cur = state;
  for (let i = 0; i < depth && !cur.over; i++) {
    const move = cheapRolloutMove(cur, cur.current, rng);
    if (!move) break;
    applyMove(cur, move);
  }
  const score = cur.over ? cur.score : computeScore(cur);
  return rankReward(score.scores, viewerIdx);
}

// ponytail: 本式の木（手の列ごとにノードを持ち UCB で分岐を共有する）ではなく、根の「どれを取るか」だけを
// UCB1 で選び、毎回決定化し直して軽い貪欲プレイアウトで採点する簡易版（flat MC + determinization）。
// gem-trade と同じ形。考える時間が足りないほど弱くなる。木を共有したくなったら、手の列をキーにノードを持つ
// 本式の ISMCTS に置き換える。
export function ismctsMove(state, viewerIdx, opts = {}) {
  const { timeLimitMs = 1500, maxIters = Infinity, rolloutDepth = 8, rng = Math.random } = opts;
  const moves = legalMoves(state);
  if (moves.length <= 1) return moves[0] || null;
  const groups = groupByTakes(moves); // 根の分岐＝どの takes を選ぶか
  const stats = groups.map(() => ({ n: 0, total: 0 }));
  const totalN = () => stats.reduce((sum, x) => sum + x.n, 0);
  const start = Date.now();
  let iters = 0;
  while (iters < maxIters && (maxIters !== Infinity || Date.now() - start < timeLimitMs)) {
    iters++;
    let mi = stats.findIndex((x) => x.n === 0);
    if (mi === -1) {
      let best = -Infinity;
      const logN = Math.log(totalN());
      stats.forEach((x, i) => {
        const ucb = x.total / x.n + Math.SQRT2 * Math.sqrt(logN / x.n);
        if (ucb > best) { best = ucb; mi = i; }
      });
    }
    const after = determinize(state, viewerIdx, rng);
    const move = pickBest(after, groups[mi], viewerIdx, rng); // そのグループ内で原石の操作だけ選び直す
    applyMove(after, move);
    stats[mi].n++;
    stats[mi].total += rollout(after, viewerIdx, rolloutDepth, rng);
    if (maxIters === Infinity && Date.now() - start >= timeLimitMs) break;
  }
  let best = -Infinity, bestI = 0;
  stats.forEach((x, i) => { const avg = x.n ? x.total / x.n : -Infinity; if (avg > best) { best = avg; bestI = i; } });
  return pickBest(determinize(state, viewerIdx, rng), groups[bestI], viewerIdx, rng);
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

export const BOTS = { greedy: chooseMove, legacy: legacyMove, ismcts: (state, player) => ismctsMove(state, player), random: (state) => {
  const moves = legalMoves(state);
  return moves.length ? moves[Math.floor(Math.random() * moves.length)] : null;
} };
