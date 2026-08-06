const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Content = require('../js/content-store.js');
const Progress = require('../js/progress-store.js');
const Learning = require('../js/learning-engine.js');
const Review = require('../js/review-engine.js');

const test = (name, fn) => {
  try {
    fn();
    process.stdout.write(`ok - ${name}\n`);
  } catch (error) {
    process.stderr.write(`not ok - ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
};

test('static content preserves the complete current local baseline', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/content.json'), 'utf8'));
  const content = Content.normalizeContent(raw);
  assert.equal(content.groups.length, 101);
  assert.equal(content.superGroups.length, 2);
  assert.equal(Object.keys(raw.charDefs).length, 812);
  assert.equal(Object.keys(content.charDefs).length, 826);
  assert.equal(content.similarGroups.length, 1);
  assert.equal(content.groups.flatMap(group => group.entries).length, 1057);
  assert.equal(content.groups.flatMap(group => group.entries).filter(entry => entry.type === 'char').length, 0);
  assert.equal(content.groups.flatMap(group => group.entries).filter(entry => entry.type === 'word').length, 1057);

  const expandedGroups = content.groups.filter(group =>
    /^c(?:0[1-9]|[1-7][0-9]|80)$/.test(group.id));
  assert.equal(expandedGroups.length, 80);
  assert.equal(expandedGroups.flatMap(group => group.entries).length, 798);
  assert.ok(expandedGroups.flatMap(group => group.entries)
    .every(entry => entry.type === 'word' && entry.focusIndices.length >= 1));
  assert.deepEqual(expandedGroups.find(group => group.id === 'c01').entries[5], {
    type: 'word',
    hanzi: '没了',
    focusIndices: [1]
  });
  assert.deepEqual(expandedGroups.find(group => group.id === 'c03').entries[0], {
    type: 'word',
    hanzi: '时间',
    focusIndices: [0]
  });
  assert.deepEqual(expandedGroups.find(group => group.id === 'c03').entries[6], {
    type: 'word',
    hanzi: '作业',
    focusIndices: [0]
  });
  assert.deepEqual(expandedGroups.find(group => group.id === 'c25').entries.at(-1), {
    type: 'word',
    hanzi: '共同',
    pinyin: 'gòng tóng',
    focusIndices: [0]
  });
});

test('content overrides round-trip additions, edits, deletions and ordering', () => {
  const base = Content.normalizeContent({
    groups: [{ id: 'a', name: 'A', entries: [{ type: 'char', hanzi: '晴' }] }],
    superGroups: [],
    charDefs: { 晴: '1-4' },
    similarGroups: []
  });
  const current = Content.normalizeContent({
    ...base,
    groups: [
      { id: 'b', name: 'B', entries: [{ type: 'word', hanzi: '晴天', pinyin: 'qíng tiān', focusIndices: [0] }] },
      { id: 'a', name: 'A2', entries: [{ type: 'char', hanzi: '晴', focus: false }] }
    ],
    charDefs: { ...base.charDefs, 天: '' },
    similarGroups: [{ id: 'sim1', name: '青字族', chars: ['晴', '清', '晴'] }]
  });
  const overrides = Content.buildContentOverrides(current, base);
  assert.deepEqual(Content.applyContentOverrides(base, overrides), current);
  assert.deepEqual(overrides.groupOrder, ['b', 'a']);
});

test('legacy full payload becomes content without importing old achievements', () => {
  const base = Content.normalizeContent({ groups: [], charDefs: {}, superGroups: [] });
  const decoded = Content.decodeContentPayload({
    groups: [{ id: 'g1', name: '旧数据', entries: [{ type: 'char', hanzi: '行', pinyin: 'xíng' }] }],
    charDefs: { 行: { mode: 'simple' } },
    ach: { learnedChars: [{ ch: '行' }] }
  }, base);
  assert.equal(decoded.legacy, true);
  assert.deepEqual(decoded.content.groups[0].entries[0], { type: 'char', hanzi: '行' });
  assert.equal(decoded.content.charDefs.行, '');
  assert.equal('progress' in decoded, false);
});

test('unchanged static content produces a tiny cloud override record', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/content.json'), 'utf8'));
  const overrides = Content.buildContentOverrides(raw, raw);
  assert.deepEqual(overrides, { groups: {}, superGroups: {}, charDefs: {}, similarGroups: {} });
  assert.ok(Buffer.byteLength(JSON.stringify(overrides)) < 100);
});

test('learning targets prefer one fixed focus-word context and deduplicate chars', () => {
  const group = Content.normalizeContent({ groups: [{ id: 'g', name: 'G', entries: [
    { type: 'char', hanzi: '荷' },
    { type: 'word', hanzi: '荷叶', pinyin: 'hé yè', focusIndices: [0, 1] },
    { type: 'word', hanzi: '荷花', pinyin: 'hé huā', focusIndices: [0] }
  ] }] }).groups[0];
  const targets = Learning.buildLearningTargets(group, () => 0.999);
  assert.deepEqual(targets.map(target => target.hanzi), ['荷', '叶']);
  assert.equal(targets[0].context.entry.hanzi, '荷叶');
  assert.equal(targets[0].hasFocusWord, true);
});

test('a focused character inside 大山 becomes a word-context learning target', () => {
  const group = Content.normalizeContent({ groups: [{ id: 'g', name: '基础字', entries: [
    { type: 'char', hanzi: '山' },
    { type: 'char', hanzi: '水' },
    { type: 'char', hanzi: '火' },
    { type: 'word', hanzi: '大山', pinyin: 'dà shān', focusIndices: [0] }
  ] }] }).groups[0];
  const targets = Learning.buildLearningTargets(group, () => 0);
  assert.deepEqual(targets.map(target => target.hanzi), ['山', '水', '火', '大']);
  assert.equal(targets[3].context.entry.hanzi, '大山');
  assert.equal(targets[3].context.position, 0);
});

test('recognition candidates are the deduplicated union of all manual groups', () => {
  const groups = [
    { chars: ['晴', '清', '情'] },
    { chars: ['晴', '睛', '清'] }
  ];
  assert.deepEqual(Learning.similarCandidates('晴', groups), ['清', '情', '睛']);
  const question = Learning.buildRecognitionQuestion('晴', groups, () => 0);
  assert.equal(question.options.length, 3);
  assert.ok(question.options.includes('晴'));
});

test('component question keeps red and blue as separate positioned instances', () => {
  const data = strokes => ({ strokes: Array.from({ length: strokes }, (_, index) => `M${index} 0`) });
  const question = Learning.buildComponentQuestion(
    '林',
    { 林: data(8), 明: data(8), 好: data(6) },
    ['林', '明', '好'],
    { 林: '1-4', 明: '1-4', 好: '' },
    () => 0
  );
  assert.deepEqual(new Set(question.correctIds), new Set(['林:red', '林:blue']));
  assert.equal(question.options.filter(option => option.correct).length, 2);
  assert.ok(question.options.some(option => !option.correct));
  assert.equal(Learning.buildComponentQuestion('好', { 好: data(6), 林: data(8) }, ['好', '林'], { 好: '', 林: '1-4' }), null);
});

test('component matching creates two unique positioned parts for each splittable focus character', () => {
  const data = strokes => ({ strokes: Array.from({ length: strokes }, (_, index) => `M${index} 0`) });
  const items = Learning.buildComponentMatchItems([
    { ch: '诗', entry: { hanzi: '古诗' }, positions: [1] },
    { ch: '童', entry: { hanzi: '儿童' }, positions: [1] },
    { ch: '必', entry: { hanzi: '必须' }, positions: [0] }
  ], {
    诗: data(8),
    童: data(12),
    必: data(5)
  }, {
    诗: '1-2',
    童: '1-6',
    必: ''
  });
  assert.deepEqual(items.map(item => item.ch), ['诗', '童']);
  assert.ok(items.every(item => item.components.length === 2));
  assert.equal(new Set(items.flatMap(item => item.components.map(part => part.id))).size, 4);
  assert.deepEqual(items[0].components.map(part => part.role), ['red', 'blue']);
});

test('stroke questions show every target stroke while keeping the current answer', () => {
  const step = Learning.buildStrokeStep(5, 2, () => 0);
  assert.equal(step.correctIndex, 2);
  assert.equal(step.options.length, 5);
  assert.deepEqual([...step.options].sort((a, b) => a - b), [0, 1, 2, 3, 4]);
  assert.equal(Learning.buildStrokeStep(5, 4, () => 0).correctIndex, 4);
});

test('review progress advances only when due and on distinct dates', () => {
  let record = Progress.markLearned(null, { today: '2026-07-01', now: 'learned' });
  assert.equal(record.masteryStep, 0);
  assert.equal(record.nextReviewDate, '2026-07-01');
  record = Progress.applyReviewResult(record, 'correct', { today: '2026-07-01', now: 'one' });
  assert.equal(record.masteryStep, 1);
  assert.equal(record.nextReviewDate, '2026-07-02');
  record = Progress.applyReviewResult(record, 'correct', { today: '2026-07-01', now: 'same-day' });
  assert.equal(record.masteryStep, 1);
  record = Progress.applyReviewResult(record, 'correct', { today: '2026-07-02', now: 'two' });
  assert.equal(record.masteryStep, 2);
  assert.equal(record.nextReviewDate, '2026-07-05');
  record = Progress.applyReviewResult(record, 'correct', { today: '2026-07-03', now: 'early' });
  assert.equal(record.masteryStep, 2);
  record = Progress.applyReviewResult(record, 'correct', { today: '2026-07-06', now: 'three' });
  assert.equal(record.masteryStep, 3);
  assert.equal(record.nextReviewDate, null);
  assert.equal(record.correctCount, 5);
});

test('direct review advances mastery without marking the learning flow complete', () => {
  const record = Progress.applyReviewResult(null, 'correct', { today: '2026-07-01', now: 'reviewed' });
  assert.equal(record.learningCompleted, false);
  assert.equal(record.learnedAt, null);
  assert.equal(record.masteryStep, 1);
  assert.equal(record.nextReviewDate, '2026-07-02');
});

test('almost keeps an active stage and rolls mastered back to 2/3', () => {
  let active = Progress.normalizeRecord({ learningCompleted: true, masteryStep: 1, nextReviewDate: '2026-07-10' });
  active = Progress.applyReviewResult(active, 'almost', { today: '2026-07-08', now: 'a' });
  assert.equal(active.masteryStep, 1);
  assert.equal(active.nextReviewDate, '2026-07-09');
  assert.equal(active.lastAlmostDate, '2026-07-08');
  let mastered = Progress.normalizeRecord({ learningCompleted: true, masteryStep: 3, masteredAt: 'old' });
  mastered = Progress.applyReviewResult(mastered, 'almost', { today: '2026-07-08', now: 'b' });
  assert.equal(mastered.masteryStep, 2);
  assert.equal(mastered.masteredAt, null);
  assert.equal(mastered.nextReviewDate, '2026-07-09');
});

test('compact progress round-trips independently from content', () => {
  const source = {
    晴: Progress.applyReviewResult(
      Progress.markLearned(null, { today: '2026-07-01', now: 'learned' }),
      'correct',
      { today: '2026-07-01', now: 'reviewed' }
    ),
    山: Progress.applyReviewResult(null, 'almost', { today: '2026-07-02', now: 'direct-review' })
  };
  const compact = Progress.compactProgress(source);
  assert.equal('l' in compact.山, false);
  assert.deepEqual(Progress.expandProgress(compact), Progress.normalizeProgress(source));
});

test('review tasks use group word order and test each focus char once without requiring learning', () => {
  const group = Content.normalizeContent({ groups: [{ id: 'g', name: 'G', entries: [
    { type: 'word', hanzi: '荷荷叶', pinyin: 'hé hé yè', focusIndices: [0, 1, 2] },
    { type: 'word', hanzi: '荷花', pinyin: 'hé huā', focusIndices: [0] }
  ] }] }).groups[0];
  const review = Review.buildReviewTasks(group);
  assert.equal(review.status, 'ready');
  assert.equal(review.tasks.length, 1);
  assert.deepEqual(review.tasks[0].hiddenIndices, [0, 1, 2]);
  assert.deepEqual(review.tasks[0].targets.map(target => target.ch), ['荷', '叶']);
  assert.deepEqual(review.tasks[0].targets[0].positions, [0, 1]);
});

test('review only requires a word with configured focus characters', () => {
  const noFocus = { entries: [{ type: 'word', hanzi: '荷叶', focusIndices: [] }] };
  const notLearned = { entries: [{ type: 'word', hanzi: '荷叶', focusIndices: [0] }] };
  assert.equal(Review.buildReviewTasks(noFocus).status, 'no-focus-words');
  assert.equal(Review.buildReviewTasks(notLearned).status, 'ready');
  assert.deepEqual(Review.buildReviewTasks(notLearned).tasks[0].hiddenIndices, [0]);
});

test('review session records assessed tasks only and keeps ratings after hiding', () => {
  const tasks = [
    { targets: [{ ch: '荷' }, { ch: '叶' }] },
    { targets: [{ ch: '荷' }, { ch: '花' }] },
    { targets: [{ ch: '山' }] }
  ];
  const session = Review.collectSessionResults(tasks, [
    { assessed: true, revealed: false, ratings: { 荷: 'correct', 叶: 'almost' } },
    { assessed: true, revealed: true, ratings: { 荷: 'almost', 花: 'correct' } },
    { assessed: false, revealed: false, ratings: {} }
  ]);
  assert.equal(session.taskCount, 2);
  assert.deepEqual(session.results, [
    { ch: '荷', result: 'correct' },
    { ch: '叶', result: 'almost' },
    { ch: '花', result: 'correct' }
  ]);
});

test('review sources combine groups and select today, due and high-frequency characters', () => {
  const groups = Content.normalizeContent({ groups: [
    { id: 'a', name: 'A', entries: [{ type: 'word', hanzi: '荷叶', focusIndices: [0, 1] }] },
    { id: 'b', name: 'B', entries: [{ type: 'word', hanzi: '荷花', focusIndices: [0, 1] }] }
  ] }).groups;
  const progress = {
    荷: Progress.normalizeRecord({ almostCount: 2, lastAlmostDate: '2026-07-10', masteryStep: 1, nextReviewDate: '2026-07-10' }),
    叶: Progress.normalizeRecord({ almostCount: 4, lastAlmostDate: '2026-07-09', masteryStep: 2, nextReviewDate: '2026-07-12' }),
    花: Progress.normalizeRecord({ almostCount: 1, lastAlmostDate: '2026-07-10', masteryStep: 0, nextReviewDate: '2026-07-10' }),
    山: Progress.normalizeRecord({ almostCount: 9, lastAlmostDate: '2026-07-10' })
  };
  const sources = Review.buildSmartSources(groups, progress, '2026-07-10');
  assert.deepEqual(sources.todayAlmost, ['荷', '花']);
  assert.deepEqual(sources.due, ['荷', '花']);
  assert.deepEqual(sources.historical, ['叶', '荷', '花']);
  const review = Review.buildReviewTasks(groups, ['花', '荷']);
  assert.deepEqual(review.tasks.map(task => task.targets.map(target => target.ch)), [['荷'], ['花']]);
});

test('partially rated review tasks still record selected characters only', () => {
  const session = Review.collectSessionResults([
    { targets: [{ ch: '荷' }, { ch: '叶' }] }
  ], [
    { assessed: false, ratings: { 荷: 'correct' } }
  ]);
  assert.equal(session.taskCount, 1);
  assert.deepEqual(session.results, [{ ch: '荷', result: 'correct' }]);
});
