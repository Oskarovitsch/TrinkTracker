const STORAGE_KEY = "drinkTracker.v1";

const DEFAULT_STATE = {
  goalMl: 2000,
  dayKey: null,
  entries: []
};

const DRINK_TYPES = [
  { name: "Wasser", factor: 1.0 },
  { name: "Sprudel", factor: 1.0 },
  { name: "Tee", factor: 1.0 },
  { name: "Kaffee", factor: 0.85 },
  { name: "Saft", factor: 0.7 },
  { name: "Softdrink", factor: 0.6 },
  { name: "Milch", factor: 0.8 },
  { name: "Bier/Alkohol", factor: 0.4 }
];

const $ = (id) => document.getElementById(id);

function getLocalDayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(DEFAULT_STATE);
  try {
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_STATE), ...parsed };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function resetForNewDayIfNeeded(state) {
  const today = getLocalDayKey();
  if (state.dayKey !== today) {
    state.dayKey = today;
    state.entries = [];
    saveState(state);
  }
}

function hydrationTotal(state) {
  return Math.round(state.entries.reduce((sum, e) => sum + e.hydration, 0));
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function scheduleMidnightReset(state) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  const ms = next - now;

  setTimeout(() => {
    resetForNewDayIfNeeded(state);
    render(state);
    scheduleMidnightReset(state);
  }, ms + 50);
}

/* ===== Pager / Swipe Navigation ===== */
let currentPage = 0;

function setPage(idx) {
  currentPage = clamp(idx, 0, 1);
  $("pagerTrack").style.transform = `translateX(${-100 * currentPage}%)`;

  // dots
  $("dot0")?.classList.toggle("isActive", currentPage === 0);
  $("dot1")?.classList.toggle("isActive", currentPage === 1);
}

function initSwipePager() {
  const viewport = $("pagerViewport");
  const track = $("pagerTrack");

  let startX = 0;
  let startY = 0;
  let dragging = false;
  let moved = 0;

  const threshold = 45; // px

  function onTouchStart(e) {
    if (!e.touches || e.touches.length !== 1) return;
    dragging = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    moved = 0;

    track.style.transition = "none";
  }

  function onTouchMove(e) {
    if (!dragging) return;
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    const dx = x - startX;
    const dy = y - startY;

    // wenn eher vertikal gescrollt wird -> swipe ignorieren
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      track.style.transition = "";
      dragging = false;
      return;
    }

    moved = dx;

    // Track live mitziehen (in %)
    const viewportWidth = viewport.clientWidth || 1;
    const deltaPct = (dx / viewportWidth) * 100;

    const base = -100 * currentPage;
    track.style.transform = `translateX(${base + deltaPct}%)`;

    // Verhindert horizontales "Gummiband" in Safari
    e.preventDefault();
  }

  function onTouchEnd() {
    if (!dragging) return;
    dragging = false;
    track.style.transition = "";

    if (moved <= -threshold) setPage(currentPage + 1); // nach links
    else if (moved >= threshold) setPage(currentPage - 1); // nach rechts
    else setPage(currentPage); // zurücksnappen
  }

  viewport.addEventListener("touchstart", onTouchStart, { passive: true });
  viewport.addEventListener("touchmove", onTouchMove, { passive: false });
  viewport.addEventListener("touchend", onTouchEnd, { passive: true });
}

/* ===== Render ===== */
function render(state) {
  const day = state.dayKey || getLocalDayKey();
  $("todayLabel").textContent = `Datum: ${day}`;

  $("goalMl").textContent = state.goalMl;

  const total = hydrationTotal(state);
  $("hydrationMl").textContent = total;

  const pct = state.goalMl > 0 ? clamp((total / state.goalMl) * 100, 0, 999) : 0;
  $("percent").textContent = Math.round(pct);

  // Fill height (cap at 100 for visual)
  const fillPct = state.goalMl > 0 ? clamp((total / state.goalMl) * 100, 0, 100) : 0;
  $("fill").style.height = `${fillPct}%`;

  $("goalInput").value = state.goalMl;

  // List
  const list = $("list");
  list.innerHTML = "";

  if (state.entries.length === 0) {
    $("empty").style.display = "block";
  } else {
    $("empty").style.display = "none";
    const reversed = [...state.entries].sort((a, b) => b.ts - a.ts);

    for (const e of reversed) {
      const li = document.createElement("li");
      li.className = "item";

      const left = document.createElement("div");
      left.innerHTML = `<div><strong>${e.type}</strong> <small>(${formatTime(e.ts)})</small></div>
                        <div><small>${e.ml} ml × ${e.factor} = ${Math.round(e.hydration)} ml Hydration</small></div>`;

      const del = document.createElement("button");
      del.className = "ghost";
      del.type = "button";
      del.textContent = "Löschen";
      del.onclick = () => {
        state.entries = state.entries.filter((x) => x.id !== e.id);
        saveState(state);
        render(state);
      };

      li.appendChild(left);
      li.appendChild(del);
      list.appendChild(li);
    }
  }
}

function initDrinkTypeUI() {
  const sel = $("typeSelect");
  sel.innerHTML = "";
  for (const t of DRINK_TYPES) {
    const opt = document.createElement("option");
    opt.value = t.name;
    opt.textContent = `${t.name} (Faktor ${t.factor})`;
    opt.dataset.factor = String(t.factor);
    sel.appendChild(opt);
  }

  $("factorInput").value = DRINK_TYPES[0].factor;

  sel.addEventListener("change", () => {
    const opt = sel.selectedOptions[0];
    const f = Number(opt.dataset.factor || "1");
    $("factorInput").value = f;
  });
}

function main() {
  const state = loadState();
  resetForNewDayIfNeeded(state);

  initDrinkTypeUI();
  initSwipePager();
  setPage(0);

  // Button + -> Seite 2
  $("toAddBtn").addEventListener("click", () => setPage(1));
  $("backBtn").addEventListener("click", () => setPage(0));

  // Goal speichern
  $("goalForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const goal = Number($("goalInput").value);
    if (!Number.isFinite(goal) || goal < 250) return;
    state.goalMl = Math.round(goal);
    saveState(state);
    render(state);
  });

  // Drink hinzufügen
  $("drinkForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    resetForNewDayIfNeeded(state);

    const ml = Number($("mlInput").value);
    const type = $("typeSelect").value;
    const factor = Number($("factorInput").value);

    if (!Number.isFinite(ml) || ml <= 0) return;
    if (!Number.isFinite(factor) || factor < 0 || factor > 1.2) return;

    const hydration = ml * factor;

    state.entries.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      ts: Date.now(),
      type,
      ml: Math.round(ml),
      factor: Math.round(factor * 100) / 100,
      hydration
    });

    saveState(state);
    $("mlInput").value = "";

    render(state);

    // nach Hinzufügen automatisch zurück zur Startseite
    setPage(0);
  });

  // Reset
  $("resetBtn").addEventListener("click", () => {
    state.entries = [];
    state.dayKey = getLocalDayKey();
    saveState(state);
    render(state);
  });

  render(state);
  scheduleMidnightReset(state);
}

main();
