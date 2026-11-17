const DURATIONS = { focus: 25 * 60, break: 5 * 60, longBreak: 15 * 60 };
const RING_CIRCUMFERENCE = 2 * Math.PI * 90;
const SESSIONS_KEY = "fk_sessions";
const SESSIONS_DATE_KEY = "fk_sessions_date";
const HISTORY_KEY = "fk_history";
const TASKS_KEY = "fk_tasks";
const SETTINGS_KEY = "fk_settings";
const CYCLE_KEY = "fk_cycle";
const CYCLE_TARGET = 4;
const DEFAULT_SETTINGS = { focus: 25, break: 5, longBreak: 15, notify: false };
const SETTING_RANGES = { focus: [1, 180], break: [1, 90], longBreak: [1, 90] };
const MODE_LABELS = {
  focus: "Sesi Fokus",
  break: "Sesi Istirahat",
  longBreak: "Istirahat Panjang",
};
const DAY_NAMES_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const el = (id) => document.getElementById(id);

let mode = "focus";
let remaining = DURATIONS.focus;
let timerId = null;
let endTimestamp = null;
let hasPausedMidSession = false;
let sessionsToday = 0;
let settings = { ...DEFAULT_SETTINGS };
let cycleCount = 0;
let focusHistory = {};
let tasks = [];
let activeFilter = "all";
let storageWritable = true;

function showStorageAlert(message) {
  const alertEl = el("storageAlert");
  el("storageAlertText").textContent = message;
  alertEl.hidden = false;
}

function hideStorageAlert() {
  el("storageAlert").hidden = true;
}

function readLocalCount(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = Number(raw || 0);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
  } catch {
    storageWritable = false;
    showStorageAlert("Browser membatasi akses penyimpanan lokal. Perubahan sesi mungkin tidak tersimpan.");
    return 0;
  }
}

function writeLocalItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    storageWritable = false;
    showStorageAlert("Gagal menyimpan data ke penyimpanan browser. Periksa kuota atau izin situs.");
    return false;
  }
}

function dateKeyOf(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function todayKey() {
  return dateKeyOf(new Date());
}

function readSessionsToday() {
  try {
    if (localStorage.getItem(SESSIONS_DATE_KEY) !== todayKey()) {
      writeLocalItem(SESSIONS_KEY, "0");
      writeLocalItem(SESSIONS_DATE_KEY, todayKey());
      return 0;
    }
  } catch {
    // Fall through to the stored count if the date check cannot run.
  }
  return readLocalCount(SESSIONS_KEY);
}

// ---------- Pengaturan Sesi & Siklus Pomodoro ----------

function sanitizeSettingValue(key, value) {
  const n = Number(value);
  const [min, max] = SETTING_RANGES[key];
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS[key];
  const rounded = Math.round(n);
  return rounded >= min && rounded <= max ? rounded : DEFAULT_SETTINGS[key];
}

function readLocalSettings() {
  const result = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return result;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return result;
    for (const key of ["focus", "break", "longBreak"]) {
      result[key] = sanitizeSettingValue(key, parsed[key]);
    }
    result.notify = parsed.notify === true;
    return result;
  } catch {
    // Pengaturan yang rusak kembali ke nilai bawaan agar timer tetap jalan.
    return result;
  }
}

function applySettings() {
  DURATIONS.focus = settings.focus * 60;
  DURATIONS.break = settings.break * 60;
  DURATIONS.longBreak = settings.longBreak * 60;
}

function saveSettings() {
  writeLocalItem(SETTINGS_KEY, JSON.stringify(settings));
  applySettings();
}

function readCycleCount() {
  const n = readLocalCount(CYCLE_KEY);
  return Math.min(n, CYCLE_TARGET - 1);
}

function saveCycleCount() {
  writeLocalItem(CYCLE_KEY, String(cycleCount));
}

// ---------- Riwayat & Statistik Fokus ----------

function sanitizeHistoryEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const sessions = Number(value.sessions);
  const minutes = Number(value.minutes);
  if (!Number.isFinite(sessions) || !Number.isFinite(minutes)) return null;
  if (sessions < 0 || minutes < 0) return null;
  return { sessions: Math.floor(sessions), minutes: Math.floor(minutes) };
}

function readLocalHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const clean = {};
    for (const [key, value] of Object.entries(parsed)) {
      const entry = sanitizeHistoryEntry(value);
      if (entry) clean[key] = entry;
    }
    return clean;
  } catch {
    // Riwayat yang rusak diperlakukan sebagai kosong agar halaman tetap jalan.
    return {};
  }
}

function saveHistory() {
  writeLocalItem(HISTORY_KEY, JSON.stringify(focusHistory));
}

// Benih sekali saja untuk pengguna lama: bila belum ada riwayat sama sekali,
// counter sesi hari ini yang sudah berjalan menjadi entri hari ini.
function ensureHistorySeed() {
  focusHistory = readLocalHistory();
  let hasStoredHistory = false;
  try {
    hasStoredHistory = localStorage.getItem(HISTORY_KEY) !== null;
  } catch {
    hasStoredHistory = false;
  }
  if (!hasStoredHistory && sessionsToday > 0) {
    focusHistory[todayKey()] = {
      sessions: sessionsToday,
      minutes: sessionsToday * settings.focus,
    };
    saveHistory();
  }
}

function recordFocusSession(durationMinutes) {
  const key = todayKey();
  const entry = focusHistory[key] || { sessions: 0, minutes: 0 };
  entry.sessions += 1;
  entry.minutes += durationMinutes;
  focusHistory[key] = entry;
  saveHistory();
}

function summarizeWeek(history, now = new Date()) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  let sessions = 0;
  let minutes = 0;
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const entry = history[dateKeyOf(day)];
    if (entry) {
      sessions += entry.sessions;
      minutes += entry.minutes;
    }
  }
  return { sessions, minutes };
}

function lastSevenDays(history, now = new Date()) {
  const days = [];
  for (let offset = 6; offset >= 0; offset--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const entry = history[dateKeyOf(day)];
    days.push({
      key: dateKeyOf(day),
      label: DAY_NAMES_ID[day.getDay()],
      sessions: entry ? entry.sessions : 0,
      minutes: entry ? entry.minutes : 0,
      isToday: offset === 0,
    });
  }
  return days;
}

function renderStats() {
  const week = summarizeWeek(focusHistory);
  el("statWeekMinutes").textContent = String(week.minutes);
  el("statWeekSessions").textContent = String(week.sessions);

  const hasAnyHistory = Object.values(focusHistory).some(
    (entry) => entry.sessions > 0 || entry.minutes > 0
  );
  el("statsEmpty").hidden = hasAnyHistory;

  const days = lastSevenDays(focusHistory);
  const maxMinutes = Math.max(...days.map((day) => day.minutes), 0);
  const chart = el("statsChart");
  chart.innerHTML = "";

  for (const day of days) {
    const col = document.createElement("div");
    col.className = "chart-col" + (day.isToday ? " is-today" : "");

    const value = document.createElement("span");
    value.className = "chart-value";
    value.textContent = String(day.minutes);

    const track = document.createElement("div");
    track.className = "chart-track";
    const bar = document.createElement("div");
    bar.className = "chart-bar";
    const pct =
      day.minutes > 0 && maxMinutes > 0
        ? Math.max(6, Math.round((day.minutes / maxMinutes) * 100))
        : 0;
    bar.style.height = pct + "%";
    track.appendChild(bar);

    const label = document.createElement("span");
    label.className = "chart-day";
    label.textContent = day.label;

    col.append(value, track, label);
    chart.appendChild(col);
  }

  const today = days[days.length - 1];
  chart.setAttribute(
    "aria-label",
    `Grafik menit fokus 7 hari terakhir. Hari ini ${today.minutes} menit. Total minggu ini ${week.minutes} menit dari ${week.sessions} sesi.`
  );
}

function readLocalTasks() {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("Format daftar tugas tidak valid");
    }
    return parsed.filter(
      (item) =>
        item &&
        typeof item.name === "string" &&
        typeof item.course === "string" &&
        typeof item.date === "string"
    );
  } catch {
    showStorageAlert("Data deadline tersimpan tidak dapat dibaca. Anda bisa mengatur ulang penyimpanan agar kembali normal.");
    return [];
  }
}

function formatTime(seconds) {
  const safe = Math.max(0, seconds);
  const m = String(Math.floor(safe / 60)).padStart(2, "0");
  const s = String(safe % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function renderTodayDate() {
  const now = new Date();
  const dateEl = el("todayDate");
  dateEl.dateTime = now.toISOString().slice(0, 10);
  dateEl.textContent = now.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function updateControlStates() {
  const isRunning = timerId !== null;
  const isAtFullDuration = remaining === DURATIONS[mode] && !hasPausedMidSession;

  el("btnStart").disabled = isRunning;
  el("btnStartLabel").textContent = isRunning
    ? "Berjalan"
    : hasPausedMidSession
      ? "Lanjutkan"
      : "Mulai";
  el("btnPause").disabled = !isRunning;
  el("btnReset").disabled = !isRunning && isAtFullDuration;
  el("btnResetSessions").disabled = sessionsToday === 0;
}

function renderTimer() {
  const text = formatTime(remaining);
  el("timerDisplay").textContent = text;
  document.title = `${text} | Fokus Kuliah`;
  document.body.dataset.mode = mode;

  el("timerModeTag").textContent = MODE_LABELS[mode];
  el("sessionCount").textContent = String(sessionsToday);
  el("headerSessionCount").textContent = String(sessionsToday);
  el("cycleStatus").textContent =
    `Siklus: ${cycleCount} dari ${CYCLE_TARGET} sesi menuju istirahat panjang`;

  const modeButtons = {
    focus: el("modeFocus"),
    break: el("modeBreak"),
    longBreak: el("modeLongBreak"),
  };
  for (const [key, btn] of Object.entries(modeButtons)) {
    btn.classList.toggle("is-active", mode === key);
    btn.setAttribute("aria-pressed", String(mode === key));
  }
  modeButtons.focus.textContent = `Fokus ${formatTime(DURATIONS.focus)}`;
  modeButtons.break.textContent = `Istirahat ${formatTime(DURATIONS.break)}`;
  modeButtons.longBreak.textContent = `Istirahat Panjang ${formatTime(DURATIONS.longBreak)}`;

  const rawProgress = DURATIONS[mode] ? remaining / DURATIONS[mode] : 0;
  const progress = Math.min(1, Math.max(0, rawProgress));
  el("ringFg").style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress));
  updateControlStates();
}

function stopTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
  endTimestamp = null;
}

function setMode(newMode, customStatus) {
  stopTimer();
  mode = newMode;
  remaining = DURATIONS[mode];
  hasPausedMidSession = false;
  const defaultStatus = {
    focus: "Siap mulai sesi fokus.",
    break: "Siap istirahat sebentar.",
    longBreak: "Siap istirahat panjang.",
  };
  el("timerStatus").textContent = customStatus || defaultStatus[mode];
  renderTimer();
}

// ---------- Bunyi Selesai Sesi (Web Audio, tanpa berkas luar) ----------

let audioCtx = null;

function ensureAudioContext() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") {
      const resumed = audioCtx.resume();
      if (resumed && typeof resumed.catch === "function") resumed.catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function playTone(ctx, frequency, startAt, duration) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.22, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

function playDoneSound(kind) {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    if (kind === "focus") {
      playTone(ctx, 880, now, 0.22);
      playTone(ctx, 1174.66, now + 0.18, 0.32);
    } else {
      playTone(ctx, 659.25, now, 0.22);
      playTone(ctx, 523.25, now + 0.18, 0.32);
    }
  } catch {
    // Bunyi bersifat tambahan; kegagalannya tidak boleh mengganggu timer.
  }
}

// ---------- Notifikasi Browser (opt-in lewat saklar) ----------

function notificationSupported() {
  return "Notification" in window;
}

function notifySession(title, body) {
  if (!settings.notify || !notificationSupported()) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body });
  } catch {
    // Ignore notification errors in restricted browser contexts.
  }
}

function renderNotifyControl() {
  const toggle = el("notifyToggle");
  const status = el("notifyStatus");
  if (!notificationSupported()) {
    toggle.checked = false;
    toggle.disabled = true;
    status.textContent =
      "Browser ini tidak mendukung notifikasi. Sesi selesai tetap ditandai bunyi dan teks status.";
    return;
  }
  toggle.disabled = false;
  if (Notification.permission === "denied") {
    toggle.checked = false;
    status.textContent =
      "Izin notifikasi ditolak oleh browser. Ubah izin situs di pengaturan browser bila ingin mengaktifkannya.";
    return;
  }
  if (settings.notify && Notification.permission === "granted") {
    toggle.checked = true;
    status.textContent = "Aktif. Notifikasi muncul setiap sesi selesai.";
    return;
  }
  toggle.checked = false;
  status.textContent = "Nonaktif.";
}

async function onNotifyToggle() {
  const toggle = el("notifyToggle");
  if (!toggle.checked) {
    settings.notify = false;
    saveSettings();
    renderNotifyControl();
    return;
  }
  if (!notificationSupported()) {
    renderNotifyControl();
    return;
  }
  let permission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch {
      permission = Notification.permission;
    }
  }
  settings.notify = permission === "granted";
  saveSettings();
  renderNotifyControl();
}

function onSessionDone() {
  stopTimer();
  if (mode === "focus") {
    sessionsToday = readSessionsToday();
    sessionsToday += 1;
    writeLocalItem(SESSIONS_KEY, String(sessionsToday));
    recordFocusSession(settings.focus);
    renderStats();
    playDoneSound("focus");

    cycleCount += 1;
    let nextMode = "break";
    if (cycleCount >= CYCLE_TARGET) {
      nextMode = "longBreak";
      cycleCount = 0;
    }
    saveCycleCount();

    const nextMinutes = nextMode === "longBreak" ? settings.longBreak : settings.break;
    const message =
      nextMode === "longBreak"
        ? `Sesi fokus selesai. Waktunya istirahat panjang ${nextMinutes} menit.`
        : `Sesi fokus selesai. Waktunya istirahat ${nextMinutes} menit.`;
    notifySession("Sesi fokus selesai", message);
    setMode(nextMode, message);
  } else {
    const wasLongBreak = mode === "longBreak";
    playDoneSound("break");
    const message = wasLongBreak
      ? "Istirahat panjang selesai. Siap mulai fokus lagi."
      : "Istirahat selesai. Siap mulai fokus lagi.";
    notifySession("Istirahat selesai", message);
    setMode("focus", message);
  }
}

function tickTimer() {
  if (endTimestamp === null) return;
  const nextRemaining = Math.max(0, Math.ceil((endTimestamp - Date.now()) / 1000));
  if (nextRemaining === remaining) return;
  remaining = nextRemaining;
  renderTimer();
  if (remaining <= 0) {
    onSessionDone();
  }
}

function startTimer() {
  if (timerId !== null) return;
  // Konteks audio dibuka dari gestur pengguna (klik Mulai) agar tidak diblokir browser.
  ensureAudioContext();
  hasPausedMidSession = false;
  endTimestamp = Date.now() + remaining * 1000;
  el("timerStatus").textContent =
    mode === "focus" ? "Sedang fokus..." : "Sedang istirahat...";
  timerId = setInterval(tickTimer, 250);
  renderTimer();
}

function pauseTimer() {
  if (timerId === null) return;
  tickTimer();
  stopTimer();
  hasPausedMidSession = remaining < DURATIONS[mode] && remaining > 0;
  el("timerStatus").textContent = "Timer dijeda.";
  renderTimer();
}

el("btnStart").addEventListener("click", startTimer);
el("btnPause").addEventListener("click", pauseTimer);
el("btnReset").addEventListener("click", () => setMode(mode));
el("modeFocus").addEventListener("click", () => setMode("focus"));
el("modeBreak").addEventListener("click", () => setMode("break"));
el("modeLongBreak").addEventListener("click", () => setMode("longBreak"));
el("notifyToggle").addEventListener("change", onNotifyToggle);

// ---------- Formulir Pengaturan Durasi ----------

const SETTING_FIELDS = [
  { id: "setFocus", key: "focus", label: "Fokus" },
  { id: "setBreak", key: "break", label: "Istirahat" },
  { id: "setLongBreak", key: "longBreak", label: "Istirahat panjang" },
];

function clearSettingsErrors() {
  el("settingsError").hidden = true;
  el("settingsError").textContent = "";
  for (const field of SETTING_FIELDS) {
    el(field.id).removeAttribute("aria-invalid");
  }
}

el("settingsForm").addEventListener("submit", (event) => {
  event.preventDefault();
  clearSettingsErrors();
  el("settingsStatus").textContent = "";

  const invalid = [];
  const next = { ...settings };
  for (const field of SETTING_FIELDS) {
    const input = el(field.id);
    const raw = input.value.trim();
    const value = Number(raw);
    const [min, max] = SETTING_RANGES[field.key];
    if (raw === "" || !Number.isFinite(value) || value < min || value > max) {
      input.setAttribute("aria-invalid", "true");
      invalid.push(field);
    } else {
      next[field.key] = Math.round(value);
    }
  }

  if (invalid.length > 0) {
    const names = invalid.map((field) => field.label).join(", ");
    const errorEl = el("settingsError");
    errorEl.textContent =
      `Periksa lagi kolom berikut: ${names}. Fokus 1 sampai 180 menit, istirahat dan istirahat panjang 1 sampai 90 menit. Pengaturan sebelumnya tidak berubah.`;
    errorEl.hidden = false;
    el(invalid[0].id).focus();
    return;
  }

  settings = next;
  saveSettings();
  if (timerId === null && !hasPausedMidSession) {
    remaining = DURATIONS[mode];
  }
  renderTimer();
  el("settingsStatus").textContent =
    "Pengaturan tersimpan. Durasi baru berlaku mulai sesi berikutnya.";
});

for (const field of SETTING_FIELDS) {
  el(field.id).addEventListener("input", () => {
    el(field.id).removeAttribute("aria-invalid");
    if (!document.querySelector('#settingsForm [aria-invalid="true"]')) {
      el("settingsError").hidden = true;
    }
  });
}

function renderSettingsForm() {
  el("setFocus").value = String(settings.focus);
  el("setBreak").value = String(settings.break);
  el("setLongBreak").value = String(settings.longBreak);
  renderNotifyControl();
}

el("btnResetSessions").addEventListener("click", () => {
  sessionsToday = 0;
  writeLocalItem(SESSIONS_KEY, "0");
  writeLocalItem(SESSIONS_DATE_KEY, todayKey());
  renderTimer();
});

// Keep timer accurate when the tab becomes visible again after background throttling.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && timerId !== null) {
    tickTimer();
  }
});

// ---------- Deadline Ledger ----------

function saveTasks() {
  if (!storageWritable) return;
  writeLocalItem(TASKS_KEY, JSON.stringify(tasks));
}

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function deadlineBadge(task) {
  if (task.done) return { text: "Selesai", cls: "badge-done" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(task.date + "T00:00:00");
  const diff = Math.round((due - today) / 86400000);
  if (Number.isNaN(diff)) return { text: "Terjadwal", cls: "badge-later" };
  if (diff < 0) return { text: `Terlambat ${-diff} hari`, cls: "badge-late" };
  if (diff === 0) return { text: "Hari ini", cls: "badge-today" };
  if (diff === 1) return { text: "Besok", cls: "badge-soon" };
  if (diff <= 7) return { text: `${diff} hari lagi`, cls: "badge-soon" };
  return { text: `${diff} hari lagi`, cls: "badge-later" };
}

function createDeleteIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M3.5 4.5h9M6 4.5V3h4v1.5M5 4.5l.5 8.5h5l.5-8.5"
  );
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");

  svg.appendChild(path);
  return svg;
}

function updateFilterButtons() {
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    const isSelected = btn.dataset.filter === activeFilter;
    btn.classList.toggle("is-active", isSelected);
    btn.setAttribute("aria-pressed", String(isSelected));
  });
}

function renderTasks() {
  const list = el("taskList");
  const emptyBox = el("taskEmpty");
  const emptyText = el("taskEmptyText");
  const showAllBtn = el("btnShowAll");
  const clearDoneBtn = el("btnClearDone");

  list.innerHTML = "";
  updateFilterButtons();

  const activeCount = tasks.filter((t) => !t.done).length;
  const doneCount = tasks.length - activeCount;
  el("taskCount").textContent = `${activeCount} aktif`;
  clearDoneBtn.hidden = doneCount === 0;

  const sorted = [...tasks].sort((a, b) => {
    if (a.done !== b.done) return Number(a.done) - Number(b.done);
    return a.date.localeCompare(b.date);
  });

  const filtered = sorted.filter((task) => {
    if (activeFilter === "active") return !task.done;
    if (activeFilter === "done") return task.done;
    return true;
  });

  if (filtered.length === 0) {
    emptyBox.hidden = false;
    if (tasks.length === 0) {
      emptyText.textContent =
        "Belum ada deadline tercatat. Isi formulir di atas untuk menambahkan tugas pertama.";
      showAllBtn.hidden = true;
    } else if (activeFilter === "active") {
      emptyText.textContent = "Semua tugas yang tercatat sudah selesai.";
      showAllBtn.hidden = false;
    } else {
      emptyText.textContent = "Belum ada tugas yang ditandai selesai.";
      showAllBtn.hidden = false;
    }
    return;
  }

  emptyBox.hidden = true;

  for (const task of filtered) {
    const li = document.createElement("li");
    li.className = "task-item" + (task.done ? " done" : "");

    const checkWrap = document.createElement("label");
    checkWrap.className = "task-check-wrap";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(task.done);
    checkbox.setAttribute(
      "aria-label",
      `Tandai ${task.name} sebagai ${task.done ? "belum selesai" : "selesai"}`
    );
    checkbox.addEventListener("change", () => {
      task.done = checkbox.checked;
      saveTasks();
      renderTasks();
    });
    checkWrap.appendChild(checkbox);

    const info = document.createElement("div");
    info.className = "task-info";

    const nameEl = document.createElement("div");
    nameEl.className = "task-name";
    nameEl.textContent = task.name;

    const metaEl = document.createElement("div");
    metaEl.className = "task-meta";

    const courseEl = document.createElement("span");
    courseEl.className = "course";
    courseEl.textContent = task.course;

    const dateEl = document.createElement("span");
    dateEl.className = "date";
    dateEl.textContent = formatDate(task.date);

    metaEl.append(courseEl, dateEl);
    info.append(nameEl, metaEl);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const badgeData = deadlineBadge(task);
    const badge = document.createElement("span");
    badge.className = "badge " + badgeData.cls;
    badge.textContent = badgeData.text;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn-delete";
    del.setAttribute("aria-label", `Hapus tugas ${task.name}`);
    del.title = `Hapus ${task.name}`;
    del.appendChild(createDeleteIcon());
    del.addEventListener("click", () => {
      tasks = tasks.filter((t) => t.id !== task.id);
      saveTasks();
      renderTasks();
    });

    actions.append(badge, del);
    li.append(checkWrap, info, actions);
    list.appendChild(li);
  }
}

function clearFieldErrors() {
  el("formError").hidden = true;
  el("formError").textContent = "";
  ["taskName", "taskCourse", "taskDate"].forEach((id) => {
    el(id).removeAttribute("aria-invalid");
  });
}

el("taskForm").addEventListener("submit", (event) => {
  event.preventDefault();
  clearFieldErrors();

  const nameInput = el("taskName");
  const courseInput = el("taskCourse");
  const dateInput = el("taskDate");

  const name = nameInput.value.trim();
  const course = courseInput.value.trim();
  const date = dateInput.value;

  const missing = [];
  if (!name) {
    nameInput.setAttribute("aria-invalid", "true");
    missing.push({ input: nameInput, label: "Nama tugas" });
  }
  if (!course) {
    courseInput.setAttribute("aria-invalid", "true");
    missing.push({ input: courseInput, label: "Mata kuliah" });
  }
  if (!date) {
    dateInput.setAttribute("aria-invalid", "true");
    missing.push({ input: dateInput, label: "Batas waktu" });
  }

  if (missing.length > 0) {
    const names = missing.map((item) => item.label).join(", ");
    const errorEl = el("formError");
    errorEl.textContent = `Lengkapi kolom wajib berikut: ${names}.`;
    errorEl.hidden = false;
    missing[0].input.focus();
    return;
  }

  tasks.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    course,
    date,
    done: false,
  });
  saveTasks();
  if (activeFilter === "done") activeFilter = "all";
  renderTasks();
  event.target.reset();
  nameInput.focus();
});

["taskName", "taskCourse", "taskDate"].forEach((id) => {
  el(id).addEventListener("input", () => {
    el(id).removeAttribute("aria-invalid");
    if (!document.querySelector('#taskForm [aria-invalid="true"]')) {
      el("formError").hidden = true;
    }
  });
});

document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    activeFilter = btn.dataset.filter || "all";
    renderTasks();
  });
});

el("btnShowAll").addEventListener("click", () => {
  activeFilter = "all";
  renderTasks();
});

el("btnClearDone").addEventListener("click", () => {
  tasks = tasks.filter((t) => !t.done);
  saveTasks();
  if (activeFilter === "done") activeFilter = "all";
  renderTasks();
});

el("btnDismissAlert").addEventListener("click", hideStorageAlert);

el("btnResetStorage").addEventListener("click", () => {
  try {
    localStorage.removeItem(TASKS_KEY);
    localStorage.removeItem(SESSIONS_KEY);
    localStorage.removeItem(SESSIONS_DATE_KEY);
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(CYCLE_KEY);
    storageWritable = true;
  } catch {
    // Keep going with in-memory defaults if storage remains blocked.
  }
  tasks = [];
  sessionsToday = 0;
  focusHistory = {};
  settings = { ...DEFAULT_SETTINGS };
  applySettings();
  cycleCount = 0;
  setMode("focus", "Siap mulai sesi fokus.");
  hideStorageAlert();
  renderTimer();
  renderStats();
  renderTasks();
  renderSettingsForm();
  el("settingsStatus").textContent = "";
});

function initApp() {
  renderTodayDate();
  settings = readLocalSettings();
  applySettings();
  remaining = DURATIONS[mode];
  cycleCount = readCycleCount();
  sessionsToday = readSessionsToday();
  ensureHistorySeed();
  tasks = readLocalTasks();
  el("taskLoading").hidden = true;
  renderTimer();
  renderStats();
  renderTasks();
  renderSettingsForm();
}

initApp();
