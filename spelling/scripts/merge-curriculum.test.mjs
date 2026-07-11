import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'merge-curriculum.mjs');

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value));
}

function cloud(overrides = {}, extra = {}) {
  return {
    dataVersion: 3,
    curriculumVersion: 1,
    revision: 4,
    contentOverrides: { wordSets: {}, groups: {}, ...overrides },
    wordStats: { there: { c: 2, w: 1 } },
    achievement: { totalCorrect: 8 },
    ...extra
  };
}

function curriculum() {
  return {
    curriculumVersion: 1,
    wordSets: [
      { id: 'A', words: ['one'] },
      { id: 'B', words: ['two'] }
    ],
    groups: [{ id: 1, name: 'Group', setIds: ['A', 'B'] }]
  };
}

function run(command, files, expectFailure = false) {
  const args = [script, command];
  for (const [key, value] of Object.entries(files)) args.push(`--${key}`, value);
  try {
    execFileSync(process.execPath, args, { stdio: 'pipe' });
    if (expectFailure) assert.fail(`${command} should have failed`);
  } catch (error) {
    if (!expectFailure) throw error;
  }
}

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spelling-merge-'));
  const files = {
    cloud: path.join(dir, 'cloud.json'),
    curriculum: path.join(dir, 'curriculum.json'),
    snapshot: path.join(dir, 'snapshot.json'),
    output: path.join(dir, 'output.json')
  };
  writeJson(files.curriculum, curriculum());
  return files;
}

{
  const files = fixture();
  writeJson(files.cloud, cloud({
    wordSets: {
      A: { id: 'A', words: ['one', 'three'] },
      B: null,
      C: { id: 'C', words: ['four'] }
    },
    groups: { 1: { id: 1, name: 'Group', setIds: ['A', 'C'] } }
  }));
  run('apply', files);
  const result = JSON.parse(fs.readFileSync(files.curriculum));
  assert.equal(result.curriculumVersion, 2);
  assert.deepEqual(result.wordSets, [
    { id: 'A', words: ['one', 'three'] },
    { id: 'C', words: ['four'] }
  ]);
  assert.deepEqual(result.groups[0].setIds, ['A', 'C']);
}

{
  const files = fixture();
  writeJson(files.cloud, cloud({ wordSets: { A: { id: 'A', words: ['th/ere', 'there'] } } }));
  run('preview', files, true);
}

{
  const files = fixture();
  writeJson(files.cloud, cloud({ groups: { 1: { id: 1, name: 'Group', setIds: ['missing'] } } }));
  run('preview', files, true);
}

{
  const additions = Object.fromEntries(Array.from({ length: 51 }, (_, index) => [
    `New-${index}`,
    { id: `New-${index}`, words: [`word-${index}`] }
  ]));
  const files = fixture();
  writeJson(files.cloud, cloud({ wordSets: additions }));
  run('apply', files, true);
  assert.equal(JSON.parse(fs.readFileSync(files.curriculum)).curriculumVersion, 1);
  run('apply-large', files);
  assert.equal(JSON.parse(fs.readFileSync(files.curriculum)).curriculumVersion, 2);
}

{
  const files = fixture();
  const processed = {
    wordSets: { A: { id: 'A', words: ['one', 'merged'] } },
    groups: { 1: { id: 1, name: 'Merged', setIds: ['A', 'B'] } }
  };
  writeJson(files.snapshot, {
    processedOverrides: processed,
    newCurriculumVersion: 2
  });
  writeJson(files.cloud, cloud({
    wordSets: {
      A: { id: 'A', words: ['one', 'newer-change'] },
      C: { id: 'C', words: ['new-after-snapshot'] }
    },
    groups: processed.groups
  }));
  run('finalize', files);
  const result = JSON.parse(fs.readFileSync(files.output)).data;
  assert.deepEqual(result.contentOverrides.wordSets.A.words, ['one', 'newer-change']);
  assert.deepEqual(result.contentOverrides.wordSets.C.words, ['new-after-snapshot']);
  assert.deepEqual(result.contentOverrides.groups, {});
  assert.deepEqual(result.wordStats, { there: { c: 2, w: 1 } });
  assert.deepEqual(result.achievement, { totalCorrect: 8 });
  assert.equal(result.curriculumVersion, 2);
  assert.equal(result.revision, 5);
}

console.log('merge-curriculum tests passed');
