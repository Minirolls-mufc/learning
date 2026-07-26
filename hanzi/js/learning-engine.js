(function (root, factory) {
  const content = typeof module === 'object' && module.exports
    ? require('./content-store.js')
    : root.HanziContent;
  const api = factory(content);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HanziLearning = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Content) {
  'use strict';

  function shuffle(values, random) {
    const rng = random || Math.random;
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const target = Math.floor(rng() * (index + 1));
      [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
  }

  function sample(values, count, random) {
    return shuffle(values, random).slice(0, Math.max(0, count));
  }

  function buildLearningTargets(group, random) {
    const targetMap = new Map();
    (group && group.entries || []).forEach((entry, entryIndex) => {
      if (Content.isCharFocus(entry)) {
        const ch = entry.hanzi;
        if (!targetMap.has(ch)) targetMap.set(ch, { hanzi: ch, firstOrder: entryIndex, words: [], standalone: true });
        else targetMap.get(ch).standalone = true;
      }
      if (entry.type === 'word') {
        const chars = [...entry.hanzi];
        Content.getWordFocusIndices(entry).forEach(position => {
          const ch = chars[position];
          if (!targetMap.has(ch)) targetMap.set(ch, { hanzi: ch, firstOrder: entryIndex, words: [], standalone: false });
          targetMap.get(ch).words.push({ entry, entryIndex, position });
        });
      }
    });
    return [...targetMap.values()]
      .sort((a, b) => a.firstOrder - b.firstOrder)
      .map(target => {
        const context = target.words.length
          ? sample(target.words, 1, random)[0]
          : { entry: { type: 'char', hanzi: target.hanzi }, entryIndex: target.firstOrder, position: 0 };
        return { hanzi: target.hanzi, context, hasFocusWord: target.words.length > 0 };
      });
  }

  function similarCandidates(ch, similarGroups) {
    const result = [];
    (similarGroups || []).forEach(group => {
      if (!(group.chars || []).includes(ch)) return;
      (group.chars || []).forEach(candidate => {
        if (candidate !== ch && !result.includes(candidate)) result.push(candidate);
      });
    });
    return result;
  }

  function buildRecognitionQuestion(ch, similarGroups, random) {
    const distractors = sample(similarCandidates(ch, similarGroups), 2, random);
    if (!distractors.length) return null;
    return {
      target: ch,
      options: shuffle([ch, ...distractors], random)
    };
  }

  function parseStrokeRange(value, strokeCount) {
    const result = new Set();
    const text = String(value || '').trim();
    if (!text) return result;
    text.split(',').forEach(part => {
      const token = part.trim();
      if (!token) return;
      if (token.includes('-')) {
        let [start, end] = token.split('-').map(Number);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return;
        if (start > end) [start, end] = [end, start];
        for (let index = start; index <= end && index <= strokeCount; index += 1) {
          if (index >= 1) result.add(index - 1);
        }
      } else {
        const index = Number(token);
        if (Number.isInteger(index) && index >= 1 && index <= strokeCount) result.add(index - 1);
      }
    });
    return result;
  }

  function partitionStrokes(redRange, strokeCount) {
    const red = [...parseStrokeRange(redRange, strokeCount)].sort((a, b) => a - b);
    const redSet = new Set(red);
    const blue = [];
    for (let index = 0; index < strokeCount; index += 1) {
      if (!redSet.has(index)) blue.push(index);
    }
    if (!String(redRange || '').trim()) return { red: [...Array(strokeCount).keys()], blue: [] };
    return { red, blue };
  }

  function fragment(id, sourceChar, role, indices, correct) {
    return { id, sourceChar, role, indices: [...indices], correct: Boolean(correct) };
  }

  function buildComponentQuestion(target, charDataMap, groupChars, charDefs, random) {
    const targetData = charDataMap[target];
    if (!targetData || !Array.isArray(targetData.strokes)) return null;
    const targetParts = partitionStrokes(charDefs[target], targetData.strokes.length);
    if (!targetParts.red.length || !targetParts.blue.length) return null;
    const correct = [
      fragment(`${target}:red`, target, 'red', targetParts.red, true),
      fragment(`${target}:blue`, target, 'blue', targetParts.blue, true)
    ];
    const distractors = [];
    (groupChars || []).forEach(ch => {
      if (ch === target) return;
      const data = charDataMap[ch];
      if (!data || !Array.isArray(data.strokes) || !data.strokes.length) return;
      const parts = partitionStrokes(charDefs[ch], data.strokes.length);
      if (parts.red.length && parts.blue.length) {
        distractors.push(fragment(`${ch}:red`, ch, 'red', parts.red, false));
        distractors.push(fragment(`${ch}:blue`, ch, 'blue', parts.blue, false));
      } else {
        distractors.push(fragment(`${ch}:whole`, ch, 'whole', [...Array(data.strokes.length).keys()], false));
      }
    });
    if (!distractors.length) return null;
    return {
      target,
      correctIds: correct.map(item => item.id),
      options: shuffle([...correct, ...sample(distractors, 3, random)], random)
    };
  }

  function buildStrokeStep(strokeCount, currentIndex, random) {
    if (!Number.isInteger(strokeCount) || currentIndex < 0 || currentIndex >= strokeCount) return null;
    const allStrokes = Array.from({ length: strokeCount }, (_, index) => index);
    return {
      correctIndex: currentIndex,
      options: shuffle(allStrokes, random)
    };
  }

  return {
    shuffle,
    sample,
    buildLearningTargets,
    similarCandidates,
    buildRecognitionQuestion,
    parseStrokeRange,
    partitionStrokes,
    buildComponentQuestion,
    buildStrokeStep
  };
});
