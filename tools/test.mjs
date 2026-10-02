#!/usr/bin/env node
// rules.js の自己チェック:  node tools/test.mjs
// 合法手をランダムに打って 1 局最後まで進め、48 枚がちょうど全部取られる・得点が computeScore と一致する・
// 原石の数（手元＋除外＋盤上）が保たれることを確かめる。
'use strict';
import assert from 'node:assert/strict';
import * as Rules from '../rules.js';

function randomGame(numPlayers) {
  const s = Rules.newGame(numPlayers);
  let turns = 0;
  while (!s.over && turns < 500) {
    const moves = Rules.legalMoves(s);
    assert.ok(moves.length, `${turns} 手目で打てる手が無い`);
    const move = moves[Math.floor(Math.random() * moves.length)];
    Rules.applyMove(s, move);
    turns++;
  }
  assert.ok(s.over, '500 手打っても対局が終わらなかった');
  return s;
}

for (const n of [2, 3, 4]) {
  for (let i = 0; i < 20; i++) {
    const s = randomGame(n);

    const taken = s.rows.flat().filter((t) => t.taken).length;
    assert.equal(taken, 48, `${n}人: 取られた札が48枚でない (${taken})`);

    const recomputed = Rules.computeScore(s);
    assert.deepEqual(s.score.scores, recomputed.scores, `${n}人: 終局時の得点が computeScore と一致しない`);

    const gemsEach = n <= 2 ? 3 : 2;
    s.players.forEach((pl, p) => {
      const onBoard = s.rows.flat().filter((t) => t.gem === p).length;
      assert.equal(pl.gemsHand + pl.gemsExcluded + onBoard, gemsEach, `${n}人 P${p + 1}: 原石の数が合わない`);
    });
  }
}
console.log('ok: すべて通った');
