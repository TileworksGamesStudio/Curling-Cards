(function () {
  "use strict";

  // Configuration Constants
  const STORAGE_KEY = "universal_sequence_puzzle_state_v1";
  const HOME_URL = "https://tileworksgamesstudio.github.io/Curling-Menu/"; // REPLACE_WITH_HOME_URL: Destination provided by project owner
  const MAX_ATTEMPTS = 4;
  const SLOTS_COUNT = 5;

  // Application State
  const AppState = {
    puzzles: [],
    todayPuzzle: null,
    activePuzzle: null,
    isArchiveMode: false,
    selectedSlot: 0,
    currentDraft: [null, null, null, null, null],
    lockedSlots: [false, false, false, false, false],
    attemptsUsed: 0,
    isCompleted: false,
    isWon: false,
    historyGrid: [],
    store: loadStorage()
  };

  // DOM Elements Cache
  const DOM = {
    headerBackBtn: document.getElementById("header-back-btn"),
    headerTitle: document.getElementById("header-title"),
    btnStats: document.getElementById("btn-stats"),
    btnRules: document.getElementById("btn-rules"),
    viewMenu: document.getElementById("view-menu"),
    viewGame: document.getElementById("view-game"),
    viewVault: document.getElementById("view-vault"),
    menuTodayDate: document.getElementById("menu-today-date"),
    menuTodayTitle: document.getElementById("menu-today-title"),
    menuTodayStatus: document.getElementById("menu-today-status"),
    btnPlayToday: document.getElementById("btn-play-today"),
    menuArchiveCount: document.getElementById("menu-archive-count"),
    btnViewVault: document.getElementById("btn-view-vault"),
    btnNavHome: document.getElementById("btn-nav-home"),
    gameDateBadge: document.getElementById("game-date-badge"),
    gameAttemptsBadge: document.getElementById("game-attempts-badge"),
    hintStatusIndicator: document.getElementById("hint-status-indicator"),
    hintStatusText: document.getElementById("hint-status-text"),
    slots: document.querySelectorAll(".slot"),
    gameClue: document.getElementById("game-clue"),
    hintBox: document.getElementById("hint-box"),
    hintText: document.getElementById("hint-text"),
    itemsPool: document.getElementById("items-pool"),
    btnClear: document.getElementById("btn-clear"),
    btnSubmit: document.getElementById("btn-submit"),
    vaultList: document.getElementById("vault-list"),
    modalResult: document.getElementById("modal-result"),
    btnCloseResult: document.getElementById("btn-close-result"),
    resultTitle: document.getElementById("result-title"),
    resultSubtitle: document.getElementById("result-subtitle"),
    resultGrid: document.getElementById("result-grid"),
    resultSolutionList: document.getElementById("result-solution-list"),
    resultNotes: document.getElementById("result-notes"),
    btnShare: document.getElementById("btn-share"),
    btnResultVault: document.getElementById("btn-result-vault"),
    btnResultMenu: document.getElementById("btn-result-menu"),
    modalRules: document.getElementById("modal-rules"),
    btnCloseRules: document.getElementById("btn-close-rules"),
    btnRulesOk: document.getElementById("btn-rules-ok"),
    modalStats: document.getElementById("modal-stats"),
    btnCloseStats: document.getElementById("btn-close-stats"),
    statPlayed: document.getElementById("stat-played"),
    statWinRate: document.getElementById("stat-win-rate"),
    statStreak: document.getElementById("stat-streak"),
    statMaxStreak: document.getElementById("stat-max-streak"),
    statsDistribution: document.getElementById("stats-distribution"),
    toast: document.getElementById("toast"),
    ambientCanvas: document.getElementById("ambient-curling-canvas")
  };

  // Safe Storage Management
  function loadStorage() {
    const fallback = {
      version: 1,
      stats: { played: 0, won: 0, currentStreak: 0, maxStreak: 0, dist: { 1: 0, 2: 0, 3: 0, 4: 0 } },
      history: {}
    };
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return fallback;
      const parsed = JSON.parse(data);
      if (!parsed || typeof parsed !== "object") return fallback;
      return {
        version: parsed.version || 1,
        stats: Object.assign({}, fallback.stats, parsed.stats || {}),
        history: parsed.history || {}
      };
    } catch (err) {
      return fallback;
    }
  }

  function saveStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(AppState.store));
    } catch (e) {
      // Storage quota or disabled fallback
    }
  }

  // Robust CSV Parser
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let val = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const next = text[i + 1];
      if (c === '"' && inQuotes && next === '"') {
        val += '"';
        i++;
      } else if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === "," && !inQuotes) {
        row.push(val.trim());
        val = "";
      } else if ((c === "\n" || (c === "\r" && next === "\n")) && !inQuotes) {
        if (c === "\r") i++;
        row.push(val.trim());
        rows.push(row);
        row = [];
        val = "";
      } else {
        val += c;
      }
    }
    if (val !== "" || (row.length > 0 && text[text.length - 1] === ",")) {
      row.push(val.trim());
    }
    if (row.length > 0) rows.push(row);
    return rows;
  }

  function shuffle(arr) {
    const res = arr.slice();
    for (let i = res.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = res[i];
      res[i] = res[j];
      res[j] = tmp;
    }
    return res;
  }

  function formatLocalYYYYMMDD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  let toastTimer = null;
  function showToast(msg) {
    if (toastTimer) clearTimeout(toastTimer);
    DOM.toast.textContent = msg;
    DOM.toast.classList.remove("hidden");
    toastTimer = setTimeout(() => {
      DOM.toast.classList.add("hidden");
    }, 2400);
  }

  // ==========================================================================
  // LIGHTWEIGHT WEB AUDIO TACTILE SYNTHESIZER
  // Completely safe: Initialised strictly on user gesture with silent fallback
  // ==========================================================================
  let audioCtx = null;
  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }

  function playTactileTone(type) {
    if (!audioCtx) return;
    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === "tap") {
        // Crisp stone contact tap
        osc.type = "sine";
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.04);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (type === "place") {
        // Solid stone placed in slot
        osc.type = "triangle";
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(360, now + 0.07);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        osc.start(now);
        osc.stop(now + 0.07);
      } else if (type === "hit") {
        // High-end two-tone curling bell chime
        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880, now + 0.08); // A5
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.28);
      } else if (type === "miss") {
        // Muted low rink tone
        osc.type = "sine";
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.12);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      }
    } catch (e) {
      // Audio fails silently without interrupting gameplay
    }
  }

  // ==========================================================================
  // AMBIENT BACKGROUND: 12 CURLING ICONS + CANADIAN MAPLE LEAF SYSTEM
  // ==========================================================================
  const CURLING_ICONS = [
    "icon-curling-stone",
    "icon-curling-house",
    "icon-curling-broom",
    "icon-brush-head",
    "icon-hack",
    "icon-stone-handle",
    "icon-hog-line",
    "icon-back-line",
    "icon-centre-line",
    "icon-ice-pebble",
    "icon-scoreboard-end",
    "icon-curling-skip"
  ];

  function initCurlingBackground() {
    if (!DOM.ambientCanvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Maintain 12 to 16 floating entities with varied depth and trajectory
    const isMobile = window.innerWidth < 480;
    const maxEntities = isMobile ? 8 : 14;

    for (let i = 0; i < maxEntities; i++) {
      spawnCurlingEntity(true);
    }

    setInterval(() => {
      if (document.hidden) return;
      const count = DOM.ambientCanvas.childElementCount;
      if (count < maxEntities) {
        spawnCurlingEntity(false);
      }
    }, 2800);
  }

  function spawnCurlingEntity(initialSeed) {
    const el = document.createElement("div");
    el.className = "ambient-curling-entity";

    // 25% chance of spawning the authoritative Canadian Maple Leaf, 75% curling icons
    const isMaple = Math.random() < 0.25;
    let iconId = "";
    let viewBox = "0 0 100 100";

    if (isMaple) {
      iconId = "icon-maple-leaf";
      viewBox = "0 0 298.72 341.12";
      el.classList.add("leaf");
    } else {
      iconId = CURLING_ICONS[Math.floor(Math.random() * CURLING_ICONS.length)];
    }

    // Assign to one of 3 depth layers
    const depthRoll = Math.random();
    let depthClass = "depth-mid";
    let size = 32 + Math.random() * 24;
    let duration = 24 + Math.random() * 18;
    let baseOpacity = 0.10;

    if (depthRoll < 0.35) {
      depthClass = "depth-far";
      size = 20 + Math.random() * 14;
      duration = 34 + Math.random() * 20;
      baseOpacity = 0.06;
    } else if (depthRoll > 0.8) {
      depthClass = "depth-near";
      size = 46 + Math.random() * 26;
      duration = 18 + Math.random() * 12;
      baseOpacity = 0.16;
    }

    el.classList.add(depthClass);
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;

    el.innerHTML = `
      <svg viewBox="${viewBox}" aria-hidden="true" focusable="false">
        <use href="#${iconId}" />
      </svg>
    `;

    const startX = Math.random() * 92; // 0% to 92vw
    const driftX = (Math.random() - 0.5) * 16;
    const startY = initialSeed ? Math.random() * 100 : 108; // start below or scattered
    const endY = -18;
    const startRot = Math.random() * 360;
    const endRot = startRot + (Math.random() - 0.5) * 180;

    el.style.left = `${startX}vw`;
    el.style.top = `${startY}vh`;
    el.style.opacity = `${baseOpacity}`;

    DOM.ambientCanvas.appendChild(el);

    // Coordinate smooth upward glide
    const startTime = performance.now();
    const remainingFraction = initialSeed ? (startY - endY) / (108 - endY) : 1;
    const activeDuration = duration * remainingFraction * 1000;

    function glide(time) {
      const elapsed = time - startTime;
      const p = Math.min(1, elapsed / activeDuration);
      const currentY = startY - p * (startY - endY);
      const currentX = startX + p * driftX;
      const currentRot = startRot + p * (endRot - startRot);

      el.style.transform = `translate(${currentX - startX}vw, ${currentY - startY}vh) rotate(${currentRot}deg)`;

      if (p < 1 && el.parentNode) {
        requestAnimationFrame(glide);
      } else {
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    }
    requestAnimationFrame(glide);
  }

  // Navigation Controller
  function showView(viewId) {
    DOM.viewMenu.classList.add("hidden");
    DOM.viewGame.classList.add("hidden");
    DOM.viewVault.classList.add("hidden");

    if (viewId === "menu") {
      DOM.headerBackBtn.classList.add("hidden");
      DOM.headerTitle.textContent = "SEQUENCE";
      DOM.viewMenu.classList.remove("hidden");
      renderMenu();
    } else if (viewId === "game") {
      DOM.headerBackBtn.classList.remove("hidden");
      DOM.headerTitle.textContent = AppState.activePuzzle.title;
      DOM.viewGame.classList.remove("hidden");
    } else if (viewId === "vault") {
      DOM.headerBackBtn.classList.remove("hidden");
      DOM.headerTitle.textContent = "VAULT";
      DOM.viewVault.classList.remove("hidden");
      renderVault();
    }
    window.scrollTo(0, 0);
  }

  // Application Initialization
  async function init() {
    DOM.btnNavHome.setAttribute("href", HOME_URL);
    initCurlingBackground();

    try {
      const res = await fetch("puzzles.csv");
      if (!res.ok) throw new Error("Unable to load puzzles source.");
      const text = await res.text();
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error("Dataset is empty or malformed.");

      const header = rows[0];
      const rawList = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (r.length < header.length) continue;
        const p = {};
        header.forEach((k, idx) => (p[k] = r[idx]));
        rawList.push(p);
      }

      AppState.puzzles = rawList.map((p) => {
        const slots = [];
        const pool = [];
        for (let s = 1; s <= SLOTS_COUNT; s++) {
          const name = p[`slot_${s}_name`] || `Step ${s}`;
          const answer = p[`slot_${s}_answer`] || `Answer ${s}`;
          const decoy = p[`slot_${s}_decoy`] || `Decoy ${s}`;
          slots.push({ slotIndex: s - 1, name, answer });
          pool.push({ id: `${p.date}-c-${s}`, text: answer, slotIndex: s - 1 });
          pool.push({ id: `${p.date}-d-${s}`, text: decoy, slotIndex: null });
        }
        return {
          date: p.date,
          title: p.title || "Sequence Challenge",
          clue: p.clue || "Determine the proper sequence.",
          hint: p.hint || "Review the step names and logical progression.",
          notes: p.notes || "",
          slots,
          pool
        };
      });

      AppState.puzzles.sort((a, b) => a.date.localeCompare(b.date));

      const todayStr = formatLocalYYYYMMDD(new Date());
      let available = AppState.puzzles.filter((p) => p.date <= todayStr);
      if (available.length === 0) available = [AppState.puzzles[0]];

      AppState.todayPuzzle = available[available.length - 1];

      bindEvents();
      showView("menu");
    } catch (err) {
      createFallbackPuzzle();
      bindEvents();
      showView("menu");
    }
  }

  function createFallbackPuzzle() {
    const today = formatLocalYYYYMMDD(new Date());
    const fallback = {
      date: today,
      title: "Solar System Distance",
      clue: "Order the celestial bodies from nearest to farthest from the Sun.",
      hint: "Earth is the third rock from the Sun; Mercury is first.",
      notes: "Standard astronomical ordering from Sol outwards.",
      slots: [
        { slotIndex: 0, name: "1st From Sun", answer: "Mercury" },
        { slotIndex: 1, name: "2nd From Sun", answer: "Venus" },
        { slotIndex: 2, name: "3rd From Sun", answer: "Earth" },
        { slotIndex: 3, name: "4th From Sun", answer: "Mars" },
        { slotIndex: 4, name: "5th From Sun", answer: "Jupiter" }
      ],
      pool: [
        { id: "fb-c-1", text: "Mercury", slotIndex: 0 },
        { id: "fb-d-1", text: "Pluto", slotIndex: null },
        { id: "fb-c-2", text: "Venus", slotIndex: 1 },
        { id: "fb-d-2", text: "Moon", slotIndex: null },
        { id: "fb-c-3", text: "Earth", slotIndex: 2 },
        { id: "fb-d-3", text: "Ceres", slotIndex: null },
        { id: "fb-c-4", text: "Mars", slotIndex: 3 },
        { id: "fb-d-4", text: "Titan", slotIndex: null },
        { id: "fb-c-5", text: "Jupiter", slotIndex: 4 },
        { id: "fb-d-5", text: "Saturn", slotIndex: null }
      ]
    };
    AppState.puzzles = [fallback];
    AppState.todayPuzzle = fallback;
  }

  // Menu View Controller
  function renderMenu() {
    const today = AppState.todayPuzzle;
    if (!today) return;

    DOM.menuTodayDate.textContent = today.date;
    DOM.menuTodayTitle.textContent = today.title;

    const record = AppState.store.history[today.date];
    if (record && record.completed) {
      DOM.menuTodayStatus.textContent = record.won
        ? `Status: Solved in End ${record.attemptsUsed} (${record.attemptsUsed}/${MAX_ATTEMPTS})`
        : "Status: Completed (Unsolved)";
      DOM.btnPlayToday.textContent = "Review Result";
    } else if (record && record.attemptsUsed > 0) {
      DOM.menuTodayStatus.textContent = `Status: In Progress (${record.attemptsUsed}/${MAX_ATTEMPTS} ends)`;
      DOM.btnPlayToday.textContent = "Resume Daily Puzzle";
    } else {
      DOM.menuTodayStatus.textContent = "Status: Ready on ice";
      DOM.btnPlayToday.textContent = "Play Daily Puzzle";
    }

    const pastPuzzles = AppState.puzzles.filter((p) => p.date < today.date);
    DOM.menuArchiveCount.textContent = `${pastPuzzles.length} puzzle${pastPuzzles.length === 1 ? "" : "s"}`;
  }

  // Gameplay Setup
  function startPuzzle(puzzle, isArchive = false) {
    initAudio();
    AppState.activePuzzle = puzzle;
    AppState.isArchiveMode = isArchive;
    AppState.selectedSlot = 0;

    const record = AppState.store.history[puzzle.date];
    if (record) {
      AppState.isCompleted = !!record.completed;
      AppState.isWon = !!record.won;
      AppState.attemptsUsed = record.attemptsUsed || 0;
      AppState.lockedSlots = Array.isArray(record.lockedSlots)
        ? record.lockedSlots.slice()
        : [false, false, false, false, false];
      AppState.currentDraft = Array.isArray(record.draft)
        ? record.draft.slice()
        : [null, null, null, null, null];
      AppState.historyGrid = Array.isArray(record.historyGrid)
        ? record.historyGrid.slice()
        : [];
    } else {
      AppState.isCompleted = false;
      AppState.isWon = false;
      AppState.attemptsUsed = 0;
      AppState.lockedSlots = [false, false, false, false, false];
      AppState.currentDraft = [null, null, null, null, null];
      AppState.historyGrid = [];
    }

    DOM.gameDateBadge.textContent = puzzle.date;
    DOM.gameClue.textContent = puzzle.clue;

    if (!puzzle.shuffledPool) {
      puzzle.shuffledPool = shuffle(puzzle.pool);
    }

    const firstFree = AppState.lockedSlots.findIndex((l) => !l);
    AppState.selectedSlot = firstFree !== -1 ? firstFree : 0;

    renderGameStatus();
    renderSlots();
    renderPool();
    showView("game");
  }

  // Render Status & Feedback
  function renderGameStatus() {
    const left = MAX_ATTEMPTS - AppState.attemptsUsed;
    DOM.gameAttemptsBadge.textContent = `Attempts: ${left} / ${MAX_ATTEMPTS}`;

    const hintAvailable = AppState.attemptsUsed >= 2 || AppState.isCompleted;
    if (hintAvailable) {
      DOM.hintBox.classList.remove("hidden");
      DOM.hintText.textContent = AppState.activePuzzle.hint;
      DOM.hintStatusIndicator.classList.remove("hidden");
    } else {
      DOM.hintBox.classList.add("hidden");
      DOM.hintStatusIndicator.classList.add("hidden");
    }

    if (AppState.isCompleted) {
      DOM.btnSubmit.textContent = "View Summary";
      DOM.btnClear.classList.add("hidden");
    } else {
      DOM.btnSubmit.textContent = "Submit Sequence";
      DOM.btnClear.classList.remove("hidden");
    }
  }

  function renderSlots() {
    DOM.slots.forEach((el, idx) => {
      const slotDef = AppState.activePuzzle.slots[idx];
      el.querySelector(".slot-name").textContent = slotDef.name;
      el.classList.remove("active", "locked");

      const valHolder = el.querySelector(".slot-value");
      valHolder.innerHTML = "";

      if (AppState.lockedSlots[idx]) {
        el.classList.add("locked");
        valHolder.textContent = slotDef.answer;
      } else if (AppState.currentDraft[idx]) {
        valHolder.textContent = AppState.currentDraft[idx].text;
      } else {
        valHolder.innerHTML = '<span class="placeholder">Empty</span>';
      }

      if (!AppState.isCompleted && !AppState.lockedSlots[idx] && idx === AppState.selectedSlot) {
        el.classList.add("active");
      }
    });
  }

  function renderPool() {
    DOM.itemsPool.innerHTML = "";
    const placedIds = new Set(AppState.currentDraft.filter(Boolean).map((t) => t.id));

    AppState.activePuzzle.shuffledPool.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "item-tile";
      btn.textContent = item.text;

      if (placedIds.has(item.id)) {
        btn.classList.add("used");
        btn.setAttribute("aria-disabled", "true");
      } else {
        btn.addEventListener("click", () => handleTileClick(item));
      }
      DOM.itemsPool.appendChild(btn);
    });
  }

  // User Interactions
  function handleTileClick(item) {
    if (AppState.isCompleted) return;
    playTactileTone("place");

    let target = AppState.selectedSlot;
    if (AppState.lockedSlots[target]) {
      target = AppState.lockedSlots.findIndex((l) => !l);
    }
    if (target === -1) return;

    AppState.currentDraft[target] = item;

    // Advance selection
    let next = -1;
    for (let i = 0; i < SLOTS_COUNT; i++) {
      if (!AppState.lockedSlots[i] && !AppState.currentDraft[i]) {
        next = i;
        break;
      }
    }
    AppState.selectedSlot = next !== -1 ? next : target;

    renderSlots();
    renderPool();
  }

  function handleSlotClick(idx) {
    if (AppState.isCompleted || AppState.lockedSlots[idx]) return;
    playTactileTone("tap");

    if (AppState.currentDraft[idx]) {
      AppState.currentDraft[idx] = null;
      AppState.selectedSlot = idx;
    } else {
      AppState.selectedSlot = idx;
    }
    renderSlots();
    renderPool();
  }

  function clearDraft() {
    if (AppState.isCompleted) return;
    playTactileTone("tap");
    for (let i = 0; i < SLOTS_COUNT; i++) {
      if (!AppState.lockedSlots[i]) AppState.currentDraft[i] = null;
    }
    const firstFree = AppState.lockedSlots.findIndex((l) => !l);
    AppState.selectedSlot = firstFree !== -1 ? firstFree : 0;
    renderSlots();
    renderPool();
  }

  function submitAttempt() {
    initAudio();
    if (AppState.isCompleted) {
      openResultModal();
      return;
    }

    for (let i = 0; i < SLOTS_COUNT; i++) {
      if (!AppState.lockedSlots[i] && !AppState.currentDraft[i]) {
        showToast("Deliver all 5 items to the sheet before submitting.");
        playTactileTone("miss");
        return;
      }
    }

    AppState.attemptsUsed++;
    const rowResult = [];
    let hasIncorrect = false;

    for (let i = 0; i < SLOTS_COUNT; i++) {
      if (AppState.lockedSlots[i]) {
        rowResult.push("hit");
        continue;
      }
      const item = AppState.currentDraft[i];
      if (item && item.slotIndex === i) {
        AppState.lockedSlots[i] = true;
        rowResult.push("hit");
      } else {
        hasIncorrect = true;
        AppState.currentDraft[i] = null;
        rowResult.push("miss");
        const slotEl = DOM.slots[i];
        slotEl.classList.add("incorrect-flash");
        setTimeout(() => slotEl.classList.remove("incorrect-flash"), 500);
      }
    }

    AppState.historyGrid.push(rowResult);

    const won = AppState.lockedSlots.every(Boolean);
    if (won) {
      playTactileTone("hit");
      AppState.isCompleted = true;
      AppState.isWon = true;
      saveProgress();
      recordStats(true, AppState.attemptsUsed);
      renderGameStatus();
      renderSlots();
      renderPool();
      setTimeout(openResultModal, 400);
      return;
    }

    if (AppState.attemptsUsed >= MAX_ATTEMPTS) {
      playTactileTone("miss");
      AppState.isCompleted = true;
      AppState.isWon = false;
      AppState.lockedSlots = [true, true, true, true, true];
      saveProgress();
      recordStats(false, AppState.attemptsUsed);
      renderGameStatus();
      renderSlots();
      renderPool();
      setTimeout(openResultModal, 400);
      return;
    }

    if (hasIncorrect) {
      playTactileTone("tap");
    }

    const nextFree = AppState.lockedSlots.findIndex((l) => !l);
    AppState.selectedSlot = nextFree !== -1 ? nextFree : 0;
    saveProgress();
    renderGameStatus();
    renderSlots();
    renderPool();
  }

  function saveProgress() {
    AppState.store.history[AppState.activePuzzle.date] = {
      completed: AppState.isCompleted,
      won: AppState.isWon,
      attemptsUsed: AppState.attemptsUsed,
      lockedSlots: AppState.lockedSlots.slice(),
      draft: AppState.currentDraft.slice(),
      historyGrid: AppState.historyGrid.slice()
    };
    saveStorage();
  }

  function recordStats(won, attempts) {
    if (AppState.isArchiveMode) return;
    const s = AppState.store.stats;
    s.played++;
    if (won) {
      s.won++;
      s.currentStreak++;
      if (s.currentStreak > s.maxStreak) s.maxStreak = s.currentStreak;
      if (s.dist[attempts] !== undefined) s.dist[attempts]++;
    } else {
      s.currentStreak = 0;
    }
    saveStorage();
  }

  // Modals & Details
  function openResultModal() {
    const p = AppState.activePuzzle;
    DOM.resultTitle.textContent = AppState.isWon ? "Championship Sequence Solved!" : "Tournament Sheet Complete";
    DOM.resultSubtitle.textContent = `${p.title} (${p.date})`;

    DOM.resultGrid.innerHTML = "";
    AppState.historyGrid.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "result-grid-row";
      row.forEach((cell) => {
        const cellEl = document.createElement("div");
        cellEl.className = `result-grid-cell ${cell}`;
        rowEl.appendChild(cellEl);
      });
      DOM.resultGrid.appendChild(rowEl);
    });

    DOM.resultSolutionList.innerHTML = "";
    p.slots.forEach((s) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${s.name}:</strong> ${s.answer}`;
      DOM.resultSolutionList.appendChild(li);
    });

    DOM.resultNotes.textContent = p.notes || "";
    DOM.modalResult.classList.remove("hidden");
  }

  function openStatsModal() {
    playTactileTone("tap");
    const s = AppState.store.stats;
    DOM.statPlayed.textContent = s.played;
    DOM.statWinRate.textContent = `${s.played > 0 ? Math.round((s.won / s.played) * 100) : 0}%`;
    DOM.statStreak.textContent = s.currentStreak;
    DOM.statMaxStreak.textContent = s.maxStreak;

    DOM.statsDistribution.innerHTML = "";
    const maxVal = Math.max(1, ...Object.values(s.dist));
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      const count = s.dist[i] || 0;
      const pct = Math.max(12, Math.round((count / maxVal) * 100));

      const row = document.createElement("div");
      row.className = "dist-row";
      row.innerHTML = `
        <span style="width:18px;font-weight:900;">${i}</span>
        <div class="dist-bar-bg">
          <div class="dist-bar-fill" style="width:${pct}%">${count}</div>
        </div>
      `;
      DOM.statsDistribution.appendChild(row);
    }
    DOM.modalStats.classList.remove("hidden");
  }

  // Vault Screen
  function renderVault() {
    DOM.vaultList.innerHTML = "";
    const past = AppState.puzzles.filter((p) => p.date < AppState.todayPuzzle.date);
    if (past.length === 0) {
      DOM.vaultList.innerHTML = '<p class="status-text">No previous curling sheets in the vault yet.</p>';
      return;
    }

    past.slice().reverse().forEach((puzzle) => {
      const record = AppState.store.history[puzzle.date];
      const item = document.createElement("div");
      item.className = "vault-item panel-glass-neo";
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");

      let status = "Not Started";
      if (record && record.completed) {
        status = record.won ? `Solved (${record.attemptsUsed}/${MAX_ATTEMPTS})` : "Unsolved";
      }

      item.innerHTML = `
        <div>
          <div class="vault-item-title">${puzzle.title}</div>
          <div class="status-text">${puzzle.date}</div>
        </div>
        <span class="badge ${record && record.completed && record.won ? "badge-accent" : ""}">${status}</span>
      `;

      const onSelect = () => {
        playTactileTone("tap");
        startPuzzle(puzzle, true);
      };
      item.addEventListener("click", onSelect);
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      });

      DOM.vaultList.appendChild(item);
    });
  }

  function copyShareSnippet() {
    initAudio();
    playTactileTone("tap");
    const p = AppState.activePuzzle;
    const score = AppState.isWon ? `${AppState.attemptsUsed}/${MAX_ATTEMPTS}` : "X/4";
    let text = `Sequence ${p.date} — ${score}\n`;
    AppState.historyGrid.forEach((row) => {
      text += row.map((cell) => (cell === "hit" ? "🥌" : "⬜")).join("") + "\n";
    });

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => showToast("Results copied to clipboard."));
    } else {
      showToast("Clipboard unavailable.");
    }
  }

  // Universal Navigation & Event Binding
  function bindEvents() {
    DOM.headerBackBtn.addEventListener("click", () => {
      initAudio();
      playTactileTone("tap");
      showView("menu");
    });

    DOM.btnPlayToday.addEventListener("click", () => {
      initAudio();
      playTactileTone("tap");
      startPuzzle(AppState.todayPuzzle, false);
    });

    DOM.btnViewVault.addEventListener("click", () => {
      initAudio();
      playTactileTone("tap");
      showView("vault");
    });

    DOM.btnStats.addEventListener("click", () => {
      initAudio();
      openStatsModal();
    });

    DOM.btnRules.addEventListener("click", () => {
      initAudio();
      playTactileTone("tap");
      DOM.modalRules.classList.remove("hidden");
    });

    DOM.slots.forEach((el) => {
      const idx = parseInt(el.dataset.slot, 10);
      el.addEventListener("click", () => handleSlotClick(idx));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSlotClick(idx);
        }
      });
    });

    DOM.btnClear.addEventListener("click", clearDraft);
    DOM.btnSubmit.addEventListener("click", submitAttempt);

    DOM.btnCloseResult.addEventListener("click", () => DOM.modalResult.classList.add("hidden"));
    DOM.btnResultMenu.addEventListener("click", () => {
      DOM.modalResult.classList.add("hidden");
      showView("menu");
    });
    DOM.btnResultVault.addEventListener("click", () => {
      DOM.modalResult.classList.add("hidden");
      showView("vault");
    });
    DOM.btnShare.addEventListener("click", copyShareSnippet);

    DOM.btnCloseRules.addEventListener("click", () => DOM.modalRules.classList.add("hidden"));
    DOM.btnRulesOk.addEventListener("click", () => DOM.modalRules.classList.add("hidden"));

    DOM.btnCloseStats.addEventListener("click", () => DOM.modalStats.classList.add("hidden"));

    [DOM.modalResult, DOM.modalRules, DOM.modalStats].forEach((backdrop) => {
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) {
          backdrop.classList.add("hidden");
        }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();