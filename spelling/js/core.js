/* ==================== CONFIG ==================== */
const BIN_ID = '695b813c43b1c97be91a29d3';
const API_KEY = '$2a$10$uEeLgIqeB1wImpeUneAhref2IXtkWjDsrQ1rh4tDTOdjMu8zDeYBC';
const DATA_VERSION = 3;
const STATS_VERSION = 2;
const CURRICULUM_URL = 'curriculum.json';
const RECENT_LOG_DAYS = 90;
const CLOUD_WARNING_BYTES = 80 * 1024;
const CLOUD_MAX_BYTES = 90 * 1024;

/* ==================== STATE ==================== */
let db;
let baseCurriculum = null;
let currentSetDate = null;
let practiceList = [], currentIndex = 0, sessionMasteredSet = new Set(), sessionEasyCompletedSet = new Set();
let sessionWrongSet = new Set(); // words that were wrong at least once this session
let pendingStatWrites = [];
let isProcessing = false;
let currentWordHadWrong = false;
let currentPracticeMode = null;
let targetSelectionWords = [], currentTargetGroupKey = null;
let pendingPracticeWords = null;

// Learn state
let learnList = [], learnIndex = 0, learnChunks = [], learnRevealedCount = 0, learnCovered = false, learnInStepMode = false;
// Easy practice state
let easyAnswerArr = [], easyTileArr = [], easyTileOrder = [];
// Normal practice state
let targetWord = "", targetLetters = "", currentInput = "";

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function unlockAudio() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const u = new SpeechSynthesisUtterance(''); speechSynthesis.speak(u);
}
document.addEventListener('touchstart', unlockAudio, { once: true });
document.addEventListener('click', unlockAudio, { once: true });

/* ==================== DB INIT (v7) ==================== */
// Database version 2 adds appState for compact cloud metadata and achievements.
const DB_REQ = indexedDB.open('romeo_spelling_v7', 2);
DB_REQ.onupgradeneeded = (e) => {
  db = e.target.result;
  if (!db.objectStoreNames.contains('wordSets'))
    db.createObjectStore('wordSets', { keyPath: 'id' });
  if (!db.objectStoreNames.contains('groups'))
    db.createObjectStore('groups', { keyPath: 'id', autoIncrement: true });
  if (!db.objectStoreNames.contains('wrongBank'))
    db.createObjectStore('wrongBank', { keyPath: 'word' });
  if (!db.objectStoreNames.contains('practiceLogs'))
    db.createObjectStore('practiceLogs', { keyPath: 'id', autoIncrement: true });
  if (!db.objectStoreNames.contains('appState'))
    db.createObjectStore('appState', { keyPath: 'key' });
};
DB_REQ.onsuccess = (e) => {
  db = e.target.result;
  migrateFromV6().then(() => autoRestoreFromCloud());
};

function showLoadingOverlay(msg) {
  const el = document.createElement('div');
  el.id = 'loadingOverlay';
  el.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: linear-gradient(160deg, #f0f4f8 0%, #e8eef8 100%);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 20px;
  `;
  el.innerHTML = `
    <div style="
      width: 72px; height: 72px; background: var(--yellow);
      border-radius: 20px; display: flex; align-items: center; justify-content: center;
      font-size: 38px; font-family: 'Fredoka One', cursive; color: #333;
      box-shadow: 0 8px 0 var(--yellow-dark);
      animation: loadBounce 0.8s ease-in-out infinite alternate;
    ">R</div>
    <div style="text-align:center">
      <div style="font-family:'Fredoka One',cursive;font-size:22px;color:#1a1a2e;margin-bottom:6px">Romeo's Spelling</div>
      <div style="font-size:14px;color:var(--text-2);font-weight:700" id="loadingMsg">${msg}</div>
    </div>
    <style>
      @keyframes loadBounce {
        from { transform: translateY(0); box-shadow: 0 8px 0 var(--yellow-dark); }
        to   { transform: translateY(-10px); box-shadow: 0 18px 0 var(--yellow-dark); }
      }
    </style>
  `;
  document.body.appendChild(el);
}

function hideLoadingOverlay() {
  const el = document.getElementById('loadingOverlay');
  if (!el) return;
  el.style.transition = 'opacity 0.35s ease';
  el.style.opacity = '0';
  setTimeout(() => el.remove(), 380);
}

async function autoRestoreFromCloud() {
  showLoadingOverlay('正在从云端同步数据…');
  try {
    const [content, curriculum] = await Promise.all([
      fetchCloudContent(),
      loadCurriculum().catch(() => null)
    ]);
    const state = decodeCloudData(content, curriculum);
    baseCurriculum = state.baseCurriculum;
    await replaceLocalState(state);

    document.getElementById('loadingMsg').textContent = '✅ 同步完成';
    await new Promise(r => setTimeout(r, 600));
  } catch (err) {
    document.getElementById('loadingMsg').textContent = '⚠️ 无法连接云端，使用本地数据';
    await new Promise(r => setTimeout(r, 1200));
  }
  hideLoadingOverlay();
  startRouter();
}

function migrateFromV6() {
  return new Promise(resolve => {
    const req = indexedDB.open('romeo_spelling_v6', 2);
    req.onsuccess = (e) => {
      const oldDb = e.target.result;
      if (!oldDb.objectStoreNames.contains('wordSets')) { oldDb.close(); return resolve(); }
      const tx6 = oldDb.transaction(['wordSets', 'wrongBank', 'practiceLogs'], 'readonly');
      Promise.all([
        getAll(tx6.objectStore('wordSets')),
        getAll(tx6.objectStore('wrongBank')),
        getAll(tx6.objectStore('practiceLogs'))
      ]).then(([sets, wrongs, logs]) => {
        oldDb.close();
        // Check if v7 already has data
        const checkTx = db.transaction('wordSets', 'readonly');
        getAll(checkTx.objectStore('wordSets')).then(existing => {
          if (existing.length > 0) return resolve(); // already migrated
          if (!sets.length && !wrongs.length) return resolve();
          const tx7 = db.transaction(['wordSets', 'wrongBank', 'practiceLogs'], 'readwrite');
          sets.forEach(s => tx7.objectStore('wordSets').put({ id: s.id || s.date, words: s.words }));
          // Preserve v6 counters as legacy-only data and start the new mastery statistics from zero.
          wrongs.forEach(w => tx7.objectStore('wrongBank').put(normalizeWrongRecord(w, 1)));
          logs.forEach(l => tx7.objectStore('practiceLogs').put(l));
          tx7.oncomplete = () => resolve();
        });
      });
    };
    req.onerror = () => resolve();
  });
}

function getAll(store) {
  return new Promise(r => { const req = store.getAll(); req.onsuccess = () => r(req.result); req.onerror = () => r([]); });
}

function getAllStrict(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      const error = new Error('Local database read failed');
      error.name = 'LocalReadError';
      reject(error);
    };
  });
}

function displayWord(rawWord) {
  return String(rawWord || '').replace(/\//g, '');
}

function normalizeApostrophes(text) {
  return String(text || '').replace(/[‘’]/g, "'");
}

function normalizeWordKey(rawWord) {
  return normalizeApostrophes(displayWord(rawWord)).toLowerCase();
}

function spellingLetters(rawWord) {
  return normalizeApostrophes(displayWord(rawWord)).replace(/[^a-zA-Z]/g, '').toLowerCase();
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Database request failed'));
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('Database transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('Database transaction aborted'));
  });
}

async function getAppState(key) {
  const tx = db.transaction('appState', 'readonly');
  return requestValue(tx.objectStore('appState').get(key));
}

async function putAppState(record) {
  const tx = db.transaction('appState', 'readwrite');
  tx.objectStore('appState').put(record);
  await transactionDone(tx);
}

function normalizeCurriculum(raw) {
  if (!raw || !Array.isArray(raw.wordSets) || !Array.isArray(raw.groups)) throw new Error('Invalid curriculum');
  return {
    curriculumVersion: Number(raw.curriculumVersion) || 1,
    wordSets: raw.wordSets.map(s => ({ id: String(s.id || s.date), words: Array.isArray(s.words) ? s.words.map(String) : [] })),
    groups: raw.groups.map(g => ({ id: Number(g.id), name: String(g.name || ''), setIds: Array.isArray(g.setIds) ? g.setIds.map(String) : [] }))
  };
}

async function loadCurriculum() {
  if (baseCurriculum) return baseCurriculum;
  const res = await fetch(CURRICULUM_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error('Curriculum unavailable');
  baseCurriculum = normalizeCurriculum(await res.json());
  return baseCurriculum;
}

function normalizeContentOverrides(raw) {
  return {
    wordSets: raw && raw.wordSets && typeof raw.wordSets === 'object' ? raw.wordSets : {},
    groups: raw && raw.groups && typeof raw.groups === 'object' ? raw.groups : {}
  };
}

function applyContentOverrides(curriculum, rawOverrides) {
  const overrides = normalizeContentOverrides(rawOverrides);
  const sets = new Map(curriculum.wordSets.map(s => [s.id, { id: s.id, words: [...s.words] }]));
  Object.entries(overrides.wordSets).forEach(([id, value]) => {
    if (value === null) sets.delete(id);
    else sets.set(id, { id, words: Array.isArray(value.words) ? value.words.map(String) : [] });
  });

  const groups = new Map(curriculum.groups.map(g => [String(g.id), { id: g.id, name: g.name, setIds: [...g.setIds] }]));
  Object.entries(overrides.groups).forEach(([id, value]) => {
    if (value === null) groups.delete(id);
    else groups.set(id, { id: Number(value.id ?? id), name: String(value.name || ''), setIds: Array.isArray(value.setIds) ? value.setIds.map(String) : [] });
  });
  return { wordSets: [...sets.values()], groups: [...groups.values()] };
}

function buildContentOverrides(sets, groups, curriculum) {
  const overrides = { wordSets: {}, groups: {} };
  const baseSets = new Map(curriculum.wordSets.map(s => [s.id, s]));
  const currentSets = new Map(sets.map(s => [String(s.id), { id: String(s.id), words: (s.words || []).map(String) }]));
  baseSets.forEach((_, id) => { if (!currentSets.has(id)) overrides.wordSets[id] = null; });
  currentSets.forEach((set, id) => {
    const base = baseSets.get(id);
    if (!base || JSON.stringify(base.words) !== JSON.stringify(set.words)) overrides.wordSets[id] = set;
  });

  const cleanGroup = g => ({ id: Number(g.id), name: String(g.name || ''), setIds: [...(g.setIds || [])].map(String).sort() });
  const baseGroups = new Map(curriculum.groups.map(g => [String(g.id), cleanGroup(g)]));
  const currentGroups = new Map(groups.map(g => [String(g.id), cleanGroup(g)]));
  baseGroups.forEach((_, id) => { if (!currentGroups.has(id)) overrides.groups[id] = null; });
  currentGroups.forEach((group, id) => {
    const base = baseGroups.get(id);
    if (!base || JSON.stringify(base) !== JSON.stringify(group)) overrides.groups[id] = group;
  });
  return overrides;
}

function uniqueWordList(words) {
  return [...new Set((words || []).map(normalizeWordKey).filter(Boolean))].sort();
}

function aggregateLogsByDay(logs) {
  const days = new Map();
  (logs || []).forEach(log => {
    if (!log || !log.date) return;
    const date = String(log.date);
    const existing = days.get(date) || { date, count: 0, words: new Set() };
    existing.count += Number(log.count) || 0;
    (log.words || []).forEach(word => existing.words.add(normalizeWordKey(word)));
    days.set(date, existing);
  });
  return [...days.values()].map(day => ({ date: day.date, count: day.count, words: [...day.words].filter(Boolean).sort() }));
}

function normalizeAchievement(raw = {}, today = localDateKey()) {
  const cutoff = addDaysToDateKey(today, -(RECENT_LOG_DAYS - 1));
  const monthlyTotals = { ...(raw.monthlyTotals || {}) };
  const recentDailyLogs = [];
  aggregateLogsByDay(raw.recentDailyLogs || []).forEach(log => {
    if (log.date < cutoff) {
      const month = log.date.slice(0, 7);
      monthlyTotals[month] = (Number(monthlyTotals[month]) || 0) + log.count;
    } else {
      recentDailyLogs.push(log);
    }
  });
  recentDailyLogs.sort((a, b) => b.date.localeCompare(a.date));
  return {
    key: 'achievement',
    totalCorrect: Number(raw.totalCorrect) || 0,
    wordWall: uniqueWordList(raw.wordWall || []),
    monthlyTotals,
    recentDailyLogs
  };
}

function buildAchievementFromLogs(logs) {
  const totalCorrect = (logs || []).reduce((sum, log) => sum + (Number(log.count) || 0), 0);
  const wordWall = uniqueWordList((logs || []).flatMap(log => log.words || []));
  return normalizeAchievement({ totalCorrect, wordWall, recentDailyLogs: aggregateLogsByDay(logs) });
}

async function getAchievementState() {
  const stored = await getAppState('achievement');
  if (stored) return normalizeAchievement(stored);
  const tx = db.transaction('practiceLogs', 'readonly');
  return buildAchievementFromLogs(await getAllStrict(tx.objectStore('practiceLogs')));
}

async function recordAchievementSession(count, words) {
  if (!count) return;
  const achievement = await getAchievementState();
  const today = localDateKey();
  achievement.totalCorrect += count;
  achievement.wordWall = uniqueWordList([...achievement.wordWall, ...words]);
  const existing = achievement.recentDailyLogs.find(log => log.date === today);
  if (existing) {
    existing.count += count;
    existing.words = uniqueWordList([...existing.words, ...words]);
  } else {
    achievement.recentDailyLogs.push({ date: today, count, words: uniqueWordList(words) });
  }
  await putAppState(normalizeAchievement(achievement));
}

async function fetchCloudContent() {
  const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, { headers: { 'X-Master-Key': API_KEY } });
  if (!res.ok) throw new Error('Cloud download failed');
  const result = await res.json();
  const content = result.record && result.record.data;
  if (!content) throw new Error('Cloud data is empty');
  return content;
}

function decodeCloudData(content, curriculum) {
  if (Number(content.dataVersion) >= DATA_VERSION) {
    if (!curriculum) throw new Error('Curriculum is required for cloud data v3');
    if (Number(content.curriculumVersion) > curriculum.curriculumVersion) throw new Error('Website curriculum is out of date');
    const contentOverrides = normalizeContentOverrides(content.contentOverrides);
    const effective = applyContentOverrides(curriculum, contentOverrides);
    return {
      baseCurriculum: curriculum,
      wordSets: effective.wordSets,
      groups: effective.groups,
      wrongBank: expandWordStats(content.wordStats || {}),
      achievement: normalizeAchievement(content.achievement || {}),
      syncMeta: {
        key: 'syncMeta', dataVersion: DATA_VERSION,
        curriculumVersion: curriculum.curriculumVersion,
        revision: Number(content.revision) || 0,
        contentOverrides
      }
    };
  }

  const legacyCurriculum = curriculum || normalizeCurriculum({
    curriculumVersion: 1,
    wordSets: content.wordSets || [],
    groups: content.groups || []
  });
  const wordSets = (content.wordSets || legacyCurriculum.wordSets).map(s => ({ id: String(s.id || s.date), words: [...(s.words || [])] }));
  const groups = (content.groups || legacyCurriculum.groups).map(g => ({ id: Number(g.id), name: String(g.name || ''), setIds: [...(g.setIds || [])] }));
  return {
    baseCurriculum: legacyCurriculum,
    wordSets,
    groups,
    wrongBank: (content.wrongBank || []).map(w => normalizeWrongRecord(w, content.statsVersion)),
    achievement: buildAchievementFromLogs(content.practiceLogs || []),
    syncMeta: {
      key: 'syncMeta', dataVersion: DATA_VERSION,
      curriculumVersion: legacyCurriculum.curriculumVersion,
      revision: 0,
      contentOverrides: buildContentOverrides(wordSets, groups, legacyCurriculum)
    }
  };
}

async function replaceLocalState(state) {
  const stores = ['wordSets', 'groups', 'wrongBank', 'practiceLogs', 'appState'];
  const tx = db.transaction(stores, 'readwrite');
  stores.forEach(name => tx.objectStore(name).clear());
  state.wordSets.forEach(set => tx.objectStore('wordSets').put(set));
  state.groups.forEach(group => tx.objectStore('groups').put(group));
  state.wrongBank.forEach(record => tx.objectStore('wrongBank').put(record));
  tx.objectStore('appState').put(normalizeAchievement(state.achievement));
  tx.objectStore('appState').put(state.syncMeta);
  await transactionDone(tx);
}

function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysToDateKey(dateKey, days) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function reviewDelayForStep(step) {
  if (step === 1) return 1;
  if (step === 2) return 3;
  return null;
}

function nextReviewDateForStep(step, dateKey) {
  const delay = reviewDelayForStep(step);
  return delay && dateKey ? addDaysToDateKey(dateKey, delay) : null;
}

function normalizeNextReviewDateForStep(step, lastMasteryDate, fallbackDate) {
  if (step >= 3) return null;
  return nextReviewDateForStep(step, lastMasteryDate) || fallbackDate || null;
}

function isNewStatsRecord(w, sourceVersion) {
  return Number(sourceVersion) >= STATS_VERSION || Number(w.statsVersion) >= STATS_VERSION || 'legacyWrongCount' in w;
}

function normalizeWrongRecord(w, sourceVersion = 1) {
  const cleanWord = normalizeWordKey(w.word);
  if (isNewStatsRecord(w, sourceVersion)) {
    const masteryStep = Math.min(3, Math.max(0, Number(w.masteryStep) || 0));
    const lastMasteryDate = w.lastMasteryDate || null;
    return {
      word: cleanWord,
      statsVersion: STATS_VERSION,
      legacyCorrectCount: Number(w.legacyCorrectCount) || 0,
      legacyWrongCount: Number(w.legacyWrongCount) || 0,
      legacyLastPracticeAt: w.legacyLastPracticeAt || null,
      correctCount: Number(w.correctCount) || 0,
      wrongCount: Number(w.wrongCount) || 0,
      skipCount: Number(w.skipCount) || 0,
      lastPracticeAt: w.lastPracticeAt || null,
      lastCorrectAt: w.lastCorrectAt || null,
      lastWrongAt: w.lastWrongAt || null,
      lastResult: w.lastResult || null,
      masteryStep,
      lastMasteryDate,
      nextReviewDate: normalizeNextReviewDateForStep(masteryStep, lastMasteryDate, w.nextReviewDate || null),
      masteredAt: w.masteredAt || null,
      needsConsolidation: Boolean(w.needsConsolidation),
      needsIndependentTest: Boolean(w.needsIndependentTest)
    };
  }

  return {
    word: cleanWord,
    statsVersion: STATS_VERSION,
    legacyCorrectCount: Number(w.correctCount) || 0,
    legacyWrongCount: Number(w.wrongCount) || (w.lastWrong ? 1 : 0),
    legacyLastPracticeAt: w.lastPractice || w.lastWrong || null,
    correctCount: 0,
    wrongCount: 0,
    skipCount: 0,
    lastPracticeAt: null,
    lastCorrectAt: null,
    lastWrongAt: null,
    lastResult: null,
    masteryStep: 0,
    lastMasteryDate: null,
    nextReviewDate: null,
    masteredAt: null,
    needsConsolidation: false,
    needsIndependentTest: false
  };
}

function hasCurrentWordStats(record) {
  return Boolean(
    record.correctCount || record.wrongCount || record.masteryStep ||
    record.lastPracticeAt || record.lastWrongAt || record.lastMasteryDate ||
    record.nextReviewDate || record.masteredAt ||
    record.needsConsolidation || record.needsIndependentTest
  );
}

function compactWordStats(wrongs) {
  const result = {};
  (wrongs || []).forEach(raw => {
    const record = normalizeWrongRecord(raw, STATS_VERSION);
    if (!record.word || !hasCurrentWordStats(record)) return;
    const compact = {};
    if (record.correctCount) compact.c = record.correctCount;
    if (record.wrongCount) compact.w = record.wrongCount;
    if (record.masteryStep) compact.m = record.masteryStep;
    if (record.lastPracticeAt) compact.lp = record.lastPracticeAt;
    if (record.lastWrongAt) compact.lw = record.lastWrongAt;
    if (record.lastMasteryDate) compact.lm = record.lastMasteryDate;
    if (record.nextReviewDate) compact.nr = record.nextReviewDate;
    if (record.masteredAt) compact.ma = record.masteredAt;
    const flags = (record.needsConsolidation ? 1 : 0) | (record.needsIndependentTest ? 2 : 0);
    if (flags) compact.f = flags;
    result[record.word] = compact;
  });
  return result;
}

function expandWordStats(stats) {
  return Object.entries(stats || {}).map(([word, compact]) => normalizeWrongRecord({
    word,
    correctCount: Number(compact.c) || 0,
    wrongCount: Number(compact.w) || 0,
    masteryStep: Number(compact.m) || 0,
    lastPracticeAt: compact.lp || null,
    lastWrongAt: compact.lw || null,
    lastMasteryDate: compact.lm || null,
    nextReviewDate: compact.nr || null,
    masteredAt: compact.ma || null,
    needsConsolidation: Boolean((Number(compact.f) || 0) & 1),
    needsIndependentTest: Boolean((Number(compact.f) || 0) & 2)
  }, STATS_VERSION));
}

function achievementForCloud(raw) {
  const achievement = normalizeAchievement(raw);
  return {
    totalCorrect: achievement.totalCorrect,
    wordWall: achievement.wordWall,
    monthlyTotals: achievement.monthlyTotals,
    recentDailyLogs: achievement.recentDailyLogs
  };
}

function buildCloudData(sets, groups, wrongs, achievement, syncMeta, curriculum) {
  return {
    dataVersion: DATA_VERSION,
    curriculumVersion: curriculum.curriculumVersion,
    revision: (Number(syncMeta && syncMeta.revision) || 0) + 1,
    updatedAt: new Date().toISOString(),
    contentOverrides: buildContentOverrides(sets, groups, curriculum),
    wordStats: compactWordStats(wrongs),
    achievement: achievementForCloud(achievement)
  };
}

function keepFocus() {
  const hidden = document.getElementById('hiddenInput');
  if (document.querySelector('.blanks-container') && !isProcessing) hidden.focus();
}
document.addEventListener('click', (e) => {
  if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) return;
  keepFocus();
}, true);
