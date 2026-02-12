const STORAGE_KEY = "personal-goals-2026-v7";
const UI_PREFS_KEY = "personal-goals-2026-ui-v1";
const LEGACY_KEYS = [];
const TARGET_YEAR = 2026;
const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_START = new Date(`${TARGET_YEAR}-01-01T00:00:00`);

const categoryLabels = {
  health: "الصحة",
  career: "العمل",
  learning: "التعلم",
  finance: "المال",
  personal: "تطوير ذاتي",
};

const sourceLabels = {
  manual: "يدوي",
  finance: "مالي",
  health: "صحي",
  study: "تعليمي",
  career: "مهني",
};

const riskLabels = {
  on_track: "على المسار",
  at_risk: "مهدد",
  off_track: "خارج المسار",
  completed: "مكتمل",
};

const form = document.getElementById("goal-form");
const titleInput = document.getElementById("goal-title");
const categoryInput = document.getElementById("goal-category");
const dateInput = document.getElementById("goal-date");
const targetInput = document.getElementById("goal-target");
const currentInput = document.getElementById("goal-current");
const whyInput = document.getElementById("goal-why");
const notesInput = document.getElementById("goal-notes");
const smartHint = document.getElementById("smart-hint");
const feedback = document.getElementById("form-feedback");

const statusFilter = document.getElementById("status-filter");
const searchInput = document.getElementById("search-input");
const focusToggle = document.getElementById("focus-toggle");
const clearFiltersBtn = document.getElementById("clear-filters");

const statTotal = document.getElementById("stat-total");
const statOnTrack = document.getElementById("stat-ontrack");
const statRisk = document.getElementById("stat-risk");
const statConfidence = document.getElementById("stat-confidence");

const goalsCount = document.getElementById("goals-count");
const focusNote = document.getElementById("focus-note");
const goalsList = document.getElementById("goals-list");

const state = {
  goals: [],
  filter: "all",
  search: "",
  focusMode: false,
};

const dateFormatter = new Intl.DateTimeFormat("ar-EG", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDate(value) {
  return new Date(`${value}T23:59:59`);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const rand = Math.random().toString(36).slice(2, 10);
  return `goal-${Date.now().toString(36)}-${rand}`;
}

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (_error) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (_error) {
    return false;
  }
}

function daysSince(iso) {
  return (Date.now() - new Date(iso).getTime()) / DAY_MS;
}

function isValidDateInYear(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  return Number(value.slice(0, 4)) === TARGET_YEAR;
}

function formatDate(value) {
  const [y, m, d] = value.split("-").map(Number);
  return dateFormatter.format(new Date(y, m - 1, d));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function profileByCategory(category, title = "") {
  const lower = title.toLowerCase();

  if (category === "finance") {
    return {
      unit: "ر.س/شهر",
      source: "finance",
      frequency: "monthly",
      weight: 5,
      step: 1000,
      hint: "سيتم اعتماد تحديث شهري رقمي منظم.",
    };
  }

  if (category === "health") {
    return {
      unit: "جلسة",
      source: "health",
      frequency: "weekly",
      weight: 4,
      step: 2,
      hint: "يفضل تحديث صحي أسبوعي ثابت.",
    };
  }

  if (category === "learning") {
    const isScore =
      lower.includes("ielts") ||
      lower.includes("ايلتس") ||
      lower.includes("أيلتس") ||
      lower.includes("درجة");
    return {
      unit: isScore ? "درجة" : "وحدة",
      source: "study",
      frequency: "weekly",
      weight: 4,
      step: isScore ? 1 : 2,
      hint: "اربط التقدم بنتائج أو إنجازات تعليمية أسبوعية.",
    };
  }

  if (category === "career") {
    return {
      unit: "وحدة",
      source: "career",
      frequency: "weekly",
      weight: 5,
      step: 1,
      hint: "أفضل دقة تكون بمخرجات عمل أسبوعية.",
    };
  }

  return {
    unit: "وحدة",
    source: "manual",
    frequency: "weekly",
    weight: 3,
    step: 1,
    hint: "حدّث الهدف أسبوعيًا لتبقى التوقعات واقعية.",
  };
}

function progress(goal) {
  if (goal.targetValue <= 0) {
    return 0;
  }
  return Math.round(clamp((goal.currentValue / goal.targetValue) * 100, 0, 100));
}

function expectedProgress(goal) {
  const total = parseDate(goal.targetDate).getTime() - YEAR_START.getTime();
  if (total <= 0) {
    return 100;
  }
  const elapsed = Date.now() - YEAR_START.getTime();
  return Math.round(clamp(elapsed / total, 0, 1) * 100);
}

function isCompleted(goal) {
  return progress(goal) >= 100;
}

function velocity(goal) {
  if (!Array.isArray(goal.history) || goal.history.length < 2) {
    return 0;
  }

  const history = [...goal.history].sort((a, b) => a.date.localeCompare(b.date));
  const last = history[history.length - 1];
  const lastDate = new Date(`${last.date}T00:00:00`);
  let first = history[0];

  for (let i = history.length - 2; i >= 0; i -= 1) {
    const candidateDate = new Date(`${history[i].date}T00:00:00`);
    const days = (lastDate.getTime() - candidateDate.getTime()) / DAY_MS;
    if (days >= 7) {
      first = history[i];
      break;
    }
  }

  const days = Math.max(
    1,
    (lastDate.getTime() - new Date(`${first.date}T00:00:00`).getTime()) / DAY_MS,
  );

  const delta = Math.max(0, last.value - first.value);
  const weekly = delta / (days / 7);
  const safeCap = Math.max(1, goal.targetValue * 0.5);
  return Math.min(weekly, safeCap);
}

function projection(goal) {
  if (isCompleted(goal)) {
    return new Date(goal.completedAt || goal.lastUpdateAt);
  }

  const v = velocity(goal);
  if (v <= 0) {
    return null;
  }

  const remaining = goal.targetValue - goal.currentValue;
  if (remaining <= 0) {
    return new Date();
  }

  const weeks = remaining / v;
  if (!Number.isFinite(weeks) || weeks <= 0) {
    return null;
  }

  return new Date(Date.now() + weeks * 7 * DAY_MS);
}

function staleThreshold(frequency) {
  if (frequency === "monthly") {
    return 35;
  }
  if (frequency === "daily") {
    return 2;
  }
  return 9;
}

function isStale(goal) {
  return daysSince(goal.lastUpdateAt) > staleThreshold(goal.frequency);
}

function risk(goal) {
  if (isCompleted(goal)) {
    return "completed";
  }

  const due = parseDate(goal.targetDate);
  if (Date.now() > due.getTime()) {
    return "off_track";
  }

  const gap = progress(goal) - expectedProgress(goal);
  const daysLeft = Math.max(1, (due.getTime() - Date.now()) / DAY_MS);
  const needPerWeek = (goal.targetValue - goal.currentValue) / (daysLeft / 7);
  const momentum = needPerWeek > 0 ? velocity(goal) / needPerWeek : 1;

  if (gap >= -10 || momentum >= 1) {
    return "on_track";
  }
  if (gap >= -25 || momentum >= 0.6) {
    return "at_risk";
  }
  return "off_track";
}

function confidence(goal) {
  const baseBySource = {
    manual: 58,
    finance: 84,
    health: 78,
    study: 80,
    career: 74,
  };

  let score = baseBySource[goal.source] || 58;
  score += Math.min(10, goal.updatesCount);
  if (isStale(goal)) {
    score -= 16;
  }

  return clamp(Math.round(score), 35, 95);
}

function stepSize(goal) {
  const profile = profileByCategory(goal.category, goal.title);
  if (goal.category === "finance") {
    return Math.max(500, Math.round(goal.targetValue / 20 / 100) * 100 || 500);
  }
  return Math.max(profile.step, Math.round(goal.targetValue / 20) || profile.step);
}

function nextAction(goal) {
  const level = risk(goal);
  if (level === "off_track") {
    return "قسّم الهدف إلى مهمة صغيرة واحدة خلال 7 أيام وابدأ بها اليوم.";
  }
  if (level === "at_risk") {
    return "أضف تحديثًا حقيقيًا هذا الأسبوع لتقليل الفجوة.";
  }
  if (isStale(goal)) {
    return "حدّث الرقم الحالي الآن لرفع دقة التوقع.";
  }
  return goal.why ? `تذكير: ${goal.why}` : "استمر بنفس الوتيرة.";
}

function formatMetric(value, goal) {
  if (goal.category === "finance") {
    return new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 }).format(value);
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(1);
}

function normalizeGoal(raw) {
  const category = Object.prototype.hasOwnProperty.call(categoryLabels, raw.category)
    ? raw.category
    : "personal";

  const profile = profileByCategory(category, raw.title);

  const targetRaw = toNumber(raw.targetValue ?? raw.target, NaN);
  const progressRaw = toNumber(raw.progress, NaN);

  const targetValue = Math.max(1, Number.isFinite(targetRaw) ? targetRaw : 100);
  const currentValue = Math.max(
    0,
    toNumber(raw.currentValue ?? raw.current, Number.isFinite(progressRaw) ? progressRaw : 0),
  );

  const createdAt =
    typeof raw.createdAt === "string" && !Number.isNaN(new Date(raw.createdAt).getTime())
      ? raw.createdAt
      : new Date().toISOString();

  const lastUpdateAt =
    typeof raw.lastUpdateAt === "string" && !Number.isNaN(new Date(raw.lastUpdateAt).getTime())
      ? raw.lastUpdateAt
      : createdAt;

  const source = Object.prototype.hasOwnProperty.call(sourceLabels, raw.source)
    ? raw.source
    : profile.source;

  const frequency =
    raw.frequency === "daily" || raw.frequency === "weekly" || raw.frequency === "monthly"
      ? raw.frequency
      : profile.frequency;

  const history = Array.isArray(raw.history)
    ? raw.history
        .map((item) => ({
          date: String(item.date || toISODate(new Date())),
          value: Math.max(0, toNumber(item.value, currentValue)),
        }))
        .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-90)
    : [{ date: toISODate(new Date()), value: currentValue }];

  const normalizedHistory = history.length ? history : [{ date: toISODate(new Date()), value: currentValue }];

  const goal = {
    id: String(raw.id || createId()),
    title: String(raw.title || "").trim(),
    category,
    targetDate: isValidDateInYear(String(raw.targetDate || raw.dueDate || ""))
      ? String(raw.targetDate || raw.dueDate)
      : `${TARGET_YEAR}-12-31`,
    targetValue,
    currentValue,
    unit: String(raw.unit || profile.unit),
    source,
    frequency,
    weight: clamp(Math.round(toNumber(raw.weight, profile.weight)), 1, 5),
    why: String(raw.why || "").trim(),
    notes: String(raw.notes || "").trim(),
    updatesCount: Math.max(0, Math.round(toNumber(raw.updatesCount, normalizedHistory.length - 1))),
    history: normalizedHistory,
    createdAt,
    lastUpdateAt,
    completedAt:
      typeof raw.completedAt === "string" && !Number.isNaN(new Date(raw.completedAt).getTime())
        ? raw.completedAt
        : null,
  };

  if (isCompleted(goal) && !goal.completedAt) {
    goal.completedAt = goal.lastUpdateAt;
  }

  return goal;
}

function defaultGoals() {
  return [];
}

function saveGoals() {
  writeStorage(STORAGE_KEY, JSON.stringify(state.goals));
}

function saveUiPrefs() {
  writeStorage(
    UI_PREFS_KEY,
    JSON.stringify({
      focusMode: state.focusMode,
    }),
  );
}

function loadUiPrefs() {
  const raw = readStorage(UI_PREFS_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    state.focusMode = Boolean(parsed.focusMode);
  } catch (_error) {
    state.focusMode = false;
  }
}

function readLegacy() {
  for (const key of LEGACY_KEYS) {
    const raw = readStorage(key);
    if (raw) {
      return raw;
    }
  }
  return null;
}

function loadGoals() {
  const currentRaw = readStorage(STORAGE_KEY);
  const raw = currentRaw || readLegacy();

  if (!raw) {
    state.goals = defaultGoals().map(normalizeGoal);
    saveGoals();
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("invalid goals");
    }

    state.goals = parsed.map(normalizeGoal).filter((goal) => goal.title.length > 0);
    if (state.goals.length === 0) {
      state.goals = defaultGoals().map(normalizeGoal);
    }

    if (!currentRaw) {
      saveGoals();
    }
  } catch (_error) {
    state.goals = defaultGoals().map(normalizeGoal);
    saveGoals();
  }
}

function filteredGoals() {
  return state.goals
    .filter((goal) => {
      if (state.filter === "all") {
        return true;
      }
      if (state.filter === "completed") {
        return isCompleted(goal);
      }
      return risk(goal) === state.filter;
    })
    .filter((goal) => {
      if (!state.search) {
        return true;
      }
      const term = state.search.toLowerCase();
      return (
        goal.title.toLowerCase().includes(term) ||
        goal.notes.toLowerCase().includes(term) ||
        goal.why.toLowerCase().includes(term)
      );
    })
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate));
}

function priorityScore(goal) {
  if (isCompleted(goal)) {
    return -1;
  }

  const riskScore = { on_track: 1, at_risk: 2, off_track: 3 }[risk(goal)] || 1;
  const daysLeft = Math.max(1, (parseDate(goal.targetDate).getTime() - Date.now()) / DAY_MS);
  const urgency = daysLeft <= 14 ? 4 : daysLeft <= 30 ? 3 : daysLeft <= 60 ? 2 : 1;
  const staleBoost = isStale(goal) ? 2 : 0;

  return riskScore * 5 + urgency * 3 + goal.weight * 2 + staleBoost;
}

function renderStats() {
  const total = state.goals.length;
  const onTrackCount = state.goals.filter((goal) => risk(goal) === "on_track").length;
  const riskCount = state.goals.filter((goal) => {
    const level = risk(goal);
    return level === "at_risk" || level === "off_track";
  }).length;

  const confidenceAvg =
    total === 0
      ? 0
      : Math.round(state.goals.reduce((sum, goal) => sum + confidence(goal), 0) / total);

  statTotal.textContent = String(total);
  statOnTrack.textContent = String(onTrackCount);
  statRisk.textContent = String(riskCount);
  statConfidence.textContent = `${confidenceAvg}%`;
}

function riskClass(goal) {
  return `risk-${risk(goal)}`;
}

function confidenceClass(goal) {
  const value = confidence(goal);
  if (value >= 80) {
    return "conf-high";
  }
  if (value >= 60) {
    return "conf-mid";
  }
  return "conf-low";
}

function projectionText(goal) {
  const projected = projection(goal);
  if (!projected) {
    return "التوقع غير واضح بعد بسبب قلة التحديثات.";
  }
  return `التاريخ المتوقع: ${dateFormatter.format(projected)}`;
}

function goalTemplate(goal) {
  const currentProgress = progress(goal);
  const expected = expectedProgress(goal);
  const gap = currentProgress - expected;
  const step = stepSize(goal);

  return `
    <article class="goal-card" data-id="${goal.id}" data-risk="${risk(goal)}">
      <div class="goal-top">
        <strong class="goal-title">${escapeHtml(goal.title)}</strong>
        <div class="badges">
          <span class="badge ${riskClass(goal)}">${riskLabels[risk(goal)]}</span>
          <span class="badge ${confidenceClass(goal)}">ثقة ${confidence(goal)}%</span>
        </div>
      </div>

      <div class="goal-meta">
        <span>${categoryLabels[goal.category]}</span>
        <span>الموعد: ${formatDate(goal.targetDate)}</span>
        <span>المصدر: ${sourceLabels[goal.source]}</span>
      </div>

      <p class="metric">${formatMetric(goal.currentValue, goal)} / ${formatMetric(goal.targetValue, goal)} ${escapeHtml(
    goal.unit,
  )}</p>

      <div class="progress-row">
        <div class="progress-track"><div class="progress-fill" style="width:${currentProgress}%"></div></div>
        <small>فعلي ${currentProgress}% | متوقع ${expected}% | فجوة ${gap > 0 ? "+" : ""}${gap}%</small>
      </div>

      <div class="why-box">
        <strong>لماذا هذا الهدف؟</strong>
        <p>${escapeHtml(goal.why || "غير محدد")}</p>
      </div>

      <p class="intel">${escapeHtml(projectionText(goal))}</p>
      <p class="intel">${escapeHtml(nextAction(goal))}</p>
      ${goal.notes ? `<p class="notes">${escapeHtml(goal.notes)}</p>` : ""}

      <div class="actions">
        <button type="button" data-action="inc">+${escapeHtml(String(step))}</button>
        <button type="button" data-action="set">تعديل القيمة</button>
        <button type="button" data-action="done">إنجاز</button>
        <button type="button" class="danger-btn" data-action="delete">حذف</button>
      </div>
    </article>
  `;
}

function renderGoals() {
  let list = filteredGoals();

  if (state.focusMode) {
    list = list
      .filter((goal) => !isCompleted(goal))
      .sort((a, b) => priorityScore(b) - priorityScore(a))
      .slice(0, 3);
  }

  goalsCount.textContent = `${list.length} من ${state.goals.length}`;
  focusNote.textContent = state.focusMode
    ? "وضع التركيز مفعّل: تظهر أهم 3 أهداف فقط."
    : "";

  if (!list.length) {
    goalsList.innerHTML = `<p class="empty">لا توجد أهداف مطابقة.</p>`;
    return;
  }

  goalsList.innerHTML = list.map(goalTemplate).join("");
}

function addHistory(goal) {
  const today = toISODate(new Date());
  const existing = goal.history.find((item) => item.date === today);

  if (existing) {
    existing.value = goal.currentValue;
    return;
  }

  goal.history.push({ date: today, value: goal.currentValue });
  goal.history = goal.history.slice(-90);
}

function touchGoal(goal) {
  goal.lastUpdateAt = new Date().toISOString();
  goal.updatesCount += 1;
  addHistory(goal);

  if (isCompleted(goal) && !goal.completedAt) {
    goal.completedAt = new Date().toISOString();
  }

  if (!isCompleted(goal)) {
    goal.completedAt = null;
  }
}

function updateValue(goal, value) {
  goal.currentValue = clamp(value, 0, goal.targetValue * 10);
  touchGoal(goal);
}

function handleGoalActions(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const card = button.closest(".goal-card");
  if (!card) {
    return;
  }

  const goal = state.goals.find((item) => item.id === card.dataset.id);
  if (!goal) {
    return;
  }

  const action = button.dataset.action;

  if (action === "inc") {
    updateValue(goal, goal.currentValue + stepSize(goal));
  } else if (action === "set") {
    const value = window.prompt("أدخل القيمة الحالية الجديدة:", String(goal.currentValue));
    if (value === null) {
      return;
    }
    const parsed = toNumber(value, NaN);
    if (!Number.isFinite(parsed) || parsed < 0) {
      window.alert("قيمة غير صالحة.");
      return;
    }
    updateValue(goal, parsed);
  } else if (action === "done") {
    updateValue(goal, goal.targetValue);
  } else if (action === "delete") {
    const ok = window.confirm(`هل تريد حذف الهدف: "${goal.title}"؟`);
    if (!ok) {
      return;
    }
    state.goals = state.goals.filter((item) => item.id !== goal.id);
  }

  saveGoals();
  renderAll();
}

function renderHint() {
  const profile = profileByCategory(categoryInput.value, titleInput.value.trim());
  smartHint.textContent = `تلميح ذكي: ${profile.hint} | خطوة التحديث المقترحة: ${profile.step} ${profile.unit}.`;
}

function addGoal(event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  const category = categoryInput.value;
  const targetDate = dateInput.value;
  const targetValue = Math.max(1, toNumber(targetInput.value, 1));
  const currentValue = Math.max(0, toNumber(currentInput.value, 0));
  const why = whyInput.value.trim();
  const notes = notesInput.value.trim();

  if (!title) {
    feedback.textContent = "اكتب اسم هدف واضح.";
    return;
  }

  if (!isValidDateInYear(targetDate)) {
    feedback.textContent = `اختر تاريخًا ضمن ${TARGET_YEAR}.`;
    return;
  }

  if (currentValue > targetValue) {
    feedback.textContent = "القيمة الحالية لا يمكن أن تكون أكبر من القيمة المستهدفة عند إضافة الهدف.";
    return;
  }

  if (!why || why.length < 8) {
    feedback.textContent = "اكتب سببًا واضحًا للهدف (8 أحرف على الأقل).";
    return;
  }

  const profile = profileByCategory(category, title);
  const now = new Date().toISOString();

  state.goals.unshift(
    normalizeGoal({
      id: createId(),
      title,
      category,
      targetDate,
      targetValue,
      currentValue,
      why,
      notes,
      unit: profile.unit,
      source: profile.source,
      frequency: profile.frequency,
      weight: profile.weight,
      updatesCount: 1,
      history: [{ date: toISODate(new Date()), value: currentValue }],
      createdAt: now,
      lastUpdateAt: now,
    }),
  );

  saveGoals();
  renderAll();

  form.reset();
  targetInput.value = "10";
  currentInput.value = "0";
  setDefaultDate();
  renderHint();
  feedback.textContent = "تمت إضافة الهدف.";
}

function setDefaultDate() {
  const now = new Date();
  if (now.getFullYear() === TARGET_YEAR) {
    dateInput.value = toISODate(now);
  } else {
    dateInput.value = `${TARGET_YEAR}-06-30`;
  }
}

function renderAll() {
  renderStats();
  renderGoals();
}

function bindEvents() {
  form.addEventListener("submit", addGoal);
  goalsList.addEventListener("click", handleGoalActions);

  statusFilter.addEventListener("change", () => {
    state.filter = statusFilter.value;
    renderGoals();
  });

  searchInput.addEventListener("input", () => {
    state.search = searchInput.value.trim();
    renderGoals();
  });

  focusToggle.addEventListener("click", () => {
    state.focusMode = !state.focusMode;
    focusToggle.textContent = state.focusMode ? "وضع التركيز: تشغيل" : "وضع التركيز: إيقاف";
    saveUiPrefs();
    renderGoals();
  });

  clearFiltersBtn.addEventListener("click", () => {
    state.filter = "all";
    state.search = "";
    state.focusMode = false;
    statusFilter.value = "all";
    searchInput.value = "";
    focusToggle.textContent = "وضع التركيز: إيقاف";
    saveUiPrefs();
    renderAll();
  });

  categoryInput.addEventListener("change", renderHint);
  titleInput.addEventListener("input", renderHint);
}

function init() {
  setDefaultDate();
  loadUiPrefs();
  loadGoals();
  bindEvents();
  focusToggle.textContent = state.focusMode ? "وضع التركيز: تشغيل" : "وضع التركيز: إيقاف";
  renderHint();
  renderAll();
}

init();
