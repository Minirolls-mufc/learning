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

  function buildReviewTasks(group) {
    const focusWords = (group && group.entries || []).filter(entry => (
      entry.type === 'word' && Content.getWordFocusIndices(entry).length
    ));
    if (!focusWords.length) return { status: 'no-focus-words', tasks: [] };

    const handled = new Set();
    const tasks = [];
    focusWords.forEach((entry, entryIndex) => {
      const chars = [...entry.hanzi];
      const focusIndices = Content.getWordFocusIndices(entry);
      const newlyHandledChars = [];
      focusIndices.forEach(position => {
        const ch = chars[position];
        if (!ch || handled.has(ch)) return;
        handled.add(ch);
        newlyHandledChars.push(ch);
      });
      if (!newlyHandledChars.length) return;
      const targetSet = new Set(newlyHandledChars);
      const hiddenIndices = focusIndices.filter(position => targetSet.has(chars[position]));
      tasks.push({
        entry,
        entryIndex,
        hiddenIndices,
        targets: newlyHandledChars.map(ch => ({
          ch,
          positions: hiddenIndices.filter(position => chars[position] === ch)
        }))
      });
    });
    return { status: tasks.length ? 'ready' : 'no-focus-words', tasks };
  }

  function collectSessionResults(tasks, taskStates) {
    const handled = new Set();
    const results = [];
    let taskCount = 0;
    (tasks || []).forEach((task, index) => {
      const state = (taskStates || [])[index];
      if (!state || !state.assessed) return;
      taskCount += 1;
      (task.targets || []).forEach(target => {
        const result = state.ratings && state.ratings[target.ch];
        if (handled.has(target.ch) || !['correct', 'almost'].includes(result)) return;
        handled.add(target.ch);
        results.push({ ch: target.ch, result });
      });
    });
    return { taskCount, results };
  }

  return { pinyinTokens, buildReviewTasks, collectSessionResults };
});
