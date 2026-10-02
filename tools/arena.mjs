#!/usr/bin/env node
// CPU どうしを対局させて、勝率・平均点を出す。
//   node tools/arena.mjs --a greedy --b legacy --games 400 --players 2
//   node tools/arena.mjs --a ismcts --b greedy --games 100 --iters 300   # ismcts は反復回数で止める（再現しやすい）
// 席（手番の順）を 1 局ごとに回して、先手有利を打ち消す。
'use strict';
import * as Rules from '../rules.js';
import { BOTS, ismctsMove } from '../ai.js';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return typeof def === 'number' ? Number(v) : v;
};
const GAMES = arg('games', 200);
const A = arg('a', 'greedy');
const B = arg('b', 'legacy');
const PLAYERS = arg('players', 2);
const ITERS = arg('iters', 200); // ismcts の反復回数の上限（時間でなくこれで打ち切るので再現しやすい）

if (!BOTS[A] || !BOTS[B]) {
  console.error(`知らない CPU: --a/--b は ${Object.keys(BOTS).join(', ')} のどれか`);
  process.exit(1);
}

// ismcts だけ反復回数を固定して呼ぶ（BOTS.ismcts は時間切れ既定なので arena では使わない）。
const movePicker = (name) => (name === 'ismcts' ? (s, p) => ismctsMove(s, p, { maxIters: ITERS }) : BOTS[name]);

// 席 0..PLAYERS-1 に A・B をどう割り振るか（1 局ごとに回す）。2 人なら AB/BA、3〜4 人なら A を 1 席だけにして残りを B にし、席を回す。
function seatBots(game) {
  const bots = [];
  for (let s = 0; s < PLAYERS; s++) bots.push((s - game) % PLAYERS === 0 ? A : B);
  return bots;
}

const totalsByName = { [A]: 0, [B]: 0 };
const winsByName = { [A]: 0, [B]: 0 };
const scoreSumByName = { [A]: 0, [B]: 0 };
let draws = 0;
const started = Date.now();

for (let g = 0; g < GAMES; g++) {
  const bots = seatBots(g);
  const s = Rules.newGame(PLAYERS);
  let turns = 0;
  while (!s.over && turns < 500) {
    const move = movePicker(bots[s.current])(s, s.current);
    if (!move) break; // 打てる手が無い（起きないはずだが念のため）
    Rules.applyMove(s, move);
    turns++;
  }
  const best = Math.max(...s.score.scores);
  const winners = s.score.scores.map((v, p) => (v === best ? p : -1)).filter((p) => p >= 0);
  bots.forEach((name, p) => {
    totalsByName[name]++;
    scoreSumByName[name] += s.score.scores[p];
  });
  // 勝者の CPU 名が 1 種類だけならその名の勝ち。違う名が混ざって並んだ・全員並んだときは引き分け扱い。
  const winnerNames = [...new Set(winners.map((p) => bots[p]))];
  if (winnerNames.length === 1) winsByName[winnerNames[0]]++;
  else draws++;
}

const ms = Date.now() - started;
console.log(`${PLAYERS} 人・${GAMES} 局（${ms}ms）${[A, B].includes('ismcts') ? ` ismcts反復=${ITERS}` : ''}`);
for (const name of [A, B]) {
  const n = totalsByName[name];
  console.log(`  ${name}: 勝率 ${(100 * winsByName[name] / GAMES).toFixed(1)}% / 平均得点 ${(scoreSumByName[name] / n).toFixed(2)}`);
}
console.log(`  引き分け局: ${draws} / ${GAMES}`);
