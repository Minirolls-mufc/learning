(function (root, factory) {
  const content = typeof module === 'object' && module.exports
    ? require('./content-store.js')
    : root.HanziContent;
  const api = factory(content);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HanziReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Content) {
  'use strict';

  function pinyinTokens(entry, pinyinForText) {
    const text = String(entry && entry.pinyin || '').trim()
      || String((pinyinForText || function () { return ''; })(entry && entry.hanzi || '')).trim();
    return text ? text.split(/\s+/) : [];
  }

  function normalizeGroups(value) {
    return (Array.isArray(value) ? value : [value]).filter(Boolean);
  }

  function availableFocusChars(groups) {
    const result = [];
    normalizeGroups(groups).forEach(group => {
      (group.entries || []).forEach(entry => {
        if (entry.type !== 'word') return;
        const chars = [...entry.hanzi];
        Content.getWordFocusIndices(entry).forEach(index => {
          const ch = chars[index];
          if (ch && !result.includes(ch)) result.push(ch);
        });
      });
    });
    return result;
  }

  function buildReviewTasks(groups, targetChars) {
    const allowed = targetChars == null ? null : new Set(targetChars);
    const focusWords = [];
    normalizeGroups(groups).forEach((group, groupIndex) => {
      (group.entries || []).forEach((entry, entryIndex) => {
        if (entry.type !== 'word' || !Content.getWordFocusIndices(entry).length) return;
        focusWords.push({ entry, entryIndex, group, groupIndex });
      });
    });
    if (!focusWords.length) return { status: 'no-focus-words', tasks: [] };

    const handled = new Set();
    const tasks = [];
    focusWords.forEach(item => {
      const { entry, entryIndex, group, groupIndex } = item;
      const chars = [...entry.hanzi];
      const focusIndices = Content.getWordFocusIndices(entry);
      const newlyHandledChars = [];
      focusIndices.forEach(position => {
        const ch = chars[position];
        if (!ch || handled.has(ch) || (allowed && !allowed.has(ch))) return;
        handled.add(ch);
        newlyHandledChars.push(ch);
      });
      if (!newlyHandledChars.length) return;
      const targetSet = new Set(newlyHandledChars);
      const hiddenIndices = focusIndices.filter(position => targetSet.has(chars[position]));
      tasks.push({
        entry,
        entryIndex,
        groupId: group.id,
        groupName: group.name,
        groupIndex,
        hiddenIndices,
        targets: newlyHandledChars.map(ch => ({
          ch,
          positions: hiddenIndices.filter(position => chars[position] === ch)
        }))
      });
    });
    return { status: tasks.length ? 'ready' : 'no-focus-words', tasks };
  }

  function buildSmartSources(groups, progress, today) {
    const date = today || new Date().toISOString().slice(0, 10);
    const available = new Set(availableFocusChars(groups));
    const records = Object.entries(progress || {}).filter(([ch]) => available.has(ch));
    const todayAlmost = records
      .filter(([, record]) => record && record.lastAlmostDate === date)
      .map(([ch]) => ch);
    const due = records
      .filter(([, record]) => record && record.masteryStep < 3
        && record.nextReviewDate && record.nextReviewDate <= date)
      .sort((a, b) => String(a[1].nextReviewDate).localeCompare(String(b[1].nextReviewDate)))
      .map(([ch]) => ch);
    const historical = records
      .filter(([, record]) => record && record.almostCount > 0 && record.masteryStep < 3)
      .sort((a, b) => {
        const count = b[1].almostCount - a[1].almostCount;
        return count || String(b[1].lastAlmostDate || '').localeCompare(String(a[1].lastAlmostDate || ''));
      })
      .slice(0, 10)
      .map(([ch]) => ch);
    return { todayAlmost, due, historical };
  }

  function expandTargetTasks(tasks) {
    const result = [];
    (tasks || []).forEach(task => {
      (task.targets || []).forEach(target => {
        result.push({
          entry: task.entry,
          groupId: task.groupId,
          groupName: task.groupName,
          ch: target.ch,
          positions: target.positions
        });
      });
    });
    return result;
  }

  function collectSessionResults(tasks, taskStates) {
    const handled = new Set();
    const results = [];
    let taskCount = 0;
    (tasks || []).forEach((task, index) => {
      const state = (taskStates || [])[index];
      if (!state) return;
      let recordedTask = false;
      (task.targets || []).forEach(target => {
        const result = state.ratings && state.ratings[target.ch];
        if (handled.has(target.ch) || !['correct', 'almost'].includes(result)) return;
        recordedTask = true;
        handled.add(target.ch);
        results.push({ ch: target.ch, result });
      });
      if (recordedTask) taskCount += 1;
    });
    return { taskCount, results };
  }

  return {
    pinyinTokens,
    availableFocusChars,
    buildReviewTasks,
    buildSmartSources,
    expandTargetTasks,
    collectSessionResults
  };
});
