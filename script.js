/**
 * SEQUENCE — CANADIAN CURLING ICE HOUSE ENGINE
 * Universal Game Design System with Full Predictive Background Curling Simulation.
 */

(function () {
  "use strict";

  // ==========================================================================
  // 1. CONSTANTS & CONFIGURATION
  // ==========================================================================
  const STORAGE_KEY = "ice_house_sequence_state_v3";
  const HOME_URL = "https://tileworksgamesstudio.github.io/Curling-Menu/";
  const MAX_ATTEMPTS = 4;
  const SLOTS_COUNT = 5;
  const CANONICAL_TIMEZONE = "Europe/London";

  // ==========================================================================
  // 2. AUTHORITATIVE DAILY RELEASE ENGINE
  // ==========================================================================
  const DailyReleaseEngine = {
    synchronized: false,
    authoritativeOffsetMs: 0,

    async synchronize() {
      const endpoints = [
        async () => {
          const res = await fetch("https://worldtimeapi.org/api/timezone/Etc/UTC", { cache: "no-store" });
          if (!res.ok) throw new Error("WTA");
          const json = await res.json();
          return new Date(json.utc_datetime).getTime();
        },
        async () => {
          const res = await fetch("https://timeapi.io/api/time/current/zone?timeZone=UTC", { cache: "no-store" });
          if (!res.ok) throw new Error("TA");
          const json = await res.json();
          return new Date(json.dateTime).getTime();
        },
        async () => {
          const res = await fetch("puzzles.csv", { method: "HEAD", cache: "no-store" });
          const dateHeader = res.headers.get("Date");
          if (!dateHeader) throw new Error("Header Date");
          return new Date(dateHeader).getTime();
        }
      ];

      for (const fn of endpoints) {
        try {
          const remoteTimeMs = await Promise.race([
            fn(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3200))
          ]);
          if (!isNaN(remoteTimeMs) && remoteTimeMs > 0) {
            this.authoritativeOffsetMs = remoteTimeMs - performance.now();
            this.synchronized = true;
            return true;
          }
        } catch (e) {}
      }

      this.synchronized = false;
      return false;
    },

    getNow() {
      if (this.synchronized) {
        return new Date(performance.now() + this.authoritativeOffsetMs);
      }
      return new Date();
    },

    getCanonicalReleaseDate() {
      const now = this.getNow();
      try {
        const formatter = new Intl.DateTimeFormat("en-CA", {
          timeZone: CANONICAL_TIMEZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        });
        return formatter.format(now);
      } catch (e) {
        return now.toISOString().slice(0, 10);
      }
    }
  };

  // ==========================================================================
  // 3. APPLICATION STATE
  // ==========================================================================
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

  // ==========================================================================
  // 4. DOM REFERENCES
  // ==========================================================================
  const DOM = {
    btnHeaderHome: document.getElementById("btn-header-home"),
    btnHeaderBack: document.getElementById("btn-header-back"),
    headerTitle: document.getElementById("header-title"),
    
    // Views
    viewMenu: document.getElementById("view-menu"),
    viewGame: document.getElementById("view-game"),
    viewVault: document.getElementById("view-vault"),
    viewSettings: document.getElementById("view-settings"),
    
    // Main Menu
    btnMenuPlay: document.getElementById("btn-menu-play"),
    btnPlayLabel: document.getElementById("btn-play-label"),
    menuPlaySub: document.getElementById("menu-play-sub"),
    menuTodayDate: document.getElementById("menu-today-date"),
    btnMenuVault: document.getElementById("btn-menu-vault"),
    menuVaultCount: document.getElementById("menu-vault-count"),
    btnMenuSettings: document.getElementById("btn-menu-settings"),
    btnMenuRules: document.getElementById("btn-menu-rules"),
    
    // Utilities
    btnUtilStats: document.getElementById("btn-util-stats"),
    btnUtilShare: document.getElementById("btn-util-share"),
    btnUtilPlus: document.getElementById("btn-util-plus"),
    
    // Game Board
    gameTitleBadge: document.getElementById("game-title-badge"),
    gameAttemptsBadge: document.getElementById("game-attempts-badge"),
    gameClue: document.getElementById("game-clue"),
    hintBox: document.getElementById("hint-box"),
    hintText: document.getElementById("hint-text"),
    slotsContainer: document.getElementById("slots-container"),
    slots: document.querySelectorAll(".slot"),
    itemsPool: document.getElementById("items-pool"),
    btnClearPool: document.getElementById("btn-clear-pool"),
    btnSubmit: document.getElementById("btn-submit"),
    
    // Vault & Settings
    vaultList: document.getElementById("vault-list"),
    btnAnimOn: document.getElementById("btn-anim-on"),
    btnAnimOff: document.getElementById("btn-anim-off"),
    
    // Overlays & Panels
    panelRulesOverlay: document.getElementById("panel-rules-overlay"),
    sidePanelRules: document.getElementById("side-panel-rules"),
    backdropRules: document.getElementById("backdrop-rules"),
    btnCloseRules: document.getElementById("btn-close-rules"),
    btnRulesConfirm: document.getElementById("btn-rules-confirm"),
    
    // Modals
    modalStats: document.getElementById("modal-stats"),
    btnCloseStats: document.getElementById("btn-close-stats"),
    statPlayed: document.getElementById("stat-played"),
    statWinRate: document.getElementById("stat-win-rate"),
    statStreak: document.getElementById("stat-streak"),
    statMaxStreak: document.getElementById("stat-max-streak"),
    statsDistribution: document.getElementById("stats-distribution"),
    
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
    
    // Feedback & Canvas
    toast: document.getElementById("toast"),
    curlingCanvas: document.getElementById("bg-curling-canvas")
  };

  // ==========================================================================
  // 5. STORAGE SYSTEM
  // ==========================================================================
  function loadStorage() {
    const fallback = {
      version: 3,
      settings: { anim: true },
      stats: { played: 0, won: 0, currentStreak: 0, maxStreak: 0, dist: { 1: 0, 2: 0, 3: 0, 4: 0 } },
      history: {}
    };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return {
        version: 3,
        settings: Object.assign({}, fallback.settings, parsed.settings || {}),
        stats: Object.assign({}, fallback.stats, parsed.stats || {}),
        history: parsed.history || {}
      };
    } catch (e) {
      return fallback;
    }
  }

  function saveStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(AppState.store));
    } catch (e) {}
  }

  // ==========================================================================
  // 6. CSV PARSER & DATA LOADER
  // ==========================================================================
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

  // ==========================================================================
  // 7. TOAST FEEDBACK
  // ==========================================================================
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
  // 8. ROUTING & NAVIGATION
  // ==========================================================================
  function showView(viewId) {
    DOM.viewMenu.classList.add("hidden");
    DOM.viewGame.classList.add("hidden");
    DOM.viewVault.classList.add("hidden");
    DOM.viewSettings.classList.add("hidden");

    if (viewId === "menu") {
      DOM.btnHeaderBack.classList.add("hidden");
      DOM.btnHeaderHome.classList.remove("hidden");
      DOM.headerTitle.innerHTML = '<span class="title-leaf" aria-hidden="true">🍁</span> SEQUENCE';
      DOM.viewMenu.classList.remove("hidden");
      renderMenu();
    } else {
      DOM.btnHeaderHome.classList.add("hidden");
      DOM.btnHeaderBack.classList.remove("hidden");

      if (viewId === "game") {
        DOM.headerTitle.innerHTML = '<span class="title-leaf" aria-hidden="true">🍁</span> SEQUENCE';
        DOM.viewGame.classList.remove("hidden");
      } else if (viewId === "vault") {
        DOM.headerTitle.innerHTML = '<span class="title-leaf" aria-hidden="true">🍁</span> VAULT';
        DOM.viewVault.classList.remove("hidden");
        renderVault();
      } else if (viewId === "settings") {
        DOM.headerTitle.innerHTML = '<span class="title-leaf" aria-hidden="true">🍁</span> SETTINGS';
        DOM.viewSettings.classList.remove("hidden");
        renderSettings();
      }
    }
    window.scrollTo(0, 0);
  }

  // ==========================================================================
  // 9. HOW TO PLAY: RIGHT-TO-LEFT ENTRANCE
  // ==========================================================================
  function openHowToPlay() {
    DOM.panelRulesOverlay.classList.remove("hidden");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        DOM.panelRulesOverlay.classList.add("active");
        DOM.sidePanelRules.focus();
      });
    });
  }

  function closeHowToPlay() {
    DOM.panelRulesOverlay.classList.remove("active");
    setTimeout(() => {
      DOM.panelRulesOverlay.classList.add("hidden");
    }, 380);
  }

  // ==========================================================================
  // 10. CANADIAN CURLING ICE HOUSE BACKGROUND SIMULATION
  // ==========================================================================
  const CurlingSimulation = {
    canvas: null,
    ctx: null,
    width: 0,
    height: 0,
    dpr: 1,

    // Rink house geometry (elevated at ~40% simulation height)
    houseX: 0,
    houseY: 0,
    houseRadius: 160,
    buttonRadius: 24,
    buttonAccuracyRadius: 16,

    // Stone physical characteristics (Identical size)
    stoneRadius: 18,
    stones: [],

    // Simulation state
    turnCount: 0,
    activeStone: null,
    shotScheduleTimer: 0,
    animFrameId: null,
    lastTime: 0,

    // Physics parameters
    DRAG: 0.988,
    ANGULAR_DRAG: 0.982,
    CURL_COEFF: 0.0016,

    init() {
      this.canvas = DOM.curlingCanvas;
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext("2d");
      this.handleResize();
      window.addEventListener("resize", () => this.handleResize());

      // Boot first stone quickly
      this.turnCount = 0;
      this.stones = [];
      this.activeStone = null;
      this.shotScheduleTimer = 0.4;
      this.lastTime = performance.now();
      this.loop(this.lastTime);
    },

    handleResize() {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;

      // Authoritative button position: exactly 40% down from top
      this.houseX = this.width * 0.5;
      this.houseY = this.height * 0.40;
      
      const minDim = Math.min(this.width, this.height);
      this.houseRadius = Math.max(130, Math.min(220, minDim * 0.28));
      this.buttonRadius = this.houseRadius * 0.15;
      this.buttonAccuracyRadius = this.houseRadius * 0.10;
      this.stoneRadius = Math.max(15, Math.min(22, minDim * 0.038));
    },

    scheduleNextTurn() {
      this.turnCount++;
      const isRed = this.turnCount % 2 === 1;
      const color = isRed ? "RED" : "YELLOW";
      const isMega = (this.turnCount % 9 === 0);

      // Pre-roll spawn below viewport
      const spawnY = this.height + this.stoneRadius * 3 + Math.random() * (this.height * 0.15);
      const spawnX = this.houseX + (Math.random() - 0.5) * (this.width * 0.08);

      let targetX = this.houseX;
      let targetY = this.houseY;
      let targetSpeed = 0;
      let spinDir = (this.turnCount % 3 === 0) ? -1 : 1;
      let spinRate = spinDir * (0.8 + Math.random() * 0.6);
      let isLightCurl = (this.turnCount % 2 === 0);

      if (isMega) {
        // Scheduled 9th Stone Mega Takeout
        const targets = this.stones.filter(s => !s.outOfPlay && Math.hypot(s.x - this.houseX, s.y - this.houseY) < this.houseRadius * 1.2);
        if (targets.length > 0) {
          // Find keystone closest to button
          targets.sort((a, b) => Math.hypot(a.x - this.houseX, a.y - this.houseY) - Math.hypot(b.x - this.houseX, b.y - this.houseY));
          targetX = targets[0].x + (Math.random() - 0.5) * (this.stoneRadius * 0.4);
          targetY = targets[0].y;
        } else {
          targetX = this.houseX;
          targetY = this.houseY;
        }
      } else {
        // Button-centric placement
        if (this.turnCount === 1) {
          targetX = this.houseX;
          targetY = this.houseY;
        } else {
          // Select legal pocket close to button
          const settled = this.stones.filter(s => !s.outOfPlay && s.state === "SLEEPING");
          let bestDist = Infinity;
          let bestPocket = { x: this.houseX, y: this.houseY };

          const candidateOffsets = [
            { dx: 0, dy: 0 },
            { dx: this.stoneRadius * 1.8, dy: 0 },
            { dx: -this.stoneRadius * 1.8, dy: 0 },
            { dx: 0, dy: this.stoneRadius * 1.8 },
            { dx: 0, dy: -this.stoneRadius * 1.8 },
            { dx: this.stoneRadius * 1.3, dy: this.stoneRadius * 1.3 },
            { dx: -this.stoneRadius * 1.3, dy: this.stoneRadius * 1.3 }
          ];

          for (const cand of candidateOffsets) {
            const cx = this.houseX + cand.dx;
            const cy = this.houseY + cand.dy;
            const hasConflict = settled.some(s => Math.hypot(s.x - cx, s.y - cy) < this.stoneRadius * 1.9);
            if (!hasConflict) {
              const d = Math.hypot(cand.dx, cand.dy);
              if (d < bestDist) {
                bestDist = d;
                bestPocket = { x: cx, y: cy };
              }
            }
          }
          targetX = bestPocket.x;
          targetY = bestPocket.y;
        }
      }

      // Analytical closed-loop launch velocity solve
      const dy = targetY - spawnY; // negative
      const dx = targetX - spawnX;
      const distance = Math.hypot(dx, dy);

      // Solve forward velocity: integral of v(t) with exponential drag
      // distance ≈ v0 / (1 - DRAG) / 60
      const dragFactor = (1 - this.DRAG) * 60;
      let baseV = (distance * dragFactor) * (isMega ? 2.9 : 1.05);

      let vx = (dx / distance) * baseV;
      let vy = (dy / distance) * baseV;

      // Predict curl compensation: offset launch angle opposite spin
      if (isLightCurl && !isMega) {
        const curlOffset = spinDir * (this.stoneRadius * 1.4);
        vx -= (curlOffset / distance) * (baseV * 0.35);
      }

      const stone = {
        id: `rock-${this.turnCount}`,
        color: color,
        x: spawnX,
        y: spawnY,
        vx: vx,
        vy: vy,
        angle: Math.random() * Math.PI * 2,
        vAngle: spinRate,
        visualAngle: Math.random() * Math.PI * 2,
        visualSpinRate: spinRate,
        mass: 1.0,
        radius: this.stoneRadius,
        state: "IN_FLIGHT", // IN_FLIGHT, SLEEPING, OUT_OF_PLAY
        isMega: isMega,
        isLightCurl: isLightCurl,
        stallWatchdog: 0,
        settleTimer: 0,
        outOfPlay: false
      };

      this.stones.push(stone);
      this.activeStone = stone;
    },

    update(dt) {
      if (!AppState.store.settings.anim) return;

      const subSteps = 6;
      const subDt = dt / subSteps;

      for (let step = 0; step < subSteps; step++) {
        // 1. Position & Motion integration
        for (let i = 0; i < this.stones.length; i++) {
          const s = this.stones[i];
          if (s.outOfPlay || s.state === "SLEEPING") continue;

          // Apply curl lateral force
          const speed = Math.hypot(s.vx, s.vy);
          if (speed > 4 && s.isLightCurl) {
            const sideX = -s.vy / speed;
            const sideY = s.vx / speed;
            const curlAcc = sideX * s.vAngle * this.CURL_COEFF * speed;
            s.vx += curlAcc * subDt * 60;
          }

          // Move
          s.x += s.vx * subDt;
          s.y += s.vy * subDt;

          // Damping
          s.vx *= Math.pow(this.DRAG, subDt * 60);
          s.vy *= Math.pow(this.DRAG, subDt * 60);
          s.vAngle *= Math.pow(this.ANGULAR_DRAG, subDt * 60);
          s.angle += s.vAngle * subDt;
          s.visualAngle += s.visualSpinRate * subDt;
          s.visualSpinRate *= Math.pow(0.985, subDt * 60);

          // Check screen bounds for physical exit
          if (s.x < -this.stoneRadius * 4 || s.x > this.width + this.stoneRadius * 4 || s.y < -this.stoneRadius * 4 || s.y > this.height + this.stoneRadius * 8) {
            s.outOfPlay = true;
            s.state = "OUT_OF_PLAY";
          }
        }

        // 2. Collision Resolution (Circle-to-Circle CCD)
        for (let i = 0; i < this.stones.length; i++) {
          const s1 = this.stones[i];
          if (s1.outOfPlay) continue;

          for (let j = i + 1; j < this.stones.length; j++) {
            const s2 = this.stones[j];
            if (s2.outOfPlay) continue;

            const dx = s2.x - s1.x;
            const dy = s2.y - s1.y;
            const dist = Math.hypot(dx, dy);
            const minDist = s1.radius + s2.radius;

            if (dist < minDist && dist > 0.001) {
              const nx = dx / dist;
              const ny = dy / dist;

              // Overlap separation
              const overlap = (minDist - dist) * 0.5;
              s1.x -= nx * overlap;
              s1.y -= ny * overlap;
              s2.x += nx * overlap;
              s2.y += ny * overlap;

              // Normal impulse
              const kx = s1.vx - s2.vx;
              const ky = s1.vy - s2.vy;
              const p = 2 * (nx * kx + ny * ky) / (s1.mass + s2.mass);

              if (p > 0) {
                const restitution = (s1.isMega || s2.isMega) ? 0.94 : 0.82;
                s1.vx -= p * s2.mass * nx * restitution;
                s1.vy -= p * s2.mass * ny * restitution;
                s2.vx += p * s1.mass * nx * restitution;
                s2.vy += p * s1.mass * ny * restitution;

                // Wake sleeping stone upon meaningful impact
                s1.state = "IN_FLIGHT";
                s2.state = "IN_FLIGHT";
              }
            }
          }
        }
      }

      // 3. Quiescence & Settling Detection
      let boardActive = false;
      for (const s of this.stones) {
        if (s.outOfPlay) continue;
        const speed = Math.hypot(s.vx, s.vy);
        if (speed > 2.0) {
          boardActive = true;
        } else if (s.state === "IN_FLIGHT") {
          s.settleTimer += dt;
          if (s.settleTimer > 0.35) {
            s.vx = 0;
            s.vy = 0;
            s.state = "SLEEPING";
          }
        }

        // Anti-Bottom-Stall Watchdog
        if (s === this.activeStone && s.state === "IN_FLIGHT" && s.y > this.height * 0.82) {
          s.stallWatchdog += dt;
          if (s.stallWatchdog > 2.2 && s.vy > -15) {
            s.vy = -180; // Bounded forward boost
          }
        }
      }

      // 4. Turn Scheduler
      if (!boardActive) {
        this.shotScheduleTimer -= dt;
        if (this.shotScheduleTimer <= 0) {
          this.scheduleNextTurn();
          this.shotScheduleTimer = 1.4; // Controlled cadence dwell
        }
      }
    },

    render() {
      const ctx = this.ctx;
      const w = this.width;
      const h = this.height;

      ctx.save();
      ctx.scale(this.dpr, this.dpr);
      ctx.clearRect(0, 0, w, h);

      // --- Draw Authentic Curling House & Sheet Markings ---
      ctx.save();
      // Centerline
      ctx.strokeStyle = "rgba(18, 59, 114, 0.22)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.houseX, 0);
      ctx.lineTo(this.houseX, h);
      ctx.stroke();

      // Tee Line
      ctx.strokeStyle = "rgba(18, 59, 114, 0.22)";
      ctx.beginPath();
      ctx.moveTo(this.houseX - this.houseRadius * 1.6, this.houseY);
      ctx.lineTo(this.houseX + this.houseRadius * 1.6, this.houseY);
      ctx.stroke();

      // 12-Foot Outer Ring (Royal Blue Tint)
      ctx.beginPath();
      ctx.arc(this.houseX, this.houseY, this.houseRadius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(18, 59, 114, 0.12)";
      ctx.fill();
      ctx.strokeStyle = "rgba(18, 59, 114, 0.4)";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // 8-Foot Ring (Fresh Ice White)
      ctx.beginPath();
      ctx.arc(this.houseX, this.houseY, this.houseRadius * 0.66, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
      ctx.fill();
      ctx.strokeStyle = "rgba(18, 59, 114, 0.35)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // 4-Foot Ring (Deep Red)
      ctx.beginPath();
      ctx.arc(this.houseX, this.houseY, this.houseRadius * 0.33, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(200, 16, 46, 0.16)";
      ctx.fill();
      ctx.strokeStyle = "rgba(200, 16, 46, 0.45)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Button Center (Solid Royal Blue & Red Spot)
      ctx.beginPath();
      ctx.arc(this.houseX, this.houseY, this.buttonRadius * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(18, 59, 114, 0.4)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(this.houseX, this.houseY, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#C8102E";
      ctx.fill();

      ctx.restore();

      // --- Draw Stones (Exact Same Dimensions & Ultra-Fidelity) ---
      for (let i = 0; i < this.stones.length; i++) {
        const s = this.stones[i];
        if (s.outOfPlay) continue;

        const r = s.radius;

        ctx.save();
        ctx.translate(s.x, s.y);

        // Contact Drop Shadow
        ctx.beginPath();
        ctx.ellipse(2, 4, r * 1.05, r * 0.95, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(11, 36, 80, 0.18)";
        ctx.fill();

        // Polished Granite Outer Rim
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        const graniteGrad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r);
        graniteGrad.addColorStop(0, "#EAEFF4");
        graniteGrad.addColorStop(0.65, "#8A9BA8");
        graniteGrad.addColorStop(1, "#445361");
        ctx.fillStyle = graniteGrad;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#25313D";
        ctx.stroke();

        // Team Colored Running Band
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
        const colorGrad = ctx.createRadialGradient(-r * 0.1, -r * 0.1, r * 0.1, 0, 0, r * 0.72);
        if (s.color === "RED") {
          colorGrad.addColorStop(0, "#FF4D6A");
          colorGrad.addColorStop(0.6, "#C8102E");
          colorGrad.addColorStop(1, "#8B0F24");
        } else {
          colorGrad.addColorStop(0, "#FFF185");
          colorGrad.addColorStop(0.6, "#FFD52A");
          colorGrad.addColorStop(1, "#C99A00");
        }
        ctx.fillStyle = colorGrad;
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "rgba(11, 36, 80, 0.6)";
        ctx.stroke();

        // Rotating Handle & Specular Glint
        ctx.rotate(s.visualAngle);
        
        // Handle Mounting Plate
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
        ctx.fillStyle = "#1B2834";
        ctx.fill();

        // 3D Contoured Handle
        ctx.beginPath();
        ctx.roundRect(-r * 0.12, -r * 0.48, r * 0.24, r * 0.96, 3);
        ctx.fillStyle = "#EAEFF4";
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#0B1724";
        ctx.stroke();

        // Handle Highlight
        ctx.beginPath();
        ctx.moveTo(-r * 0.05, -r * 0.35);
        ctx.lineTo(-r * 0.05, r * 0.35);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.restore();
      }

      ctx.restore();
    },

    loop(currentTime) {
      const dt = Math.min((currentTime - this.lastTime) / 1000, 0.05);
      this.lastTime = currentTime;

      this.update(dt);
      this.render();

      this.animFrameId = requestAnimationFrame(t => this.loop(t));
    }
  };

  // ==========================================================================
  // 11. INITIALIZATION & RELEASE PIPELINE
  // ==========================================================================
  async function init() {
    DOM.btnHeaderHome.setAttribute("href", HOME_URL);
    bindEvents();
    CurlingSimulation.init();

    await DailyReleaseEngine.synchronize();

    try {
      const res = await fetch("puzzles.csv");
      if (!res.ok) throw new Error("Network CSV missing");
      const text = await res.text();
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error("Malformed CSV");

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
          hint: p.hint || "Review the progression carefully.",
          notes: p.notes || "",
          slots,
          pool
        };
      });

      AppState.puzzles.sort((a, b) => a.date.localeCompare(b.date));

      const canonicalToday = DailyReleaseEngine.getCanonicalReleaseDate();
      let available = AppState.puzzles.filter((p) => p.date <= canonicalToday);
      if (available.length === 0) available = [AppState.puzzles[0]];

      AppState.todayPuzzle = available[available.length - 1];
      showView("menu");
    } catch (err) {
      createFallbackPuzzle();
      showView("menu");
    }
  }

  function createFallbackPuzzle() {
    const today = DailyReleaseEngine.getCanonicalReleaseDate();
    const fallback = {
      date: today,
      title: "Terrestrial Planets & Asteroids",
      clue: "Arrange the inner planetary zone starting closest to the Sun outward.",
      hint: "Mercury is nearest to the Sun; the main Asteroid Belt bounds the inner solar system.",
      notes: "The inner solar system consists of the four rocky terrestrial planets bounded by the main asteroid belt.",
      slots: [
        { slotIndex: 0, name: "First", answer: "Mercury" },
        { slotIndex: 1, name: "Second", answer: "Venus" },
        { slotIndex: 2, name: "Third", answer: "Earth" },
        { slotIndex: 3, name: "Fourth", answer: "Mars" },
        { slotIndex: 4, name: "Fifth", answer: "Asteroid Belt" }
      ],
      pool: [
        { id: "fb-c-1", text: "Mercury", slotIndex: 0 },
        { id: "fb-d-1", text: "Ceres", slotIndex: null },
        { id: "fb-c-2", text: "Venus", slotIndex: 1 },
        { id: "fb-d-2", text: "Jupiter", slotIndex: null },
        { id: "fb-c-3", text: "Earth", slotIndex: 2 },
        { id: "fb-d-3", text: "Moon", slotIndex: null },
        { id: "fb-c-4", text: "Mars", slotIndex: 3 },
        { id: "fb-d-4", text: "Ganymede", slotIndex: null },
        { id: "fb-c-5", text: "Asteroid Belt", slotIndex: 4 },
        { id: "fb-d-5", text: "Saturn", slotIndex: null }
      ]
    };
    AppState.puzzles = [fallback];
    AppState.todayPuzzle = fallback;
  }

  // ==========================================================================
  // 12. MENU RENDERING
  // ==========================================================================
  function renderMenu() {
    const today = AppState.todayPuzzle;
    if (!today) return;

    DOM.menuTodayDate.textContent = today.date;
    DOM.btnPlayLabel.textContent = "Play Sequence";

    const record = AppState.store.history[today.date];
    if (record && record.completed) {
      DOM.menuPlaySub.textContent = record.won ? `Solved (${record.attemptsUsed}/${MAX_ATTEMPTS})` : "Completed (Unsolved)";
    } else if (record && record.attemptsUsed > 0) {
      DOM.menuPlaySub.textContent = `Resume (${record.attemptsUsed}/${MAX_ATTEMPTS} attempts)`;
    } else {
      DOM.menuPlaySub.textContent = "Daily End Challenge";
    }

    const past = AppState.puzzles.filter((p) => p.date < today.date);
    DOM.menuVaultCount.textContent = past.length;
  }

  // ==========================================================================
  // 13. GAMEPLAY ENGINE (SINGLE-TAP INTERACTION)
  // ==========================================================================
  function startPuzzle(puzzle, isArchive = false) {
    AppState.activePuzzle = puzzle;
    AppState.isArchiveMode = isArchive;
    AppState.selectedSlot = 0;

    const record = AppState.store.history[puzzle.date];
    if (record) {
      AppState.isCompleted = !!record.completed;
      AppState.isWon = !!record.won;
      AppState.attemptsUsed = record.attemptsUsed || 0;
      AppState.lockedSlots = Array.isArray(record.lockedSlots) ? record.lockedSlots.slice() : [false, false, false, false, false];
      AppState.currentDraft = Array.isArray(record.draft) ? record.draft.slice() : [null, null, null, null, null];
      AppState.historyGrid = Array.isArray(record.historyGrid) ? record.historyGrid.slice() : [];
    } else {
      AppState.isCompleted = false;
      AppState.isWon = false;
      AppState.attemptsUsed = 0;
      AppState.lockedSlots = [false, false, false, false, false];
      AppState.currentDraft = [null, null, null, null, null];
      AppState.historyGrid = [];
    }

    DOM.gameTitleBadge.textContent = `${puzzle.title} (${puzzle.date})`;
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

  function renderGameStatus() {
    const remaining = MAX_ATTEMPTS - AppState.attemptsUsed;
    DOM.gameAttemptsBadge.textContent = `Attempts: ${remaining} / ${MAX_ATTEMPTS}`;

    const hintAvailable = AppState.attemptsUsed >= 2 || AppState.isCompleted;
    if (hintAvailable) {
      DOM.hintBox.classList.remove("hidden");
      DOM.hintText.textContent = AppState.activePuzzle.hint;
    } else {
      DOM.hintBox.classList.add("hidden");
    }

    if (AppState.isCompleted) {
      DOM.btnSubmit.textContent = "View Summary";
      DOM.btnClearPool.classList.add("hidden");
    } else {
      DOM.btnSubmit.textContent = "Submit Sequence";
      DOM.btnClearPool.classList.remove("hidden");
    }
  }

  function renderSlots() {
    DOM.slots.forEach((el, idx) => {
      const slotDef = AppState.activePuzzle.slots[idx];
      el.querySelector(".slot-label").textContent = slotDef.name;
      el.classList.remove("active", "locked");

      const valHolder = el.querySelector(".slot-value");
      valHolder.innerHTML = "";

      if (AppState.lockedSlots[idx]) {
        el.classList.add("locked");
        el.setAttribute("aria-label", `Slot ${idx + 1}: Locked correct, ${slotDef.answer}`);
        el.setAttribute("aria-pressed", "true");
        valHolder.textContent = slotDef.answer;
      } else if (AppState.currentDraft[idx]) {
        const item = AppState.currentDraft[idx];
        el.setAttribute("aria-label", `Slot ${idx + 1}: ${item.text}. Tap to remove.`);
        el.setAttribute("aria-pressed", idx === AppState.selectedSlot ? "true" : "false");
        valHolder.textContent = item.text;
      } else {
        el.setAttribute("aria-label", `Slot ${idx + 1}: Empty`);
        el.setAttribute("aria-pressed", idx === AppState.selectedSlot ? "true" : "false");
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
        btn.tabIndex = -1;
      } else {
        btn.setAttribute("aria-label", `Place ${item.text}`);
        btn.addEventListener("click", () => handleTileClick(item));
      }
      DOM.itemsPool.appendChild(btn);
    });
  }

  function handleTileClick(item) {
    if (AppState.isCompleted) return;

    let target = AppState.selectedSlot;
    if (AppState.lockedSlots[target] || AppState.currentDraft[target]) {
      target = -1;
      for (let i = 0; i < SLOTS_COUNT; i++) {
        if (!AppState.lockedSlots[i] && !AppState.currentDraft[i]) {
          target = i;
          break;
        }
      }
    }
    if (target === -1) target = AppState.selectedSlot;
    if (AppState.lockedSlots[target]) return;

    AppState.currentDraft[target] = item;

    // Advance to next unfilled slot
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
    for (let i = 0; i < SLOTS_COUNT; i++) {
      if (!AppState.lockedSlots[i]) AppState.currentDraft[i] = null;
    }
    const firstFree = AppState.lockedSlots.findIndex((l) => !l);
    AppState.selectedSlot = firstFree !== -1 ? firstFree : 0;
    renderSlots();
    renderPool();
  }

  function submitAttempt() {
    if (AppState.isCompleted) {
      openResultModal();
      return;
    }

    for (let i = 0; i < SLOTS_COUNT; i++) {
      if (!AppState.lockedSlots[i] && !AppState.currentDraft[i]) {
        showToast("Fill all 5 sequence slots before submitting.");
        return;
      }
    }

    AppState.attemptsUsed++;
    const rowResult = [];

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
        AppState.currentDraft[i] = null;
        rowResult.push("miss");
        const slotEl = DOM.slots[i];
        slotEl.classList.add("incorrect-flash");
        setTimeout(() => slotEl.classList.remove("incorrect-flash"), 450);
      }
    }

    AppState.historyGrid.push(rowResult);

    const isAllCorrect = AppState.lockedSlots.every(Boolean);
    if (isAllCorrect) {
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

  // ==========================================================================
  // 14. VAULT & SETTINGS RENDERING
  // ==========================================================================
  function renderVault() {
    DOM.vaultList.innerHTML = "";
    const canonicalToday = DailyReleaseEngine.getCanonicalReleaseDate();
    const past = AppState.puzzles.filter((p) => p.date < canonicalToday);

    if (past.length === 0) {
      DOM.vaultList.innerHTML = '<p class="status-caption">No past challenges available yet.</p>';
      return;
    }

    past.slice().reverse().forEach((puzzle) => {
      const record = AppState.store.history[puzzle.date];
      const item = document.createElement("div");
      item.className = "vault-item";
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");

      let status = "Not Played";
      let isSolved = false;
      if (record && record.completed) {
        status = record.won ? `Solved (${record.attemptsUsed}/${MAX_ATTEMPTS})` : "Unsolved";
        isSolved = record.won;
      }

      item.innerHTML = `
        <div>
          <div class="vault-item-title">${puzzle.title}</div>
          <div class="status-caption">${puzzle.date}</div>
        </div>
        <span class="badge ${isSolved ? "badge-accent" : ""}">${status}</span>
      `;

      const selectVaultPuzzle = () => startPuzzle(puzzle, true);
      item.addEventListener("click", selectVaultPuzzle);
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectVaultPuzzle();
        }
      });

      DOM.vaultList.appendChild(item);
    });
  }

  function renderSettings() {
    const isEnabled = AppState.store.settings.anim;
    if (isEnabled) {
      DOM.btnAnimOn.classList.add("active");
      DOM.btnAnimOn.setAttribute("aria-pressed", "true");
      DOM.btnAnimOff.classList.remove("active");
      DOM.btnAnimOff.setAttribute("aria-pressed", "false");
    } else {
      DOM.btnAnimOff.classList.add("active");
      DOM.btnAnimOff.setAttribute("aria-pressed", "true");
      DOM.btnAnimOn.classList.remove("active");
      DOM.btnAnimOn.setAttribute("aria-pressed", "false");
    }
  }

  function setAnimationSetting(on) {
    AppState.store.settings.anim = on;
    saveStorage();
    renderSettings();
  }

  // ==========================================================================
  // 15. MODALS: STATS & RESULTS
  // ==========================================================================
  function openStatsModal() {
    const s = AppState.store.stats;
    DOM.statPlayed.textContent = s.played;
    DOM.statWinRate.textContent = `${s.played > 0 ? Math.round((s.won / s.played) * 100) : 0}%`;
    DOM.statStreak.textContent = s.currentStreak;
    DOM.statMaxStreak.textContent = s.maxStreak;

    DOM.statsDistribution.innerHTML = "";
    const maxVal = Math.max(1, ...Object.values(s.dist));
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      const count = s.dist[i] || 0;
      const pct = Math.max(14, Math.round((count / maxVal) * 100));

      const row = document.createElement("div");
      row.className = "dist-row";
      row.innerHTML = `
        <span style="width:16px;font-weight:900;color:var(--c-rink-deep);">${i}</span>
        <div class="dist-bar-bg">
          <div class="dist-bar-fill" style="width:${pct}%">${count}</div>
        </div>
      `;
      DOM.statsDistribution.appendChild(row);
    }
    DOM.modalStats.classList.remove("hidden");
  }

  function openResultModal() {
    const p = AppState.activePuzzle;
    DOM.resultTitle.textContent = AppState.isWon ? "Sequence Solved! 🍁" : "End Concluded";
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

  // ==========================================================================
  // 16. SHARING SYSTEM
  // ==========================================================================
  function handleShareAction() {
    const url = window.location.href;
    const title = "Sequence — Canadian Curling Ice House";
    const text = "Arrange 5 items into their correct sequential order! 🍁";

    if (navigator.share) {
      navigator.share({ title, text, url }).catch(() => {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => showToast("Link copied to clipboard."))
        .catch(() => showToast("Unable to copy link."));
    } else {
      showToast("Sharing not supported on this browser.");
    }
  }

  function handleResultShare() {
    const p = AppState.activePuzzle;
    const score = AppState.isWon ? `${AppState.attemptsUsed}/${MAX_ATTEMPTS}` : "X/4";
    let shareText = `Sequence 🍁 ${p.date} — ${score}\n`;
    AppState.historyGrid.forEach((row) => {
      shareText += row.map((cell) => (cell === "hit" ? "🟩" : "⬜")).join("") + "\n";
    });

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareText)
        .then(() => showToast("Score copied to clipboard! 🍁"))
        .catch(() => showToast("Unable to copy score."));
    } else {
      showToast("Clipboard unavailable.");
    }
  }

  // ==========================================================================
  // 17. EVENT BINDING
  // ==========================================================================
  function bindEvents() {
    DOM.btnHeaderBack.addEventListener("click", () => showView("menu"));

    // Menu Primary Actions
    DOM.btnMenuPlay.addEventListener("click", () => startPuzzle(AppState.todayPuzzle, false));
    DOM.btnMenuVault.addEventListener("click", () => showView("vault"));
    DOM.btnMenuSettings.addEventListener("click", () => showView("settings"));
    DOM.btnMenuRules.addEventListener("click", openHowToPlay);

    // Menu Utilities
    DOM.btnUtilStats.addEventListener("click", openStatsModal);
    DOM.btnUtilShare.addEventListener("click", handleShareAction);
    DOM.btnUtilPlus.addEventListener("click", () => {
      showToast("Canadian Curling Ice House Collection 🍁");
    });

    // Settings
    DOM.btnAnimOn.addEventListener("click", () => setAnimationSetting(true));
    DOM.btnAnimOff.addEventListener("click", () => setAnimationSetting(false));

    // Panel Events
    DOM.btnCloseRules.addEventListener("click", closeHowToPlay);
    DOM.btnRulesConfirm.addEventListener("click", closeHowToPlay);
    DOM.backdropRules.addEventListener("click", closeHowToPlay);

    // Gameplay
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

    DOM.btnClearPool.addEventListener("click", clearDraft);
    DOM.btnSubmit.addEventListener("click", submitAttempt);

    // Modals
    DOM.btnCloseStats.addEventListener("click", () => DOM.modalStats.classList.add("hidden"));
    DOM.btnCloseResult.addEventListener("click", () => DOM.modalResult.classList.add("hidden"));
    DOM.btnResultMenu.addEventListener("click", () => {
      DOM.modalResult.classList.add("hidden");
      showView("menu");
    });
    DOM.btnResultVault.addEventListener("click", () => {
      DOM.modalResult.classList.add("hidden");
      showView("vault");
    });
    DOM.btnShare.addEventListener("click", handleResultShare);

    [DOM.modalStats, DOM.modalResult].forEach((backdrop) => {
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) backdrop.classList.add("hidden");
      });
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        DailyReleaseEngine.synchronize();
      }
    });
  }

  // Boot on DOM Ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();