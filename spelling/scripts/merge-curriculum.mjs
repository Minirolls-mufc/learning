#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const MAX_STANDARD_OVERRIDES = 50;
const VALID_COMMANDS = new Set(['preview', 'apply', 'apply-large', 'finalize']);

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!VALID_COMMANDS.has(command)) {
    fail('Usage: merge-curriculum.mjs <preview|apply|apply-large|finalize> [options]');
  }

  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const value = rest[i + 1];
    if (!key?.startsWith('--') || value === undefined) fail(`Invalid option: ${key || '(missing)'}`);
    options[key.slice(2)] = value;
  }
  return { command, options };
}

function readJson(file, label) {
  if (!file) fail(`Missing --${label}`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`Cannot read ${label}: ${error.message}`);
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value)}\n`);
}

function cloudDataFromResponse(raw) {
  const data = raw?.record?.data ?? raw?.data ?? raw;
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('Cloud response does not contain a data object');
  if (Number(data.dataVersion) < 3) fail('Cloud data must be migrated to dataVersion 3 first');
  return data;
}

function normalizeOverrides(raw) {
  return {
    wordSets: raw?.wordSets && typeof raw.wordSets === 'object' && !Array.isArray(raw.wordSets)
      ? raw.wordSets
      : {},
    groups: raw?.groups && typeof raw.groups === 'object' && !Array.isArray(raw.groups)
      ? raw.groups
      : {}
  };
}

function overrideCount(overrides) {
  return Object.keys(overrides.wordSets).length + Object.keys(overrides.groups).length;
}

function normalizeWordKey(word) {
  return String(word || '').replace(/\//g, '').replace(/[‘’]/g, "'").toLowerCase();
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
}

function deepEqual(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function normalizeCurriculum(raw) {
  if (!raw || !Array.isArray(raw.wordSets) || !Array.isArray(raw.groups)) fail('Invalid curriculum file');
  const version = Number(raw.curriculumVersion);
  if (!Number.isInteger(version) || version < 1) fail('curriculumVersion must be a positive integer');
  return {
    curriculumVersion: version,
    wordSets: raw.wordSets.map(set => ({
      id: String(set?.id ?? ''),
      words: Array.isArray(set?.words) ? set.words.map(String) : []
    })),
    groups: raw.groups.map(group => ({
      id: Number(group?.id),
      name: String(group?.name ?? ''),
      setIds: Array.isArray(group?.setIds) ? group.setIds.map(String) : []
    }))
  };
}

function validateCurriculum(curriculum) {
  const setIds = new Set();
  for (const set of curriculum.wordSets) {
    if (!set.id.trim()) fail('Every word set must have a non-empty id');
    if (setIds.has(set.id)) fail(`Duplicate word set id: ${set.id}`);
    setIds.add(set.id);
    if (!set.words.length) fail(`Word set ${set.id} must contain at least one word`);

    const words = new Set();
    for (const word of set.words) {
      const key = normalizeWordKey(word);
      if (!key) fail(`Word set ${set.id} contains an empty word`);
      if (words.has(key)) fail(`Word set ${set.id} contains duplicate word: ${key}`);
      words.add(key);
    }
  }

  const groupIds = new Set();
  const assignedSets = new Map();
  for (const group of curriculum.groups) {
    if (!Number.isInteger(group.id) || group.id < 1) fail('Every group must have a positive integer id');
    if (groupIds.has(group.id)) fail(`Duplicate group id: ${group.id}`);
    groupIds.add(group.id);
    if (!group.name.trim()) fail(`Group ${group.id} must have a non-empty name`);

    const localSetIds = new Set();
    for (const setId of group.setIds) {
      if (!setIds.has(setId)) fail(`Group ${group.name} refers to missing word set: ${setId}`);
      if (localSetIds.has(setId)) fail(`Group ${group.name} contains duplicate word set: ${setId}`);
      localSetIds.add(setId);
      if (assignedSets.has(setId)) {
        fail(`Word set ${setId} belongs to both ${assignedSets.get(setId)} and ${group.name}`);
      }
      assignedSets.set(setId, group.name);
    }
  }
}

function applyOverrides(curriculum, overrides) {
  const sets = new Map(curriculum.wordSets.map(set => [set.id, { ...set, words: [...set.words] }]));
  for (const [id, value] of Object.entries(overrides.wordSets)) {
    if (!id.trim()) fail('A word set override has an empty id');
    if (value === null) {
      sets.delete(id);
      continue;
    }
    if (!value || typeof value !== 'object' || !Array.isArray(value.words)) {
      fail(`Invalid word set override: ${id}`);
    }
    if (value.id !== undefined && String(value.id) !== id) fail(`Word set override id mismatch: ${id}`);
    sets.set(id, { id, words: value.words.map(String) });
  }

  const groups = new Map(curriculum.groups.map(group => [String(group.id), { ...group, setIds: [...group.setIds] }]));
  for (const [id, value] of Object.entries(overrides.groups)) {
    if (!id.trim()) fail('A group override has an empty id');
    if (value === null) {
      groups.delete(id);
      continue;
    }
    if (!value || typeof value !== 'object' || !Array.isArray(value.setIds)) fail(`Invalid group override: ${id}`);
    const groupId = Number(value.id ?? id);
    if (!Number.isInteger(groupId) || String(groupId) !== String(Number(id))) fail(`Group override id mismatch: ${id}`);
    groups.set(id, {
      id: groupId,
      name: String(value.name ?? ''),
      setIds: value.setIds.map(String)
    });
  }

  return {
    curriculumVersion: curriculum.curriculumVersion,
    wordSets: [...sets.values()],
    groups: [...groups.values()]
  };
}

function summarizeMap(baseItems, finalItems, keyFor) {
  const base = new Map(baseItems.map(item => [keyFor(item), item]));
  const final = new Map(finalItems.map(item => [keyFor(item), item]));
  const summary = { added: [], updated: [], deleted: [] };
  for (const [key, item] of final) {
    if (!base.has(key)) summary.added.push(key);
    else if (!deepEqual(base.get(key), item)) summary.updated.push(key);
  }
  for (const key of base.keys()) {
    if (!final.has(key)) summary.deleted.push(key);
  }
  return summary;
}

function appendOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function appendSummary(lines) {
  const text = `${lines.join('\n')}\n`;
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  else console.log(text);
}

function formatChanges(label, summary) {
  const parts = [];
  if (summary.added.length) parts.push(`新增 ${summary.added.length}`);
  if (summary.updated.length) parts.push(`更新 ${summary.updated.length}`);
  if (summary.deleted.length) parts.push(`删除 ${summary.deleted.length}`);
  return `- ${label}: ${parts.join('，') || '无变化'}`;
}

function runMerge(command, options) {
  const cloud = cloudDataFromResponse(readJson(options.cloud, 'cloud'));
  const curriculum = normalizeCurriculum(readJson(options.curriculum, 'curriculum'));
  validateCurriculum(curriculum);

  const overrides = normalizeOverrides(cloud.contentOverrides);
  const count = overrideCount(overrides);
  const cloudVersion = Number(cloud.curriculumVersion);
  if (!Number.isInteger(cloudVersion) || cloudVersion < 1) fail('Cloud curriculumVersion is invalid');
  if (cloudVersion > curriculum.curriculumVersion) {
    fail(`Cloud curriculum version ${cloudVersion} is newer than website version ${curriculum.curriculumVersion}`);
  }

  appendOutput('has_overrides', String(count > 0));
  appendOutput('override_count', String(count));
  if (!count) {
    appendOutput('has_changes', 'false');
    appendOutput('new_version', String(curriculum.curriculumVersion));
    appendSummary(['## Spelling curriculum merge', '', '- No pending content overrides.']);
    return;
  }

  const candidate = applyOverrides(curriculum, overrides);
  validateCurriculum(candidate);
  const setSummary = summarizeMap(curriculum.wordSets, candidate.wordSets, item => item.id);
  const groupSummary = summarizeMap(curriculum.groups, candidate.groups, item => String(item.id));
  const hasChanges = !deepEqual(curriculum.wordSets, candidate.wordSets) || !deepEqual(curriculum.groups, candidate.groups);

  if (cloudVersion < curriculum.curriculumVersion && hasChanges) {
    fail(`Overrides are based on curriculum version ${cloudVersion}, but the website is already version ${curriculum.curriculumVersion}`);
  }
  if (command === 'apply' && count > MAX_STANDARD_OVERRIDES) {
    fail(`${count} overrides exceed the standard limit of ${MAX_STANDARD_OVERRIDES}; use apply-large after reviewing the preview`);
  }

  const newVersion = hasChanges ? curriculum.curriculumVersion + 1 : curriculum.curriculumVersion;
  const snapshot = {
    processedOverrides: overrides,
    baseCurriculumVersion: curriculum.curriculumVersion,
    newCurriculumVersion: newVersion,
    overrideCount: count,
    curriculumChanged: hasChanges,
    createdAt: new Date().toISOString()
  };
  writeJson(options.snapshot, snapshot);

  if (command !== 'preview' && hasChanges) {
    candidate.curriculumVersion = newVersion;
    writeJson(options.curriculum, candidate);
  }

  appendOutput('has_changes', String(hasChanges));
  appendOutput('new_version', String(newVersion));
  appendSummary([
    '## Spelling curriculum merge',
    '',
    `- Mode: ${command}`,
    `- Pending overrides: ${count}`,
    `- Curriculum version: ${curriculum.curriculumVersion} -> ${newVersion}`,
    formatChanges('Word sets', setSummary),
    formatChanges('Groups', groupSummary),
    count > MAX_STANDARD_OVERRIDES ? `- Warning: exceeds the standard ${MAX_STANDARD_OVERRIDES}-override limit` : ''
  ].filter(Boolean));
}

function runFinalize(options) {
  const rawCloud = readJson(options.cloud, 'cloud');
  const cloud = cloudDataFromResponse(rawCloud);
  const snapshot = readJson(options.snapshot, 'snapshot');
  const current = normalizeOverrides(cloud.contentOverrides);
  const processed = normalizeOverrides(snapshot.processedOverrides);
  let cleared = 0;
  let retained = 0;

  for (const type of ['wordSets', 'groups']) {
    for (const [id, value] of Object.entries(processed[type])) {
      if (Object.hasOwn(current[type], id) && deepEqual(current[type][id], value)) {
        delete current[type][id];
        cleared += 1;
      } else {
        retained += 1;
      }
    }
  }

  const now = new Date().toISOString();
  const finalData = {
    ...cloud,
    curriculumVersion: Math.max(Number(cloud.curriculumVersion) || 1, Number(snapshot.newCurriculumVersion) || 1),
    revision: (Number(cloud.revision) || 0) + 1,
    updatedAt: now,
    contentOverrides: current
  };
  writeJson(options.output, { updatedAt: now, data: finalData });
  appendOutput('cleared_count', String(cleared));
  appendOutput('retained_count', String(retained));
  appendSummary([
    '## JSONBin cleanup',
    '',
    `- Cleared matching overrides: ${cleared}`,
    `- Retained new or changed overrides: ${retained}`,
    `- Cloud curriculum version: ${finalData.curriculumVersion}`
  ]);
}

const { command, options } = parseArgs(process.argv.slice(2));
if (command === 'finalize') runFinalize(options);
else runMerge(command, options);
