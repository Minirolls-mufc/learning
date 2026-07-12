/* ==================== PRACTICE MODE SELECTION ==================== */
function renderPracticeMode(setId, preloadedWords) {
  currentSetDate = setId;
  pendingPracticeWords = preloadedWords ? [...preloadedWords] : null;
  const backFn = preloadedWords && currentTargetGroupKey
    ? `renderTargetGroup('practice','${currentTargetGroupKey}')`
    : `navigateBack('practice')`;
  document.getElementById('headerBtn').innerHTML = `<button class="btn btn-gray btn-sm" onclick="${backFn}">‹ 返回</button>`;
  document.getElementById('app').innerHTML = `
    <h3 style="margin:0 0 18px 0">选择练习方式</h3>
    <button class="practice-mode-btn easy" id="modeEasyBtn" onclick="startPracticeFromBtn('easy')">
      <div class="pmb-title">🎮 简单模式 — 字母拼图</div>
      <div class="pmb-desc">打乱字母展示成磁贴，按顺序点击拼出单词</div>
    </button>
    <button class="practice-mode-btn normal" id="modeNormalBtn" onclick="startPracticeFromBtn('normal')">
      <div class="pmb-title">✍️ 普通模式 — 听写输入</div>
      <div class="pmb-desc">听到发音，用键盘逐一输入字母</div>
    </button>
  `;
}

function startPracticeFromBtn(mode) {
  if (pendingPracticeWords) {
    practiceList = [...pendingPracticeWords];
    currentIndex = 0; sessionMasteredSet = new Set(); sessionEasyCompletedSet = new Set(); sessionWrongSet = new Set(); pendingStatWrites = [];
    renderPracticeUI(mode);
  } else {
    startPractice(currentSetDate, mode);
  }
}

/* ==================== PRACTICE CORE ==================== */
function startPractice(setId, mode) {
  const tx = db.transaction('wordSets', 'readonly');
  tx.objectStore('wordSets').get(setId).onsuccess = (e) => {
    const data = e.target.result;
    if (!data) return replaceRoute('practice');
    practiceList = data.words; currentIndex = 0; sessionMasteredSet = new Set(); sessionEasyCompletedSet = new Set(); sessionWrongSet = new Set(); pendingStatWrites = [];
    renderPracticeUI(mode);
  };
}

function renderPracticeUI(mode) {
  currentPracticeMode = mode;
  setNavigationGuard('退出练习？');
  document.getElementById('headerBtn').innerHTML = `<button class="btn btn-gray btn-sm" onclick="exitPracticeSession()">🏃 退出</button>`;
  const modeLabel = mode === 'easy' ? '🎮 简单模式' : '✍️ 普通模式';
  document.getElementById('app').innerHTML = `
    <div style="text-align:center;margin-bottom:14px;color:var(--text-2);font-weight:700;font-size:13px" id="practiceProgress">
      ${modeLabel} • <span style="color:var(--primary)">${currentIndex + 1} / ${practiceList.length}</span>
    </div>
    <div class="card" id="practiceCard" style="min-height:320px"></div>
  `;
  loadPracticeWord(mode);
}

function loadPracticeWord(mode) {
  if (currentIndex >= practiceList.length) { finishPractice(); return; }
  isProcessing = false;
  currentWordHadWrong = false;
  const rawWord = practiceList[currentIndex];
  const cleanWord = rawWord.replace(/\//g, '');
  const prog = document.getElementById('practiceProgress');
  const modeLabel = mode === 'easy' ? '🎮 简单模式' : '✍️ 普通模式';
  if (prog) prog.innerHTML = `${modeLabel} • <span style="color:var(--primary)">${currentIndex + 1} / ${practiceList.length}</span>`;
  if (mode === 'easy') loadEasyWord(cleanWord, rawWord);
  else loadNormalWord(cleanWord, rawWord, mode);
}

/* ---------- EASY MODE ---------- */
function loadEasyWord(cleanWord) {
  easyAnswerArr = new Array(cleanWord.length).fill('');
  easyTileOrder = shuffleArr([...Array(cleanWord.length).keys()]);
  document.getElementById('practiceCard').innerHTML = `
    <div style="text-align:center;margin-bottom:16px">
      <button class="btn btn-outline" style="display:inline-flex;width:auto;padding:10px 22px;border-radius:30px"
        ontouchstart="event.preventDefault();speak('${cleanWord}')" onclick="speak('${cleanWord}')">
        🔊 <span style="font-weight:800">听发音</span>
      </button>
    </div>
    <div class="slots-container" id="answerSlots"></div>
    <div class="feedback-text" id="feedback"></div>
    <div style="font-size:12px;color:var(--text-2);font-weight:700;text-align:center;margin-bottom:12px">点击字母磁贴，按顺序拼出单词</div>
    <div class="tiles-container" id="letterTiles"></div>
    <button class="btn btn-gray" style="margin-top:12px;font-size:14px" ontouchstart="event.preventDefault();skipEasy()" onclick="skipEasy()">跳过 ›</button>
  `;
  // Render slots
  const slotsEl = document.getElementById('answerSlots');
  for (let i = 0; i < cleanWord.length; i++) {
    const slot = document.createElement('div');
    slot.className = 'answer-slot'; slot.id = `slot-${i}`;
    slotsEl.appendChild(slot);
  }
  // Render tiles
  const tilesEl = document.getElementById('letterTiles');
  easyTileOrder.forEach(origIdx => {
    const tile = document.createElement('button');
    tile.className = 'letter-tile pop-in';
    tile.textContent = cleanWord[origIdx].toLowerCase();
    tile.dataset.origIdx = origIdx; tile.id = `tile-${origIdx}`;
    tile.onclick = () => handleTileClick(origIdx, cleanWord);
    tile.ontouchstart = (e) => { e.preventDefault(); handleTileClick(origIdx, cleanWord); };
    tilesEl.appendChild(tile);
  });
  setTimeout(() => speak(cleanWord), 350);
}

function handleTileClick(origIdx, cleanWord) {
  if (isProcessing) return;
  const tile = document.getElementById(`tile-${origIdx}`);
  if (!tile || tile.classList.contains('used')) return;
  const nextEmpty = easyAnswerArr.findIndex(c => c === '');
  if (nextEmpty === -1) return;
  const expectedChar = cleanWord[nextEmpty];
  const clickedChar = cleanWord[origIdx];
  if (clickedChar.toLowerCase() === expectedChar.toLowerCase()) {
    easyAnswerArr[nextEmpty] = clickedChar;
    tile.classList.add('used');
    const slot = document.getElementById(`slot-${nextEmpty}`);
    slot.textContent = clickedChar.toLowerCase(); slot.classList.add('filled', 'pop-in');
    if (easyAnswerArr.every(c => c !== '')) {
      isProcessing = true;
      document.querySelectorAll('.answer-slot').forEach(s => { s.classList.remove('filled'); s.classList.add('correct'); });
      document.getElementById('feedback').innerHTML = `<span style="color:var(--green)">太棒了！🎉</span>`;
      playSuccessTone();
      const wordKey = normalizeWordKey(practiceList[currentIndex]);
      sessionEasyCompletedSet.add(wordKey);
      if (!currentWordHadWrong) {
        recordEasyCorrectResult(practiceList[currentIndex]);
      }
      setTimeout(() => { currentIndex++; loadPracticeWord('easy'); }, 900);
    }
  } else {
    // Wrong tap
    if (!currentWordHadWrong) {
      currentWordHadWrong = true;
      const wordKey = normalizeWordKey(practiceList[currentIndex]);
      sessionWrongSet.add(wordKey);
      recordWrongResult(practiceList[currentIndex]);
    }
    tile.classList.add('wrong-tile');
    const slot = document.getElementById(`slot-${nextEmpty}`);
    slot.classList.add('wrong');
    document.getElementById('feedback').innerHTML = `<span style="color:var(--red)">不对，再想想！</span>`;
    setTimeout(() => {
      tile.classList.remove('wrong-tile');
      slot.classList.remove('wrong');
      document.getElementById('feedback').innerHTML = '';
    }, 600);
  }
}

function skipEasy() {
  recordSkipResult(practiceList[currentIndex]);
  currentIndex++;
  loadPracticeWord('easy');
}

/* ---------- NORMAL MODE ---------- */
function loadNormalWord(cleanWord, rawWord, mode) {
  document.getElementById('practiceCard').innerHTML = `
    <div style="text-align:center;margin-bottom:18px">
      <button class="btn btn-outline" style="display:inline-flex;width:auto;padding:10px 22px;border-radius:30px"
        ontouchstart="event.preventDefault();speak('${cleanWord}')" onclick="speak('${cleanWord}')">
        🔊 <span style="font-weight:800">听发音</span>
      </button>
    </div>
    <div class="blanks-container" id="blanksArea"></div>
    <div class="feedback-text" id="feedback"></div>
    <button class="btn btn-primary" id="confirmBtn"
      ontouchstart="event.preventDefault();checkNormal('${mode}')" onclick="checkNormal('${mode}')">✨ 确认 (Enter)</button>
    <button class="btn btn-gray" style="margin-top:0;font-size:14px"
      ontouchstart="event.preventDefault();skipNormal('${mode}')" onclick="skipNormal('${mode}')">跳过 ›</button>
  `;
  setupNormalInput(cleanWord, mode);
  setTimeout(() => speak(cleanWord), 350);
}

function setupNormalInput(word, mode) {
  targetWord = normalizeApostrophes(word); targetLetters = spellingLetters(word); currentInput = "";
  const blanks = document.getElementById('blanksArea');
  blanks.innerHTML = '';
  for (const char of targetWord) {
    const b = document.createElement('div');
    b.className = 'blank-char';
    if (/[a-zA-Z]/.test(char)) {
      b.dataset.letter = 'true';
    } else {
      b.textContent = char;
      b.classList.add('punctuation');
    }
    blanks.appendChild(b);
  }
  const hidden = document.getElementById('hiddenInput');
  hidden.value = ''; hidden.focus();
  hidden.oninput = (e) => {
    if (isProcessing) return;
    currentInput = e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, targetLetters.length);
    updateNormalBlanks();
  };
  hidden.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); checkNormal(mode); } };
  updateNormalBlanks();
}

function updateNormalBlanks() {
  const chars = document.querySelectorAll('.blank-char');
  let inputIndex = 0;
  chars.forEach(ch => {
    if (ch.dataset.letter !== 'true') return;
    const inp = currentInput[inputIndex] || '';
    ch.textContent = inp; ch.classList.remove('active', 'filled');
    if (inputIndex === currentInput.length) ch.classList.add('active');
    if (inp) ch.classList.add('filled');
    inputIndex++;
  });
}

function checkNormal(mode) {
  if (isProcessing || !currentInput.trim()) return;
  const cleanInput = currentInput.trim().toLowerCase();
  const cleanTarget = targetLetters;
  const fb = document.getElementById('feedback');
  if (cleanInput === cleanTarget) {
    isProcessing = true;
    fb.innerHTML = `<span style="color:var(--green)">太棒了！🎉</span>`;
    document.querySelectorAll('.blank-char').forEach(c => c.classList.add('correct'));
    playSuccessTone();
    const rawWord = practiceList[currentIndex];
    const wordKey = normalizeWordKey(rawWord);
    if (!currentWordHadWrong) {
      sessionMasteredSet.add(wordKey);
      recordCorrectResult(rawWord);
    }
    setTimeout(() => { currentIndex++; loadPracticeWord(mode); }, 800);
  } else {
    fb.innerHTML = `<span style="color:var(--red)">正确: ${targetWord}</span>`;
    document.querySelectorAll('.blank-char').forEach(c => c.classList.add('wrong'));
    const wordKey = normalizeWordKey(targetWord);
    if (!currentWordHadWrong) {
      currentWordHadWrong = true;
      sessionWrongSet.add(wordKey);
      recordWrongResult(practiceList[currentIndex]);
    }
    const btn = document.getElementById('confirmBtn');
    btn.innerText = "记住了 ↺ 重试"; btn.className = "btn btn-yellow";
    btn.ontouchstart = (e) => { e.preventDefault(); resetNormal(btn, mode); };
    btn.onclick = () => resetNormal(btn, mode);
    keepFocus();
  }
}

function resetNormal(btn, mode) {
  currentInput = ""; document.getElementById('hiddenInput').value = "";
  updateNormalBlanks();
  document.querySelectorAll('.blank-char').forEach(c => c.classList.remove('wrong'));
  document.getElementById('feedback').innerHTML = "";
  btn.innerText = "✨ 确认 (Enter)"; btn.className = "btn btn-primary";
  btn.ontouchstart = (e) => { e.preventDefault(); checkNormal(mode); };
  btn.onclick = () => checkNormal(mode);
  keepFocus();
}

function skipNormal(mode) {
  recordSkipResult(practiceList[currentIndex]);
  currentIndex++;
  loadPracticeWord(mode);
}

/* ==================== WRONG BANK RECORD KEEPING ==================== */
function updateWordStats(rawWord, updater) {
  const cleanKey = normalizeWordKey(rawWord);
  const write = new Promise((resolve, reject) => {
    const tx = db.transaction('wrongBank', 'readwrite');
    const store = tx.objectStore('wrongBank');
    const req = store.get(cleanKey);
    req.onsuccess = (e) => {
      const existing = normalizeWrongRecord(e.target.result || { word: cleanKey }, STATS_VERSION);
      updater(existing);
      store.put(existing);
    };
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('Word statistics update failed'));
    tx.onabort = () => reject(tx.error || new Error('Word statistics update aborted'));
  });
  pendingStatWrites.push(write);
  return write;
}

function recordEasyCorrectResult(rawWord) {
  const now = new Date().toISOString();
  return updateWordStats(rawWord, record => {
    record.lastPracticeAt = now;
    record.lastResult = 'easy-correct';
    if ((record.masteryStep || 0) === 0 && !record.needsConsolidation) {
      record.needsIndependentTest = true;
    }
  });
}

function recordCorrectResult(rawWord) {
  const now = new Date().toISOString();
  const today = localDateKey();
  return updateWordStats(rawWord, record => {
    record.correctCount += 1;
    record.lastPracticeAt = now;
    record.lastCorrectAt = now;
    record.lastResult = 'correct';
    record.needsConsolidation = false;
    record.needsIndependentTest = false;

    const step = record.masteryStep || 0;
    const isDue = step === 0 || !record.nextReviewDate || record.nextReviewDate <= today;
    if (step < 3 && record.lastMasteryDate !== today && isDue) {
      record.masteryStep = step + 1;
      record.lastMasteryDate = today;
      record.nextReviewDate = nextReviewDateForStep(record.masteryStep, today);
      if (record.masteryStep === 3) {
        record.nextReviewDate = null;
        record.masteredAt = now;
      }
    }
  });
}

function recordWrongResult(rawWord) {
  const now = new Date().toISOString();
  return updateWordStats(rawWord, record => {
    record.wrongCount += 1;
    record.lastPracticeAt = now;
    record.lastWrongAt = now;
    record.lastResult = 'wrong';
    record.masteryStep = 0;
    record.lastMasteryDate = null;
    record.nextReviewDate = localDateKey();
    record.masteredAt = null;
    record.needsConsolidation = true;
    record.needsIndependentTest = false;
  });
}

function recordSkipResult(rawWord) {
  const now = new Date().toISOString();
  return updateWordStats(rawWord, record => {
    record.skipCount += 1;
    record.lastPracticeAt = now;
    record.lastResult = 'skip';
  });
}

async function finishPractice() {
  // Only first-try independent spellings earn achievement stars.
  const masteredCount = sessionMasteredSet.size;
  try {
    await Promise.all(pendingStatWrites);
    if (masteredCount > 0) await recordAchievementSession(masteredCount, Array.from(sessionMasteredSet));
  } catch (err) {
    alert('本次统计保存失败，请重新打开页面后再试');
    return;
  }
  const resultText = currentPracticeMode === 'easy'
    ? `本次完成字母拼图: <b style="color:#f59e0b">${sessionEasyCompletedSet.size} 个单词</b>`
    : `本次独立拼对: <b style="color:#f59e0b">${masteredCount} ⭐</b>`;
  clearNavigationGuard();
  document.getElementById('headerBtn').innerHTML = '';
  document.getElementById('app').innerHTML = `<div class="card" style="text-align:center;padding:50px 20px;margin-top:40px">
    <div style="font-size:70px;margin-bottom:12px">🎉</div>
    <h2 style="font-family:'Fredoka One',cursive;font-size:30px;margin-bottom:8px">练习完成！</h2>
    <p style="color:var(--text-2);font-size:17px;font-weight:700">${resultText}</p>
    <div style="height:20px"></div>
    <button class="btn btn-primary" onclick="navigateTo('home',{replace:true})">🏠 返回首页</button>
    <button class="btn btn-yellow" onclick="navigateTo('records',{replace:true})">🏆 查看成就</button>
  </div>`;
  await syncToCloud(true);
}
