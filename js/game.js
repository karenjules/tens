/*
 * Tens game rules. Pure functions, no DOM.
 *
 * A board is an array of cells { v: 1-9, g: crossed out? } read left to right,
 * top to bottom, 9 per row.
 */
(function (global) {
  "use strict";

  const COLS = 9;
  const ADDS = 5;
  const CLASSIC = "123456789111213141516171819".split("").map(Number);

  const matches = (x, y) => x === y || x + y === 10;

  // Next number still in play after i, reading across (wraps onto the next row).
  function nextAcross(cells, i) {
    for (let k = i + 1; k < cells.length; k++) if (!cells[k].g) return k;
    return -1;
  }

  // Next number still in play directly below i, in the same column.
  function nextDown(cells, i) {
    for (let k = i + COLS; k < cells.length; k += COLS) if (!cells[k].g) return k;
    return -1;
  }

  function canPair(cells, a, b) {
    if (a === b || a < 0 || b < 0) return false;
    const i = Math.min(a, b), j = Math.max(a, b);
    if (cells[i].g || cells[j].g || !matches(cells[i].v, cells[j].v)) return false;
    return nextAcross(cells, i) === j || ((j - i) % COLS === 0 && nextDown(cells, i) === j);
  }

  // Finds a valid pair, scanning from `from` and wrapping, so repeated hints cycle.
  function findPair(cells, from) {
    const n = cells.length;
    const start = from > 0 && from < n ? from : 0;
    for (let s = 0; s < n; s++) {
      const a = (start + s) % n;
      if (cells[a].g) continue;
      const b1 = nextAcross(cells, a);
      if (b1 >= 0 && matches(cells[a].v, cells[b1].v)) return [a, b1];
      const b2 = nextDown(cells, a);
      if (b2 >= 0 && matches(cells[a].v, cells[b2].v)) return [a, b2];
    }
    return null;
  }

  // Crosses out a pair and removes any rows that are now fully crossed out.
  // Returns the new board, the indexes of removed rows and points earned.
  function play(cells, a, b) {
    const crossed = cells.map((c, k) => (k === a || k === b ? { v: c.v, g: true } : c));
    const kept = [], rows = [];
    for (let r = 0; r < crossed.length; r += COLS) {
      const row = crossed.slice(r, r + COLS);
      if (row.every((c) => c.g)) rows.push(r / COLS);
      else for (const c of row) kept.push(c);
    }
    return { crossed, cells: kept, rows, points: 1 + rows.length * 10 };
  }

  function addNumbers(cells) {
    return cells.concat(cells.filter((c) => !c.g).map((c) => ({ v: c.v, g: false })));
  }

  const liveCount = (cells) => cells.reduce((n, c) => n + (c.g ? 0 : 1), 0);

  // ---- Seeded randomness ----
  function rng(seed) {
    let t = seed >>> 0;
    return function () {
      t = (t + 0x6d2b79f5) >>> 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  /*
   * Builds a shuffled board that can always be cleared without using Add.
   *
   * It works backwards from an empty board: each step drops a matching pair
   * (same, or adding up to ten) side by side somewhere in the sequence. Undoing
   * the steps in reverse is a full solution, because whatever lands between a
   * pair later is crossed out first, and crossed-out numbers never block.
   * `nest` is how often a new pair goes inside an existing one, which hides
   * pairs from each other and makes the board harder to read.
   */
  function solvableBoard(length, nest, rand) {
    const seq = []; // pair ids
    const vals = []; // values, parallel to seq
    let id = 0;
    while (seq.length < length) {
      const a = 1 + Math.floor(rand() * 9);
      const b = rand() < 0.3 ? a : 10 - a; // mostly tens, so boards look less samey
      let p;
      if (seq.length && rand() < nest) {
        const pick = seq[Math.floor(rand() * seq.length)];
        const i = seq.indexOf(pick), j = seq.lastIndexOf(pick);
        p = i + 1 + Math.floor(rand() * (j - i)); // anywhere strictly inside the pair
      } else {
        p = Math.floor(rand() * (seq.length + 1));
      }
      const [x, y] = rand() < 0.5 ? [a, b] : [b, a];
      seq.splice(p, 0, id, id);
      vals.splice(p, 0, x, y);
      id++;
    }
    return vals;
  }

  // Stage 1 is the classic opening. Later stages get longer and more tangled.
  function stageBoard(stage, rand) {
    if (stage <= 1) return CLASSIC.slice();
    const length = Math.min(28 + (stage - 2) * 2, 54);
    const nest = Math.min(0.3 + (stage - 2) * 0.06, 0.8);
    return solvableBoard(length, nest, rand || Math.random);
  }

  function dailyBoard(dateKey) {
    return solvableBoard(40, 0.55, rng(hash("tens-daily-" + dateKey)));
  }

  // Compact storage: live 1-9 as digits, crossed out 1-9 as letters a-i.
  function encode(cells) {
    return cells.map((c) => (c.g ? String.fromCharCode(96 + c.v) : String(c.v))).join("");
  }

  function decode(str) {
    return str.split("").map((ch) => (ch >= "a" ? { v: ch.charCodeAt(0) - 96, g: true } : { v: +ch, g: false }));
  }

  global.Tens = {
    COLS, ADDS, CLASSIC,
    canPair, findPair, play, addNumbers, liveCount,
    stageBoard, dailyBoard, solvableBoard, rng, hash, encode, decode,
  };
})(typeof window !== "undefined" ? window : globalThis);
