// ===== Fokus Kuliah =====
// Timer Pomodoro 25/5 + daftar deadline (localStorage). Vanilla JS, tanpa backend.

// ---------- TIMER ----------
const DURATIONS = { focus: 25 * 60, break: 5 * 60 };

let mode = "focus";              // "focus" | "break"
let remaining = DURATIONS.focus; // detik tersisa
let timerId = null;              // id setInterval, null = tidak jalan
let sessionsToday = Number(localStorage.getItem("fk_sessions") || 0);

const el = (id) => document.getElementById(id);
const display = el("timerDisplay");
const statusText = el("timerStatus");

function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function renderTimer() {
  const text = formatTime(remaining);
  display.textContent = text;
  document.title = `${text} — Fokus Kuliah`;
  el("sessionCount").textContent = sessionsToday;
  el("modeFocus").classList.toggle("active", mode === "focus");
  el("modeBreak").classList.toggle("active", mode === "break");
}

function setMode(newMode) {
  stopTimer();
  mode = newMode;
  remaining = DURATIONS[mode];
  statusText.textContent =
    mode === "focus" ? "Siap mulai sesi fokus." : "Siap istirahat sebentar.";
  renderTimer();
}

function stopTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

function onSessionDone() {
  stopTimer();
  if (mode === "focus") {
    sessionsToday += 1;
    localStorage.setItem("fk_sessions", String(sessionsToday));
    statusText.textContent = "Sesi fokus selesai 🎉 Waktunya istirahat 5 menit.";
    setMode("break");
  } else {
    statusText.textContent = "Istirahat selesai. Siap fokus lagi?";
    setMode("focus");
  }
  // Notifikasi sederhana (izin diminta browser saat halaman aktif).
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Fokus Kuliah", { body: statusText.textContent });
  }
}

el("btnStart").addEventListener("click", () => {
  if (timerId !== null) return; // sudah jalan
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
  statusText.textContent = mode === "focus" ? "Sedang fokus…" : "Sedang istirahat…";
  timerId = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      remaining = 0;
      renderTimer();
      onSessionDone();
      return;
    }
    renderTimer();
  }, 1000);
});

el("btnPause").addEventListener("click", () => {
  stopTimer();
  statusText.textContent = "Dijeda.";
});

el("btnReset").addEventListener("click", () => setMode(mode));
el("modeFocus").addEventListener("click", () => setMode("focus"));
el("modeBreak").addEventListener("click", () => setMode("break"));

renderTimer();

// ---------- DEADLINE ----------
const TASKS_KEY = "fk_tasks";
let tasks = JSON.parse(localStorage.getItem(TASKS_KEY) || "[]");

function saveTasks() {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

function renderTasks() {
  const list = el("taskList");
  list.innerHTML = "";

  const sorted = [...tasks].sort((a, b) => a.date.localeCompare(b.date));
  el("taskEmpty").style.display = sorted.length ? "none" : "block";

  for (const task of sorted) {
    const li = document.createElement("li");
    li.className = "task-item" + (task.done ? " done" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.addEventListener("change", () => {
      task.done = checkbox.checked;
      saveTasks();
      renderTasks();
    });

    const info = document.createElement("div");
    info.className = "task-info";
    info.innerHTML = `
      <div class="task-name"></div>
      <div class="course"></div>
      <div class="date"></div>`;
    info.querySelector(".task-name").textContent = task.name;
    info.querySelector(".course").textContent = task.course;
    info.querySelector(".date").textContent = task.date;

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "🗑";
    del.title = "Hapus tugas";
    del.addEventListener("click", () => {
      tasks = tasks.filter((t) => t.id !== task.id);
      saveTasks();
      renderTasks();
    });

    li.append(checkbox, info, del);
    list.appendChild(li);
  }
}

el("taskForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = el("taskName").value.trim();
  const course = el("taskCourse").value.trim();
  const date = el("taskDate").value;
  if (!name || !course || !date) return;

  tasks.push({ id: Date.now(), name, course, date, done: false });
  saveTasks();
  renderTasks();
  event.target.reset();
});

renderTasks();
