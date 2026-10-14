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

  // Every pair that can be played right now.
  function allPairs(cells) {
    const out = [];
    for (let a = 0; a < cells.length; a++) {
      if (cells[a].g) continue;
      for (const b of neighbours(cells, a)) if (matches(cells[a].v, cells[b].v)) out.push([a, b]);
    }
    return out;
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
  function solvableBoard(length, nest, rand, avoid, hide) {
    const seq = []; // pair ids, in board order
    let id = 0;
    while (seq.length < length) {
      let p;
      // Pairs still side by side are the ones on show at the start. Splitting one keeps
      // that number down, so on harder boards fewer pairs are visible straight away.
      const open = hide && rand() < hide ? seq.filter((x, k) => k > 0 && seq[k - 1] === x) : [];
      if (open.length) {
        p = seq.lastIndexOf(open[Math.floor(rand() * open.length)]);
      } else if (seq.length && rand() < nest) {
        const pick = seq[Math.floor(rand() * seq.length)];
        const i = seq.indexOf(pick), j = seq.lastIndexOf(pick);
        p = i + 1 + Math.floor(rand() * (j - i)); // anywhere strictly inside the pair
      } else {
        p = Math.floor(rand() * (seq.length + 1));
      }
      seq.splice(p, 0, id, id);
      id++;
    }
    return avoid ? sparseValues(seq, rand, avoid) : randomValues(seq, rand);
  }

  // Easy: any matching values. Random digits often match their neighbours by chance,
  // which gives lots of extra pairs to find.
  function randomValues(seq, rand) {
    const vals = new Array(seq.length);
    const done = new Set();
    seq.forEach((id, k) => {
      if (done.has(id)) return;
      done.add(id);
      const a = 1 + Math.floor(rand() * 9);
      const b = rand() < 0.3 ? a : 10 - a; // mostly tens, so boards look less samey
      const [x, y] = rand() < 0.5 ? [a, b] : [b, a];
      vals[k] = x;
      vals[seq.lastIndexOf(id)] = y;
    });
    return vals;
  }

  // Every way to fill a pair's two cells so they match: same digit, or adding to ten.
  const PAIR_OPTIONS = [];
  for (let a = 1; a <= 9; a++) {
    PAIR_OPTIONS.push([a, a]);
    if (a !== 5) PAIR_OPTIONS.push([a, 10 - a]);
  }

  // Cells touching cell k on the starting board: across (with wrap), up/down and diagonals.
  function touching(k, length) {
    const col = k % COLS, out = [k - 1, k + 1, k - COLS, k + COLS];
    if (col > 0) out.push(k - COLS - 1, k + COLS - 1);
    if (col < COLS - 1) out.push(k - COLS + 1, k + COLS + 1);
    return out.filter((m) => m >= 0 && m < length);
  }

  /*
   * Hard and Ultra hard: choose digits so that cells which touch don't match by
   * accident. Then the only pairs on show are the planted ones that are already
   * side by side, and new pairs only appear as you clear numbers. The board can
   * still always be cleared, but the path is narrow and easy to lose.
   * avoid 1 = one careful pass (a few accidental pairs survive),
   * avoid 2 = keep repairing until there are none, if possible.
   */
  function sparseValues(seq, rand, avoid) {
    const n = seq.length;
    const vals = new Array(n).fill(0);
    const near = seq.map((_, k) => touching(k, n));
    const cells = {}; // pair id -> [first, second] index
    seq.forEach((id, k) => (cells[id] = cells[id] || []).push(k));
    const ids = Object.keys(cells).map(Number);

    const clashes = (k, v) => {
      let c = 0;
      for (const m of near[k]) if (vals[m] && seq[m] !== seq[k] && matches(v, vals[m])) c++;
      return c;
    };
    const place = (pid) => {
      const [i, j] = cells[pid];
      vals[i] = vals[j] = 0;
      let best = Infinity, picks = [];
      for (const [x, y] of PAIR_OPTIONS) {
        for (const [p, q] of x === y ? [[x, y]] : [[x, y], [y, x]]) {
          const cost = clashes(i, p) + clashes(j, q);
          if (cost < best) { best = cost; picks = [[p, q]]; } else if (cost === best) picks.push([p, q]);
        }
      }
      const [p, q] = picks[Math.floor(rand() * picks.length)];
      vals[i] = p; vals[j] = q;
    };

    // Shuffle the order pairs are filled in, then fill each as cleanly as possible.
    for (let k = ids.length - 1; k > 0; k--) {
      const r = Math.floor(rand() * (k + 1));
      [ids[k], ids[r]] = [ids[r], ids[k]];
    }
    ids.forEach(place);

    if (avoid >= 2) {
      for (let step = 0; step < ids.length * 60; step++) {
        const bad = ids.filter((pid) => cells[pid].some((k) => clashes(k, vals[k]) > 0));
        if (!bad.length) break;
        place(bad[Math.floor(rand() * bad.length)]);
      }
    }
    return vals;
  }

  /*
   * Difficulty levels. hints and undos are per stage; null means unlimited.
   * Every level starts with 38 numbers and adds 2 per stage. nest sets how
   * tangled the board is; avoid sets how hard it works to stop accidental pairs.
   */
  const LEVELS = {
    easy: {
      name: "Easy", tag: "EASY", adds: 5, hints: null, undos: null, mult: 1, avoid: 0, hide: 0, tries: 1,
      len: (s) => Math.min(38 + (s - 1) * 2, 60), nest: (s) => Math.min(0.3 + (s - 1) * 0.06, 0.8),
    },
    hard: {
      name: "Hard", tag: "HARD", adds: 3, hints: 3, undos: 3, mult: 2, avoid: 1, hide: 0.8, tries: 4,
      len: (s) => Math.min(38 + (s - 1) * 2, 64), nest: (s) => Math.min(0.7 + (s - 1) * 0.03, 0.9),
    },
    ultra: {
      name: "Ultra hard", tag: "ULTRA", adds: 1, hints: 0, undos: 0, mult: 3, avoid: 2, hide: 0.85, tries: 10,
      len: (s) => Math.min(38 + (s - 1) * 2, 66), nest: (s) => Math.min(0.85 + (s - 1) * 0.02, 0.95),
    },
  };
  const level = (key) => LEVELS[key] || LEVELS.easy;

  // Plays a board with random moves (no Add). Returns true if it happened to clear.
  function luckyClear(vals, rand) {
    let cells = vals.map((v) => ({ v, g: false }));
    while (cells.length) {
      const moves = allPairs(cells);
      if (!moves.length) return false;
      const [a, b] = moves[Math.floor(rand() * moves.length)];
      cells = play(cells, a, b).cells;
    }
    return true;
  }

  /*
   * Shuffled boards that get longer and more tangled each stage.
   * Hard and Ultra hard make several candidate boards, test-play each one a few
   * times with random moves, and keep the trickiest: the fewest pairs on show at
   * the start and the most dead ends.
   */
  function stageBoard(stage, rand, levelKey) {
    const L = level(levelKey);
    rand = rand || Math.random;
    let best = null, bestScore = Infinity;
    for (let t = 0; t < L.tries; t++) {
      const vals = solvableBoard(L.len(stage), L.nest(stage), rand, L.avoid, L.hide);
      if (L.tries === 1) return vals;
      let score = allPairs(vals.map((v) => ({ v, g: false }))).length;
      for (let k = 0; k < 6; k++) if (luckyClear(vals, rand)) score += 4;
      if (score < bestScore) { best = vals; bestScore = score; }
    }
    return best;
  }

  function dailyBoard(dateKey) {
    return solvableBoard(38, 0.55, rng(hash("tens-daily-" + dateKey)));
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
    canPair, findPair, allPairs, play, addNumbers, liveCount,
    stageBoard, dailyBoard, solvableBoard, rng, hash, encode, decode,
  };
})(typeof window !== "undefined" ? window : globalThis);
