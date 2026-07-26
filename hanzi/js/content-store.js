(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HanziContent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function normalizeCharDef(value) {
    if (typeof value === 'string') return value.trim();
    if (!value || typeof value !== 'object') return '';
    if (value.mode === 'simple') return '';
    return String(value.redRange || '').trim();
  }

  function normalizeFocusIndices(indices, length) {
    return [...new Set((Array.isArray(indices) ? indices : [])
      .map(Number)
      .filter(index => Number.isInteger(index) && index >= 0 && index < length))]
      .sort((a, b) => a - b);
  }

  function normalizeEntry(raw) {
    const hanzi = String(raw && raw.hanzi || '').trim();
    if ((raw && raw.type) === 'word' || [...hanzi].length > 1) {
      const entry = {
        type: 'word',
        hanzi,
        focusIndices: normalizeFocusIndices(raw && raw.focusIndices, [...hanzi].length)
      };
      const pinyin = String(raw && raw.pinyin || '').trim();
      if (pinyin) entry.pinyin = pinyin;
      return entry;
    }
    const entry = { type: 'char', hanzi: [...hanzi][0] || '' };
    if (raw && raw.focus === false) entry.focus = false;
    return entry;
  }

  function normalizeGroup(raw, fallbackId) {
    return {
      id: String(raw && raw.id || fallbackId || ''),
      name: String(raw && raw.name || ''),
      entries: (Array.isArray(raw && raw.entries) ? raw.entries : [])
        .map(normalizeEntry)
        .filter(entry => entry.hanzi)
    };
  }

  function normalizeSuperGroup(raw, fallbackId) {
    return {
      id: String(raw && raw.id || fallbackId || ''),
      name: String(raw && raw.name || ''),
      groupIds: [...new Set((Array.isArray(raw && raw.groupIds) ? raw.groupIds : []).map(String))]
    };
  }

  function normalizeSimilarGroup(raw, fallbackId) {
    const chars = [];
    (Array.isArray(raw && raw.chars) ? raw.chars : []).forEach(value => {
      const ch = [...String(value || '').trim()][0];
      if (ch && !chars.includes(ch)) chars.push(ch);
    });
    return {
      id: String(raw && raw.id || fallbackId || ''),
      name: String(raw && raw.name || ''),
      chars
    };
  }

  function normalizeContent(raw) {
    const source = raw && raw.record && raw.record.data
      ? raw.record.data
      : raw && raw.record && !raw.groups
        ? raw.record
        : raw || {};
    const groups = (Array.isArray(source.groups) ? source.groups : [])
      .map((group, index) => normalizeGroup(group, `g${index + 1}`));
    const charDefs = {};
    Object.entries(source.charDefs || {}).forEach(([ch, value]) => {
      const key = [...String(ch)][0];
      if (key) charDefs[key] = normalizeCharDef(value);
    });
    groups.forEach(group => group.entries.forEach(entry => {
      [...entry.hanzi].forEach(ch => {
        if (!Object.prototype.hasOwnProperty.call(charDefs, ch)) charDefs[ch] = '';
      });
    }));
    return {
      schemaVersion: 2,
      contentVersion: Number(source.contentVersion) || 1,
      groups,
      superGroups: (Array.isArray(source.superGroups) ? source.superGroups : [])
        .map((group, index) => normalizeSuperGroup(group, `sg${index + 1}`)),
      charDefs,
      similarGroups: (Array.isArray(source.similarGroups) ? source.similarGroups : [])
        .map((group, index) => normalizeSimilarGroup(group, `sim${index + 1}`))
    };
  }

  function normalizeOverrides(raw) {
    const value = raw && typeof raw === 'object' ? raw : {};
    return {
      groups: value.groups && typeof value.groups === 'object' ? value.groups : {},
      superGroups: value.superGroups && typeof value.superGroups === 'object' ? value.superGroups : {},
      charDefs: value.charDefs && typeof value.charDefs === 'object' ? value.charDefs : {},
      similarGroups: value.similarGroups && typeof value.similarGroups === 'object' ? value.similarGroups : {},
      groupOrder: Array.isArray(value.groupOrder) ? value.groupOrder.map(String) : null,
      superGroupOrder: Array.isArray(value.superGroupOrder) ? value.superGroupOrder.map(String) : null,
      similarGroupOrder: Array.isArray(value.similarGroupOrder) ? value.similarGroupOrder.map(String) : null
    };
  }

  function applyCollectionOverrides(baseItems, rawChanges, order, normalizeItem) {
    const map = new Map(baseItems.map(item => [String(item.id), clone(item)]));
    Object.entries(rawChanges || {}).forEach(([id, value]) => {
      if (value === null) map.delete(String(id));
      else map.set(String(id), normalizeItem(value, id));
    });
    const result = [];
    const used = new Set();
    (order || []).forEach(id => {
      const key = String(id);
      if (map.has(key) && !used.has(key)) {
        result.push(map.get(key));
        used.add(key);
      }
    });
    map.forEach((item, id) => {
      if (!used.has(id)) result.push(item);
    });
    return result;
  }

  function applyContentOverrides(baseRaw, rawOverrides) {
    const base = normalizeContent(baseRaw);
    const overrides = normalizeOverrides(rawOverrides);
    const charDefs = { ...base.charDefs };
    Object.entries(overrides.charDefs).forEach(([ch, value]) => {
      if (value === null) delete charDefs[ch];
      else charDefs[ch] = normalizeCharDef(value);
    });
    return normalizeContent({
      schemaVersion: 2,
      contentVersion: base.contentVersion,
      groups: applyCollectionOverrides(base.groups, overrides.groups, overrides.groupOrder, normalizeGroup),
      superGroups: applyCollectionOverrides(base.superGroups, overrides.superGroups, overrides.superGroupOrder, normalizeSuperGroup),
      charDefs,
      similarGroups: applyCollectionOverrides(base.similarGroups, overrides.similarGroups, overrides.similarGroupOrder, normalizeSimilarGroup)
    });
  }

  function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function collectionOverrides(currentItems, baseItems) {
    const changes = {};
    const baseMap = new Map(baseItems.map(item => [String(item.id), item]));
    const currentMap = new Map(currentItems.map(item => [String(item.id), item]));
    baseMap.forEach((_, id) => {
      if (!currentMap.has(id)) changes[id] = null;
    });
    currentMap.forEach((item, id) => {
      if (!baseMap.has(id) || !same(item, baseMap.get(id))) changes[id] = clone(item);
    });
    return changes;
  }

  function buildContentOverrides(currentRaw, baseRaw) {
    const current = normalizeContent(currentRaw);
    const base = normalizeContent(baseRaw);
    const result = {
      groups: collectionOverrides(current.groups, base.groups),
      superGroups: collectionOverrides(current.superGroups, base.superGroups),
      charDefs: {},
      similarGroups: collectionOverrides(current.similarGroups, base.similarGroups)
    };
    const allChars = new Set([...Object.keys(base.charDefs), ...Object.keys(current.charDefs)]);
    allChars.forEach(ch => {
      if (!Object.prototype.hasOwnProperty.call(current.charDefs, ch)) result.charDefs[ch] = null;
      else if (!Object.prototype.hasOwnProperty.call(base.charDefs, ch) || current.charDefs[ch] !== base.charDefs[ch]) {
        result.charDefs[ch] = current.charDefs[ch];
      }
    });
    const orderFields = [
      ['groups', 'groupOrder'],
      ['superGroups', 'superGroupOrder'],
      ['similarGroups', 'similarGroupOrder']
    ];
    orderFields.forEach(([field, orderField]) => {
      const currentOrder = current[field].map(item => String(item.id));
      const baseOrder = base[field].map(item => String(item.id));
      if (!same(currentOrder, baseOrder)) result[orderField] = currentOrder;
    });
    return result;
  }

  function decodeContentPayload(payloadRaw, baseRaw) {
    const payload = payloadRaw && payloadRaw.record ? payloadRaw.record : payloadRaw || {};
    const base = normalizeContent(baseRaw);
    if (Number(payload.dataVersion) >= 2 && payload.contentOverrides) {
      return {
        content: applyContentOverrides(base, payload.contentOverrides),
        overrides: normalizeOverrides(payload.contentOverrides),
        legacy: false
      };
    }
    if (Array.isArray(payload.groups)) {
      const content = normalizeContent({
        contentVersion: base.contentVersion,
        groups: payload.groups,
        superGroups: payload.superGroups || [],
        charDefs: payload.charDefs || {},
        similarGroups: payload.similarGroups || []
      });
      return { content, overrides: buildContentOverrides(content, base), legacy: true };
    }
    return { content: base, overrides: buildContentOverrides(base, base), legacy: false };
  }

  function isCharFocus(entry) {
    return Boolean(entry && entry.type === 'char' && entry.focus !== false);
  }

  function getWordFocusIndices(entry) {
    if (!entry || entry.type !== 'word') return [];
    return normalizeFocusIndices(entry.focusIndices, [...entry.hanzi].length);
  }

  function groupDistinctChars(group) {
    const chars = [];
    (group && group.entries || []).forEach(entry => [...entry.hanzi].forEach(ch => {
      if (!chars.includes(ch)) chars.push(ch);
    }));
    return chars;
  }

  return {
    clone,
    normalizeCharDef,
    normalizeFocusIndices,
    normalizeEntry,
    normalizeContent,
    normalizeOverrides,
    applyContentOverrides,
    buildContentOverrides,
    decodeContentPayload,
    isCharFocus,
    getWordFocusIndices,
    groupDistinctChars
  };
});
