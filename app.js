import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------
// CONFIG — paste your own Supabase project values here.
// Find them in your Supabase project: Settings -> API.
// The anon key is safe to expose in client code, but only if your
// table's Row Level Security policies are scoped the way schema.sql sets them up.
// ---------------------------------------------------------------
const CONFIG = {
  SUPABASE_URL: "https://xnxhaqtujrszmvtfuwbx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhueGhhcXR1anJzem12dGZ1d2J4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMDQ5NzAsImV4cCI6MjEwNDc4MDk3MH0.fkZw_WsjzRw3rb4TIdtRw7xOI7Gi5R0t_nAhhiUhUfM",
};

const supabaseEnabled =
  CONFIG.SUPABASE_URL.includes("supabase.co") &&
  !CONFIG.SUPABASE_ANON_KEY.startsWith("YOUR-");

const supabase = supabaseEnabled
  ? createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY)
  : null;

// ---------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------
const syncDot = document.getElementById("syncDot");
const statusText = document.getElementById("statusText");

const screenRaces = document.getElementById("screenRaces");
const screenDrivers = document.getElementById("screenDrivers");
const screenRecord = document.getElementById("screenRecord");

const manageDriversBtn = document.getElementById("manageDriversBtn");
const racesList = document.getElementById("racesList");
const newRaceTrackInput = document.getElementById("newRaceTrackInput");
const newRaceNameInput = document.getElementById("newRaceNameInput");
const startRaceBtn = document.getElementById("startRaceBtn");
const trackHistory = document.getElementById("trackHistory");

const backToRacesFromDriversBtn = document.getElementById("backToRacesFromDriversBtn");
const driversList = document.getElementById("driversList");
const newDriverInput = document.getElementById("newDriverInput");
const addDriverBtn = document.getElementById("addDriverBtn");

const backToRacesBtn = document.getElementById("backToRacesBtn");
const deleteRaceBtn = document.getElementById("deleteRaceBtn");
const recordRaceName = document.getElementById("recordRaceName");
const recordTrackName = document.getElementById("recordTrackName");
const driverPills = document.getElementById("driverPills");

const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const octx = overlay.getContext("2d");
const camWrap = document.getElementById("camWrap");
const camMsg = document.getElementById("camMsg");
const startCamBtn = document.getElementById("startCamBtn");
const flipBtn = document.getElementById("flipBtn");
const orientBtn = document.getElementById("orientBtn");
const camSelect = document.getElementById("camSelect");
const meterFill = document.getElementById("meterFill");
const mainBtn = document.getElementById("mainBtn");
const lapCountEl = document.getElementById("lapCount");
const lastLapEl = document.getElementById("lastLap");
const bestLapEl = document.getElementById("bestLap");
const lapsPanel = document.getElementById("lapsPanel");
const sensSlider = document.getElementById("sensSlider");
const gapSlider = document.getElementById("gapSlider");
const sensVal = document.getElementById("sensVal");
const gapVal = document.getElementById("gapVal");
const calibSummary = document.getElementById("calibSummary");
const lbSummary = document.getElementById("lbSummary");
const lbList = document.getElementById("lbList");
const atSummary = document.getElementById("atSummary");
const atList = document.getElementById("atList");

const sample = document.getElementById("sample");
const sctx = sample.getContext("2d", { willReadFrequently: true });

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmt(ms) {
  return (ms / 1000).toFixed(2) + "s";
}

// ---------------------------------------------------------------
// Navigation state
// ---------------------------------------------------------------
let currentRace = null; // { id, name, track }
let currentDriverId = null; // whoever is "at the wheel" right now
let driversCache = []; // [{ id, name }] — global, shared across all races
let racesCache = [];

function showScreen(name) {
  screenRaces.hidden = name !== "races";
  screenDrivers.hidden = name !== "drivers";
  screenRecord.hidden = name !== "record";
}

function setSyncDot(state) {
  syncDot.classList.remove("synced", "pending", "offline");
  if (state) syncDot.classList.add(state);
}

async function createDriver(name) {
  const { data, error } = await supabase.from("drivers").insert({ name }).select().single();
  if (error) {
    alert(error.code === "23505" ? `"${name}" already exists — pick them from the list.` : "Could not add driver: " + error.message);
    return null;
  }
  driversCache.push(data);
  driversCache.sort((a, b) => a.name.localeCompare(b.name));
  return data;
}

async function deleteDriverEverywhere(driver) {
  if (!confirm(`Delete ${driver.name} and all of their laps in every race? This can't be undone.`)) return;
  const { error } = await supabase.from("drivers").delete().eq("id", driver.id);
  if (error) {
    alert("Could not delete driver: " + error.message);
    return;
  }
  driversCache = driversCache.filter((d) => d.id !== driver.id);
  if (currentDriverId === driver.id) currentDriverId = driversCache[0]?.id || null;
  renderDriversManager();
}

// ---------------------------------------------------------------
// SCREEN: drivers manager
// ---------------------------------------------------------------
async function loadDrivers() {
  if (!supabase) {
    driversCache = [];
    renderDriversManager();
    return;
  }
  const { data, error } = await supabase.from("drivers").select("id, name").order("name");
  if (!error) driversCache = data || [];
  renderDriversManager();
  renderPills();
}

function renderDriversManager() {
  if (!driversCache.length) {
    driversList.innerHTML = '<div class="empty">No drivers yet — add one below.</div>';
    return;
  }
  driversList.innerHTML = driversCache
    .map(
      (d) => `<div class="list-row">
        <div class="row-main"><span class="row-name">${esc(d.name)}</span></div>
        <button class="row-del" data-id="${d.id}" title="Delete driver">🗑</button>
      </div>`
    )
    .join("");
  driversList.querySelectorAll(".row-del").forEach((btn) => {
    btn.addEventListener("click", () => {
      const driver = driversCache.find((d) => d.id === btn.dataset.id);
      if (driver) deleteDriverEverywhere(driver);
    });
  });
}

addDriverBtn.addEventListener("click", async () => {
  const name = newDriverInput.value.trim();
  if (!name || !supabase) return;
  const d = await createDriver(name);
  if (d) {
    newDriverInput.value = "";
    renderDriversManager();
  }
});
newDriverInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addDriverBtn.click();
});

manageDriversBtn.addEventListener("click", () => {
  showScreen("drivers");
  loadDrivers();
});
backToRacesFromDriversBtn.addEventListener("click", () => {
  showScreen("races");
});

// ---------------------------------------------------------------
// SCREEN: races (home)
// ---------------------------------------------------------------
async function loadRaces() {
  racesList.innerHTML = '<div class="empty">Loading races…</div>';
  const { data: races, error } = await supabase.from("races").select("id, name, track, created_at").order("created_at", { ascending: false });
  if (error) {
    racesList.innerHTML = `<div class="empty">Couldn't load races: ${esc(error.message)}</div>`;
    setSyncDot("offline");
    return;
  }
  setSyncDot("synced");
  let statsByRace = {};
  if (races.length) {
    const ids = races.map((r) => r.id);
    const { data: lapsData } = await supabase.from("laps").select("race_id, driver_id, duration_ms").in("race_id", ids);
    for (const l of lapsData || []) {
      const s = statsByRace[l.race_id] || (statsByRace[l.race_id] = { count: 0, best: Infinity, drivers: new Set() });
      s.count++;
      s.drivers.add(l.driver_id);
      if (l.duration_ms < s.best) s.best = l.duration_ms;
    }
  }
  racesCache = races.map((r) => {
    const s = statsByRace[r.id];
    return { ...r, count: s ? s.count : 0, best: s ? s.best : Infinity, driverCount: s ? s.drivers.size : 0 };
  });
  renderRaces();
  refreshTrackHistory();
}

function renderRaces() {
  if (!racesCache.length) {
    racesList.innerHTML = '<div class="empty">No races yet — start one below.</div>';
    return;
  }
  racesList.innerHTML = racesCache
    .map((r) => {
      const bestText = isFinite(r.best) ? ` · best ${fmt(r.best)}` : "";
      const driverText = r.driverCount ? `${r.driverCount} driver${r.driverCount === 1 ? "" : "s"} · ` : "";
      return `<div class="list-row">
        <button class="row-main" data-id="${r.id}">
          <span class="row-name">${esc(r.name)}</span>
          <span class="row-sub">${esc(r.track)} · ${driverText}${r.count} lap${r.count === 1 ? "" : "s"}${bestText}</span>
        </button>
        <button class="row-del" data-id="${r.id}" title="Delete race">🗑</button>
      </div>`;
    })
    .join("");
  racesList.querySelectorAll(".row-main").forEach((btn) => {
    btn.addEventListener("click", () => {
      const race = racesCache.find((r) => r.id === btn.dataset.id);
      if (race) openRace(race);
    });
  });
  racesList.querySelectorAll(".row-del").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const race = racesCache.find((r) => r.id === btn.dataset.id);
      if (race) deleteRace(race);
    });
  });
}

async function deleteRace(race) {
  if (!confirm(`Delete race "${race.name}" and all its laps? This can't be undone.`)) return;
  const { error } = await supabase.from("races").delete().eq("id", race.id);
  if (error) {
    alert("Could not delete race: " + error.message);
    return;
  }
  racesCache = racesCache.filter((r) => r.id !== race.id);
  renderRaces();
}

function defaultRaceName() {
  const d = new Date();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

startRaceBtn.addEventListener("click", async () => {
  const track = newRaceTrackInput.value.trim();
  if (!track) {
    alert("Give this race a track name.");
    return;
  }
  const name = newRaceNameInput.value.trim() || defaultRaceName();
  const { data, error } = await supabase.from("races").insert({ track, name }).select().single();
  if (error) {
    alert("Could not start race: " + error.message);
    return;
  }
  newRaceNameInput.value = "";
  openRace(data);
});

async function refreshTrackHistory() {
  if (!supabase) return;
  const { data, error } = await supabase.from("races").select("track").order("created_at", { ascending: false }).limit(300);
  if (error) return;
  const seen = [];
  for (const row of data) if (!seen.includes(row.track)) seen.push(row.track);
  trackHistory.innerHTML = seen.map((t) => `<option value="${esc(t)}"></option>`).join("");
  if (!newRaceTrackInput.value && seen.length) newRaceTrackInput.value = seen[0];
}

// ---------------------------------------------------------------
// SCREEN: camera + lap recording — multiple drivers share one race
// ---------------------------------------------------------------
let raceLaps = []; // every lap in the open race, any driver: { id, driver_id, lap_number, duration_ms }

async function openRace(race) {
  currentRace = race;
  recordRaceName.textContent = race.name;
  recordTrackName.textContent = race.track;
  armed = false;
  triggered = false;
  mainBtn.textContent = "Start";
  mainBtn.classList.remove("stop");
  statusText.textContent = "idle";
  showScreen("record");
  await loadLapsForRace();
  if (!currentDriverId && driversCache.length) currentDriverId = driversCache[0].id;
  renderAll();
  refreshAllTimeLeaderboard();
  startCamera();
}

async function loadLapsForRace() {
  const { data, error } = await supabase.from("laps").select("id, driver_id, lap_number, duration_ms").eq("race_id", currentRace.id).order("lap_number");
  raceLaps = error ? [] : data || [];
}

function lapsFor(driverId) {
  return raceLaps.filter((l) => l.driver_id === driverId);
}

function renderAll() {
  renderPills();
  renderLaps();
  renderLeaderboard();
}

backToRacesBtn.addEventListener("click", () => {
  stopCamera();
  showScreen("races");
  loadRaces();
});

deleteRaceBtn.addEventListener("click", async () => {
  if (!confirm(`Delete race "${currentRace.name}" and all its laps? This can't be undone.`)) return;
  const { error } = await supabase.from("races").delete().eq("id", currentRace.id);
  if (error) {
    alert("Could not delete race: " + error.message);
    return;
  }
  stopCamera();
  showScreen("races");
  loadRaces();
});

// ---------------------------------------------------------------
// Driver switcher (who's currently at the wheel)
// ---------------------------------------------------------------
function renderPills() {
  if (!driversCache.length) {
    driverPills.innerHTML = '<button class="pill add" id="quickAddDriverBtn">+ Add driver</button>';
    document.getElementById("quickAddDriverBtn").addEventListener("click", quickAddDriver);
    mainBtn.disabled = true;
    return;
  }
  mainBtn.disabled = false;
  driverPills.innerHTML =
    driversCache
      .map((d) => {
        const mine = lapsFor(d.id);
        const best = mine.length ? fmt(Math.min(...mine.map((l) => l.duration_ms))) : "—";
        return `<button class="pill ${d.id === currentDriverId ? "active" : ""}" data-id="${d.id}">${esc(d.name)} <span class="pb">${best}</span></button>`;
      })
      .join("") + '<button class="pill add" id="quickAddDriverBtn">+</button>';
  driverPills.querySelectorAll(".pill[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => selectDriverForRace(btn.dataset.id));
  });
  document.getElementById("quickAddDriverBtn").addEventListener("click", quickAddDriver);
}

function selectDriverForRace(id) {
  currentDriverId = id;
  armed = false;
  triggered = false;
  mainBtn.textContent = "Start";
  mainBtn.classList.remove("stop");
  statusText.textContent = "idle";
  renderAll();
}

async function quickAddDriver() {
  const name = (prompt("New driver name:") || "").trim();
  if (!name) return;
  const d = await createDriver(name);
  if (d) {
    currentDriverId = d.id;
    renderAll();
  }
}

// ---------------------------------------------------------------
// Camera (Samsung Internet friendly)
// ---------------------------------------------------------------
let facingMode = "environment";
let stream = null;
let currentDeviceId = null;
let orientation = "horizontal";
let gatePos = 0.5;
const thickness = 0.09;

let armed = false;
let startTime = 0;
let lastLapTime = 0;

let prevSample = null;
let triggered = false;
let lastTriggerAt = 0;
let dragging = false;
let lastProcessAt = 0;
let audioCtx = null;

function sensitivityToThreshold(s) {
  const sMin = 2.5, sMax = 32;
  return sMax - (sMax - sMin) * (s / 100);
}

async function startCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    camMsg.style.display = "flex";
    camMsg.textContent = "This browser can't access the camera here. Open this page as a normal https:// page, then reload.";
    return;
  }
  try {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    const constraints = currentDeviceId
      ? { video: { deviceId: { exact: currentDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }
      : { video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
    camMsg.style.display = "none";
    populateDeviceList();
  } catch (err) {
    camMsg.style.display = "flex";
    camMsg.innerHTML =
      "Camera access failed: " + esc(err.message || err.name) +
      '<br><button class="btn-reset" id="retryBtn" style="margin-top:10px;">Try again</button>';
    document.getElementById("retryBtn").onclick = startCamera;
  }
}
function stopCamera() {
  armed = false;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}

async function populateDeviceList() {
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    if (devices.length > 1) {
      camSelect.style.display = "block";
      camSelect.innerHTML = devices
        .map((d, i) => `<option value="${d.deviceId}">${esc(d.label || "Camera " + (i + 1))}</option>`)
        .join("");
      if (currentDeviceId) camSelect.value = currentDeviceId;
    }
  } catch (e) {
    /* labels unavailable until permission granted; ignore */
  }
}
camSelect.addEventListener("change", () => {
  currentDeviceId = camSelect.value;
  startCamera();
});

video.addEventListener("loadedmetadata", () => {
  const vw = video.videoWidth, vh = video.videoHeight;
  sample.width = 160;
  sample.height = Math.max(40, Math.round(160 * (vh / vw || 0.75)));
  resizeOverlay();
  prevSample = null;
});
function resizeOverlay() {
  const rect = camWrap.getBoundingClientRect();
  overlay.width = Math.round(rect.width);
  overlay.height = Math.round(rect.height);
}
window.addEventListener("resize", resizeOverlay);

function posFromEvent(e) {
  const rect = overlay.getBoundingClientRect();
  return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
}
overlay.addEventListener("pointerdown", (e) => {
  const p = posFromEvent(e);
  const near = orientation === "horizontal" ? Math.abs(p.y - gatePos) < thickness : Math.abs(p.x - gatePos) < thickness;
  if (near) { dragging = true; overlay.setPointerCapture(e.pointerId); }
});
overlay.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const p = posFromEvent(e);
  gatePos = orientation === "horizontal" ? p.y : p.x;
  gatePos = Math.min(0.92, Math.max(0.08, gatePos));
});
overlay.addEventListener("pointerup", () => { dragging = false; });
overlay.addEventListener("pointercancel", () => { dragging = false; });

orientBtn.addEventListener("click", () => {
  orientation = orientation === "horizontal" ? "vertical" : "horizontal";
  orientBtn.textContent = orientation === "horizontal" ? "↕ Horizontal" : "↔ Vertical";
  prevSample = null;
});
flipBtn.addEventListener("click", () => {
  facingMode = facingMode === "environment" ? "user" : "environment";
  currentDeviceId = null;
  startCamera();
});
startCamBtn.addEventListener("click", startCamera);

function drawOverlay() {
  const w = overlay.width, h = overlay.height;
  octx.clearRect(0, 0, w, h);
  const now = performance.now();
  const flash = Math.max(0, 1 - (now - lastTriggerAt) / 320);
  const color = flash > 0 ? `rgba(79,174,113,${0.15 + flash * 0.35})` : "rgba(232,163,61,0.14)";
  const lineColor = flash > 0 ? "#4FAE71" : "#E8A33D";
  octx.fillStyle = color; octx.strokeStyle = lineColor; octx.lineWidth = 2;
  if (orientation === "horizontal") {
    const y = gatePos * h, band = thickness * h;
    octx.fillRect(0, y - band / 2, w, band);
    octx.beginPath(); octx.moveTo(0, y); octx.lineTo(w, y); octx.stroke();
  } else {
    const x = gatePos * w, band = thickness * w;
    octx.fillRect(x - band / 2, 0, band, h);
    octx.beginPath(); octx.moveTo(x, 0); octx.lineTo(x, h); octx.stroke();
  }
  requestAnimationFrame(drawOverlay);
}
requestAnimationFrame(drawOverlay);

function processFrame(now) {
  requestAnimationFrame(processFrame);
  if (!video.videoWidth) return;
  if (now - lastProcessAt < 40) return;
  lastProcessAt = now;
  sctx.drawImage(video, 0, 0, sample.width, sample.height);
  const w = sample.width, h = sample.height;
  let rx, ry, rw, rh;
  if (orientation === "horizontal") {
    ry = Math.round((gatePos - thickness / 2) * h); rh = Math.max(2, Math.round(thickness * h));
    rx = 0; rw = w;
  } else {
    rx = Math.round((gatePos - thickness / 2) * w); rw = Math.max(2, Math.round(thickness * w));
    ry = 0; rh = h;
  }
  ry = Math.max(0, Math.min(h - 1, ry)); rx = Math.max(0, Math.min(w - 1, rx));
  rh = Math.max(1, Math.min(h - ry, rh)); rw = Math.max(1, Math.min(w - rx, rw));
  let data;
  try { data = sctx.getImageData(rx, ry, rw, rh).data; } catch (e) { return; }
  let sum = 0; const count = data.length / 4;
  for (let i = 0; i < data.length; i += 4) sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  const avg = sum / count;
  if (prevSample !== null) {
    const diff = Math.abs(avg - prevSample);
    const threshold = sensitivityToThreshold(Number(sensSlider.value));
    const pct = Math.min(100, (diff / (threshold * 2.2)) * 100);
    meterFill.style.width = pct + "%";
    meterFill.style.background = diff > threshold ? "#4FAE71" : pct > 55 ? "#E8A33D" : "#5A5D68";
    const minGapMs = Number(gapSlider.value) * 100;
    if (armed && diff > threshold && !triggered && now - lastLapTime > minGapMs) {
      triggered = true; lastTriggerAt = now; registerLap(now);
    } else if (diff < threshold * 0.5) {
      triggered = false;
    }
  }
  prevSample = avg;
}
requestAnimationFrame(processFrame);

function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
}
function beep() {
  try {
    ensureAudio();
    if (!audioCtx) return;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 880; o.type = "sine";
    g.gain.setValueAtTime(0.001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.2);
  } catch (e) {}
  if (navigator.vibrate) navigator.vibrate(60);
}

// ---------------------------------------------------------------
// Lap logic (local, instant — never blocked by the network)
// ---------------------------------------------------------------
function registerLap(now) {
  if (!currentDriverId) return;
  const mine = lapsFor(currentDriverId);
  const from = lastLapTime || startTime;
  const duration_ms = Math.round(now - from);
  lastLapTime = now;
  const lap_number = mine.length ? Math.max(...mine.map((l) => l.lap_number)) + 1 : 1;
  const lap = { id: null, driver_id: currentDriverId, lap_number, duration_ms };
  raceLaps.push(lap);
  beep();
  renderAll();
  syncLap(lap);
}

function renderLaps() {
  const mine = lapsFor(currentDriverId).slice().sort((a, b) => b.lap_number - a.lap_number);
  lapCountEl.textContent = mine.length;
  if (!mine.length) {
    lastLapEl.textContent = "—"; bestLapEl.textContent = "—";
    lapsPanel.innerHTML = '<div class="empty">Laps will appear here once you start.</div>';
    return;
  }
  const best = Math.min(...mine.map((l) => l.duration_ms));
  lastLapEl.textContent = fmt(mine[0].duration_ms);
  bestLapEl.textContent = fmt(best);
  lapsPanel.innerHTML = mine
    .map((l) => {
      const isBest = l.duration_ms === best;
      const deltaText = isBest ? "best" : "+" + ((l.duration_ms - best) / 1000).toFixed(2) + "s";
      return `<div class="lap-row ${isBest ? "pb" : ""}">
        <span class="n">#${l.lap_number}</span>
        <span class="t">${fmt(l.duration_ms)}</span>
        <span class="d ${isBest ? "best" : "off"}">${deltaText}</span>
        <button class="del" data-id="${l.id ?? ""}" title="Delete lap">✕</button>
      </div>`;
    })
    .join("");
  lapsPanel.querySelectorAll(".del").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (!id) { alert("Still syncing this lap — try again in a moment."); return; }
      deleteLap(id);
    });
  });
}

async function deleteLap(id) {
  if (!confirm("Delete this lap?")) return;
  const { error } = await supabase.from("laps").delete().eq("id", id);
  if (error) {
    alert("Could not delete lap: " + error.message);
    return;
  }
  raceLaps = raceLaps.filter((l) => String(l.id) !== String(id));
  renderAll();
}

mainBtn.addEventListener("click", () => {
  if (!currentDriverId) return;
  if (!armed) {
    ensureAudio();
    armed = true;
    startTime = performance.now();
    lastLapTime = 0;
    triggered = false;
    mainBtn.textContent = "Stop";
    mainBtn.classList.add("stop");
    statusText.textContent = "waiting for first crossing";
  } else {
    armed = false;
    mainBtn.textContent = "Start";
    mainBtn.classList.remove("stop");
    statusText.textContent = "stopped";
  }
});

sensSlider.addEventListener("input", () => { sensVal.textContent = sensSlider.value; updateCalibSummary(); });
gapSlider.addEventListener("input", () => { gapVal.textContent = (Number(gapSlider.value) / 10).toFixed(1) + "s"; updateCalibSummary(); });
function updateCalibSummary() {
  calibSummary.textContent = `sensitivity ${sensSlider.value} · min gap ${(Number(gapSlider.value) / 10).toFixed(1)}s`;
}

// ---------------------------------------------------------------
// Supabase sync
// ---------------------------------------------------------------
async function syncLap(lap) {
  if (!supabase) { setSyncDot(null); return; }
  setSyncDot("pending");
  try {
    const { data, error } = await supabase
      .from("laps")
      .insert({ race_id: currentRace.id, driver_id: lap.driver_id, lap_number: lap.lap_number, duration_ms: lap.duration_ms })
      .select()
      .single();
    if (error) throw error;
    lap.id = data.id;
    setSyncDot("synced");
    refreshAllTimeLeaderboard();
  } catch (e) {
    console.warn("Supabase sync failed:", e.message || e);
    setSyncDot("offline");
  }
}

function renderLeaderboard() {
  const ids = new Set(raceLaps.map((l) => l.driver_id));
  if (currentDriverId) ids.add(currentDriverId);
  const rows = [...ids].map((id) => {
    const mine = lapsFor(id);
    const best = mine.length ? Math.min(...mine.map((l) => l.duration_ms)) : Infinity;
    return { name: driversCache.find((d) => d.id === id)?.name || "Unknown", best };
  }).sort((a, b) => a.best - b.best);
  lbSummary.textContent = rows.length + (rows.length === 1 ? " driver" : " drivers");
  if (!rows.length) {
    lbList.innerHTML = '<div class="lb-empty">No laps yet.</div>';
    return;
  }
  const fastest = rows[0].best;
  lbList.innerHTML = rows
    .map((r, i) => {
      const hasTime = isFinite(r.best);
      const gap = hasTime && i > 0 ? "+" + ((r.best - fastest) / 1000).toFixed(2) + "s" : i === 0 && hasTime ? "fastest" : "—";
      return `<div class="lb-row ${i === 0 && hasTime ? "leader" : ""}">
        <span class="rank">${i + 1}</span>
        <span class="name">${esc(r.name)}</span>
        <span class="best">${hasTime ? fmt(r.best) : "—"}</span>
        <span class="gap">${gap}</span>
      </div>`;
    })
    .join("");
}

async function refreshAllTimeLeaderboard() {
  if (!supabase) {
    atSummary.textContent = "not connected";
    atList.innerHTML = '<div class="lb-empty">Add your Supabase URL and key in app.js to enable all-time history.</div>';
    return;
  }
  try {
    const { data: races, error } = await supabase.from("races").select("id").eq("track", currentRace.track);
    if (error) throw error;
    if (!races.length) {
      atSummary.textContent = "no laps yet";
      atList.innerHTML = '<div class="lb-empty">No recorded laps for this track yet.</div>';
      return;
    }
    const raceIds = races.map((r) => r.id);
    const { data: lapsData, error: lapsErr } = await supabase.from("laps").select("driver_id, duration_ms").in("race_id", raceIds);
    if (lapsErr) throw lapsErr;
    const bestByDriver = {};
    for (const row of lapsData) {
      if (!(row.driver_id in bestByDriver) || row.duration_ms < bestByDriver[row.driver_id]) bestByDriver[row.driver_id] = row.duration_ms;
    }
    const ranked = Object.entries(bestByDriver)
      .map(([driverId, dur]) => ({ name: driversCache.find((d) => d.id === driverId)?.name || "Unknown", dur }))
      .sort((a, b) => a.dur - b.dur);
    atSummary.textContent = ranked.length ? ranked.length + " drivers" : "no laps yet";
    if (!ranked.length) {
      atList.innerHTML = '<div class="lb-empty">No recorded laps for this track yet.</div>';
      return;
    }
    const fastest = ranked[0].dur;
    atList.innerHTML = ranked
      .map((r, i) => {
        const gap = i === 0 ? "fastest" : "+" + ((r.dur - fastest) / 1000).toFixed(2) + "s";
        return `<div class="lb-row ${i === 0 ? "leader" : ""}">
          <span class="rank">${i + 1}</span>
          <span class="name">${esc(r.name)}</span>
          <span class="best">${fmt(r.dur)}</span>
          <span class="gap">${gap}</span>
        </div>`;
      })
      .join("");
  } catch (e) {
    console.warn("All-time leaderboard fetch failed:", e.message || e);
    atSummary.textContent = "offline";
  }
}

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------
setSyncDot(supabase ? "pending" : null);
loadDrivers();
loadRaces();
showScreen("races");
