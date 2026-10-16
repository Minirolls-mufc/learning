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

function ringGap(a, b) {
  const gap = Math.abs(a - b);
  return Math.min(gap, 12 - gap);
}

function isClearRoute(points) {
  const count = points.length;
  const minimumOpening = Math.cos(Math.PI / 6);
  for (let i = 0; i < count; i += 1) {
    const previous = points[(i + count - 1) % count];
    const point = points[i];
    const next = points[(i + 1) % count];
    const ax = previous.x - point.x;
    const ay = previous.y - point.y;
    const bx = next.x - point.x;
    const by = next.y - point.y;
    if ((ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by)) > minimumOpening + 1e-9) return false;
  }

  for (let i = 0; i < count; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % count];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    for (let j = i + 2; j < count; j += 1) {
      if (i === 0 && j === count - 1) continue;
      const c = points[j];
      const d = points[(j + 1) % count];
      const ex = d.x - c.x;
      const ey = d.y - c.y;
      const otherLength = Math.hypot(ex, ey);
      const sine = Math.abs(dx * ey - dy * ex) / (length * otherLength);
      if (crosses(a, b, c, d) && sine < Math.sin(25 * Math.PI / 180) - 1e-9) return false;

      // Parallel routes need visible space between them, even when they do not cross.
      if (sine < Math.sin(12 * Math.PI / 180)) {
        const projectionC = ((c.x - a.x) * dx + (c.y - a.y) * dy) / length;
        const projectionD = ((d.x - a.x) * dx + (d.y - a.y) * dy) / length;
        const overlap = Math.min(length, Math.max(projectionC, projectionD)) - Math.max(0, Math.min(projectionC, projectionD));
        const distance = Math.min(Math.abs(dx * (c.y - a.y) - dy * (c.x - a.x)), Math.abs(dx * (d.y - a.y) - dy * (d.x - a.x))) / length;
        if (overlap > 0.2 && distance < 0.18) return false;
      }
    }
  }
  return true;
}

function generateCharts() {
  const ring = Array.from({ length: 12 }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI / 6;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  });
  const orders = [];
  function visit(order) {
    if (orders.length >= 80) return;
    if (order.length === 12) {
      if (ringGap(order[10], order[11]) > 4) return;
      const points = [{ x: 0, y: 0 }, ...order.map((index) => ring[index])];
      if (isClearRoute(points)) orders.push(order);
      return;
    }
    for (const next of shuffle(Array.from({ length: 12 }, (_, index) => index))) {
      if (order.includes(next)) continue;
      const gap = ringGap(order.at(-1), next);
      if (gap < 3 || gap > 5 || (order.length === 1 && gap > 4)) continue;
      if (order.length > 1 && ringGap(order.at(-2), next) < 2) continue;
      visit([...order, next]);
    }
  }
  visit([0]);
  const variants = orders.flatMap((order) => Array.from({ length: 12 }, (_, offset) => order.map((index) => (index + offset) % 12)));
  return shuffle(variants).slice(0, 20).map((order) => {
    const rotation = Math.random() * Math.PI * 2;
    const points = [{ x: 0, y: 0 }, ...order.map((index) => {
      const angle = index * Math.PI / 6 + rotation;
      return { x: Math.cos(angle), y: Math.sin(angle) };
    })];
    return { points, order };
  });
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
  const chartRadius = Math.max(1, Math.min(width, height) / 2 - radius - 14);
  screenPoints = currentChart().points.map((point) => ({ x: width / 2 + point.x * chartRadius, y: height / 2 + point.y * chartRadius }));
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
