const DURATIONS = { focus: 25 * 60, break: 5 * 60, longBreak: 15 * 60 };
const RING_CIRCUMFERENCE = 2 * Math.PI * 90;
const SESSIONS_KEY = "fk_sessions";
const SESSIONS_DATE_KEY = "fk_sessions_date";
const HISTORY_KEY = "fk_history";
const COURSE_HISTORY_KEY = "fk_course_history";
const TASKS_KEY = "fk_tasks";
const SETTINGS_KEY = "fk_settings";
const CYCLE_KEY = "fk_cycle";
const ACTIVE_TASK_KEY = "fk_active_task";
const CYCLE_TARGET = 4;

const DEFAULT_SETTINGS = {
  focus: 25,
  break: 5,
  longBreak: 15,
  notify: false,
  sound: true,
  autoStart: false,
};
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
let activeSessionMinutes = DEFAULT_SETTINGS.focus;
let timerId = null;
let endTimestamp = null;
let hasPausedMidSession = false;
let sessionsToday = 0;
let settings = structuredClone(DEFAULT_SETTINGS);
let cycleCount = 0;
let focusHistory = {};
let courseHistory = {};
let tasks = [];
let activeTaskId = "";
let editingTaskId = "";
let activeFilter = "all";
let activeCourseFilter = "all";
let searchQuery = "";
let storageWritable = true;
let lastRenderedDateKey = "";

function announce(message) {
  const region = el("liveAnnouncer");
  if (!region) return;
  region.textContent = "";
  setTimeout(() => {
    region.textContent = message;
  }, 50);
}

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
    showStorageAlert(
      "Browser membatasi akses penyimpanan lokal. Perubahan sesi mungkin tidak tersimpan."
    );
    return 0;
  }
}

function readLocalString(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeLocalItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    storageWritable = false;
    showStorageAlert(
      "Gagal menyimpan data ke penyimpanan browser. Periksa kuota atau izin situs."
    );
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

// Parse YYYY-MM-DD in local wall-clock time so UTC offsets never shift calendar dates.
function parseIsoDateLocal(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function isValidTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
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

function sanitizeSettingValue(key, value) {
  const n = Number(value);
  const [min, max] = SETTING_RANGES[key];
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS[key];
  const rounded = Math.round(n);
  return rounded >= min && rounded <= max ? rounded : DEFAULT_SETTINGS[key];
}

function sanitizeSettingsObject(parsed) {
  const result = structuredClone(DEFAULT_SETTINGS);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return result;
  for (const key of ["focus", "break", "longBreak"]) {
    result[key] = sanitizeSettingValue(key, parsed[key]);
  }
  result.notify = parsed.notify === true;
  result.sound = parsed.sound !== false;
  result.autoStart = parsed.autoStart === true;
  return result;
}

function readLocalSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    return sanitizeSettingsObject(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
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

function saveActiveTaskId() {
  if (!storageWritable) return;
  writeLocalItem(ACTIVE_TASK_KEY, activeTaskId);
}

function sanitizeHistoryEntry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const sessions = Number(value.sessions);
  const minutes = Number(value.minutes);
  if (!Number.isFinite(sessions) || !Number.isFinite(minutes)) return null;
  if (sessions < 0 || minutes < 0) return null;
  return { sessions: Math.floor(sessions), minutes: Math.floor(minutes) };
}

function sanitizeHistoryMap(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const clean = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!parseIsoDateLocal(key)) continue;
    const entry = sanitizeHistoryEntry(value);
    if (entry) clean[key] = entry;
  }
  return clean;
}

function readLocalHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return {};
    return sanitizeHistoryMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

function saveHistory() {
  writeLocalItem(HISTORY_KEY, JSON.stringify(focusHistory));
}

function sanitizeCourseHistoryMap(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const clean = {};
  for (const [dateKey, courses] of Object.entries(parsed)) {
    if (!parseIsoDateLocal(dateKey)) continue;
    if (!courses || typeof courses !== "object" || Array.isArray(courses)) continue;
    const dayBucket = {};
    for (const [courseName, val] of Object.entries(courses)) {
      const name = String(courseName).trim();
      const entry = sanitizeHistoryEntry(val);
      if (name && entry) dayBucket[name] = entry;
    }
    if (Object.keys(dayBucket).length > 0) clean[dateKey] = dayBucket;
  }
  return clean;
}

function readLocalCourseHistory() {
  try {
    const raw = localStorage.getItem(COURSE_HISTORY_KEY);
    if (!raw) return {};
    return sanitizeCourseHistoryMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

function saveCourseHistory() {
  writeLocalItem(COURSE_HISTORY_KEY, JSON.stringify(courseHistory));
}

// Seed history once for users upgrading from pre-history versions.
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

function recordFocusSession(durationMinutes, linkedCourse) {
  const key = todayKey();
  const entry = Object.hasOwn(focusHistory, key)
    ? focusHistory[key]
    : { sessions: 0, minutes: 0 };
  entry.sessions += 1;
  entry.minutes += durationMinutes;
  focusHistory[key] = entry;
  saveHistory();

  if (linkedCourse) {
    const dayBucket = Object.hasOwn(courseHistory, key) ? courseHistory[key] : {};
    const courseEntry = Object.hasOwn(dayBucket, linkedCourse)
      ? dayBucket[linkedCourse]
      : { sessions: 0, minutes: 0 };
    courseEntry.sessions += 1;
    courseEntry.minutes += durationMinutes;
    dayBucket[linkedCourse] = courseEntry;
    courseHistory[key] = dayBucket;
    saveCourseHistory();
  }
}

function summarizeWeek(history, now = new Date()) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  let sessions = 0;
  let minutes = 0;
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const key = dateKeyOf(day);
    const entry = Object.hasOwn(history, key) ? history[key] : null;
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
    const key = dateKeyOf(day);
    const entry = Object.hasOwn(history, key) ? history[key] : null;
    days.push({
      key,
      label: DAY_NAMES_ID[day.getDay()],
      sessions: entry ? entry.sessions : 0,
      minutes: entry ? entry.minutes : 0,
      isToday: offset === 0,
    });
  }
  return days;
}

function computeStreak(history, now = new Date()) {
  const todayStr = dateKeyOf(now);
  const todayHas =
    Object.hasOwn(history, todayStr) && history[todayStr].sessions > 0;
  let offset = todayHas ? 0 : 1;
  let streak = 0;
  while (offset < 3650) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    const key = dateKeyOf(day);
    if (Object.hasOwn(history, key) && history[key].sessions > 0) {
      streak += 1;
      offset += 1;
    } else {
      break;
    }
  }
  return streak;
}

function aggregateCourseTotals() {
  const totals = new Map();
  for (const dayBucket of Object.values(courseHistory)) {
    for (const [course, entry] of Object.entries(dayBucket)) {
      const current = totals.get(course) || { sessions: 0, minutes: 0 };
      current.sessions += entry.sessions;
      current.minutes += entry.minutes;
      totals.set(course, current);
    }
  }
  return Array.from(totals.entries())
    .map(([course, data]) => ({ course, ...data }))
    .toSorted((a, b) => b.minutes - a.minutes);
}

function renderCourseStats() {
  const wrap = el("courseStatsWrap");
  const list = el("courseStatsList");
  const rows = aggregateCourseTotals().filter((r) => r.minutes > 0);
  if (rows.length === 0) {
    wrap.hidden = true;
    list.replaceChildren();
    return;
  }

  wrap.hidden = false;
  const maxMinutes = rows[0].minutes;
  const items = rows.slice(0, 6).map((row) => {
    const li = document.createElement("li");
    li.className = "course-stat-item";

    const head = document.createElement("div");
    head.className = "course-stat-head";

    const name = document.createElement("span");
    name.className = "course-stat-name";
    name.textContent = row.course;

    const val = document.createElement("span");
    val.className = "course-stat-val";
    val.textContent = `${row.minutes} mnt (${row.sessions} sesi)`;

    head.append(name, val);

    const track = document.createElement("div");
    track.className = "course-stat-track";
    const fill = document.createElement("div");
    fill.className = "course-stat-fill";
    const pct = maxMinutes > 0 ? Math.max(4, Math.round((row.minutes / maxMinutes) * 100)) : 0;
    fill.style.width = `${pct}%`;
    track.appendChild(fill);

    li.append(head, track);
    return li;
  });

  list.replaceChildren(...items);
}

function renderStats() {
  const week = summarizeWeek(focusHistory);
  const days = lastSevenDays(focusHistory);
  const sum7 = days.reduce((acc, d) => acc + d.minutes, 0);
  const streak = computeStreak(focusHistory);

  el("statWeekMinutes").textContent = String(week.minutes);
  el("statWeekSessions").textContent = String(week.sessions);
  el("statStreak").textContent = String(streak);
  el("statDailyAvg").textContent = String(Math.round(sum7 / 7));

  const hasAnyHistory = Object.values(focusHistory).some(
    (entry) => entry.sessions > 0 || entry.minutes > 0
  );
  el("statsEmpty").hidden = hasAnyHistory;

  const maxMinutes = Math.max(...days.map((day) => day.minutes), 0);
  const chart = el("statsChart");
  const cols = days.map((day) => {
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
    bar.style.height = `${pct}%`;
    track.appendChild(bar);

    const label = document.createElement("span");
    label.className = "chart-day";
    label.textContent = day.label;

    col.append(value, track, label);
    return col;
  });

  chart.replaceChildren(...cols);

  const today = days[days.length - 1];
  chart.setAttribute(
    "aria-label",
    `Grafik menit fokus 7 hari terakhir. Hari ini ${today.minutes} menit. Total minggu ini ${week.minutes} menit dari ${week.sessions} sesi.`
  );

  renderCourseStats();
}

function sanitizeTaskItem(item, index) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  if (typeof item.name !== "string" || typeof item.course !== "string" || typeof item.date !== "string") {
    return null;
  }
  const name = item.name.trim();
  const course = item.course.trim();
  if (!name || !course || !parseIsoDateLocal(item.date)) return null;
  const focusSessions = Number(item.focusSessions);
  const focusMinutes = Number(item.focusMinutes);
  return {
    id:
      typeof item.id === "string" && item.id.trim()
        ? item.id.trim()
        : `task-${Date.now()}-${index}`,
    name,
    course,
    date: item.date,
    time: isValidTime(item.time) ? item.time : "",
    done: item.done === true,
    focusSessions:
      Number.isFinite(focusSessions) && focusSessions >= 0 ? Math.floor(focusSessions) : 0,
    focusMinutes:
      Number.isFinite(focusMinutes) && focusMinutes >= 0 ? Math.floor(focusMinutes) : 0,
  };
}

function readLocalTasks() {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("Format daftar tugas tidak valid");
    }
    return parsed.map(sanitizeTaskItem).filter(Boolean);
  } catch {
    showStorageAlert(
      "Data deadline tersimpan tidak dapat dibaca. Anda bisa mengatur ulang penyimpanan agar kembali normal."
    );
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
  lastRenderedDateKey = dateKeyOf(now);
  dateEl.dateTime = lastRenderedDateKey;
  dateEl.textContent = now.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function syncDayRollover() {
  const currentKey = todayKey();
  if (currentKey === lastRenderedDateKey) return;
  renderTodayDate();
  sessionsToday = readSessionsToday();
  renderTimer();
  renderStats();
  renderTasks();
}

function getLinkedTask() {
  if (!activeTaskId) return null;
  const found = tasks.find((t) => t.id === activeTaskId && !t.done);
  if (!found) {
    activeTaskId = "";
    saveActiveTaskId();
    return null;
  }
  return found;
}

function renderActiveTask() {
  const box = el("activeTaskBox");
  const titleEl = el("activeTaskTitle");
  const courseEl = el("activeTaskCourse");
  const clearBtn = el("btnClearActiveTask");
  const task = getLinkedTask();

  if (!task) {
    box.classList.remove("has-task");
    titleEl.textContent =
      "Belum ada tugas tertaut. Pilih tombol Fokuskan di daftar deadline.";
    courseEl.hidden = true;
    courseEl.textContent = "";
    clearBtn.hidden = true;
    return;
  }

  box.classList.add("has-task");
  titleEl.textContent = task.name;
  courseEl.textContent =
    task.focusSessions > 0
      ? `${task.course} · ${task.focusSessions} sesi selesai`
      : task.course;
  courseEl.hidden = false;
  clearBtn.hidden = false;
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
  activeSessionMinutes = Math.max(1, Math.round(DURATIONS[mode] / 60));
  hasPausedMidSession = false;
  const defaultStatus = {
    focus: "Siap mulai sesi fokus.",
    break: "Siap istirahat sebentar.",
    longBreak: "Siap istirahat panjang.",
  };
  el("timerStatus").textContent = customStatus || defaultStatus[mode];
  renderTimer();
}

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
  if (!settings.sound) return;
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
    // Sound is an optional cue; failure must never interrupt the timer.
  }
}

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
  syncDayRollover();

  if (mode === "focus") {
    const completedMinutes = Math.max(1, activeSessionMinutes);
    const linkedTask = getLinkedTask();

    sessionsToday = readSessionsToday() + 1;
    writeLocalItem(SESSIONS_KEY, String(sessionsToday));
    recordFocusSession(completedMinutes, linkedTask ? linkedTask.course : "");

    if (linkedTask) {
      linkedTask.focusSessions += 1;
      linkedTask.focusMinutes += completedMinutes;
      saveTasks();
      renderTasks();
      renderActiveTask();
    }

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
    if (settings.autoStart) startTimer();
  } else {
    const wasLongBreak = mode === "longBreak";
    playDoneSound("break");
    const message = wasLongBreak
      ? "Istirahat panjang selesai. Siap mulai fokus lagi."
      : "Istirahat selesai. Siap mulai fokus lagi.";
    notifySession("Istirahat selesai", message);
    setMode("focus", message);
    if (settings.autoStart) startTimer();
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
  // AudioContext must be unlocked inside a user gesture so completion chimes are not blocked.
  ensureAudioContext();
  if (!hasPausedMidSession && remaining === DURATIONS[mode]) {
    activeSessionMinutes = Math.max(1, Math.round(DURATIONS[mode] / 60));
  }
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

function skipSession() {
  if (mode === "focus") {
    setMode("break", "Sesi fokus dilewati. Siap istirahat sebentar.");
    announce("Sesi fokus dilewati. Beralih ke mode istirahat.");
  } else {
    setMode("focus", "Istirahat dilewati. Siap mulai sesi fokus.");
    announce("Sesi istirahat dilewati. Beralih ke mode fokus.");
  }
}

el("btnStart").addEventListener("click", startTimer);
el("btnPause").addEventListener("click", pauseTimer);
el("btnReset").addEventListener("click", () => setMode(mode));
el("btnSkip").addEventListener("click", skipSession);
el("modeFocus").addEventListener("click", () => setMode("focus"));
el("modeBreak").addEventListener("click", () => setMode("break"));
el("modeLongBreak").addEventListener("click", () => setMode("longBreak"));
el("notifyToggle").addEventListener("change", onNotifyToggle);

el("soundToggle").addEventListener("change", () => {
  settings.sound = el("soundToggle").checked;
  saveSettings();
});

el("autoStartToggle").addEventListener("change", () => {
  settings.autoStart = el("autoStartToggle").checked;
  saveSettings();
});

el("btnClearActiveTask").addEventListener("click", () => {
  activeTaskId = "";
  saveActiveTaskId();
  renderActiveTask();
  renderTasks();
  announce("Target tugas dilepas dari timer.");
});

// Keyboard shortcuts: Space (start/pause) and R (reset) when not inside interactive controls.
document.addEventListener("keydown", (event) => {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (
    target instanceof Element &&
    target.closest("input, textarea, select, button, a, [contenteditable]")
  ) {
    return;
  }
  if (event.code === "Space") {
    event.preventDefault();
    if (timerId !== null) pauseTimer();
    else startTimer();
  } else if (event.key === "r" || event.key === "R") {
    if (!el("btnReset").disabled) {
      event.preventDefault();
      setMode(mode);
    }
  }
});

const SETTING_FIELDS = [
  { id: "setFocus", key: "focus", label: "Fokus" },
  { id: "setBreak", key: "break", label: "Istirahat" },
  { id: "setLongBreak", key: "longBreak", label: "Istirahat panjang" },
];

function setFieldValidationState(input, errorId, invalid) {
  input.setAttribute("aria-invalid", invalid ? "true" : "false");
  if (!errorId) return;
  const existing = (input.getAttribute("aria-describedby") || "")
    .split(/\s+/)
    .filter((id) => id && id !== errorId);
  if (invalid) existing.push(errorId);
  if (existing.length > 0) input.setAttribute("aria-describedby", existing.join(" "));
  else input.removeAttribute("aria-describedby");
}

function clearSettingsErrors() {
  const errorEl = el("settingsError");
  errorEl.hidden = true;
  errorEl.textContent = "";
  for (const field of SETTING_FIELDS) {
    setFieldValidationState(el(field.id), "settingsError", false);
  }
}

el("settingsForm").addEventListener("submit", (event) => {
  event.preventDefault();
  clearSettingsErrors();
  el("settingsStatus").textContent = "";

  const invalid = [];
  const next = structuredClone(settings);
  for (const field of SETTING_FIELDS) {
    const input = el(field.id);
    const raw = input.value.trim();
    const value = Number(raw);
    const [min, max] = SETTING_RANGES[field.key];
    if (raw === "" || !Number.isFinite(value) || value < min || value > max) {
      setFieldValidationState(input, "settingsError", true);
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
    activeSessionMinutes = Math.max(1, Math.round(DURATIONS[mode] / 60));
  }
  renderTimer();
  el("settingsStatus").textContent =
    "Pengaturan tersimpan. Durasi baru berlaku mulai sesi berikutnya.";
});

for (const field of SETTING_FIELDS) {
  el(field.id).addEventListener("input", () => {
    setFieldValidationState(el(field.id), "settingsError", false);
    if (!document.querySelector('#settingsForm [aria-invalid="true"]')) {
      el("settingsError").hidden = true;
    }
  });
}

function renderSettingsForm() {
  el("setFocus").value = String(settings.focus);
  el("setBreak").value = String(settings.break);
  el("setLongBreak").value = String(settings.longBreak);
  el("soundToggle").checked = settings.sound;
  el("autoStartToggle").checked = settings.autoStart;
  renderNotifyControl();
}

el("btnResetSessions").addEventListener("click", () => {
  sessionsToday = 0;
  writeLocalItem(SESSIONS_KEY, "0");
  writeLocalItem(SESSIONS_DATE_KEY, todayKey());
  renderTimer();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  syncDayRollover();
  if (timerId !== null) {
    tickTimer();
  }
});

function saveTasks() {
  if (!storageWritable) return;
  writeLocalItem(TASKS_KEY, JSON.stringify(tasks));
}

function formatDate(iso) {
  const d = parseIsoDateLocal(iso);
  if (!d) return iso;
  return d.toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function deadlineBadge(task) {
  if (task.done) return { text: "Selesai", cls: "badge-done" };
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = parseIsoDateLocal(task.date);
  if (!due) return { text: "Terjadwal", cls: "badge-later" };
  const diff = Math.round((due - today) / 86400000);
  if (diff < 0) return { text: `Terlambat ${-diff} hari`, cls: "badge-late" };
  if (diff === 0) return { text: "Hari ini", cls: "badge-today" };
  if (diff === 1) return { text: "Besok", cls: "badge-soon" };
  if (diff <= 7) return { text: `${diff} hari lagi`, cls: "badge-soon" };
  return { text: `${diff} hari lagi`, cls: "badge-later" };
}

function createActionSvg(pathData) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathData);
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

function updateCourseControls() {
  const uniqueCourses = Array.from(
    new Set(tasks.map((t) => t.course.trim()).filter(Boolean))
  ).toSorted((a, b) => a.localeCompare(b, "id-ID"));

  const datalist = el("courseSuggestions");
  const datalistNodes = uniqueCourses.map((course) => {
    const opt = document.createElement("option");
    opt.value = course;
    return opt;
  });
  datalist.replaceChildren(...datalistNodes);

  const select = el("courseFilter");
  if (activeCourseFilter !== "all" && !uniqueCourses.includes(activeCourseFilter)) {
    activeCourseFilter = "all";
  }

  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "Semua mata kuliah";
  const courseOpts = uniqueCourses.map((course) => {
    const opt = document.createElement("option");
    opt.value = course;
    opt.textContent = course;
    return opt;
  });
  select.replaceChildren(allOpt, ...courseOpts);
  select.value = activeCourseFilter;
}

function buildEditForm(task) {
  const form = document.createElement("form");
  form.className = "task-edit-form";
  form.noValidate = true;

  const errorBox = document.createElement("div");
  errorBox.className = "form-error task-edit-full";
  errorBox.role = "alert";
  errorBox.hidden = true;
  const errorId = `editError-${task.id}`;
  errorBox.id = errorId;

  const nameField = document.createElement("div");
  nameField.className = "field task-edit-full";
  const nameLabel = document.createElement("label");
  nameLabel.htmlFor = `editName-${task.id}`;
  nameLabel.textContent = "Nama tugas";
  const nameInput = document.createElement("input");
  nameInput.id = `editName-${task.id}`;
  nameInput.type = "text";
  nameInput.value = task.name;
  nameInput.required = true;
  nameInput.setAttribute("aria-invalid", "false");
  nameField.append(nameLabel, nameInput);

  const courseField = document.createElement("div");
  courseField.className = "field";
  const courseLabel = document.createElement("label");
  courseLabel.htmlFor = `editCourse-${task.id}`;
  courseLabel.textContent = "Mata kuliah";
  const courseInput = document.createElement("input");
  courseInput.id = `editCourse-${task.id}`;
  courseInput.type = "text";
  courseInput.setAttribute("list", "courseSuggestions");
  courseInput.value = task.course;
  courseInput.required = true;
  courseInput.setAttribute("aria-invalid", "false");
  courseField.append(courseLabel, courseInput);

  const pair = document.createElement("div");
  pair.className = "field-pair";

  const dateField = document.createElement("div");
  dateField.className = "field";
  const dateLabel = document.createElement("label");
  dateLabel.htmlFor = `editDate-${task.id}`;
  dateLabel.textContent = "Batas waktu";
  const dateInput = document.createElement("input");
  dateInput.id = `editDate-${task.id}`;
  dateInput.type = "date";
  dateInput.value = task.date;
  dateInput.required = true;
  dateInput.setAttribute("aria-invalid", "false");
  dateField.append(dateLabel, dateInput);

  const timeField = document.createElement("div");
  timeField.className = "field";
  const timeLabel = document.createElement("label");
  timeLabel.htmlFor = `editTime-${task.id}`;
  timeLabel.textContent = "Jam (opsional)";
  const timeInput = document.createElement("input");
  timeInput.id = `editTime-${task.id}`;
  timeInput.type = "time";
  timeInput.value = task.time || "";
  timeField.append(timeLabel, timeInput);

  pair.append(dateField, timeField);

  const actions = document.createElement("div");
  actions.className = "task-edit-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn-secondary";
  cancelBtn.textContent = "Batal";
  cancelBtn.addEventListener("click", () => {
    editingTaskId = "";
    renderTasks();
    const editTrigger = document.querySelector(`[data-edit-id="${task.id}"]`);
    if (editTrigger instanceof HTMLElement) editTrigger.focus();
  });

  const saveBtn = document.createElement("button");
  saveBtn.type = "submit";
  saveBtn.className = "btn-primary";
  saveBtn.textContent = "Simpan";

  actions.append(cancelBtn, saveBtn);
  form.append(errorBox, nameField, courseField, pair, actions);

  [nameInput, courseInput, dateInput].forEach((input) => {
    input.addEventListener("input", () => {
      setFieldValidationState(input, errorId, false);
      if (!form.querySelector('[aria-invalid="true"]')) {
        errorBox.hidden = true;
      }
    });
  });

  form.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelBtn.click();
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const nextName = nameInput.value.trim();
    const nextCourse = courseInput.value.trim();
    const nextDate = dateInput.value;
    const nextTime = isValidTime(timeInput.value) ? timeInput.value : "";

    const missing = [];
    if (!nextName) {
      setFieldValidationState(nameInput, errorId, true);
      missing.push({ input: nameInput, label: "Nama tugas" });
    }
    if (!nextCourse) {
      setFieldValidationState(courseInput, errorId, true);
      missing.push({ input: courseInput, label: "Mata kuliah" });
    }
    if (!nextDate || !parseIsoDateLocal(nextDate)) {
      setFieldValidationState(dateInput, errorId, true);
      missing.push({ input: dateInput, label: "Batas waktu" });
    }

    if (missing.length > 0) {
      errorBox.textContent = `Lengkapi kolom wajib berikut: ${missing.map((m) => m.label).join(", ")}.`;
      errorBox.hidden = false;
      missing[0].input.focus();
      return;
    }

    task.name = nextName;
    task.course = nextCourse;
    task.date = nextDate;
    task.time = nextTime;
    editingTaskId = "";
    saveTasks();
    renderTasks();
    renderActiveTask();
    announce(`Tugas ${task.name} diperbarui.`);
    const editTrigger = document.querySelector(`[data-edit-id="${task.id}"]`);
    if (editTrigger instanceof HTMLElement) editTrigger.focus();
  });

  return form;
}

function renderTasks() {
  const list = el("taskList");
  const emptyBox = el("taskEmpty");
  const emptyText = el("taskEmptyText");
  const showAllBtn = el("btnShowAll");
  const clearDoneBtn = el("btnClearDone");

  updateFilterButtons();
  updateCourseControls();

  const activeCount = tasks.filter((t) => !t.done).length;
  const doneCount = tasks.length - activeCount;
  el("taskCount").textContent = `${activeCount} aktif`;
  clearDoneBtn.hidden = doneCount === 0;

  const sorted = tasks.toSorted((a, b) => {
    if (a.done !== b.done) return Number(a.done) - Number(b.done);
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return (a.time || "23:59").localeCompare(b.time || "23:59");
  });

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase("id-ID");
  const filtered = sorted.filter((task) => {
    if (activeFilter === "active" && task.done) return false;
    if (activeFilter === "done" && !task.done) return false;
    if (activeCourseFilter !== "all" && task.course !== activeCourseFilter) return false;
    if (normalizedQuery) {
      const hay = `${task.name} ${task.course}`.toLocaleLowerCase("id-ID");
      if (!hay.includes(normalizedQuery)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    list.replaceChildren();
    emptyBox.hidden = false;
    if (tasks.length === 0) {
      emptyText.textContent =
        "Belum ada deadline tercatat. Isi formulir di atas untuk menambahkan tugas pertama.";
      showAllBtn.hidden = true;
    } else if (normalizedQuery || activeCourseFilter !== "all") {
      emptyText.textContent = "Tidak ada tugas yang cocok dengan pencarian atau filter mata kuliah.";
      showAllBtn.hidden = false;
      showAllBtn.textContent = "Reset filter";
    } else if (activeFilter === "active") {
      emptyText.textContent = "Semua tugas yang tercatat sudah selesai.";
      showAllBtn.hidden = false;
      showAllBtn.textContent = "Tampilkan semua tugas";
    } else {
      emptyText.textContent = "Belum ada tugas yang ditandai selesai.";
      showAllBtn.hidden = false;
      showAllBtn.textContent = "Tampilkan semua tugas";
    }
    return;
  }

  emptyBox.hidden = true;

  const items = filtered.map((task) => {
    const li = document.createElement("li");
    const isFocused = !task.done && activeTaskId === task.id;
    const isEditing = editingTaskId === task.id;
    li.className =
      "task-item" +
      (task.done ? " done" : "") +
      (isFocused ? " is-focused-task" : "") +
      (isEditing ? " is-editing" : "");

    if (isEditing) {
      li.appendChild(buildEditForm(task));
      return li;
    }

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
      if (task.done && activeTaskId === task.id) {
        activeTaskId = "";
        saveActiveTaskId();
      }
      saveTasks();
      renderTasks();
      renderActiveTask();
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
    dateEl.textContent = task.time
      ? `${formatDate(task.date)} · ${task.time}`
      : formatDate(task.date);

    metaEl.append(courseEl, dateEl);

    if (task.focusSessions > 0) {
      const pill = document.createElement("span");
      pill.className = "pomodoro-pill";
      pill.textContent = `${task.focusSessions} sesi · ${task.focusMinutes} mnt`;
      metaEl.appendChild(pill);
    }

    info.append(nameEl, metaEl);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const badgeData = deadlineBadge(task);
    const badge = document.createElement("span");
    badge.className = "badge " + badgeData.cls;
    badge.textContent = badgeData.text;
    actions.appendChild(badge);

    if (!task.done) {
      const focusBtn = document.createElement("button");
      focusBtn.type = "button";
      focusBtn.className = "btn-focus-task";
      focusBtn.setAttribute("aria-pressed", String(isFocused));
      focusBtn.textContent = isFocused ? "Sedang fokus" : "Fokuskan";
      focusBtn.setAttribute(
        "aria-label",
        isFocused ? `Lepas fokus dari ${task.name}` : `Fokuskan timer pada ${task.name}`
      );
      focusBtn.addEventListener("click", () => {
        activeTaskId = isFocused ? "" : task.id;
        saveActiveTaskId();
        renderActiveTask();
        renderTasks();
        announce(
          activeTaskId
            ? `Target fokus disetel ke ${task.name}.`
            : `Target fokus ${task.name} dilepas.`
        );
      });
      actions.appendChild(focusBtn);
    }

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn-icon-action";
    editBtn.dataset.editId = task.id;
    editBtn.setAttribute("aria-label", `Ubah tugas ${task.name}`);
    editBtn.appendChild(
      createActionSvg("M11.5 2.5l2 2L5.5 12.5H3.5v-2l8-8z")
    );
    editBtn.addEventListener("click", () => {
      editingTaskId = task.id;
      renderTasks();
      const input = el(`editName-${task.id}`);
      if (input) input.focus();
    });

    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn-delete";
    del.setAttribute("aria-label", `Hapus tugas ${task.name}`);
    del.appendChild(
      createActionSvg("M3.5 4.5h9M6 4.5V3h4v1.5M5 4.5l.5 8.5h5l.5-8.5")
    );
    del.addEventListener("click", () => {
      tasks = tasks.filter((t) => t.id !== task.id);
      if (activeTaskId === task.id) {
        activeTaskId = "";
        saveActiveTaskId();
      }
      if (editingTaskId === task.id) editingTaskId = "";
      saveTasks();
      renderTasks();
      renderActiveTask();
      announce(`Tugas ${task.name} dihapus.`);
    });

    actions.append(editBtn, del);
    li.append(checkWrap, info, actions);
    return li;
  });

  list.replaceChildren(...items);
}

function clearFieldErrors() {
  el("formError").hidden = true;
  el("formError").textContent = "";
  ["taskName", "taskCourse", "taskDate"].forEach((id) => {
    setFieldValidationState(el(id), "formError", false);
  });
}

el("taskForm").addEventListener("submit", (event) => {
  event.preventDefault();
  clearFieldErrors();

  const nameInput = el("taskName");
  const courseInput = el("taskCourse");
  const dateInput = el("taskDate");
  const timeInput = el("taskTime");

  const name = nameInput.value.trim();
  const course = courseInput.value.trim();
  const date = dateInput.value;
  const time = isValidTime(timeInput.value) ? timeInput.value : "";

  const missing = [];
  if (!name) {
    setFieldValidationState(nameInput, "formError", true);
    missing.push({ input: nameInput, label: "Nama tugas" });
  }
  if (!course) {
    setFieldValidationState(courseInput, "formError", true);
    missing.push({ input: courseInput, label: "Mata kuliah" });
  }
  if (!date || !parseIsoDateLocal(date)) {
    setFieldValidationState(dateInput, "formError", true);
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
    time,
    done: false,
    focusSessions: 0,
    focusMinutes: 0,
  });
  saveTasks();
  if (activeFilter === "done") activeFilter = "all";
  renderTasks();
  event.target.reset();
  clearFieldErrors();
  nameInput.focus();
  announce(`Deadline ${name} ditambahkan.`);
});

["taskName", "taskCourse", "taskDate"].forEach((id) => {
  el(id).addEventListener("input", () => {
    setFieldValidationState(el(id), "formError", false);
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

el("taskSearch").addEventListener("input", (event) => {
  searchQuery = event.target.value;
  renderTasks();
});

el("courseFilter").addEventListener("change", (event) => {
  activeCourseFilter = event.target.value || "all";
  renderTasks();
});

el("btnShowAll").addEventListener("click", () => {
  activeFilter = "all";
  activeCourseFilter = "all";
  searchQuery = "";
  el("taskSearch").value = "";
  el("courseFilter").value = "all";
  renderTasks();
});

el("btnClearDone").addEventListener("click", () => {
  tasks = tasks.filter((t) => !t.done);
  saveTasks();
  if (activeFilter === "done") activeFilter = "all";
  renderTasks();
  renderActiveTask();
});

// Export / Import JSON Backup
function showBackupStatus(message, isError = false) {
  const statusEl = el("backupStatus");
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
  statusEl.hidden = false;
}

el("btnExportData").addEventListener("click", () => {
  const payload = {
    app: "fokus-kuliah",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: {
      tasks,
      history: focusHistory,
      courseHistory,
      settings,
      cycleCount,
      sessionsToday,
      sessionsDate: todayKey(),
      activeTaskId,
    },
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fokus-kuliah-backup-${todayKey()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showBackupStatus(`Cadangan JSON diekspor (${tasks.length} tugas).`);
});

el("btnImportData").addEventListener("click", () => {
  el("importFileInput").value = "";
  el("importFileInput").click();
});

el("importFileInput").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || parsed.app !== "fokus-kuliah" || !parsed.data) {
      throw new Error("Berkas cadangan bukan format Fokus Kuliah yang valid.");
    }
    const data = parsed.data;
    const nextTasks = Array.isArray(data.tasks)
      ? data.tasks.map(sanitizeTaskItem).filter(Boolean)
      : [];
    const nextHistory = sanitizeHistoryMap(data.history);
    const nextCourseHistory = sanitizeCourseHistoryMap(data.courseHistory);
    const nextSettings = sanitizeSettingsObject(data.settings);
    const nextCycle =
      Number.isFinite(Number(data.cycleCount)) && Number(data.cycleCount) >= 0
        ? Math.min(Math.floor(Number(data.cycleCount)), CYCLE_TARGET - 1)
        : 0;
    const isSameDay = data.sessionsDate === todayKey();
    const nextSessionsToday =
      isSameDay && Number.isFinite(Number(data.sessionsToday)) && Number(data.sessionsToday) >= 0
        ? Math.floor(Number(data.sessionsToday))
        : 0;
    const nextActiveTaskId =
      typeof data.activeTaskId === "string" ? data.activeTaskId.trim() : "";

    tasks = nextTasks;
    focusHistory = nextHistory;
    courseHistory = nextCourseHistory;
    settings = nextSettings;
    applySettings();
    cycleCount = nextCycle;
    sessionsToday = nextSessionsToday;
    activeTaskId = nextActiveTaskId;
    editingTaskId = "";
    storageWritable = true;

    writeLocalItem(TASKS_KEY, JSON.stringify(tasks));
    writeLocalItem(HISTORY_KEY, JSON.stringify(focusHistory));
    writeLocalItem(COURSE_HISTORY_KEY, JSON.stringify(courseHistory));
    writeLocalItem(SETTINGS_KEY, JSON.stringify(settings));
    writeLocalItem(CYCLE_KEY, String(cycleCount));
    writeLocalItem(SESSIONS_KEY, String(sessionsToday));
    writeLocalItem(SESSIONS_DATE_KEY, todayKey());
    writeLocalItem(ACTIVE_TASK_KEY, activeTaskId);

    setMode("focus", "Data cadangan berhasil dipulihkan.");
    renderSettingsForm();
    renderActiveTask();
    renderStats();
    renderTasks();
    showBackupStatus(
      `Data dipulihkan: ${tasks.length} tugas dan ${Object.keys(focusHistory).length} hari riwayat fokus.`
    );
  } catch (err) {
    showBackupStatus(
      err instanceof Error
        ? `Gagal mengimpor berkas: ${err.message}`
        : "Gagal mengimpor berkas JSON.",
      true
    );
  }
});

el("btnDismissAlert").addEventListener("click", hideStorageAlert);

el("btnResetStorage").addEventListener("click", () => {
  try {
    localStorage.removeItem(TASKS_KEY);
    localStorage.removeItem(SESSIONS_KEY);
    localStorage.removeItem(SESSIONS_DATE_KEY);
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(COURSE_HISTORY_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(CYCLE_KEY);
    localStorage.removeItem(ACTIVE_TASK_KEY);
    storageWritable = true;
  } catch {
    // Keep going with in-memory defaults if storage remains blocked.
  }
  tasks = [];
  sessionsToday = 0;
  focusHistory = {};
  courseHistory = {};
  settings = structuredClone(DEFAULT_SETTINGS);
  applySettings();
  cycleCount = 0;
  activeTaskId = "";
  editingTaskId = "";
  setMode("focus", "Siap mulai sesi fokus.");
  hideStorageAlert();
  renderTimer();
  renderActiveTask();
  renderStats();
  renderTasks();
  renderSettingsForm();
  el("settingsStatus").textContent = "";
  el("backupStatus").hidden = true;
});

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const isLocalHost =
    window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (window.location.protocol !== "https:" && !isLocalHost) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {
    // Offline cache is progressive enhancement; registration errors do not block app usage.
  });
}

function initApp() {
  renderTodayDate();
  settings = readLocalSettings();
  applySettings();
  remaining = DURATIONS[mode];
  activeSessionMinutes = settings.focus;
  cycleCount = readCycleCount();
  sessionsToday = readSessionsToday();
  ensureHistorySeed();
  courseHistory = readLocalCourseHistory();
  tasks = readLocalTasks();
  activeTaskId = readLocalString(ACTIVE_TASK_KEY);
  el("taskLoading").hidden = true;
  renderTimer();
  renderActiveTask();
  renderStats();
  renderTasks();
  renderSettingsForm();
  registerServiceWorker();
}

initApp();
