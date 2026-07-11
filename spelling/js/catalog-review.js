/* ==================== HOME ==================== */
function renderHome() {
  document.getElementById('headerBtn').innerHTML = '';
  document.getElementById('app').innerHTML = `
    <div style="margin: 16px 0 18px 4px">
      <div class="hero-title">Hi, Romeo!</div>
      <div style="font-size:14px;color:var(--text-2);font-weight:700">今天想做点什么？</div>
    </div>
    <div class="home-grid">
      <div class="mode-card learn" onclick="renderSetSelection('learn')">
        <div class="mode-icon">📖</div>
        <div class="mode-info"><h3 style="color:#3563d4">单词学习</h3><p>认读、拼读、逐步揭示</p></div>
      </div>
      <div class="mode-card practice" onclick="renderSetSelection('practice')">
        <div class="mode-icon">✏️</div>
        <div class="mode-info"><h3 style="color:#b45309">拼写练习</h3><p>字母拼图 / 听写输入</p></div>
      </div>
      <div class="mode-card records" onclick="renderRecords()">
        <div class="mode-icon">🏆</div>
        <div class="mode-info"><h3 style="color:#059669">成就记录</h3><p>星星、火箭、足迹</p></div>
      </div>
      <div class="mode-card manage" onclick="renderWordManager()">
        <div class="mode-icon">📂</div>
        <div class="mode-info"><h3 style="color:#7c3aed">单词管理</h3><p>词组、分组、编辑</p></div>
      </div>
    </div>
    <div class="card" style="background:#f5f8ff;border:1.5px solid #d4e1ff">
      <div style="font-size:11px;font-weight:800;color:var(--primary);margin-bottom:10px;letter-spacing:1px">CLOUD SYNC</div>
      <div class="btn-row">
        <button class="btn btn-primary btn-sm" style="flex:1" onclick="syncToCloud()">☁️ 上传</button>
        <button class="btn btn-outline btn-sm" style="flex:1" onclick="syncFromCloud()">📥 恢复</button>
        <button class="btn btn-gray btn-sm" style="flex:1" onclick="exportAllData()">📤 导出</button>
        <button class="btn btn-gray btn-sm" style="flex:1" onclick="document.getElementById('fileInput').click()">📥 导入</button>
      </div>
    </div>
  `;
}

/* ==================== SET SELECTION ==================== */
function renderSetSelection(mode, activeTab) {
  document.getElementById('headerBtn').innerHTML = `<button class="btn btn-gray btn-sm" onclick="renderHome()">🏠 首页</button>`;
  const stores = ['wordSets', 'groups', 'wrongBank'];
  const tx = db.transaction(stores, 'readonly');
  Promise.all([
    getAll(tx.objectStore('wordSets')),
    getAll(tx.objectStore('groups')),
    getAll(tx.objectStore('wrongBank'))
  ]).then(([sets, groups, wrongBank]) => {
    sets.sort((a, b) => a.id.localeCompare(b.id));
    groups.sort((a, b) => a.name.localeCompare(b.name));
    activeTab = activeTab || 'all';

    const modeLabel = mode === 'learn' ? '单词学习' : '拼写练习';
    const modeIcon = mode === 'learn' ? '📖' : '✏️';

    // Build tab bar: All + each group
    let tabsHtml = `<button class="tab-btn ${activeTab === 'all' ? 'active' : ''}" onclick="renderSetSelection('${mode}','all')">全部</button>`;
    groups.forEach(g => {
      const gid = g.id;
      tabsHtml += `<button class="tab-btn ${activeTab == gid ? 'active' : ''}" onclick="renderSetSelection('${mode}',${gid})">${g.name}</button>`;
    });

    // Filter sets by active tab
    let filteredSets = sets;
    if (activeTab !== 'all') {
      const grp = groups.find(g => g.id == activeTab);
      const setIds = grp ? (grp.setIds || []) : [];
      filteredSets = sets.filter(s => setIds.includes(s.id));
    }

    // Target entry card
    const targetLabel = mode === 'learn' ? '🎯 针对复习' : '🎯 针对练习';
    const targetDesc = mode === 'learn' ? '按掌握程度排序，选择要加强的词' : '按掌握程度排序，选择要攻克的词';
    const targetFn = mode === 'learn' ? `renderTargetSelection('learn')` : `renderTargetSelection('practice')`;

    let html = `
      <div style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:20px">${modeIcon} ${modeLabel}</h3>
        <span style="background:#eef2ff;padding:4px 12px;border-radius:12px;font-size:12px;color:#4f7ef8;font-weight:800">${filteredSets.length} 个</span>
      </div>

      <div class="target-card ${mode === 'practice' ? 'practice-type' : ''}" onclick="${targetFn}">
        <div style="font-size:36px">🎯</div>
        <div>
          <div style="font-size:17px;font-weight:800;margin-bottom:2px">${targetLabel}</div>
          <div style="font-size:13px;color:var(--text-2);font-weight:600">${targetDesc}</div>
        </div>
      </div>

      <div class="tab-bar">${tabsHtml}</div>
    `;

    if (filteredSets.length === 0) {
      html += `<div class="card" style="text-align:center;padding:40px;color:#999">
        <div style="font-size:48px;margin-bottom:12px">📭</div>
        <div style="font-weight:700">${activeTab === 'all' ? '暂无词组，去管理页面录入吧！' : '该分组暂无词组'}</div>
      </div>`;
    } else {
      filteredSets.forEach(s => {
        const preview = s.words.map(w => w.replace(/\//g, '')).slice(0, 4).join('  ');
        const fn = mode === 'learn' ? `startLearn('${esc(s.id)}')` : `renderPracticeMode('${esc(s.id)}')`;
        html += `<div class="card" style="cursor:pointer;padding:18px;display:flex;justify-content:space-between;align-items:center;gap:12px" onclick="${fn}">
          <div style="min-width:0;flex:1">
            <div style="font-weight:800;font-size:17px;margin-bottom:4px">${s.id}</div>
            <div style="font-size:13px;color:var(--text-2);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${preview}${s.words.length > 4 ? '…' : ''}</div>
          </div>
          <div style="font-weight:800;color:var(--primary);background:#eef2ff;padding:8px 14px;border-radius:12px;font-size:15px;flex-shrink:0">${s.words.length}词 ›</div>
        </div>`;
      });
    }
    document.getElementById('app').innerHTML = html;
  });
}

/* ==================== TARGET SELECTION ==================== */
function buildTargetData(bank, sets) {
  const today = localDateKey();
  const statsByWord = new Map(bank.map(w => [normalizeWordKey(w.word), w]));
  const catalog = new Map();

  [...sets].sort((a, b) => a.id.localeCompare(b.id)).forEach(s => {
    (s.words || []).forEach(rawWord => {
      const key = normalizeWordKey(rawWord);
      const clean = displayWord(rawWord);
      const existing = catalog.get(key);
      if (existing) {
        if (!existing.setIds.includes(s.id)) existing.setIds.push(s.id);
        existing.clean = clean;
        existing.rawWord = rawWord;
      } else {
        catalog.set(key, { key, clean, rawWord, setIds: [s.id] });
      }
    });
  });

  bank.forEach(w => {
    const key = normalizeWordKey(w.word);
    if (!catalog.has(key)) catalog.set(key, { key, clean: w.word, rawWord: w.word, setIds: [] });
  });

  const toEntry = (w, reason = '') => {
    const source = catalog.get(normalizeWordKey(w.word)) || { clean: w.word, rawWord: w.word, setIds: [] };
    return { ...source, stats: w, reason };
  };
  const isToday = timestamp => Boolean(timestamp) && localDateKey(new Date(timestamp)) === today;
  const byWrongPriority = (a, b) => {
    const countDiff = (b.wrongCount || 0) - (a.wrongCount || 0);
    if (countDiff) return countDiff;
    return new Date(b.lastWrongAt || 0) - new Date(a.lastWrongAt || 0);
  };
  const hasAdvancedToday = w => w.lastMasteryDate === today;
  const canAdvanceToday = w => !hasAdvancedToday(w) && (w.needsConsolidation || !w.nextReviewDate || w.nextReviewDate <= today);

  const activeBank = bank.filter(w =>
    (w.correctCount || 0) > 0 || (w.wrongCount || 0) > 0 || (w.skipCount || 0) > 0 || w.lastPracticeAt
  );
  const todayWrong = activeBank
    .filter(w => isToday(w.lastWrongAt))
    .sort((a, b) => new Date(b.lastWrongAt) - new Date(a.lastWrongAt))
    .map(w => toEntry(w, '今天拼错'));

  const unresolved = activeBank
    .filter(w => !hasAdvancedToday(w) && w.needsConsolidation && (w.masteryStep || 0) < 3)
    .sort((a, b) => new Date(b.lastWrongAt || 0) - new Date(a.lastWrongAt || 0));
  const unresolvedKeys = new Set(unresolved.map(w => w.word));
  const independentTest = activeBank
    .filter(w => !hasAdvancedToday(w) && !w.needsConsolidation && w.needsIndependentTest && (w.masteryStep || 0) === 0)
    .sort((a, b) => new Date(b.lastPracticeAt || 0) - new Date(a.lastPracticeAt || 0));
  const due = activeBank
    .filter(w => !hasAdvancedToday(w) && !unresolvedKeys.has(w.word) && (w.masteryStep || 0) > 0 && (w.masteryStep || 0) < 3 && w.nextReviewDate && w.nextReviewDate <= today)
    .sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate));
  const highFrequency = activeBank
    .filter(w => (w.wrongCount || 0) > 0 && (w.masteryStep || 0) < 3 && canAdvanceToday(w))
    .sort(byWrongPriority);

  const consolidation = [];
  const consolidationKeys = new Set();
  unresolved.forEach(w => {
    consolidation.push(toEntry(w, '待重新巩固'));
    consolidationKeys.add(w.word);
  });
  independentTest.forEach(w => {
    consolidation.push(toEntry(w, '待听写检测'));
    consolidationKeys.add(w.word);
  });
  due.forEach(w => {
    const reason = (w.masteryStep || 0) === 1 ? '1天复习到期' : '3天复习到期';
    consolidation.push(toEntry(w, reason));
    consolidationKeys.add(w.word);
  });
  for (const w of highFrequency) {
    if (consolidation.length >= 10) break;
    if (consolidationKeys.has(w.word)) continue;
    consolidation.push(toEntry(w, '高频补充'));
    consolidationKeys.add(w.word);
  }

  const historical = highFrequency.slice(0, 10).map(w => toEntry(w, `累计错${w.wrongCount || 0}次`));
  const mastered = activeBank
    .filter(w => (w.masteryStep || 0) >= 3)
    .sort((a, b) => new Date(b.masteredAt || 0) - new Date(a.masteredAt || 0))
    .map(w => toEntry(w, '已掌握'));
  const allWords = [...catalog.values()]
    .sort((a, b) => a.clean.localeCompare(b.clean))
    .map(source => ({ ...source, stats: statsByWord.get(source.key) || null, reason: '' }));

  return { todayWrong, consolidation, historical, mastered, allWords };
}

function getTargetData() {
  const tx = db.transaction(['wrongBank', 'wordSets'], 'readonly');
  return Promise.all([getAll(tx.objectStore('wrongBank')), getAll(tx.objectStore('wordSets'))])
    .then(([bank, sets]) => buildTargetData(bank.map(w => normalizeWrongRecord(w, STATS_VERSION)), sets));
}

function renderTargetSelection(mode) {
  currentTargetGroupKey = null;
  document.getElementById('headerBtn').innerHTML = `<button class="btn btn-gray btn-sm" onclick="renderSetSelection('${mode}')">‹ 返回</button>`;
  getTargetData().then(data => {
    const title = mode === 'learn' ? '🎯 针对复习' : '🎯 针对练习';
    const groups = [];
    if (mode === 'practice') {
      groups.push({ key: 'todayWrong', icon: '✕', title: '今日错词', desc: '只包含今天实际拼错过的词，不添加其他内容', items: data.todayWrong });
    }
    groups.push(
      { key: 'consolidation', icon: '✓', title: '今日巩固', desc: '待纠正、待听写检测、到期复习和高频补充', items: data.consolidation },
      { key: 'historical', icon: '↻', title: '历史高频错词', desc: '只显示现在练了能推进的高频错词，最多10个', items: data.historical },
      { key: 'mastered', icon: '★', title: '已掌握', desc: '已在三个不同日期完成巩固', items: data.mastered },
      { key: 'allWords', icon: '≡', title: '全部词列表', desc: '查看全部词及新规则下的正确、错误次数', items: data.allWords }
    );

    const cards = groups.map(group => `<div class="card target-group-card" onclick="renderTargetGroup('${mode}','${group.key}')">
      <div class="target-group-icon">${group.icon}</div>
      <div style="min-width:0;flex:1">
        <div style="font-size:17px;font-weight:800;margin-bottom:3px">${group.title}</div>
        <div style="font-size:12px;color:var(--text-2);font-weight:600;line-height:1.4">${group.desc}</div>
      </div>
      <div class="target-group-count">${group.items.length}</div>
    </div>`).join('');

    document.getElementById('app').innerHTML = `
      <h3 style="margin:0 0 4px 0">${title}</h3>
      <div style="font-size:13px;color:var(--text-2);font-weight:600;margin-bottom:14px">选择本次需要处理的词组</div>
      ${cards}
    `;
  });
}

function targetStatusText(entry) {
  const w = entry.stats;
  if (!w || (!w.lastPracticeAt && !(w.correctCount || 0) && !(w.wrongCount || 0) && !(w.skipCount || 0))) return '进度 0/3';
  if ((w.masteryStep || 0) >= 3) return '已掌握 · 进度 3/3';
  if (w.needsConsolidation) return '进度 0/3';
  if (w.nextReviewDate) return `进度 ${w.masteryStep || 0}/3 · ${w.nextReviewDate}复习`;
  return `进度 ${w.masteryStep || 0}/3`;
}

function renderTargetGroup(mode, groupKey) {
  currentTargetGroupKey = groupKey;
  document.getElementById('headerBtn').innerHTML = `<button class="btn btn-gray btn-sm" onclick="renderTargetSelection('${mode}')">‹ 返回</button>`;
  getTargetData().then(data => {
    const labels = {
      todayWrong: '今日错词', consolidation: '今日巩固', historical: '历史高频错词',
      mastered: '已掌握', allWords: '全部词列表'
    };
    const items = data[groupKey] || [];
    targetSelectionWords = items.map(item => item.rawWord);
    const startFn = mode === 'learn' ? 'startTargetLearn()' : 'startTargetPractice()';

    const listHtml = items.map((entry, i) => {
      const w = entry.stats || {};
      const source = entry.setIds.length ? entry.setIds.join(' · ') : '不在当前词表中';
      const reason = entry.reason ? `${entry.reason} · ` : '';
      const checked = groupKey === 'allWords' || (groupKey === 'consolidation' && i >= 10) ? '' : 'checked';
      return `<label class="target-word-row">
        <input type="checkbox" id="tchk-${i}" ${checked} style="width:20px;height:20px;accent-color:var(--primary);cursor:pointer;flex-shrink:0">
        <div class="target-word-main">
          <div class="target-word-name">${entry.clean}</div>
          <div class="target-word-meta">${reason}${targetStatusText(entry)} · ${source}</div>
        </div>
        <div class="target-word-stats">
          <span class="stat-badge stat-correct">✓${w.correctCount || 0}</span>
          <span class="stat-badge stat-wrong">✗${w.wrongCount || 0}</span>
        </div>
      </label>`;
    }).join('');

    const emptyHtml = `<div style="text-align:center;padding:42px 20px;color:var(--text-2);font-weight:700">当前分组暂无单词</div>`;
    document.getElementById('app').innerHTML = `
      <h3 style="margin:0 0 4px 0">${labels[groupKey] || '针对练习'}</h3>
      <div style="display:flex;gap:8px;margin:12px 0">
        <button class="btn btn-gray btn-sm" onclick="toggleAllTarget(true)">全选</button>
        <button class="btn btn-gray btn-sm" onclick="toggleAllTarget(false)">全不选</button>
        <span style="margin-left:auto;font-size:12px;color:var(--text-2);font-weight:700;align-self:center">${items.length} 个词</span>
      </div>
      <div class="card" style="padding:0;margin-bottom:14px;overflow:hidden">${items.length ? listHtml : emptyHtml}</div>
      ${items.length ? `<button class="btn btn-primary" onclick="${startFn}">开始 ›</button>` : ''}
    `;
  });
}

function toggleAllTarget(checked) {
  document.querySelectorAll('[id^="tchk-"]').forEach(cb => cb.checked = checked);
}

function startTargetLearn() {
  const selected = targetSelectionWords.filter((_, i) => { const cb = document.getElementById(`tchk-${i}`); return cb && cb.checked; });
  if (!selected.length) return alert("请至少选择一个单词");
  currentSetDate = 'target';
  learnList = selected; learnIndex = 0;
  renderLearnUI();
}

function startTargetPractice() {
  const selected = targetSelectionWords.filter((_, i) => { const cb = document.getElementById(`tchk-${i}`); return cb && cb.checked; });
  if (!selected.length) return alert("请至少选择一个单词");
  currentSetDate = 'target';
  renderPracticeMode('target', selected);
}

