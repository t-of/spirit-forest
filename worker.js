'use strict';
// CPU（ISMCTS）を別スレッドで回す。画面は { id, state, viewerIdx, opts } を送り、{ id, move } を受け取る。
// 考えるあいだ（既定 1.5 秒）も画面は固まらない。
import { ismctsMove } from './ai.js';

self.onmessage = (e) => {
  const { id, state, viewerIdx, opts } = e.data;
  let move = null;
  try { move = ismctsMove(state, viewerIdx, opts); } catch { move = null; }
  self.postMessage({ id, move });
};
