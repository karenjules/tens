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

  // Next number still in play diagonally below i: dir +1 goes down-right, -1 down-left.
  // Diagonals stop at the edge of the board rather than wrapping round.
  function nextDiag(cells, i, dir) {
    let col = i % COLS;
    for (let k = i + COLS + dir; k < cells.length; k += COLS + dir) {
      col += dir;
      if (col < 0 || col >= COLS) return -1;
      if (!cells[k].g) return k;
    }
    return -1;
  }

  // The numbers that count as neighbours of i, looking forwards: across, down and both diagonals.
  // Crossed-out numbers in between are skipped, so they never block a pair.
  function neighbours(cells, i) {
    return [nextAcross(cells, i), nextDown(cells, i), nextDiag(cells, i, 1), nextDiag(cells, i, -1)].filter((k) => k >= 0);
  }

  function canPair(cells, a, b) {
    if (a === b || a < 0 || b < 0) return false;
    const i = Math.min(a, b), j = Math.max(a, b);
    if (cells[i].g || cells[j].g || !matches(cells[i].v, cells[j].v)) return false;
    return neighbours(cells, i).includes(j);
  }

  // Finds a valid pair, scanning from `from` and wrapping, so repeated hints cycle.
  function findPair(cells, from) {
    const n = cells.length;
    const start = from > 0 && from < n ? from : 0;
    for (let s = 0; s < n; s++) {
      const a = (start + s) % n;
      if (cells[a].g) continue;
      for (const b of neighbours(cells, a)) if (matches(cells[a].v, cells[b].v)) return [a, b];
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

  /*
   * Difficulty levels. hints and undos are per stage; null means unlimited.
   * len and nest set how long and how tangled each stage's board is.
   */
  const LEVELS = {
    easy: {
      name: "Easy", tag: "EASY", adds: 5, hints: null, undos: null, mult: 1,
      len: (s) => Math.min(28 + (s - 2) * 2, 54), nest: (s) => Math.min(0.3 + (s - 2) * 0.06, 0.8),
    },
    hard: {
      name: "Hard", tag: "HARD", adds: 3, hints: 3, undos: 3, mult: 2,
      len: (s) => Math.min(36 + (s - 1) * 2, 60), nest: (s) => Math.min(0.55 + (s - 1) * 0.05, 0.85),
    },
    ultra: {
      name: "Ultra hard", tag: "ULTRA", adds: 1, hints: 0, undos: 0, mult: 3,
      len: (s) => Math.min(46 + (s - 1) * 2, 66), nest: (s) => Math.min(0.75 + (s - 1) * 0.03, 0.9),
    },
  };
  const level = (key) => LEVELS[key] || LEVELS.easy;

  // Easy stage 1 is the classic opening. Later stages, and every Hard and Ultra
  // hard stage, are shuffled boards that get longer and more tangled.
  function stageBoard(stage, rand, levelKey) {
    const L = level(levelKey);
    if (L === LEVELS.easy && stage <= 1) return CLASSIC.slice();
    return solvableBoard(L.len(stage), L.nest(stage), rand || Math.random);
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
    COLS, ADDS, CLASSIC, LEVELS, level,
    canPair, findPair, play, addNumbers, liveCount,
    stageBoard, dailyBoard, solvableBoard, rng, hash, encode, decode,
  };
})(typeof window !== "undefined" ? window : globalThis);
