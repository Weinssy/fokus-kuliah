const DURATIONS = { focus: 25 * 60, break: 5 * 60 };
const RING_CIRCUMFERENCE = 2 * Math.PI * 90;
const SESSIONS_KEY = "fk_sessions";
const TASKS_KEY = "fk_tasks";

const el = (id) => document.getElementById(id);

let mode = "focus";
let remaining = DURATIONS.focus;
let timerId = null;
let endTimestamp = null;
let hasPausedMidSession = false;
let sessionsToday = 0;
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

  el("timerModeTag").textContent = mode === "focus" ? "Sesi Fokus" : "Sesi Istirahat";
  el("sessionCount").textContent = String(sessionsToday);
  el("headerSessionCount").textContent = String(sessionsToday);

  const focusBtn = el("modeFocus");
  const breakBtn = el("modeBreak");
  focusBtn.classList.toggle("is-active", mode === "focus");
  breakBtn.classList.toggle("is-active", mode === "break");
  focusBtn.setAttribute("aria-pressed", String(mode === "focus"));
  breakBtn.setAttribute("aria-pressed", String(mode === "break"));

  const progress = DURATIONS[mode] ? remaining / DURATIONS[mode] : 0;
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
  el("timerStatus").textContent =
    customStatus ||
    (mode === "focus" ? "Siap mulai sesi fokus." : "Siap istirahat sebentar.");
  renderTimer();
}

function notifySession(message) {
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification("Fokus Kuliah", { body: message });
    } catch {
      // Ignore notification errors in restricted browser contexts.
    }
  }
}

function onSessionDone() {
  stopTimer();
  if (mode === "focus") {
    sessionsToday += 1;
    writeLocalItem(SESSIONS_KEY, String(sessionsToday));
    const message = "Sesi fokus selesai. Waktunya istirahat 5 menit.";
    notifySession(message);
    setMode("break", message);
  } else {
    const message = "Istirahat selesai. Siap mulai fokus lagi.";
    notifySession(message);
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
  if ("Notification" in window && Notification.permission === "default") {
    try {
      const req = Notification.requestPermission();
      if (req && typeof req.catch === "function") req.catch(() => {});
    } catch {
      // Ignore permission prompt failures.
    }
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

el("btnStart").addEventListener("click", startTimer);
el("btnPause").addEventListener("click", pauseTimer);
el("btnReset").addEventListener("click", () => setMode(mode));
el("modeFocus").addEventListener("click", () => setMode("focus"));
el("modeBreak").addEventListener("click", () => setMode("break"));

el("btnResetSessions").addEventListener("click", () => {
  sessionsToday = 0;
  writeLocalItem(SESSIONS_KEY, "0");
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
    storageWritable = true;
  } catch {
    // Keep going with in-memory defaults if storage remains blocked.
  }
  tasks = [];
  sessionsToday = 0;
  hideStorageAlert();
  renderTimer();
  renderTasks();
});

function initApp() {
  renderTodayDate();
  sessionsToday = readLocalCount(SESSIONS_KEY);
  tasks = readLocalTasks();
  el("taskLoading").hidden = true;
  renderTimer();
  renderTasks();
}

initApp();
