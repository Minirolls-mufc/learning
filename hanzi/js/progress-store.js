(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HanziProgress = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function localDateKey(date) {
    const value = date instanceof Date ? date : new Date(date || Date.now());
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function addDays(dateKey, days) {
    const [year, month, day] = String(dateKey).split('-').map(Number);
    const date = new Date(year, month - 1, day, 12);
    date.setDate(date.getDate() + Number(days || 0));
    return localDateKey(date);
  }

  function emptyRecord() {
    return {
      learningCompleted: false,
      learnedAt: null,
      masteryStep: 0,
      correctCount: 0,
      almostCount: 0,
      lastAlmostDate: null,
      lastReviewDate: null,
      lastCountedCorrectDate: null,
      nextReviewDate: null,
      lastResult: null,
      masteredAt: null,
      updatedAt: null
    };
  }

  function normalizeRecord(raw) {
    const value = raw && typeof raw === 'object' ? raw : {};
    const masteryStep = Math.max(0, Math.min(3, Number(value.masteryStep) || 0));
    return {
      learningCompleted: Boolean(value.learningCompleted),
      learnedAt: value.learnedAt || null,
      masteryStep,
      correctCount: Math.max(0, Number(value.correctCount) || 0),
      almostCount: Math.max(0, Number(value.almostCount) || 0),
      lastAlmostDate: value.lastAlmostDate || null,
      lastReviewDate: value.lastReviewDate || null,
      lastCountedCorrectDate: value.lastCountedCorrectDate || null,
      nextReviewDate: masteryStep >= 3 ? null : value.nextReviewDate || null,
      lastResult: value.lastResult === 'correct' || value.lastResult === 'almost' ? value.lastResult : null,
      masteredAt: masteryStep >= 3 ? value.masteredAt || null : null,
      updatedAt: value.updatedAt || null
    };
  }

  function normalizeProgress(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const result = {};
    Object.entries(source).forEach(([ch, record]) => {
      const key = [...String(ch)][0];
      if (key) result[key] = normalizeRecord(record);
    });
    return result;
  }

  function markLearned(raw, options) {
    const opts = options || {};
    const today = opts.today || localDateKey();
    const now = opts.now || new Date().toISOString();
    const record = normalizeRecord(raw);
    if (!record.learningCompleted) {
      record.learningCompleted = true;
      record.learnedAt = now;
      if (!record.nextReviewDate && record.masteryStep < 3) record.nextReviewDate = today;
    }
    record.updatedAt = now;
    return record;
  }

  function applyReviewResult(raw, result, options) {
    const opts = options || {};
    const today = opts.today || localDateKey();
    const now = opts.now || new Date().toISOString();
    const record = normalizeRecord(raw);
    record.lastReviewDate = today;
    record.lastResult = result === 'almost' ? 'almost' : 'correct';
    record.updatedAt = now;

    if (record.lastResult === 'almost') {
      record.almostCount += 1;
      record.lastAlmostDate = today;
      if (record.masteryStep === 3) record.masteryStep = 2;
      record.masteredAt = null;
      record.nextReviewDate = addDays(today, 1);
      return record;
    }

    record.correctCount += 1;
    const due = !record.nextReviewDate || today >= record.nextReviewDate;
    const differentDate = record.lastCountedCorrectDate !== today;
    if (record.masteryStep < 3 && due && differentDate) {
      record.masteryStep += 1;
      record.lastCountedCorrectDate = today;
      if (record.masteryStep === 1) record.nextReviewDate = addDays(today, 1);
      else if (record.masteryStep === 2) record.nextReviewDate = addDays(today, 3);
      else {
        record.nextReviewDate = null;
        record.masteredAt = now;
      }
    }
    return record;
  }

  function compactProgress(raw) {
    const progress = normalizeProgress(raw);
    const result = {};
    Object.entries(progress).forEach(([ch, record]) => {
      const value = {};
      if (record.learningCompleted) value.l = 1;
      if (record.learnedAt) value.la = record.learnedAt;
      if (record.masteryStep) value.s = record.masteryStep;
      if (record.correctCount) value.c = record.correctCount;
      if (record.almostCount) value.a = record.almostCount;
      if (record.lastAlmostDate) value.d = record.lastAlmostDate;
      if (record.lastReviewDate) value.r = record.lastReviewDate;
      if (record.lastCountedCorrectDate) value.k = record.lastCountedCorrectDate;
      if (record.nextReviewDate) value.n = record.nextReviewDate;
      if (record.lastResult) value.x = record.lastResult === 'correct' ? 'c' : 'a';
      if (record.masteredAt) value.m = record.masteredAt;
      if (record.updatedAt) value.u = record.updatedAt;
      if (Object.keys(value).length) result[ch] = value;
    });
    return result;
  }

  function expandProgress(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const result = {};
    Object.entries(source).forEach(([ch, value]) => {
      if (!value || typeof value !== 'object') return;
      if ('learningCompleted' in value || 'masteryStep' in value) {
        result[ch] = normalizeRecord(value);
        return;
      }
      result[ch] = normalizeRecord({
        learningCompleted: value.l === 1,
        learnedAt: value.la,
        masteryStep: value.s,
        correctCount: value.c,
        almostCount: value.a,
        lastAlmostDate: value.d,
        lastReviewDate: value.r,
        lastCountedCorrectDate: value.k,
        nextReviewDate: value.n,
        lastResult: value.x === 'c' ? 'correct' : value.x === 'a' ? 'almost' : null,
        masteredAt: value.m,
        updatedAt: value.u
      });
    });
    return result;
  }

  function summarize(raw) {
    const records = Object.values(normalizeProgress(raw));
    return {
      learned: records.filter(record => record.learningCompleted).length,
      pending: records.filter(record => record.learningCompleted && record.masteryStep < 3).length,
      mastered: records.filter(record => record.masteryStep === 3).length,
      correct: records.reduce((sum, record) => sum + record.correctCount, 0),
      almost: records.reduce((sum, record) => sum + record.almostCount, 0)
    };
  }

  return {
    localDateKey,
    addDays,
    emptyRecord,
    normalizeRecord,
    normalizeProgress,
    markLearned,
    applyReviewResult,
    compactProgress,
    expandProgress,
    summarize
  };
});
