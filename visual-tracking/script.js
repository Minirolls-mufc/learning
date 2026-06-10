const refs = {
  homeScreen: document.querySelector("#homeScreen"),
  gameScreen: document.querySelector("#gameScreen"),
  choiceButtons: [...document.querySelectorAll("[data-start-mode]")],
  homeButton: document.querySelector("#homeButton"),
  gameIcon: document.querySelector("#gameIcon"),
  gameTitle: document.querySelector("#gameTitle"),
  gameSubtitle: document.querySelector("#gameSubtitle"),
  speed: document.querySelector("#speed"),
  loopGoal: document.querySelector("#loopGoal"),
  aircraftStyle: document.querySelector("#aircraftStyle"),
  soundToggle: document.querySelector("#soundToggle"),
  soundLabel: document.querySelector("#soundLabel"),
  startPause: document.querySelector("#startPause"),
  reset: document.querySelector("#reset"),
  goalBadge: document.querySelector("#goalBadge"),
  targetBadge: document.querySelector("#targetBadge"),
  starBadge: document.querySelector("#starBadge"),
  figureStage: document.querySelector("#figureEightStage"),
  numberStage: document.querySelector("#numberStage"),
  numberField: document.querySelector("#numberField"),
  flightPath: document.querySelector("#flightPath"),
  flightShadow: document.querySelector("#flightShadow"),
  plane: document.querySelector("#plane"),
  planeBody: document.querySelector("#planeBody"),
  aircraftShapes: [...document.querySelectorAll("[data-aircraft-shape]")],
};

const figureStartDistance = 170;

const state = {
  mode: "figure-eight",
  running: false,
  ended: false,
  soundOn: true,
  targetLoops: 10,
  lastTick: 0,
  animationId: 0,
  pathLength: 0,
  pathDistance: 0,
  pathProgress: 0,
  loops: 0,
  stars: 0,
  nextNumber: 1,
  foundCount: 0,
  mistakes: 0,
  numberStartedAt: 0,
};

const gameMeta = {
  "figure-eight": {
    icon: "✈",
    title: "飞机追踪∞",
    subtitle: "沿着 ∞ 航线看飞机",
  },
  numbers: {
    icon: "25",
    title: "数字积木",
    subtitle: "1-25",
  },
};

const speedMap = {
  slow: {
    figureSpeed: 130,
    numberTwist: 3,
    numberClass: "speed-slow",
  },
  normal: {
    figureSpeed: 190,
    numberTwist: 8,
    numberClass: "speed-normal",
  },
};

const aircraftMap = {
  paper: {
    scale: 0.78,
    lookAhead: 8,
  },
  a380: {
    scale: 0.7,
    lookAhead: 10,
  },
  helicopter: {
    scale: 0.76,
    lookAhead: 7,
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

function getSpeed() {
  return speedMap[refs.speed.value];
}

function getAircraft() {
  return aircraftMap[refs.aircraftStyle.value] || aircraftMap.paper;
}

function ensurePathLength() {
  if (!state.pathLength) {
    state.pathLength = refs.flightPath.getTotalLength();
  }
}

function updateBadges() {
  refs.starBadge.textContent = `燃料星 ${state.stars}`;

  if (state.mode === "figure-eight") {
    refs.goalBadge.textContent = `目标 ${state.targetLoops} 圈`;
    refs.targetBadge.textContent = `圈数 ${Math.min(state.loops, state.targetLoops)}/${state.targetLoops}`;
    return;
  }

  refs.goalBadge.textContent = "目标 1-25";
  refs.targetBadge.textContent = state.nextNumber <= 25 ? `下一个 ${state.nextNumber}` : "完成 25";
}

function placePlane(distance = state.pathDistance) {
  ensurePathLength();
  const aircraft = getAircraft();
  const normalized = ((distance % state.pathLength) + state.pathLength) % state.pathLength;
  const point = refs.flightPath.getPointAtLength(normalized);
  const ahead = refs.flightPath.getPointAtLength((normalized + aircraft.lookAhead) % state.pathLength);
  const angle = Math.atan2(ahead.y - point.y, ahead.x - point.x) * (180 / Math.PI);
  refs.plane.setAttribute("transform", `translate(${point.x} ${point.y})`);
  refs.planeBody.setAttribute("transform", `rotate(${angle}) scale(${aircraft.scale})`);
}

function tickFigureEight(now) {
  if (!state.running || state.mode !== "figure-eight") {
    return;
  }

  const deltaSec = Math.min((now - state.lastTick) / 1000, 0.06);
  state.lastTick = now;
  ensurePathLength();
  const step = getSpeed().figureSpeed * deltaSec;
  state.pathDistance += step;
  state.pathProgress += step;

  const loops = Math.floor(state.pathProgress / state.pathLength);
  if (loops !== state.loops) {
    state.loops = loops;
    state.stars += 1;
    sound.blip(760, 0.08);
  }

  placePlane();
  updateBadges();

  if (state.loops >= state.targetLoops) {
    finishSession(true);
    return;
  }

  state.animationId = requestAnimationFrame(tickFigureEight);
}

function stopMotion() {
  cancelAnimationFrame(state.animationId);
  state.animationId = 0;
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
  if (state.ended) {
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
    sound.melody();
  } else {
    sound.blip(392, 0.16);
  }

  updateBadges();
}

function resetSession() {
  stopMotion();
  state.running = false;
  state.ended = false;
  state.targetLoops = Number(refs.loopGoal.value);
  state.lastTick = performance.now();
  ensurePathLength();
  state.pathDistance = Math.min(figureStartDistance, state.pathLength * 0.1);
  state.pathProgress = 0;
  state.loops = 0;
  state.stars = 0;
  state.nextNumber = 1;
  state.foundCount = 0;
  state.mistakes = 0;
  state.numberStartedAt = 0;
  refs.startPause.textContent = "开始";
  placePlane();

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

function applyNumberDifficulty() {
  refs.numberStage.classList.remove("speed-slow", "speed-normal");
  refs.numberStage.classList.add(getSpeed().numberClass);
}

function generateNumberBlocks() {
  refs.numberField.innerHTML = "";
  applyNumberDifficulty();
  const numbers = shuffle(Array.from({ length: 25 }, (_, index) => index + 1));
  const config = getSpeed();

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

  updateBadges();
}

function setGameMode(mode) {
  state.mode = mode;
  const meta = gameMeta[mode];
  refs.gameIcon.textContent = meta.icon;
  refs.gameTitle.textContent = meta.title;
  refs.gameSubtitle.textContent = meta.subtitle;
  refs.figureStage.classList.toggle("is-hidden", mode !== "figure-eight");
  refs.numberStage.classList.toggle("is-hidden", mode !== "numbers");
}

function setAircraftStyle() {
  refs.aircraftShapes.forEach((shape) => {
    shape.classList.toggle("is-active", shape.dataset.aircraftShape === refs.aircraftStyle.value);
  });
  placePlane();
}

function showGame(mode) {
  refs.homeScreen.classList.add("is-hidden");
  refs.gameScreen.classList.remove("is-hidden");
  setGameMode(mode);
  resetSession();
  window.history.replaceState(null, "", mode === "numbers" ? "#numbers" : "#figure-eight");
}

function showHome() {
  stopMotion();
  state.running = false;
  refs.startPause.textContent = "开始";
  refs.gameScreen.classList.add("is-hidden");
  refs.homeScreen.classList.remove("is-hidden");
  window.history.replaceState(null, "", window.location.pathname);
}

refs.choiceButtons.forEach((button) => {
  button.addEventListener("click", () => showGame(button.dataset.startMode));
});

refs.homeButton.addEventListener("click", showHome);
refs.startPause.addEventListener("click", startSession);
refs.reset.addEventListener("click", resetSession);

refs.speed.addEventListener("change", resetSession);
refs.loopGoal.addEventListener("change", resetSession);
refs.aircraftStyle.addEventListener("change", setAircraftStyle);

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

setAircraftStyle();
placePlane(0);

if (window.location.hash === "#numbers") {
  showGame("numbers");
} else if (window.location.hash === "#figure-eight") {
  showGame("figure-eight");
} else {
  updateBadges();
}
