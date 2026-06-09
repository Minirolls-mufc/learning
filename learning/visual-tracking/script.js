const refs = {
  modeButtons: [...document.querySelectorAll("[data-mode]")],
  difficulty: document.querySelector("#difficulty"),
  duration: document.querySelector("#duration"),
  soundToggle: document.querySelector("#soundToggle"),
  soundLabel: document.querySelector("#soundLabel"),
  startPause: document.querySelector("#startPause"),
  reset: document.querySelector("#reset"),
  timeBadge: document.querySelector("#timeBadge"),
  targetBadge: document.querySelector("#targetBadge"),
  starBadge: document.querySelector("#starBadge"),
  sessionTitle: document.querySelector("#sessionTitle"),
  sessionLine: document.querySelector("#sessionLine"),
  figureStage: document.querySelector("#figureEightStage"),
  numberStage: document.querySelector("#numberStage"),
  numberField: document.querySelector("#numberField"),
  flightPath: document.querySelector("#flightPath"),
  plane: document.querySelector("#plane"),
};

const state = {
  mode: "figure-eight",
  running: false,
  ended: false,
  soundOn: true,
  durationSec: 180,
  remainingSec: 180,
  lastTick: 0,
  animationId: 0,
  timerId: 0,
  pathLength: 0,
  pathDistance: 0,
  loops: 0,
  stars: 0,
  nextNumber: 1,
  foundCount: 0,
  mistakes: 0,
  numberStartedAt: 0,
};

const difficultyMap = {
  easy: {
    speed: 115,
    numberTwist: 4,
    hintNext: true,
  },
  standard: {
    speed: 170,
    numberTwist: 8,
    hintNext: true,
  },
  challenge: {
    speed: 230,
    numberTwist: 12,
    hintNext: false,
  },
};

const blockColors = ["red", "yellow", "green", "blue", "cyan", "orange"];

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambient = [];
  }

  ensure() {
    if (this.ctx) {
      return;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.045;
    this.master.connect(this.ctx.destination);
  }

  async resume() {
    if (!state.soundOn) {
      return;
    }

    this.ensure();

    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  async startAmbient() {
    if (!state.soundOn || this.ambient.length) {
      return;
    }

    await this.resume();

    const tones = [
      { freq: 174, type: "sine", gain: 0.12 },
      { freq: 261.63, type: "triangle", gain: 0.05 },
    ];

    this.ambient = tones.map((tone) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.value = tone.freq;
      osc.type = tone.type;
      gain.gain.value = tone.gain;
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      return { osc, gain };
    });
  }

  stopAmbient() {
    this.ambient.forEach(({ osc, gain }) => {
      gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      osc.stop(this.ctx.currentTime + 0.12);
    });
    this.ambient = [];
  }

  async blip(freq = 620, length = 0.09) {
    if (!state.soundOn) {
      return;
    }

    await this.resume();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "square";
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(this.master);
    gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, this.ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + length);
    osc.start();
    osc.stop(this.ctx.currentTime + length + 0.02);
  }

  async melody() {
    if (!state.soundOn) {
      return;
    }

    await this.resume();
    [523, 659, 784, 1046].forEach((freq, index) => {
      setTimeout(() => this.blip(freq, 0.12), index * 110);
    });
  }
}

const sound = new SoundEngine();

function formatTime(seconds) {
  const safe = Math.max(0, Math.ceil(seconds));
  const mins = String(Math.floor(safe / 60)).padStart(2, "0");
  const secs = String(safe % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function getDifficulty() {
  return difficultyMap[refs.difficulty.value];
}

function updateBadges() {
  refs.timeBadge.textContent = formatTime(state.remainingSec);
  refs.starBadge.textContent = `燃料星 ${state.stars}`;

  if (state.mode === "figure-eight") {
    refs.targetBadge.textContent = `圈数 ${state.loops}`;
    if (!state.ended) {
      refs.sessionTitle.textContent = state.running ? "飞行训练中" : "飞行准备";
      refs.sessionLine.textContent = state.running ? `速度 ${refs.difficulty.options[refs.difficulty.selectedIndex].text}` : "准备起飞";
    }
    return;
  }

  refs.targetBadge.textContent = state.nextNumber <= 25 ? `下一个 ${state.nextNumber}` : "完成 25";
  if (!state.ended) {
    refs.sessionTitle.textContent = state.running ? "搜索训练中" : "积木准备";
    refs.sessionLine.textContent = `已找到 ${state.foundCount}/25`;
  }
}

function placePlane(distance = state.pathDistance) {
  if (!state.pathLength) {
    state.pathLength = refs.flightPath.getTotalLength();
  }

  const normalized = ((distance % state.pathLength) + state.pathLength) % state.pathLength;
  const point = refs.flightPath.getPointAtLength(normalized);
  const ahead = refs.flightPath.getPointAtLength((normalized + 3) % state.pathLength);
  const angle = Math.atan2(ahead.y - point.y, ahead.x - point.x) * (180 / Math.PI);

  refs.plane.setAttribute("transform", `translate(${point.x} ${point.y}) rotate(${angle})`);
}

function tickFigureEight(now) {
  if (!state.running || state.mode !== "figure-eight") {
    return;
  }

  const deltaSec = Math.min((now - state.lastTick) / 1000, 0.06);
  state.lastTick = now;
  state.pathDistance += getDifficulty().speed * deltaSec;

  const loops = Math.floor(state.pathDistance / state.pathLength);
  if (loops !== state.loops) {
    state.loops = loops;
    state.stars += 1;
    sound.blip(760, 0.08);
    updateBadges();
  }

  placePlane();
  state.animationId = requestAnimationFrame(tickFigureEight);
}

function startTimer() {
  clearInterval(state.timerId);
  state.timerId = window.setInterval(() => {
    if (!state.running) {
      return;
    }

    state.remainingSec -= 1;
    if (state.remainingSec <= 0) {
      finishSession(false);
      return;
    }

    updateBadges();
  }, 1000);
}

function stopMotion() {
  cancelAnimationFrame(state.animationId);
  clearInterval(state.timerId);
  state.animationId = 0;
  state.timerId = 0;
  sound.stopAmbient();
}

function setRunning(nextRunning) {
  state.running = nextRunning;
  refs.startPause.textContent = nextRunning ? "暂停" : "继续";

  if (nextRunning) {
    sound.startAmbient();
  } else {
    sound.stopAmbient();
  }
}

async function startSession() {
  if (state.ended || state.remainingSec <= 0) {
    resetSession();
  }

  if (state.running) {
    setRunning(false);
    return;
  }

  if (state.mode === "numbers" && state.foundCount >= 25) {
    resetSession();
  }

  state.ended = false;
  setRunning(true);
  state.lastTick = performance.now();
  refs.startPause.textContent = "暂停";
  await sound.startAmbient();
  sound.blip(523, 0.1);
  startTimer();

  if (state.mode === "figure-eight") {
    state.animationId = requestAnimationFrame(tickFigureEight);
  } else if (!state.numberStartedAt) {
    state.numberStartedAt = performance.now();
  }

  updateBadges();
}

function finishSession(completed) {
  state.ended = true;
  state.running = false;
  stopMotion();
  refs.startPause.textContent = "开始";

  if (completed) {
    state.stars += 3;
    refs.sessionTitle.textContent = "任务完成";
    refs.sessionLine.textContent = state.mode === "numbers" ? `错点 ${state.mistakes} 次` : `完成 ${state.loops} 圈`;
    sound.melody();
  } else {
    refs.sessionTitle.textContent = "时间到";
    refs.sessionLine.textContent = state.mode === "numbers" ? `已找到 ${state.foundCount}/25` : `完成 ${state.loops} 圈`;
    sound.blip(392, 0.16);
  }

  updateBadges();
}

function resetSession() {
  stopMotion();
  state.running = false;
  state.ended = false;
  state.durationSec = Number(refs.duration.value);
  state.remainingSec = state.durationSec;
  state.lastTick = performance.now();
  state.pathDistance = 0;
  state.loops = 0;
  state.stars = 0;
  state.nextNumber = 1;
  state.foundCount = 0;
  state.mistakes = 0;
  state.numberStartedAt = 0;
  refs.startPause.textContent = "开始";
  placePlane(0);

  if (state.mode === "numbers") {
    generateNumberBlocks();
  }

  updateBadges();
}

function range(min, max) {
  return Math.random() * (max - min) + min;
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function generateNumberBlocks() {
  refs.numberField.innerHTML = "";
  const numbers = shuffle(Array.from({ length: 25 }, (_, index) => index + 1));
  const config = getDifficulty();

  numbers.forEach((number) => {
    const cell = document.createElement("div");
    cell.className = "number-cell";

    const block = document.createElement("button");
    const color = blockColors[(number + Math.floor(Math.random() * blockColors.length)) % blockColors.length];
    block.type = "button";
    block.className = `number-block color-${color}`;
    block.textContent = String(number);
    block.dataset.number = String(number);
    block.style.setProperty("--jx", `${range(-config.numberTwist, config.numberTwist)}px`);
    block.style.setProperty("--jy", `${range(-config.numberTwist, config.numberTwist)}px`);
    block.style.setProperty("--rot", `${range(-config.numberTwist, config.numberTwist) * 0.42}deg`);
    block.addEventListener("click", () => handleNumberClick(block));

    cell.append(block);
    refs.numberField.append(cell);
  });

  highlightNextBlock();
}

function highlightNextBlock() {
  refs.numberField.querySelectorAll(".number-block").forEach((block) => {
    block.classList.toggle("is-next", getDifficulty().hintNext && Number(block.dataset.number) === state.nextNumber);
  });
}

function handleNumberClick(block) {
  if (!state.running || state.mode !== "numbers") {
    return;
  }

  const number = Number(block.dataset.number);

  if (number !== state.nextNumber) {
    state.mistakes += 1;
    block.classList.remove("is-wrong");
    void block.offsetWidth;
    block.classList.add("is-wrong");
    sound.blip(220, 0.08);
    return;
  }

  block.classList.add("is-found");
  block.disabled = true;
  state.foundCount += 1;
  state.nextNumber += 1;
  state.stars += state.foundCount % 5 === 0 ? 1 : 0;
  sound.blip(620 + state.foundCount * 10, 0.06);

  if (state.foundCount >= 25) {
    finishSession(true);
    return;
  }

  highlightNextBlock();
  updateBadges();
}

function switchMode(mode) {
  if (state.mode === mode) {
    return;
  }

  state.mode = mode;
  stopMotion();

  refs.modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });

  refs.figureStage.classList.toggle("is-hidden", mode !== "figure-eight");
  refs.numberStage.classList.toggle("is-hidden", mode !== "numbers");
  resetSession();
}

refs.modeButtons.forEach((button) => {
  button.addEventListener("click", () => switchMode(button.dataset.mode));
});

refs.startPause.addEventListener("click", startSession);
refs.reset.addEventListener("click", resetSession);

refs.difficulty.addEventListener("change", () => {
  resetSession();
});

refs.duration.addEventListener("change", resetSession);

refs.soundToggle.addEventListener("click", () => {
  state.soundOn = !state.soundOn;
  refs.soundToggle.classList.toggle("is-on", state.soundOn);
  refs.soundToggle.setAttribute("aria-pressed", String(state.soundOn));
  refs.soundLabel.textContent = state.soundOn ? "开" : "关";

  if (!state.soundOn) {
    sound.stopAmbient();
  } else if (state.running) {
    sound.startAmbient();
  }
});

window.addEventListener("resize", () => {
  placePlane();
});

if (window.location.hash === "#numbers") {
  switchMode("numbers");
} else {
  resetSession();
}
