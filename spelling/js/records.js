/* ==================== RECORDS ==================== */
async function renderRecords() {
  document.getElementById('headerBtn').innerHTML = `<button class="btn btn-gray btn-sm" onclick="renderHome()">🏠 首页</button>`;
  try {
    const achievement = await getAchievementState();
    const logs = achievement.recentDailyLogs;
    const totalStars = achievement.totalCorrect;
    const allWords = new Set(achievement.wordWall);
    const rockets = Math.floor(totalStars / 10);
    const currentStars = totalStars % 10;
    let rockHtml = ''; for (let i = 0; i < rockets; i++) rockHtml += '🚀 ';
    let starHtml = ''; for (let i = 0; i < 10; i++) starHtml += i < currentStars ? '⭐ ' : '<span style="opacity:0.2">⭐</span> ';

    let histHtml = !logs.length ? '<div style="text-align:center;padding:24px;color:#999;font-weight:600">暂无记录</div>' : '';
    logs.forEach((log, idx) => {
      const wordsHtml = (log.words || []).map(w => `<span class="detail-tag">${w}</span>`).join('');
      histHtml += `<div class="history-item">
        <div class="history-header" onclick="toggleHistory(${idx})">
          <div><div style="font-weight:800">${log.date}</div><div style="font-size:13px;color:var(--text-2);font-weight:600">拼对 ${log.count} 个单词 <span style="font-size:10px">▼</span></div></div>
          <div style="font-weight:800;color:#f59e0b;font-size:18px">⭐ +${log.count}</div>
        </div>
        <div class="history-details" id="hist-detail-${idx}">${wordsHtml || '<span style="font-size:12px;color:#ccc">无详细记录</span>'}</div>
      </div>`;
    });
    const monthlyHtml = Object.entries(achievement.monthlyTotals)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, count]) => `<div class="history-item"><div class="history-header">
        <div><div style="font-weight:800">${month}</div><div style="font-size:13px;color:var(--text-2);font-weight:600">历史月度汇总</div></div>
        <div style="font-weight:800;color:#f59e0b;font-size:18px">⭐ +${count}</div>
      </div></div>`).join('');
    const wallHtml = Array.from(allWords).sort().map(w => `<div class="wall-item">${w}</div>`).join('');

    document.getElementById('app').innerHTML = `
      <div class="score-header">
        <div style="font-size:13px;font-weight:700;opacity:0.8;letter-spacing:1px">TOTAL SCORE</div>
        <div class="big-score">${totalStars}</div>
        <div style="background:rgba(255,255,255,0.12);border-radius:14px;padding:14px;margin-top:12px">
          <div style="font-size:12px;margin-bottom:6px;opacity:0.7">火箭收藏 (${rockets})</div>
          <div class="icons-grid" style="font-size:18px">${rockHtml || '<span style="font-size:14px;opacity:0.6">加油攒火箭！</span>'}</div>
        </div>
        <div style="background:rgba(255,255,255,0.12);border-radius:14px;padding:14px;margin-top:10px">
          <div style="font-size:12px;margin-bottom:6px;opacity:0.7">进度 (${currentStars}/10)</div>
          <div class="icons-grid">${starHtml}</div>
        </div>
      </div>
      <div class="card"><h3 style="margin:0 0 10px 0">单词墙 (${allWords.size})</h3><div class="word-wall">${wallHtml || '<span style="color:#999;font-size:13px;font-weight:600">还没有拼对单词哦</span>'}</div></div>
      <h3 style="margin-left:6px">练习足迹</h3>${histHtml}${monthlyHtml}
    `;
  } catch (err) {
    document.getElementById('app').innerHTML = '<div class="card" style="text-align:center;color:#c0392b;font-weight:700">练习记录读取失败</div>';
  }
}

function toggleHistory(idx) {
  const el = document.getElementById(`hist-detail-${idx}`);
  if (el) el.classList.toggle('show');
}

/* ==================== UTILS ==================== */
function esc(str) { return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

function shuffleArr(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function speak(text) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-GB'; u.rate = 0.85;
  const all = speechSynthesis.getVoices();
  const pref =
    all.find(v => v.name === 'Daniel' && v.lang.startsWith('en-GB')) ||
    all.find(v => v.lang.startsWith('en-GB')) ||
    all.find(v => v.lang.startsWith('en'));
  if (pref) u.voice = pref;
  speechSynthesis.speak(u);
}
speechSynthesis.onvoiceschanged = () => {};

function playSuccessTone() {
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(523, audioCtx.currentTime);
    osc.frequency.setValueAtTime(659, audioCtx.currentTime + 0.12);
    osc.frequency.setValueAtTime(784, audioCtx.currentTime + 0.24);
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.55);
    osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.55);
  } catch (e) {}
}

async function exportAllData() {
  try {
    const tx = db.transaction(['wordSets', 'groups', 'wrongBank'], 'readonly');
    const [sets, groups, wrongs, achievement, curriculum] = await Promise.all([
      getAllStrict(tx.objectStore('wordSets')), getAllStrict(tx.objectStore('groups')),
      getAllStrict(tx.objectStore('wrongBank')), getAchievementState(), loadCurriculum()
    ]);
    const data = {
      dataVersion: DATA_VERSION,
      curriculumVersion: curriculum.curriculumVersion,
      wordSets: sets,
      groups,
      wrongBank: wrongs.map(w => normalizeWrongRecord(w, STATS_VERSION)),
      achievement: achievementForCloud(achievement),
      contentOverrides: buildContentOverrides(sets, groups, curriculum),
      exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `romeo_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  } catch (err) {
    alert('本地数据读取失败，未生成备份文件');
  }
}

function importData(inputEl) {
  const file = inputEl.files[0]; if (!file) return;
  if (!confirm("⚠️ 覆盖现有数据？")) { inputEl.value = ''; return; }
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      const data = parsed && parsed.record && parsed.record.data ? parsed.record.data : parsed;
      const curriculum = await loadCurriculum();
      let state;
      if (Number(data.dataVersion) >= DATA_VERSION && data.wordStats && !data.wordSets) {
        state = decodeCloudData(data, curriculum);
      } else {
        if (!Array.isArray(data.wordSets)) throw new Error('Missing word sets');
        const wordSets = data.wordSets.map(s => ({ id: String(s.id || s.date), words: [...(s.words || [])] }));
        const groups = (data.groups || []).map(g => ({ id: Number(g.id), name: String(g.name || ''), setIds: [...(g.setIds || [])] }));
        const wrongBank = data.wordStats
          ? expandWordStats(data.wordStats)
          : (data.wrongBank || []).map(w => normalizeWrongRecord(w, data.statsVersion));
        const achievement = data.achievement
          ? normalizeAchievement(data.achievement)
          : buildAchievementFromLogs(data.practiceLogs || []);
        state = {
          baseCurriculum: curriculum,
          wordSets, groups, wrongBank, achievement,
          syncMeta: {
            key: 'syncMeta', dataVersion: DATA_VERSION,
            curriculumVersion: curriculum.curriculumVersion,
            revision: Number(data.revision) || 0,
            contentOverrides: buildContentOverrides(wordSets, groups, curriculum)
          }
        };
      }
      baseCurriculum = curriculum;
      await replaceLocalState(state);
      alert('导入成功！');
      renderHome();
      inputEl.value = '';
      await syncToCloud(true);
    } catch (err) { alert("文件格式错误"); inputEl.value = ''; }
  };
  reader.readAsText(file);
}
