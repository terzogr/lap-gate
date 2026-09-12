import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------
// CONFIG — paste your own Supabase project values here.
// Find them in your Supabase project: Settings -> API.
// The anon key is safe to expose in client code, but only if your
// table's Row Level Security policies are scoped the way schema.sql sets them up.
// ---------------------------------------------------------------
const CONFIG = {
  SUPABASE_URL: "https://xnxhaqtujrszmvtfuwbx.supabase.co/rest/v1/",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhueGhhcXR1anJzem12dGZ1d2J4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMDQ5NzAsImV4cCI6MjEwNDc4MDk3MH0.fkZw_WsjzRw3rb4TIdtRw7xOI7Gi5R0t_nAhhiUhUfM",
};

const supabaseEnabled =
  CONFIG.SUPABASE_URL.includes("supabase.co") &&
  !CONFIG.SUPABASE_ANON_KEY.startsWith("YOUR-");

const supabase = supabaseEnabled
  ? createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY)
  : null;

const sessionId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());

// ---------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------
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
const syncDot = document.getElementById("syncDot");
const statusText = document.getElementById("statusText");
const mainBtn = document.getElementById("mainBtn");
const resetBtn = document.getElementById("resetBtn");
const lapCountEl = document.getElementById("lapCount");
const lastLapEl = document.getElementById("lastLap");
const bestLapEl = document.getElementById("bestLap");
const lapsPanel = document.getElementById("lapsPanel");
const sensSlider = document.getElementById("sensSlider");
const gapSlider = document.getElementById("gapSlider");
const sensVal = document.getElementById("sensVal");
const gapVal = document.getElementById("gapVal");
const calibSummary = document.getElementById("calibSummary");
const driverInput = document.getElementById("driverInput");
const driverGoBtn = document.getElementById("driverGoBtn");
const driverPills = document.getElementById("driverPills");
const trackInput = document.getElementById("trackInput");
const trackPills = document.getElementById("trackPills");
const trackHistory = document.getElementById("trackHistory");
const lbSummary = document.getElementById("lbSummary");
const lbList = document.getElementById("lbList");
const atSummary = document.getElementById("atSummary");
const atList = document.getElementById("atList");

const sample = document.getElementById("sample");
const sctx = sample.getContext("2d", { willReadFrequently: true });

// ---------------------------------------------------------------
// Camera state
// ---------------------------------------------------------------
let facingMode = "environment";
let stream = null;
let currentDeviceId = null;
let orientation = "horizontal";
let gatePos = 0.5;
const thickness = 0.09;

// ---------------------------------------------------------------
// Timing state
// ---------------------------------------------------------------
let armed = false;
let startTime = 0;
let lastLapTime = 0;

let currentTrack = trackInput.value.trim() || "Home track";
let drivers = {}; // name -> { laps: [{n,duration,best}], bestDuration }
let currentDriver = "Driver 1";
function ensureDriver(name) {
  if (!drivers[name]) drivers[name] = { laps: [], bestDuration: Infinity };
  return drivers[name];
}
ensureDriver(currentDriver);

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
function fmt(ms) {
  return (ms / 1000).toFixed(2) + "s";
}

// ---------------------------------------------------------------
// Camera (Samsung Internet friendly)
// ---------------------------------------------------------------
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
      "Camera access failed: " + (err.message || err.name) +
      '<br><button class="btn-reset" id="retryBtn" style="margin-top:10px;">Try again</button>';
    document.getElementById("retryBtn").onclick = startCamera;
  }
}

async function populateDeviceList() {
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
    if (devices.length > 1) {
      camSelect.style.display = "block";
      camSelect.innerHTML = devices
        .map((d, i) => `<option value="${d.deviceId}">${d.label || "Camera " + (i + 1)}</option>`)
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
  camWrap.style.aspectRatio = vw && vh ? vw + "/" + vh : "4/3";
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
  const d = ensureDriver(currentDriver);
  const from = d.laps.length ? lastLapTime : startTime;
  const duration = now - from;
  lastLapTime = now;
  const n = d.laps.length + 1;
  const isBest = duration < d.bestDuration;
  if (isBest) d.bestDuration = duration;
  d.laps.unshift({ n, duration, best: isBest });
  beep();
  renderLaps();
  renderDriverPills();
  renderLeaderboard();
  syncLap({ track: currentTrack, driver: currentDriver, lap_number: n, duration_ms: Math.round(duration) });
}

function renderLaps() {
  const d = ensureDriver(currentDriver);
  lapCountEl.textContent = d.laps.length;
  if (d.laps.length === 0) {
    lastLapEl.textContent = "—"; bestLapEl.textContent = "—";
    lapsPanel.innerHTML = '<div class="empty">Laps will appear here once you start.</div>';
    return;
  }
  lastLapEl.textContent = fmt(d.laps[0].duration);
  bestLapEl.textContent = fmt(d.bestDuration);
  lapsPanel.innerHTML = d.laps
    .map((l) => {
      const delta = l.duration - d.bestDuration;
      const deltaText = l.best ? "best" : "+" + (delta / 1000).toFixed(2) + "s";
      const deltaClass = l.best ? "best" : "off";
      return `<div class="lap-row ${l.best ? "pb" : ""}">
        <span class="n">#${l.n}</span>
        <span class="t">${fmt(l.duration)}</span>
        <span class="d ${deltaClass}">${deltaText}</span>
      </div>`;
    })
    .join("");
}

function renderDriverPills() {
  const names = Object.keys(drivers);
  driverPills.innerHTML = names
    .map((name) => {
      const d = drivers[name];
      const pb = isFinite(d.bestDuration) ? fmt(d.bestDuration) : "—";
      return `<button class="pill ${name === currentDriver ? "active" : ""}" data-name="${name}">
        ${name} <span class="pb">${pb}</span>
      </button>`;
    })
    .join("");
  driverPills.querySelectorAll(".pill").forEach((btn) => {
    btn.addEventListener("click", () => selectDriver(btn.dataset.name));
  });
}

function renderLeaderboard() {
  const names = Object.keys(drivers);
  lbSummary.textContent = names.length + (names.length === 1 ? " driver" : " drivers");
  const ranked = names.map((name) => ({ name, ...drivers[name] })).sort((a, b) => a.bestDuration - b.bestDuration);
  const fastest = ranked.length ? ranked[0].bestDuration : Infinity;
  lbList.innerHTML = ranked
    .map((r, i) => {
      const hasTime = isFinite(r.bestDuration);
      const gap = hasTime && i > 0 ? "+" + ((r.bestDuration - fastest) / 1000).toFixed(2) + "s" : i === 0 && hasTime ? "fastest" : "—";
      return `<div class="lb-row ${i === 0 && hasTime ? "leader" : ""}">
        <span class="rank">${i + 1}</span>
        <span class="name">${r.name}</span>
        <span class="best">${hasTime ? fmt(r.bestDuration) : "—"}</span>
        <span class="gap">${gap}</span>
      </div>`;
    })
    .join("");
}

function selectDriver(name) {
  name = (name || "").trim();
  if (!name) return;
  ensureDriver(name);
  currentDriver = name;
  driverInput.value = name;
  armed = false;
  mainBtn.textContent = "Start";
  mainBtn.classList.remove("stop");
  statusText.textContent = "idle";
  triggered = false;
  renderLaps();
  renderDriverPills();
  renderLeaderboard();
}
driverGoBtn.addEventListener("click", () => selectDriver(driverInput.value));
driverInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { selectDriver(driverInput.value); driverInput.blur(); }
});

mainBtn.addEventListener("click", () => {
  if (!armed) {
    selectDriver(driverInput.value || currentDriver);
    setTrack(trackInput.value || currentTrack);
    ensureAudio();
    armed = true;
    startTime = performance.now();
    lastLapTime = 0;
    triggered = false;
    mainBtn.textContent = "Stop";
    mainBtn.classList.add("stop");
    statusText.textContent = currentDriver + " — waiting for first crossing";
  } else {
    armed = false;
    mainBtn.textContent = "Start";
    mainBtn.classList.remove("stop");
    statusText.textContent = "stopped";
  }
});

resetBtn.addEventListener("click", () => {
  armed = false;
  drivers[currentDriver] = { laps: [], bestDuration: Infinity };
  mainBtn.textContent = "Start";
  mainBtn.classList.remove("stop");
  statusText.textContent = "idle";
  renderLaps();
  renderDriverPills();
  renderLeaderboard();
});

sensSlider.addEventListener("input", () => { sensVal.textContent = sensSlider.value; updateCalibSummary(); });
gapSlider.addEventListener("input", () => { gapVal.textContent = (Number(gapSlider.value) / 10).toFixed(1) + "s"; updateCalibSummary(); });
function updateCalibSummary() {
  calibSummary.textContent = `sensitivity ${sensSlider.value} · min gap ${(Number(gapSlider.value) / 10).toFixed(1)}s`;
}

// ---------------------------------------------------------------
// Track selection + Supabase sync
// ---------------------------------------------------------------
function setTrack(name) {
  name = (name || "").trim();
  if (!name) return;
  currentTrack = name;
  trackInput.value = name;
  renderTrackPills();
  refreshAllTimeLeaderboard();
}
function renderTrackPills() {
  const known = new Set(knownTracks);
  known.add(currentTrack);
  trackPills.innerHTML = [...known]
    .map((name) => `<button class="pill ${name === currentTrack ? "active" : ""}" data-track="${name}">${name}</button>`)
    .join("");
  trackPills.querySelectorAll(".pill").forEach((btn) => {
    btn.addEventListener("click", () => setTrack(btn.dataset.track));
  });
  trackHistory.innerHTML = [...known].map((name) => `<option value="${name}"></option>`).join("");
}
trackInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { setTrack(trackInput.value); trackInput.blur(); }
});

let knownTracks = [];

function setSyncDot(state) {
  syncDot.classList.remove("synced", "pending", "offline");
  if (state) syncDot.classList.add(state);
}

async function syncLap(record) {
  if (!supabase) { setSyncDot(null); return; }
  setSyncDot("pending");
  try {
    const { error } = await supabase.from("laps").insert({ ...record, session_id: sessionId });
    if (error) throw error;
    setSyncDot("synced");
    refreshAllTimeLeaderboard();
    refreshTrackHistory();
  } catch (e) {
    console.warn("Supabase sync failed:", e.message || e);
    setSyncDot("offline");
  }
}

async function refreshTrackHistory() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from("laps").select("track").order("created_at", { ascending: false }).limit(300);
    if (error) throw error;
    const seen = [];
    for (const row of data) if (!seen.includes(row.track)) seen.push(row.track);
    knownTracks = seen;
    renderTrackPills();
  } catch (e) {
    console.warn("Track history fetch failed:", e.message || e);
  }
}

async function refreshAllTimeLeaderboard() {
  if (!supabase) {
    atSummary.textContent = "not connected";
    atList.innerHTML = '<div class="lb-empty">Add your Supabase URL and key in app.js to enable all-time history.</div>';
    return;
  }
  try {
    const { data, error } = await supabase
      .from("laps")
      .select("driver, duration_ms")
      .eq("track", currentTrack)
      .order("duration_ms", { ascending: true })
      .limit(500);
    if (error) throw error;
    const bestByDriver = {};
    for (const row of data) {
      if (!(row.driver in bestByDriver) || row.duration_ms < bestByDriver[row.driver]) {
        bestByDriver[row.driver] = row.duration_ms;
      }
    }
    const ranked = Object.entries(bestByDriver).sort((a, b) => a[1] - b[1]);
    atSummary.textContent = ranked.length ? ranked.length + " drivers" : "no laps yet";
    if (!ranked.length) {
      atList.innerHTML = '<div class="lb-empty">No recorded laps for this track yet.</div>';
      return;
    }
    const fastest = ranked[0][1];
    atList.innerHTML = ranked
      .map(([name, dur], i) => {
        const gap = i === 0 ? "fastest" : "+" + ((dur - fastest) / 1000).toFixed(2) + "s";
        return `<div class="lb-row ${i === 0 ? "leader" : ""}">
          <span class="rank">${i + 1}</span>
          <span class="name">${name}</span>
          <span class="best">${fmt(dur)}</span>
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
renderDriverPills();
renderLeaderboard();
renderTrackPills();
refreshTrackHistory();
refreshAllTimeLeaderboard();
setSyncDot(supabase ? "pending" : null);
if (supabase) setSyncDot("synced");
startCamera();
