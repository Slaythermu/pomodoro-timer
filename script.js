const DURATIONS = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60,
};

const LABELS = {
  focus: "Foco",
  short: "Pausa curta",
  long: "Pausa longa",
};

const CIRCUMFERENCE = 2 * Math.PI * 100;

const timeDisplay = document.getElementById("timeDisplay");
const startPauseBtn = document.getElementById("startPauseBtn");
const resetBtn = document.getElementById("resetBtn");
const modeButtons = document.querySelectorAll(".mode-btn");
const ringProgress = document.querySelector(".ring-progress");
const sessionCountEl = document.getElementById("sessionCount");
const minutesFocusedEl = document.getElementById("minutesFocused");
const historyList = document.getElementById("historyList");

let mode = "focus";
let secondsLeft = DURATIONS[mode];
let timerId = null;
let running = false;

ringProgress.style.strokeDasharray = `${CIRCUMFERENCE}`;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadState() {
  const raw = localStorage.getItem("pomodoro-history");
  return raw ? JSON.parse(raw) : [];
}

function saveEntry(entry) {
  const history = loadState();
  history.unshift(entry);
  localStorage.setItem("pomodoro-history", JSON.stringify(history.slice(0, 50)));
  renderHistory();
  renderStats();
}

function renderStats() {
  const history = loadState();
  const today = todayKey();
  const todays = history.filter((h) => h.date === today && h.type === "focus");
  sessionCountEl.textContent = todays.length;
  minutesFocusedEl.textContent = todays.reduce((sum, h) => sum + h.minutes, 0);
}

function renderHistory() {
  const history = loadState();
  historyList.innerHTML = "";
  if (history.length === 0) {
    historyList.innerHTML = '<li class="history-empty">Nenhuma sessão ainda</li>';
    return;
  }
  history.slice(0, 10).forEach((h) => {
    const li = document.createElement("li");
    const time = new Date(h.completedAt).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    li.innerHTML = `<span class="h-type">${LABELS[h.type]}</span><span>${h.minutes} min · ${time}</span>`;
    historyList.appendChild(li);
  });
}

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function updateDisplay() {
  timeDisplay.textContent = formatTime(secondsLeft);
  const total = DURATIONS[mode];
  const fraction = secondsLeft / total;
  ringProgress.style.strokeDashoffset = `${CIRCUMFERENCE * (1 - fraction)}`;
}

function setMode(newMode, { resetTimer = true } = {}) {
  mode = newMode;
  document.body.style.setProperty(
    "--accent",
    getComputedStyle(document.body).getPropertyValue(`--${newMode}`)
  );
  modeButtons.forEach((b) => b.classList.toggle("active", b.dataset.mode === newMode));
  if (resetTimer) {
    pauseTimer();
    secondsLeft = DURATIONS[newMode];
    updateDisplay();
  }
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close();
  } catch (e) {
    /* audio not available */
  }
}

function tick() {
  secondsLeft -= 1;
  if (secondsLeft <= 0) {
    completeSession();
    return;
  }
  updateDisplay();
}

function completeSession() {
  pauseTimer();
  playBeep();
  const total = DURATIONS[mode];
  saveEntry({
    type: mode,
    minutes: Math.round(total / 60),
    date: todayKey(),
    completedAt: new Date().toISOString(),
  });
  secondsLeft = 0;
  updateDisplay();
  document.title = "Pomodoro — concluído!";
  setTimeout(() => {
    document.title = "Pomodoro";
    secondsLeft = DURATIONS[mode];
    updateDisplay();
  }, 2000);
}

function startTimer() {
  if (running) return;
  running = true;
  startPauseBtn.textContent = "Pausar";
  timerId = setInterval(tick, 1000);
}

function pauseTimer() {
  running = false;
  startPauseBtn.textContent = "Iniciar";
  clearInterval(timerId);
  timerId = null;
}

function toggleStartPause() {
  if (running) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function resetTimer() {
  pauseTimer();
  secondsLeft = DURATIONS[mode];
  updateDisplay();
}

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

startPauseBtn.addEventListener("click", toggleStartPause);
resetBtn.addEventListener("click", resetTimer);

setMode("focus", { resetTimer: false });
updateDisplay();
renderStats();
renderHistory();
