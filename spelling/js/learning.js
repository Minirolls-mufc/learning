/* ==================== LEARN MODULE ==================== */
function parseChunks(rawWord) {
  const clean = rawWord.replace(/\//g, '');
  if (rawWord.includes('/')) return rawWord.split('/').filter(c => c.length > 0);
  const chunks = clean.match(/[^aeiouy]*[aeiouy]+(?:[^aeiouy]*$|[^aeiouy](?=[^aeiouy]))?/gi);
  if (!chunks || chunks.length <= 1) return [clean];
  const last = chunks[chunks.length - 1];
  if (last === 'e' || last === 'es') chunks[chunks.length - 2] += chunks.pop();
  return chunks;
}

function startLearn(id) {
  const routeKey = currentRouteKey();
  const tx = db.transaction('wordSets', 'readonly');
  tx.objectStore('wordSets').get(id).onsuccess = (e) => {
    if (routeKey !== currentRouteKey()) return;
    const data = e.target.result;
    if (!data) return replaceRoute('learn');
    currentSetDate = id; learnList = data.words; learnIndex = 0;
    renderLearnUI();
  };
}

function exitLearn() {
  if (!confirm('退出学习？')) return;
  clearNavigationGuard();
  navigateTo('home', { replace: true, skipGuard: true });
}

function exitPracticeSession() {
  if (!confirm('退出练习？')) return;
  clearNavigationGuard();
  navigateTo('home', { replace: true, skipGuard: true });
}

function renderLearnUI() {
  setNavigationGuard('退出学习？');
  document.getElementById('headerBtn').innerHTML = `<button class="btn btn-gray btn-sm" onclick="exitLearn()">🏃 退出</button>`;
  document.getElementById('app').innerHTML = `<div id="learnContainer"></div>`;
  loadLearnWord();
}

function loadLearnWord() {
  if (learnIndex >= learnList.length) {
    clearNavigationGuard();
    document.getElementById('headerBtn').innerHTML = '';
    document.getElementById('app').innerHTML = `<div class="card" style="text-align:center;padding:50px 20px;margin-top:40px">
      <div style="font-size:70px;margin-bottom:12px">🎓</div>
      <h2 style="font-family:'Fredoka One',cursive;font-size:30px;margin-bottom:8px">学习完成！</h2>
      <p style="color:var(--text-2);font-size:16px;font-weight:600">所有单词都学过啦，可以去练习了！</p>
      <div style="height:20px"></div>
      <button class="btn btn-primary" onclick="navigateTo('home',{replace:true})">🏠 返回首页</button>
      <button class="btn btn-yellow" onclick="navigateTo('practice',{replace:true})">✏️ 开始练习</button>
    </div>`;
    return;
  }
  const rawWord = learnList[learnIndex];
  const cleanWord = rawWord.replace(/\//g, '');
  learnChunks = parseChunks(rawWord);
  learnRevealedCount = learnChunks.length;
  learnCovered = false; learnInStepMode = false;

  document.getElementById('learnContainer').innerHTML = `
    <div class="learn-progress">单词 ${learnIndex + 1} / ${learnList.length}</div>
    <div class="learn-word-card">
      <div class="phonics-display" id="learnPhonics"></div>
    </div>
    <div style="text-align:center;margin-bottom:16px">
      <button class="btn btn-outline" style="display:inline-flex;width:auto;padding:12px 28px;border-radius:30px;font-size:16px"
        ontouchstart="event.preventDefault();speak('${cleanWord}')" onclick="speak('${cleanWord}')">
        🔊 <span style="font-weight:800">听发音</span>
      </button>
    </div>
    <div id="learnStepHint" class="learn-step-hint">👂 先听发音，记住整个单词</div>
    <div class="learn-controls" id="learnControls"></div>
  `;
  renderLearnPhonics(learnChunks.length);
  renderLearnInitControls();
  setTimeout(() => speak(cleanWord), 350);
}

function renderLearnInitControls() {
  learnInStepMode = false;
  document.getElementById('learnControls').innerHTML = `
    <div class="btn-row" style="margin-top:4px">
      <button class="btn btn-yellow" style="flex:1;margin-bottom:0" id="toggleBtn" onclick="learnToggle()">🙈 隐藏</button>
      <button class="btn btn-green" style="flex:1;margin-bottom:0" onclick="learnStartStep()">👁 逐步展示</button>
    </div>
    <div class="btn-row" style="margin-top:10px">
      ${learnIndex > 0 ? `<button class="btn btn-outline" style="flex:1;margin-bottom:0" onclick="learnIndex--;loadLearnWord()">‹ 上一词</button>` : '<div style="flex:1"></div>'}
      <button class="btn btn-primary" style="flex:2;margin-bottom:0" onclick="learnIndex++;loadLearnWord()">下一词 ›</button>
    </div>
  `;
}

function learnToggle() {
  learnCovered = !learnCovered;
  if (learnCovered) {
    renderLearnPhonics(0);
    document.getElementById('learnStepHint').textContent = '词已隐藏，凭记忆说出来';
    const btn = document.getElementById('toggleBtn');
    btn.textContent = '👁 展示'; btn.className = 'btn btn-outline'; btn.style.cssText = 'flex:1;margin-bottom:0';
  } else {
    learnInStepMode = false;
    renderLearnPhonics(learnChunks.length);
    document.getElementById('learnStepHint').textContent = '👂 先听发音，记住整个单词';
    const btn = document.getElementById('toggleBtn');
    btn.textContent = '🙈 隐藏'; btn.className = 'btn btn-yellow'; btn.style.cssText = 'flex:1;margin-bottom:0';
  }
}

function learnStartStep() {
  learnInStepMode = true; learnCovered = true; learnRevealedCount = 0;
  renderLearnPhonics(0);
  document.getElementById('learnStepHint').textContent = '点击"+1展示"逐步揭示每个部分';
  renderLearnStepControls();
}

function renderLearnStepControls() {
  const allDone = learnRevealedCount >= learnChunks.length;
  const leftBtn = (allDone && !learnCovered)
    ? `<button class="btn btn-yellow" style="flex:1;margin-bottom:0" onclick="learnStepHide()">🙈 隐藏</button>`
    : `<button class="btn btn-outline" style="flex:1;margin-bottom:0" onclick="learnStepShowAll()">👁 展示</button>`;
  const rightBtn = !allDone
    ? `<button class="btn btn-green" style="flex:1;margin-bottom:0" onclick="learnRevealNext()">+1 展示 (${learnRevealedCount}/${learnChunks.length})</button>`
    : `<span style="flex:1;text-align:center;font-size:13px;font-weight:700;color:var(--green);padding:10px 0">✅ 展示完毕</span>`;
  document.getElementById('learnControls').innerHTML = `
    <div class="btn-row" style="margin-top:4px">${leftBtn}${rightBtn}</div>
    <div class="btn-row" style="margin-top:10px">
      ${learnIndex > 0 ? `<button class="btn btn-outline" style="flex:1;margin-bottom:0" onclick="learnIndex--;loadLearnWord()">‹ 上一词</button>` : '<div style="flex:1"></div>'}
      <button class="btn btn-primary" style="flex:2;margin-bottom:0" onclick="learnIndex++;loadLearnWord()">下一词 ›</button>
    </div>
  `;
}

function learnStepShowAll() {
  learnInStepMode = false; learnCovered = false; learnRevealedCount = learnChunks.length;
  renderLearnPhonics(learnChunks.length);
  document.getElementById('learnStepHint').textContent = '👂 先听发音，记住整个单词';
  renderLearnInitControls();
}

function learnStepHide() {
  learnCovered = true; learnRevealedCount = 0;
  renderLearnPhonics(0);
  document.getElementById('learnStepHint').textContent = '点击"+1展示"逐步揭示每个部分';
  renderLearnStepControls();
}

function renderLearnPhonics(visibleCount) {
  const container = document.getElementById('learnPhonics');
  if (!container) return;
  container.innerHTML = '';
  learnChunks.forEach((chunk, i) => {
    const span = document.createElement('span');
    span.className = `phonics-chunk color-${i % 2}`;
    span.textContent = chunk;
    if (i >= visibleCount) span.classList.add('hidden-chunk');
    container.appendChild(span);
  });
}

function learnRevealNext() {
  if (learnRevealedCount < learnChunks.length) {
    learnRevealedCount++;
    renderLearnPhonics(learnRevealedCount);
  }
  if (learnRevealedCount >= learnChunks.length) {
    learnCovered = false;
    document.getElementById('learnStepHint').textContent = '✅ 全部展示，可以隐藏再试试';
  }
  renderLearnStepControls();
}
