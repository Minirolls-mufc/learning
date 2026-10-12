const SVG_NS = "http://www.w3.org/2000/svg";
const COLORS = ["#d55c4b", "#4175bb", "#2d9561", "#9560af", "#c48c22", "#2297a5"];
const ui = {
  practice: document.querySelector("#practice"),
  area: document.querySelector("#chartArea"),
  chart: document.querySelector("#routeChart"),
  lines: document.querySelector("#routeLines"),
  nodes: document.querySelector("#routeNodes"),
  dot: document.querySelector("#guideDot"),
  count: document.querySelector("#chartCount"),
  next: document.querySelector("#nextChart"),
  guide: document.querySelector("#guideEnabled"),
  speed: document.querySelector("#guideSpeed"),
  speedValue: document.querySelector("#speedValue"),
  play: document.querySelector("#playPause"),
  restart: document.querySelector("#restart"),
  fullscreen: document.querySelector("#fullscreen"),
  progress: document.querySelector("#routeProgress"),
  notice: document.querySelector("#notice"),
};

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function crosses(a, b, c, d) {
  const side = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

function generateCharts() {
  const charts = [];
  const seen = new Set();
  while (charts.length < 20) {
    const ring = Array.from({ length: 12 }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI / 6 + (Math.random() - 0.5) * 0.13;
      const radius = 0.9 + Math.random() * 0.1;
      return { x: 0.5 + Math.cos(angle) * 0.39 * radius, y: 0.5 + Math.sin(angle) * 0.39 * radius };
    });
    const order = shuffle(Array.from({ length: 12 }, (_, index) => index));
    const key = order.join(",");
    if (seen.has(key)) continue;
    const points = [{ x: 0.5, y: 0.5 }, ...order.map((index) => ring[index])];
    const closed = [...points, points[0]];
    let crossingCount = 0;
    for (let i = 0; i < closed.length - 1; i += 1) {
      for (let j = i + 2; j < closed.length - 1; j += 1) {
        if (crosses(closed[i], closed[i + 1], closed[j], closed[j + 1])) crossingCount += 1;
      }
    }
    if (crossingCount < 14) continue;
    seen.add(key);
    charts.push({ points, order, crossingCount });
  }
  return charts;
}

const charts = generateCharts();
const motion = { segment: 0, fraction: 0, hold: 0.4, playing: true, lastTime: 0, frame: 0 };
let deck = shuffle(Array.from({ length: charts.length }, (_, index) => index));
let deckPosition = 0;
let screenPoints = [];
let noticeTimer;

function svgElement(tag, attributes, text) {
  const element = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  if (text !== undefined) element.textContent = text;
  return element;
}

function currentChart() { return charts[deck[deckPosition]]; }

function drawChart() {
  const { width, height } = ui.area.getBoundingClientRect();
  if (!width || !height) return;
  ui.chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const radius = Math.min(22, Math.max(12, Math.min(width, height) * 0.033));
  screenPoints = currentChart().points.map((point) => ({ x: point.x * width, y: point.y * height }));
  const lines = document.createDocumentFragment();
  const nodes = document.createDocumentFragment();

  screenPoints.forEach((point, index) => {
    const next = screenPoints[(index + 1) % screenPoints.length];
    const color = COLORS[index % COLORS.length];
    lines.append(svgElement("line", { class: "route-line", x1: point.x, y1: point.y, x2: next.x, y2: next.y, stroke: color, "stroke-width": width < 600 ? 1.7 : 2.3 }));
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    const length = Math.hypot(dx, dy);
    const ux = dx / length;
    const uy = dy / length;
    const size = width < 600 ? 7 : 10;
    const arrowPositions = length > 350 ? [0.32, 0.67] : [0.52];
    arrowPositions.forEach((fraction) => {
      const x = point.x + dx * fraction;
      const y = point.y + dy * fraction;
      lines.append(svgElement("path", {
        class: "route-arrow",
        d: `M${x + ux * size / 2} ${y + uy * size / 2} L${x - ux * size / 2 - uy * size * 0.4} ${y - uy * size / 2 + ux * size * 0.4} L${x - ux * size / 2 + uy * size * 0.4} ${y - uy * size / 2 - ux * size * 0.4} Z`,
        fill: color,
      }));
    });
    nodes.append(svgElement("circle", { class: "route-node", cx: point.x, cy: point.y, r: radius, fill: index === 0 ? "#d5edff" : "#ffffff", stroke: index === 0 ? "#4175bb" : COLORS[(index - 1) % COLORS.length] }));
    nodes.append(svgElement("text", {
      class: "route-number",
      x: point.x,
      y: index === 0 ? point.y + radius + 18 : point.y,
      "font-size": radius * 1.15,
      ...(index === 0 ? { stroke: "#f5fbf6", "stroke-width": 4, "paint-order": "stroke" } : {}),
    }, index));
  });
  ui.lines.replaceChildren(lines);
  ui.nodes.replaceChildren(nodes);
  ui.dot.querySelector(".guide-outline").setAttribute("r", Math.max(10, radius * 0.65));
  ui.dot.querySelector(".guide-core").setAttribute("r", Math.max(6, radius * 0.38));
  placeDot();
}

function placeDot() {
  if (!screenPoints.length) return;
  const from = screenPoints[motion.segment];
  const to = screenPoints[(motion.segment + 1) % screenPoints.length];
  ui.dot.setAttribute("transform", `translate(${from.x + (to.x - from.x) * motion.fraction} ${from.y + (to.y - from.y) * motion.fraction})`);
  ui.progress.textContent = ui.guide.checked ? `${motion.segment} → ${(motion.segment + 1) % screenPoints.length}` : "0–12";
}

function advance(seconds) {
  const speed = 110 * Number(ui.speed.value);
  // Consume time across segment boundaries so speed stays constant at every frame rate.
  while (seconds > 0 && screenPoints.length) {
    if (motion.hold > 0) {
      const used = Math.min(seconds, motion.hold);
      motion.hold -= used;
      seconds -= used;
      if (seconds <= 0) break;
    }
    const from = screenPoints[motion.segment];
    const to = screenPoints[(motion.segment + 1) % screenPoints.length];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const remaining = (1 - motion.fraction) * length / speed;
    if (seconds < remaining) {
      motion.fraction += seconds * speed / length;
      break;
    }
    seconds -= remaining;
    motion.segment = (motion.segment + 1) % screenPoints.length;
    motion.fraction = 0;
    motion.hold = 0.35;
  }
  placeDot();
}

function animate(time) {
  motion.frame = 0;
  if (!ui.guide.checked || !motion.playing || document.hidden) return;
  if (motion.lastTime) advance(Math.min((time - motion.lastTime) / 1000, 0.08));
  motion.lastTime = time;
  motion.frame = requestAnimationFrame(animate);
}

function syncPlayback() {
  cancelAnimationFrame(motion.frame);
  motion.frame = 0;
  motion.lastTime = 0;
  const enabled = ui.guide.checked;
  ui.dot.style.display = enabled ? "" : "none";
  ui.play.disabled = !enabled;
  ui.restart.disabled = !enabled;
  const label = motion.playing ? "暂停辅助点" : "继续辅助点";
  ui.play.setAttribute("aria-label", label);
  ui.play.title = label;
  ui.play.querySelector("use").setAttribute("href", `./icons.svg#${motion.playing ? "pause" : "play"}`);
  placeDot();
  if (enabled && motion.playing && !document.hidden) motion.frame = requestAnimationFrame(animate);
}

function restart() {
  motion.segment = 0;
  motion.fraction = 0;
  motion.hold = 0.4;
  syncPlayback();
}

function nextChart() {
  if (deckPosition === deck.length - 1) {
    const previous = deck[deckPosition];
    deck = shuffle(deck);
    if (deck[0] === previous) [deck[0], deck[1]] = [deck[1], deck[0]];
    deckPosition = 0;
  } else {
    deckPosition += 1;
  }
  ui.count.textContent = `${deckPosition + 1} / ${charts.length}`;
  motion.segment = 0;
  motion.fraction = 0;
  motion.hold = 0.4;
  drawChart();
  syncPlayback();
}

function showNotice(message) {
  clearTimeout(noticeTimer);
  ui.notice.textContent = message;
  ui.notice.hidden = false;
  noticeTimer = setTimeout(() => { ui.notice.hidden = true; }, 3500);
}

function syncFullscreen() {
  const active = Boolean(document.fullscreenElement);
  const label = active ? "退出全屏" : "进入全屏";
  ui.fullscreen.setAttribute("aria-label", label);
  ui.fullscreen.title = label;
  ui.fullscreen.querySelector("use").setAttribute("href", `./icons.svg#${active ? "minimize" : "maximize"}`);
}

ui.fullscreen.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (ui.practice.requestFullscreen) await ui.practice.requestFullscreen();
    else showNotice("当前浏览器不支持全屏，已使用最大练习区域");
  } catch {
    showNotice("当前浏览器无法进入全屏，已使用最大练习区域");
  }
});
ui.next.addEventListener("click", nextChart);
ui.guide.addEventListener("change", syncPlayback);
ui.play.addEventListener("click", () => { motion.playing = !motion.playing; syncPlayback(); });
ui.restart.addEventListener("click", restart);
ui.speed.addEventListener("input", () => {
  ui.speedValue.value = `${Number(ui.speed.value).toFixed(2)}×`;
  ui.speed.setAttribute("aria-valuetext", `${Number(ui.speed.value).toFixed(2)} 倍速`);
});
document.addEventListener("visibilitychange", syncPlayback);
document.addEventListener("fullscreenchange", syncFullscreen);
window.addEventListener("pagehide", () => { cancelAnimationFrame(motion.frame); motion.frame = 0; });
window.addEventListener("pageshow", syncPlayback);
new ResizeObserver(drawChart).observe(ui.area);
drawChart();
syncPlayback();
