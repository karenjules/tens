/*
 * Tens app: screens, saving and game flow. Rules live in game.js.
 */
(function () {
  "use strict";

  const T = window.Tens;
  const $ = (id) => document.getElementById(id);
  const KEY = "tens.v1";
  const HISTORY_LIMIT = 40;
  const fmt = (n) => Number(n || 0).toLocaleString("en-GB");

  // ---------- Saved data ----------
  // run:   the main game, stage after stage
  // daily: today's daily challenge
  // Games are stored with their cells packed into a short string (see game.js).
  const defaults = { run: null, daily: null, best: 0, streak: 0, lastDaily: null, result: null };
  let store = defaults;
  try { store = Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* start fresh */ }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* storage full or blocked */ }
  }

  const pack = (g) => Object.assign({}, g, { cells: T.encode(g.cells) });
  const unpack = (p) => Object.assign({}, p, { cells: T.decode(p.cells) });

  // ---------- Dates ----------
  function dayKey(d) {
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  const today = () => dayKey(new Date());
  function yesterday() { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); }
  function shortDate(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase();
  }
  // The streak only counts if the last daily was finished today or yesterday.
  function currentStreak() {
    return store.lastDaily === today() || store.lastDaily === yesterday() ? store.streak : 0;
  }
  const days = (n) => n + (n === 1 ? " day" : " days");

  // ---------- Game state ----------
  let g = null;        // the game being played, cells unpacked
  let slot = "run";    // which saved game g belongs to
  let sel = null;      // selected cell index
  let hint = null;     // [a, b] hinted pair
  let hintFrom = 0;
  let busy = false;    // true while a row-clear animation runs
  let clockFrom = null;

  function makeGame(mode, stage, values, score, date) {
    return {
      mode, stage, date: date || null,
      cells: values.map((v) => ({ v, g: false })),
      initial: values.join(""),
      adds: T.ADDS, score, stageStart: score,
      pairs: 0, addsUsed: 0, total: values.length, elapsed: 0,
      history: [], over: false, done: false,
    };
  }

  function persist() {
    if (!g) return;
    syncClock();
    store[slot] = pack(g);
    save();
  }

  function startClock() { if (g && !g.over && !g.done && clockFrom === null) clockFrom = Date.now(); }
  function stopClock() { syncClock(); clockFrom = null; }
  function syncClock() {
    if (g && clockFrom !== null) { const now = Date.now(); g.elapsed += now - clockFrom; clockFrom = now; }
  }

  function snapshot() {
    g.history.push({ c: T.encode(g.cells), adds: g.adds, score: g.score, pairs: g.pairs, addsUsed: g.addsUsed, total: g.total });
    if (g.history.length > HISTORY_LIMIT) g.history.shift();
  }

  // ---------- Screens ----------
  let current = null;
  let rulesReturn = "home";

  function show(name) {
    if (current === "game" && name !== "game") { stopClock(); persist(); }
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === "screen-" + name));
    const dark = name === "win";
    document.body.classList.toggle("dark", dark);
    $("theme-color").setAttribute("content", dark ? "#2F1B12" : "#F1DFC3");
    current = name;
    if (name === "home") renderHome();
    if (name === "game") startClock();
  }

  // ---------- Home ----------
  function renderHome() {
    const run = store.run;
    const cells = run ? T.decode(run.cells) : T.CLASSIC.map((v) => ({ v, g: false }));
    const stage = run ? run.stage : 1;
    $("continue-label").textContent = (!run ? "NEW GAME" : run.over ? "GAME OVER" : "CONTINUE") + " · STAGE " + stage;
    $("continue-left").textContent = T.liveCount(cells) + " LEFT";
    $("continue-score").textContent = fmt(run ? run.score : 0);

    const pair = T.findPair(cells) || [];
    let mini = "";
    for (let i = 0; i < 36; i++) {
      const c = cells[i];
      const bg = !c || c.g ? "transparent" : pair.includes(i) ? "var(--flame)" : "var(--brown-2)";
      mini += '<div style="background:' + bg + '"></div>';
    }
    $("continue-mini").innerHTML = mini;

    $("home-best").textContent = fmt(store.best);
    $("home-streak").textContent = days(currentStreak());
    const doneToday = store.daily && store.daily.date === today() && store.daily.done;
    $("home-daily").textContent = doneToday ? "Daily done ✓" : "Daily challenge";
  }

  function openGame(which) {
    slot = which;
    g = unpack(store[which]);
    sel = null; hint = null; hintFrom = 0; busy = false; clockFrom = null;
    show("game");
    renderGame();
    $("board-scroll").scrollTop = 0;
    if (g.over) gameOverSheet();
  }

  function newRun() {
    store.run = pack(makeGame("run", 1, T.stageBoard(1), 0));
    store.result = null;
    save();
    openGame("run");
  }

  function continueRun() {
    if (store.run) openGame("run"); else newRun();
  }

  $("home-continue").addEventListener("click", continueRun);

  $("home-new").addEventListener("click", () => {
    const run = store.run;
    if (run && !run.over && (run.stage > 1 || run.score > 0)) {
      sheet({
        title: "Start over?",
        body: "This ends your current game on stage " + run.stage + " with <b>" + fmt(run.score) + "</b> points.",
        actions: [
          { label: "Start new game", cls: "btn-flame", fn: newRun },
          { label: "Keep playing", cls: "btn-outline btn-sm", fn: () => openGame("run") },
        ],
        dismissable: true,
      });
    } else newRun();
  });

  $("home-daily").addEventListener("click", () => {
    const key = today();
    if (store.daily && store.daily.date === key) {
      if (store.daily.done) { toast("Today's daily is done. Back tomorrow!"); return; }
      openGame("daily");
      return;
    }
    store.daily = pack(makeGame("daily", 0, T.dailyBoard(key), 0, key));
    save();
    openGame("daily");
  });

  $("home-rules").addEventListener("click", () => { rulesReturn = "home"; show("rules"); });

  $("home-settings").addEventListener("click", () => {
    const actions = [];
    if (store.run && !store.run.over) actions.push({ label: "Restart this stage", cls: "btn-outline btn-sm", fn: restartStage });
    actions.push({ label: "Reset all progress", cls: "btn-outline btn-sm", fn: confirmReset });
    actions.push({ label: "Close", cls: "btn-text", fn: null });
    sheet({ title: "Settings", body: "Your games, best score and streak are saved on this phone.", actions, dismissable: true });
  });

  function restartStage() {
    const r = store.run;
    const fresh = makeGame("run", r.stage, r.initial.split("").map(Number), r.stageStart);
    store.run = pack(fresh);
    save();
    renderHome();
    toast("Stage " + r.stage + " restarted");
  }

  function confirmReset() {
    sheet({
      title: "Reset everything?",
      body: "Your best score, daily streak and saved games will be deleted.",
      actions: [
        { label: "Reset", cls: "btn-flame", fn: () => { store = Object.assign({}, defaults); save(); renderHome(); toast("Progress reset"); } },
        { label: "Cancel", cls: "btn-outline btn-sm", fn: null },
      ],
      dismissable: true,
    });
  }

  // ---------- Game ----------
  const boardEl = $("board");
  const scrollEl = $("board-scroll");

  function renderGame(effects) {
    $("game-stage").textContent = g.mode === "daily" ? "DAILY · " + shortDate(g.date) : "STAGE " + g.stage;
    $("game-score").textContent = fmt(g.score);
    const left = T.liveCount(g.cells);
    $("game-left").textContent = left;
    $("game-bar").style.width = Math.max(2, Math.round((1 - left / Math.max(g.total, left)) * 100)) + "%";
    $("game-adds").textContent = g.adds;
    $("game-add").classList.toggle("empty", g.adds <= 0);
    $("game-add").setAttribute("aria-label", "Add numbers, " + g.adds + " left");
    $("game-undo").disabled = g.history.length === 0;
    renderBoard(g.cells, effects || {});
  }

  // effects: { index: "extra classes" } for one-off animations
  function renderBoard(cells, effects) {
    let html = "";
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      let cls = "cell";
      if (c.g) cls += " used";
      else if (i === sel) cls += " sel";
      else if (hint && (i === hint[0] || i === hint[1])) cls += " hint";
      if (effects[i]) cls += " " + effects[i];
      const delay = effects[i] && effects[i].includes("fresh") ? ' style="animation-delay:' + Math.min((i % 60) * 12, 500) + 'ms"' : "";
      html += '<button type="button" class="' + cls + '" data-i="' + i + '"' + delay +
        ' aria-label="' + (c.g ? "Used " : "Number ") + c.v + '"' + (c.g ? ' tabindex="-1"' : "") + ">" + c.v + "</button>";
    }
    boardEl.innerHTML = html;
  }

  boardEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".cell");
    if (!btn || busy || !g || g.over || g.done) return;
    tap(Number(btn.dataset.i));
  });

  function tap(i) {
    if (g.cells[i].g) return;
    if (sel === null || sel === i) {
      sel = sel === i ? null : i;
      renderBoard(g.cells, {});
      return;
    }
    if (!T.canPair(g.cells, sel, i)) {
      sel = i;
      renderBoard(g.cells, { [i]: "nope" });
      return;
    }

    snapshot();
    const a = sel, b = i;
    sel = null; hint = null;
    const res = T.play(g.cells, a, b);
    g.cells = res.cells;
    g.pairs += 1;
    g.score += res.points;
    persist();
    buzz();
    bumpScore();

    if (res.rows.length) {
      const fx = { [a]: "pop", [b]: "pop" };
      for (const r of res.rows) for (let k = r * T.COLS; k < r * T.COLS + T.COLS; k++) fx[k] = (fx[k] ? fx[k] + " " : "") + "gone";
      busy = true;
      renderGame();
      renderBoard(res.crossed, fx);
      toast(res.rows.length > 1 ? res.rows.length + " rows cleared +" + res.rows.length * 10 : "Row cleared +10");
      setTimeout(() => { busy = false; renderBoard(g.cells, {}); afterMove(); }, 520);
    } else {
      renderGame({ [a]: "pop", [b]: "pop" });
      afterMove();
    }
  }

  function afterMove() {
    if (g.cells.length === 0) return boardCleared();
    if (!T.findPair(g.cells)) {
      if (g.adds > 0) toast("No pairs left. Tap Add.");
      else gameOver();
    }
  }

  function bumpScore() {
    const el = $("game-score");
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }

  function buzz() {
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* not supported */ } }
  }

  $("game-undo").addEventListener("click", () => {
    if (busy || !g || g.done) return;
    const prev = g.history.pop();
    if (!prev) { toast("Nothing to undo"); return; }
    g.cells = T.decode(prev.c);
    g.adds = prev.adds; g.score = prev.score; g.pairs = prev.pairs; g.addsUsed = prev.addsUsed; g.total = prev.total;
    g.over = false;
    sel = null; hint = null;
    hideSheet();
    startClock();
    persist();
    renderGame();
  });

  $("game-hint").addEventListener("click", () => {
    if (busy || !g || g.over || g.done) return;
    const p = T.findPair(g.cells, hintFrom);
    if (!p) {
      if (g.adds > 0) toast("No pairs left. Tap Add.");
      else gameOver();
      return;
    }
    hint = p; hintFrom = p[0] + 1; sel = null;
    renderBoard(g.cells, {});
    const el = boardEl.children[p[0]];
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  });

  $("game-add").addEventListener("click", () => {
    if (busy || !g || g.over || g.done) return;
    if (g.adds <= 0) { toast("No adds left"); return; }
    snapshot();
    const before = g.cells.length;
    g.cells = T.addNumbers(g.cells);
    const extra = g.cells.length - before;
    g.total += extra; g.adds -= 1; g.addsUsed += 1;
    sel = null; hint = null;
    persist();
    const fx = {};
    for (let k = before; k < g.cells.length; k++) fx[k] = "fresh";
    renderGame(fx);
    requestAnimationFrame(() => scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: "smooth" }));
    toast("Added " + extra + " numbers");
    if (!T.findPair(g.cells) && g.adds === 0) setTimeout(gameOver, 600);
  });

  $("game-back").addEventListener("click", () => { hideSheet(); show("home"); });
  $("game-help").addEventListener("click", () => { rulesReturn = "game"; show("rules"); });

  // ---------- End of a board ----------
  function boardCleared() {
    stopClock();
    g.done = true;
    const result = {
      mode: g.mode, stage: g.stage, date: g.date, score: g.score, pairs: g.pairs,
      addsUsed: g.addsUsed, time: g.elapsed, newBest: false, best: store.best, streak: 0,
    };
    if (g.mode === "run") {
      if (g.score > store.best) { store.best = g.score; result.newBest = true; }
      result.best = store.best;
      // Move the saved run on to the next stage straight away, so closing the app here is safe.
      store.run = pack(makeGame("run", g.stage + 1, T.stageBoard(g.stage + 1), g.score));
      g = null; // the finished board must not be saved back over the next stage
    } else {
      store.daily = pack(g);
      const key = today();
      if (store.lastDaily !== key) {
        store.streak = (store.lastDaily === yesterday() ? store.streak : 0) + 1;
        store.lastDaily = key;
      }
      result.streak = store.streak;
    }
    store.result = result;
    save();
    buzz();
    setTimeout(() => {
      sheet({ title: "Board cleared", actions: [{ label: "See results", cls: "btn-flame", fn: showWin }] });
    }, 250);
  }

  function gameOver() {
    if (!g || g.over) return;
    stopClock();
    g.over = true;
    let newBest = false;
    if (g.mode === "run" && g.score > store.best) { store.best = g.score; newBest = true; }
    persist();
    gameOverSheet(newBest);
  }

  function gameOverSheet(newBest) {
    const where = g.mode === "daily" ? "today's daily" : "stage " + g.stage;
    const actions = [];
    if (g.mode === "daily") {
      actions.push({ label: "Try again", cls: "btn-flame", fn: () => {
        store.daily = pack(makeGame("daily", 0, g.initial.split("").map(Number), 0, g.date));
        save();
        openGame("daily");
      } });
    } else {
      actions.push({ label: "New game", cls: "btn-flame", fn: newRun });
    }
    if (g.history.length) actions.push({ label: "Undo last move", cls: "btn-outline btn-sm", fn: () => $("game-undo").click() });
    actions.push({ label: "Home", cls: "btn-text", fn: () => show("home") });
    sheet({
      title: "No moves left",
      body: "No pairs and no adds left. You scored <b>" + fmt(g.score) + "</b> on " + where + "." + (newBest ? " That's a new best!" : ""),
      actions,
    });
  }

  // ---------- Board cleared screen ----------
  (function buildConfetti() {
    const cols = ["#FF4F1A", "#FF8B2B", "#F1DFC3", "#B9471A", "#E3261B"];
    let html = "";
    for (let i = 0; i < 34; i++) {
      const x = ((i * 97 + 23) % 370 + 6) / 390 * 100;
      const y = (i * 53 + 11) % 170 + 40;
      const s = 6 + (i * 7) % 12;
      html += '<div style="left:' + x.toFixed(2) + "%;top:" + y + "px;width:" + s + "px;height:" + s +
        "px;background:" + cols[i % cols.length] + ";animation-delay:" + ((i * 37) % 20) / 10 + 's"></div>';
    }
    $("confetti").innerHTML = html;
  })();

  function formatTime(ms) {
    const s = Math.round(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, "0");
    return h ? h + ":" + String(m).padStart(2, "0") + ":" + sec : m + ":" + sec;
  }

  function showWin() {
    const r = store.result;
    if (!r) { show("home"); return; }
    const daily = r.mode === "daily";
    $("win-label").textContent = daily ? "DAILY · " + shortDate(r.date) + " COMPLETE" : "STAGE " + r.stage + " COMPLETE";
    $("win-score").textContent = fmt(r.score);
    $("win-best").innerHTML = daily ? "STREAK<br>" + days(r.streak).toUpperCase() : "BEST<br>" + fmt(r.best);
    const sticker = $("win-best-sticker");
    sticker.hidden = daily ? r.streak < 2 : !r.newBest;
    sticker.textContent = daily ? r.streak + " day streak" : "New best";
    $("win-pairs").textContent = r.pairs;
    $("win-adds").textContent = r.addsUsed + " of " + T.ADDS;
    $("win-time").textContent = formatTime(r.time);
    $("win-next").firstChild.textContent = daily ? "Play stages " : "Next stage ";
    show("win");
  }

  $("win-next").addEventListener("click", continueRun);
  $("win-home").addEventListener("click", () => show("home"));

  // ---------- How to play ----------
  $("rules-close").addEventListener("click", () => show(rulesReturn));
  $("rules-play").addEventListener("click", () => {
    if (rulesReturn === "game" && g) show("game");
    else continueRun();
  });

  // ---------- Sheet & toast ----------
  const sheetEl = $("sheet");
  let sheetDismissable = false;

  function sheet({ title, body, actions, dismissable }) {
    $("sheet-title").textContent = title;
    $("sheet-body").innerHTML = body || "";
    const wrap = $("sheet-actions");
    wrap.innerHTML = "";
    for (const a of actions) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn " + a.cls;
      b.textContent = a.label;
      b.addEventListener("click", () => { hideSheet(); if (a.fn) a.fn(); });
      wrap.appendChild(b);
    }
    sheetDismissable = !!dismissable;
    sheetEl.hidden = false;
  }

  function hideSheet() { sheetEl.hidden = true; }

  sheetEl.addEventListener("click", (e) => { if (e.target === sheetEl && sheetDismissable) hideSheet(); });

  let toastTimer = null;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
  }

  // ---------- App lifecycle ----------
  document.addEventListener("visibilitychange", () => {
    if (current !== "game") return;
    if (document.hidden) { stopClock(); persist(); } else startClock();
  });
  window.addEventListener("pagehide", () => { if (current === "game") persist(); });

  // Stop pinch zoom and double-tap zoom in iOS Safari.
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  let lastTouch = 0;
  document.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouch < 300 && e.target.closest(".board, .bottom-bar")) e.preventDefault();
    lastTouch = now;
  }, { passive: false });

  show("home");

  // Offline support. Skipped on localhost so edits show up straight away while developing.
  const local = ["localhost", "127.0.0.1", ""].includes(location.hostname);
  if ("serviceWorker" in navigator && !local) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    // When a new version takes over, reload once so it shows straight away (not on the very first install).
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      if (current === "game") persist();
      location.reload();
    });
  }
})();
