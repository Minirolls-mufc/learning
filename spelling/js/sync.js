/* ==================== CLOUD SYNC ==================== */
let cloudSyncQueue = Promise.resolve();

function syncToCloud(isSilent = false) {
  const task = cloudSyncQueue.then(() => performCloudSync(isSilent));
  cloudSyncQueue = task.catch(() => {});
  return task;
}

async function performCloudSync(isSilent = false) {
  let toast = null;
  if (isSilent) {
    toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:30px;right:20px;background:#333;color:#fff;padding:8px 14px;border-radius:20px;font-size:13px;font-weight:700;z-index:999;opacity:0.9';
    toast.textContent = '☁️ 同步中…';
    document.body.appendChild(toast);
  }

  try {
    const curriculum = await loadCurriculum();
    const tx = db.transaction(['wordSets', 'groups', 'wrongBank'], 'readonly');
    const [sets, groups, wrongs, achievement, syncMeta] = await Promise.all([
      getAllStrict(tx.objectStore('wordSets')),
      getAllStrict(tx.objectStore('groups')),
      getAllStrict(tx.objectStore('wrongBank')),
      getAchievementState(),
      getAppState('syncMeta')
    ]);
    await putAppState(achievement);

    const cloudData = buildCloudData(sets, groups, wrongs, achievement, syncMeta, curriculum);
    const payload = { updatedAt: cloudData.updatedAt, data: cloudData };
    const body = JSON.stringify(payload);
    const payloadBytes = new TextEncoder().encode(body).length;
    if (payloadBytes > CLOUD_MAX_BYTES) {
      const error = new Error('Cloud payload is too large');
      error.name = 'PayloadTooLargeError';
      throw error;
    }

    const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
      body
    });
    if (!res.ok) throw new Error('Cloud upload failed');

    await putAppState({
      key: 'syncMeta',
      dataVersion: DATA_VERSION,
      curriculumVersion: curriculum.curriculumVersion,
      revision: cloudData.revision,
      contentOverrides: cloudData.contentOverrides,
      lastPayloadBytes: payloadBytes,
      lastSyncedAt: cloudData.updatedAt
    });

    const nearLimit = payloadBytes >= CLOUD_WARNING_BYTES;
    const successText = nearLimit ? '✅ 已同步，空间接近上限' : '✅ 已同步';
    if (isSilent && toast) {
      toast.textContent = successText;
      toast.style.background = nearLimit ? '#b45309' : '#1a7f45';
      setTimeout(() => toast.remove(), 2500);
    } else {
      alert(nearLimit ? '✅ 云端同步成功，但数据空间接近上限' : '✅ 云端同步成功！');
    }
  } catch (err) {
    const message = err && err.name === 'LocalReadError'
      ? '本地数据读取失败，本次未上传'
      : err && err.name === 'PayloadTooLargeError'
        ? '云端数据超过安全上限，请先导出并整理'
        : '同步失败，请检查网络';
    if (!isSilent) alert(message);
    else if (toast) {
      toast.textContent = `❌ ${message}`;
      toast.style.background = '#c0392b';
      setTimeout(() => toast.remove(), 3000);
    }
  }
}

async function syncFromCloud() {
  if (!confirm('⚠️ 将从云端下载并【覆盖】当前所有数据。确定吗？')) return;
  try {
    const [content, curriculum] = await Promise.all([fetchCloudContent(), loadCurriculum()]);
    const state = decodeCloudData(content, curriculum);
    baseCurriculum = state.baseCurriculum;
    await replaceLocalState(state);
    alert('✅ 恢复成功！');
    replaceRoute('home');
  } catch (err) {
    alert('下载失败，请检查网络或刷新网站版本');
  }
}
