/* ==================== WORD MANAGER ==================== */
function managerFormState(activeTab) {
  if (activeTab === 'groups') {
    return JSON.stringify({
      name: document.getElementById('newGroupName')?.value || '',
      editingId: document.getElementById('editingGroupId')?.value || '',
      setIds: [...document.querySelectorAll('[id^="gset-"]:checked')].map(cb => cb.dataset.setid).sort()
    });
  }
  return JSON.stringify({
    id: document.getElementById('newSetId')?.value || '',
    words: document.getElementById('newWords')?.value || '',
    groupId: document.getElementById('setGroupSelect')?.value || ''
  });
}

function installManagerFormGuard(activeTab) {
  const baseline = managerFormState(activeTab);
  setNavigationGuard('当前修改还没有保存，确定离开吗？', () => managerFormState(activeTab) !== baseline);
}

function openSetEditor(id) {
  if (!confirmRouteLeave()) return;
  clearNavigationGuard();
  editSet(id);
}

function openGroupEditor(id) {
  if (!confirmRouteLeave()) return;
  clearNavigationGuard();
  editGroup(id);
}

function renderWordManager(activeTab, activeSetGroup) {
  const routeKey = currentRouteKey();
  document.getElementById('headerBtn').innerHTML = `<button class="btn btn-gray btn-sm" onclick="navigateRoute('home')">🏠 首页</button>`;
  activeTab = activeTab || 'sets';
  activeSetGroup = activeSetGroup || 'all';
  const tx = db.transaction(['wordSets', 'groups'], 'readonly');
  Promise.all([getAll(tx.objectStore('wordSets')), getAll(tx.objectStore('groups'))]).then(([sets, groups]) => {
    if (routeKey !== currentRouteKey()) return;
    sets.sort((a, b) => a.id.localeCompare(b.id));
    groups.sort((a, b) => a.name.localeCompare(b.name));

    const tabsHtml = `
      <div class="tab-bar" style="margin-bottom:18px">
        <button class="tab-btn ${activeTab === 'sets' ? 'active' : ''}" onclick="navigateRoute('manager','sets')">📝 词组管理</button>
        <button class="tab-btn ${activeTab === 'groups' ? 'active' : ''}" onclick="navigateRoute('manager','groups')">🗂 分组管理</button>
      </div>
    `;

    if (activeTab === 'sets') {
      renderSetsTab(sets, groups, tabsHtml, activeSetGroup);
    } else {
      renderGroupsTab(sets, groups, tabsHtml);
    }
  });
}

function renderSetsTab(sets, groups, tabsHtml, activeSetGroup) {
  // Build group lookup: setId → group name
  const setGroupMap = {};
  groups.forEach(g => (g.setIds || []).forEach(sid => setGroupMap[sid] = g.name));

  const filterTabs = [{ key: 'all', label: '所有词组', count: sets.length }];
  groups.forEach(g => {
    filterTabs.push({ key: `group:${g.id}`, label: g.name, count: (g.setIds || []).length });
  });

  let visibleSets = sets;
  if (activeSetGroup && activeSetGroup.startsWith('group:')) {
    const gid = activeSetGroup.slice(6);
    const group = groups.find(g => String(g.id) === String(gid));
    if (!group) return replaceRoute('manager', 'sets');
    const ids = new Set(group ? (group.setIds || []) : []);
    visibleSets = sets.filter(s => ids.has(s.id));
  }

  const groupTabsHtml = `
    <div class="tab-bar" style="margin:0 0 14px 0">
      ${filterTabs.map(t => `
        <button class="tab-btn ${activeSetGroup === t.key ? 'active' : ''}" onclick="${t.key === 'all' ? "navigateRoute('manager','sets')" : `navigateRoute('manager','sets','group','${esc(t.key.slice(6))}')`}">
          ${t.label} <span style="opacity:.55">${t.count}</span>
        </button>
      `).join('')}
    </div>
  `;

  const listHtml = visibleSets.length ? visibleSets.map(s => {
    const preview = s.words.map(w => w.replace(/\//g, '')).slice(0, 6).join('　');
    const grpName = setGroupMap[s.id];
    return `
    <div class="manage-item" onclick="openSetEditor('${esc(s.id)}')">
      <div style="flex:1;min-width:0">
        <div style="font-weight:800;color:#333;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${s.id}
          <span style="font-size:11px;font-weight:700;color:#fff;background:var(--primary);padding:2px 8px;border-radius:20px">${s.words.length}词</span>
          ${grpName ? `<span style="font-size:11px;font-weight:700;color:#7c3aed;background:#f0e8ff;padding:2px 8px;border-radius:20px">📁 ${grpName}</span>` : ''}
        </div>
        <div style="font-size:13px;color:#aaa;margin-top:3px;font-family:'Nunito',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${preview}${s.words.length > 6 ? ' …' : ''}</div>
      </div>
      <div style="color:var(--primary);font-size:14px;font-weight:700;flex-shrink:0;margin-left:10px">编辑 ›</div>
    </div>`;
  }).join('') : '<div style="padding:20px;color:#999;text-align:center;font-weight:600">该分组暂无词组</div>';

  // Group options for dropdown
  const groupOptions = groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');

  document.getElementById('app').innerHTML = `
    ${tabsHtml}
    <div class="card" id="managerCard">
      <h3 style="margin-top:0" id="mgrTitle">新建词组</h3>
      <div style="font-size:12px;color:var(--text-2);font-weight:700;margin-bottom:4px">词组名称（唯一 ID）</div>
      <input type="text" id="newSetId" placeholder="例如：2025-06-01 或 Year 2 first part"
        style="width:100%;padding:13px 14px;border:2px solid #e0e0e0;border-radius:12px;margin:4px 0 14px;font-size:16px;font-family:'Nunito',sans-serif;font-weight:600;box-sizing:border-box;user-select:auto"
        autocomplete="off" autocorrect="off" autocapitalize="off">
      <div style="font-size:12px;color:var(--text-2);font-weight:700;margin-bottom:4px">所属分组（可选）</div>
      <select id="setGroupSelect" style="width:100%;padding:13px 14px;border:2px solid #e0e0e0;border-radius:12px;margin:4px 0 14px;font-size:16px;font-family:'Nunito',sans-serif;font-weight:600;background:#fff;box-sizing:border-box">
        <option value="">— 不加入分组 —</option>
        ${groupOptions}
      </select>
      <div style="font-size:12px;color:var(--text-2);font-weight:700;margin-bottom:4px">单词列表（每行一个，可用 / 标注音节）</div>
      <textarea id="newWords" rows="7" placeholder="例如：&#10;apple&#10;ba/na/na&#10;hap/py"></textarea>
      <div style="margin-top:18px;display:flex;gap:10px">
        <button class="btn btn-primary" style="flex:2" onclick="saveSet()">💾 保存 / 更新</button>
        <button class="btn btn-red" id="delBtn" style="flex:1;display:none" onclick="deleteSet()">🗑️ 删除</button>
      </div>
      <button id="cancelBtn" style="display:none;margin-top:10px;width:100%;padding:10px;background:#f1f3f7;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer" onclick="navigateTo(currentRouteKey())">取消编辑</button>
    </div>
    <h4 style="margin:0 0 10px 6px;color:var(--text-2)">所有词组</h4>
    ${groupTabsHtml}
    <div class="card" style="padding:0">${listHtml}</div>
  `;
  installManagerFormGuard('sets');
}

function renderGroupsTab(sets, groups, tabsHtml) {
  const listHtml = groups.length ? groups.map(g => {
    const setCount = (g.setIds || []).length;
    const setNames = (g.setIds || []).slice(0, 3).join('、');
    return `
    <div class="manage-item" onclick="openGroupEditor(${g.id})">
      <div style="flex:1;min-width:0">
        <div style="font-weight:800;color:#333;display:flex;align-items:center;gap:8px">
          📁 ${g.name}
          <span style="font-size:11px;font-weight:700;color:#fff;background:#7c3aed;padding:2px 8px;border-radius:20px">${setCount}个词组</span>
        </div>
        ${setCount > 0 ? `<div style="font-size:12px;color:#aaa;margin-top:3px">${setNames}${setCount > 3 ? '…' : ''}</div>` : ''}
      </div>
      <div style="color:#7c3aed;font-size:14px;font-weight:700;flex-shrink:0;margin-left:10px">编辑 ›</div>
    </div>`;
  }).join('') : '<div style="padding:20px;color:#999;text-align:center;font-weight:600">暂无分组</div>';

  // Set checkboxes for group editing
  const setCheckboxes = sets.map((s, i) => `
    <label style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid #f5f5f5;cursor:pointer">
      <input type="checkbox" id="gset-${i}" data-setid="${esc(s.id)}" style="width:18px;height:18px;accent-color:#7c3aed;cursor:pointer">
      <span style="font-weight:700;font-size:15px">${s.id}</span>
      <span style="font-size:12px;color:#bbb;margin-left:auto">${s.words.length}词</span>
    </label>`).join('');

  document.getElementById('app').innerHTML = `
    ${tabsHtml}
    <div class="card">
      <h3 style="margin-top:0" id="grpTitle">新建分组</h3>
      <div style="font-size:12px;color:var(--text-2);font-weight:700;margin-bottom:4px">分组名称</div>
      <input type="text" id="newGroupName" placeholder="例如：Year 2、期末复习"
        style="width:100%;padding:13px 14px;border:2px solid #e0e0e0;border-radius:12px;margin:4px 0 14px;font-size:16px;font-family:'Nunito',sans-serif;font-weight:600;box-sizing:border-box;user-select:auto"
        autocomplete="off" autocorrect="off" autocapitalize="off">
      <input type="hidden" id="editingGroupId" value="">
      <div style="font-size:12px;color:var(--text-2);font-weight:700;margin-bottom:8px">包含词组（可多选）</div>
      <div class="card" style="padding:4px 0;margin-bottom:14px;max-height:220px;overflow-y:auto">${setCheckboxes}</div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" style="flex:2;background:#7c3aed;box-shadow:0 5px 0 #5b21b6" onclick="saveGroup()">💾 保存分组</button>
        <button class="btn btn-red" id="delGrpBtn" style="flex:1;display:none" onclick="deleteGroup()">🗑️ 删除</button>
      </div>
      <button id="cancelGrpBtn" style="display:none;margin-top:10px;width:100%;padding:10px;background:#f1f3f7;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer" onclick="navigateTo(currentRouteKey())">取消编辑</button>
    </div>
    <h4 style="margin-left:6px;color:var(--text-2)">所有分组</h4>
    <div class="card" style="padding:0">${listHtml}</div>
  `;
  installManagerFormGuard('groups');
}

function editSet(id) {
  // Need to also load groups to find which group this set belongs to
  const tx = db.transaction(['wordSets', 'groups'], 'readonly');
  Promise.all([
    new Promise(r => { const req = tx.objectStore('wordSets').get(id); req.onsuccess = () => r(req.result); }),
    getAll(tx.objectStore('groups'))
  ]).then(([data, groups]) => {
    if (!data) return;
    document.getElementById('mgrTitle').innerText = "编辑：" + id;
    const idInput = document.getElementById('newSetId');
    idInput.value = data.id; idInput.disabled = true; idInput.style.background = '#f8faff';
    document.getElementById('newWords').value = data.words.join('\n');
    document.getElementById('delBtn').style.display = 'block';
    document.getElementById('cancelBtn').style.display = 'block';
    // Set group dropdown
    const grpSelect = document.getElementById('setGroupSelect');
    if (grpSelect) {
      const ownerGroup = groups.find(g => (g.setIds || []).includes(id));
      grpSelect.value = ownerGroup ? ownerGroup.id : '';
    }
    installManagerFormGuard('sets');
    document.getElementById('app').scrollTop = 0;
  });
}

function saveSet() {
  const id = document.getElementById('newSetId').value.trim();
  const text = document.getElementById('newWords').value;
  const groupId = document.getElementById('setGroupSelect').value;
  if (!id) return alert("请填写词组名称");
  if (!text.trim()) return alert("请输入单词");
  const words = text.split(/\n+/).map(w => w.trim()).filter(w => w);

  // First read all groups, then do one write transaction
  const readTx = db.transaction(['wordSets', 'groups'], 'readonly');
  getAll(readTx.objectStore('groups')).then(groups => {
    const writeTx = db.transaction(['wordSets', 'groups'], 'readwrite');
    writeTx.objectStore('wordSets').put({ id, words });
    const grpStore = writeTx.objectStore('groups');
    groups.forEach(g => {
      const newSetIds = (g.setIds || []).filter(sid => sid !== id);
      if (groupId && String(g.id) === String(groupId)) newSetIds.push(id);
      grpStore.put({ ...g, setIds: newSetIds });
    });
    writeTx.oncomplete = () => { renderCurrentRoute(); syncToCloud(true); };
  });
}

function deleteSet() {
  const id = document.getElementById('newSetId').value.trim();
  if (!confirm(`确认删除「${id}」？`)) return;
  const readTx = db.transaction('groups', 'readonly');
  getAll(readTx.objectStore('groups')).then(groups => {
    const writeTx = db.transaction(['wordSets', 'groups'], 'readwrite');
    writeTx.objectStore('wordSets').delete(id);
    const grpStore = writeTx.objectStore('groups');
    groups.forEach(g => {
      const newSetIds = (g.setIds || []).filter(sid => sid !== id);
      grpStore.put({ ...g, setIds: newSetIds });
    });
    writeTx.oncomplete = () => { renderCurrentRoute(); syncToCloud(true); };
  });
}

function editGroup(gid) {
  const tx = db.transaction('groups', 'readonly');
  tx.objectStore('groups').get(gid).onsuccess = (e) => {
    const g = e.target.result; if (!g) return;
    document.getElementById('grpTitle').innerText = "编辑分组：" + g.name;
    document.getElementById('newGroupName').value = g.name;
    document.getElementById('editingGroupId').value = gid;
    document.getElementById('delGrpBtn').style.display = 'block';
    document.getElementById('cancelGrpBtn').style.display = 'block';
    // Check boxes
    document.querySelectorAll('[id^="gset-"]').forEach(cb => {
      cb.checked = (g.setIds || []).includes(cb.dataset.setid);
    });
    installManagerFormGuard('groups');
    document.getElementById('app').scrollTop = 0;
  };
}

function saveGroup() {
  const name = document.getElementById('newGroupName').value.trim();
  const editingId = document.getElementById('editingGroupId').value;
  if (!name) return alert("请填写分组名称");
  const setIds = [];
  document.querySelectorAll('[id^="gset-"]').forEach(cb => { if (cb.checked) setIds.push(cb.dataset.setid); });

  const tx = db.transaction('groups', 'readwrite');
  const rec = editingId ? { id: parseInt(editingId), name, setIds } : { name, setIds };
  tx.objectStore('groups').put(rec);
  tx.oncomplete = () => { renderCurrentRoute(); syncToCloud(true); };
}

function deleteGroup() {
  const editingId = document.getElementById('editingGroupId').value;
  if (!editingId || !confirm("确认删除此分组？（词组不会被删除）")) return;
  const tx = db.transaction('groups', 'readwrite');
  tx.objectStore('groups').delete(parseInt(editingId));
  tx.oncomplete = () => { renderCurrentRoute(); syncToCloud(true); };
}
