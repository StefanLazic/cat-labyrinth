"use strict";

const canvas = document.querySelector("#maze");
const context = canvas.getContext("2d");
const game = document.querySelector("#game");
const intro = document.querySelector("#intro");
const endScreen = document.querySelector("#end");
const objective = document.querySelector("#objective");
const compass = document.querySelector("#compass");
const fishCount = document.querySelector("#fish-count");
const fishTotal = document.querySelector("#fish-total");
const stepsElement = document.querySelector("#steps");
const toast = document.querySelector("#toast");
const joystick = document.querySelector("#joystick");
const joystickKnob = document.querySelector("#joystick-knob");
const mouseStatus = document.querySelector("#mouse-status");
const proximityFill = document.querySelector("#proximity-fill");
const dashButton = document.querySelector("#dash");
const sniffButton = document.querySelector("#sniff");
const dashLabel = document.querySelector("#dash-label");
const sniffLabel = document.querySelector("#sniff-label");

const CELL_COUNT = 7;
const MAP_SIZE = CELL_COUNT * 2 + 1;
const directions = [
  { row: -1, col: 0 },
  { row: 0, col: 1 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
];
const palettes = [
  { floor: "#f4dfb9", floorAlt: "#ead0a4", top: "#7865bd", left: "#4b3d89", right: "#5c4ca0" },
  { floor: "#dff1d0", floorAlt: "#c9e6bb", top: "#e36e9c", left: "#963f72", right: "#bd527f" },
  { floor: "#d6e8f0", floorAlt: "#c1dbe7", top: "#e8a84e", left: "#a76830", right: "#c9853d" },
];

let map = [];
let player = { x: 1.5, y: 1.5, facingX: 1, facingY: 0 };
let mouse = { x: 1.5, y: 1.5, state: "hiding", path: [], pathIndex: 0, repathAt: 0 };
let fish = [];
let portals = [];
let keys = {};
let stick = { x: 0, y: 0 };
let playing = false;
let won = false;
let steps = 0;
let startedAt = 0;
let lastFrame = performance.now();
let dashUntil = 0;
let sniffUntil = 0;
let dashReadyAt = 0;
let sniffReadyAt = 0;
let portalCooldown = 0;
let surpriseTriggered = false;
let paletteIndex = 0;
let toastTimer;
let mouseWasAlerted = false;
let footstepAt = 0;
let shakeUntil = 0;
let effects = [];
let audioContext;

function playSound(kind) {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    const sounds = {
      step: [110, 75, 0.035, "sine", 0.025],
      fish: [620, 980, 0.16, "sine", 0.08],
      dash: [180, 520, 0.18, "sawtooth", 0.045],
      sniff: [260, 390, 0.22, "sine", 0.055],
      squeak: [860, 1220, 0.12, "square", 0.035],
      portal: [220, 880, 0.35, "sine", 0.07],
      catch: [440, 1040, 0.55, "triangle", 0.11],
    };
    const [start, end, duration, type, volume] = sounds[kind] || sounds.step;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(start, now);
    oscillator.frequency.exponentialRampToValueAtTime(end, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  } catch {
    // Audio is optional when the browser blocks Web Audio.
  }
}

function burst(x, y, color, count = 10) {
  for (let index = 0; index < count; index += 1) {
    const angle = Math.PI * 2 * index / count + Math.random() * 0.45;
    const speed = 22 + Math.random() * 45;
    effects.push({
      x, y, color, life: 0.65 + Math.random() * 0.3,
      age: 0, size: 2 + Math.random() * 4,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 18,
    });
  }
}

function shuffle(values) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[randomIndex]] = [values[randomIndex], values[index]];
  }
  return values;
}

function makeMaze() {
  map = Array.from({ length: MAP_SIZE }, () => Array(MAP_SIZE).fill(1));
  const visited = Array.from({ length: CELL_COUNT }, () => Array(CELL_COUNT).fill(false));
  const stack = [{ row: 0, col: 0 }];
  visited[0][0] = true;
  map[1][1] = 0;

  while (stack.length) {
    const current = stack[stack.length - 1];
    const choices = shuffle(directions.slice()).filter(({ row, col }) => {
      const nextRow = current.row + row;
      const nextCol = current.col + col;
      return nextRow >= 0 && nextRow < CELL_COUNT && nextCol >= 0 &&
        nextCol < CELL_COUNT && !visited[nextRow][nextCol];
    });
    if (!choices.length) {
      stack.pop();
      continue;
    }
    const next = choices[0];
    const nextRow = current.row + next.row;
    const nextCol = current.col + next.col;
    map[current.row * 2 + 1 + next.row][current.col * 2 + 1 + next.col] = 0;
    map[nextRow * 2 + 1][nextCol * 2 + 1] = 0;
    visited[nextRow][nextCol] = true;
    stack.push({ row: nextRow, col: nextCol });
  }
}

function openCellsByDistance() {
  const queue = [{ x: 1, y: 1, distance: 0 }];
  const seen = new Set(["1,1"]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    directions.forEach(({ row, col }) => {
      const x = current.x + col;
      const y = current.y + row;
      const key = `${x},${y}`;
      if (map[y]?.[x] === 0 && !seen.has(key)) {
        seen.add(key);
        queue.push({ x, y, distance: current.distance + 1 });
      }
    });
  }
  return queue;
}

function resetGame() {
  makeMaze();
  const openCells = openCellsByDistance();
  const farthest = openCells[openCells.length - 1];
  const candidates = openCells.slice(7, -4);
  mouse = {
    x: farthest.x + 0.5,
    y: farthest.y + 0.5,
    state: "hiding",
    path: [],
    pathIndex: 0,
    repathAt: 0,
  };
  fish = shuffle(candidates.slice()).slice(0, 6).map((cell, index) => ({
    x: cell.x + 0.5,
    y: cell.y + 0.5,
    found: false,
    phase: index * 0.9,
  }));
  const portalCells = shuffle(candidates.filter((cell) =>
    !fish.some((item) => Math.floor(item.x) === cell.x && Math.floor(item.y) === cell.y),
  )).slice(0, 2);
  portals = portalCells.map((cell, index) => ({
    x: cell.x + 0.5,
    y: cell.y + 0.5,
    color: index ? "#6ee7ff" : "#ff76c8",
  }));
  player = { x: 1.5, y: 1.5, facingX: 1, facingY: 0 };
  steps = 0;
  startedAt = 0;
  won = false;
  surpriseTriggered = false;
  paletteIndex = 0;
  portalCooldown = 0;
  dashUntil = 0;
  sniffUntil = 0;
  dashReadyAt = 0;
  sniffReadyAt = 0;
  mouseWasAlerted = false;
  effects = [];
  stepsElement.textContent = "0";
  fishCount.textContent = "0";
  fishTotal.textContent = String(fish.length);
  objective.textContent = "Catch the moon mouse";
  mouseStatus.textContent = "Quiet paws…";
  proximityFill.style.width = "0%";
  endScreen.hidden = true;
  game.dataset.state = playing ? "playing" : "intro";
}

function isWall(x, y) {
  return map[Math.floor(y)]?.[Math.floor(x)] !== 0;
}

function canStand(x, y) {
  const radius = 0.2;
  return !isWall(x - radius, y - radius) && !isWall(x + radius, y - radius) &&
    !isWall(x - radius, y + radius) && !isWall(x + radius, y + radius);
}

function movePlayer(horizontal, vertical, delta) {
  const length = Math.hypot(horizontal, vertical);
  if (length > 1) {
    horizontal /= length;
    vertical /= length;
  }
  if (Math.hypot(horizontal, vertical) < 0.08) return;

  const boost = performance.now() < dashUntil ? 2.1 : 1;
  const distance = delta * 2.15 * boost;
  const dx = horizontal * distance;
  const dy = vertical * distance;
  const oldX = player.x;
  const oldY = player.y;
  if (canStand(player.x + dx, player.y)) player.x += dx;
  if (canStand(player.x, player.y + dy)) player.y += dy;
  const travelled = Math.hypot(player.x - oldX, player.y - oldY);
  if (!travelled) return;

  player.facingX = horizontal;
  player.facingY = vertical;
  steps += travelled;
  stepsElement.textContent = String(Math.floor(steps * 2));
  if (!startedAt) startedAt = Date.now();
  if (performance.now() >= footstepAt) {
    playSound("step");
    footstepAt = performance.now() + (boost > 1 ? 115 : 190);
  }
  collectNearby();
  usePortal();
}

function collectNearby() {
  fish.forEach((item) => {
    if (!item.found && Math.hypot(player.x - item.x, player.y - item.y) < 0.46) {
      item.found = true;
      const count = fish.filter(({ found }) => found).length;
      fishCount.textContent = String(count);
      burst(item.x, item.y, "#ffd166", 12);
      playSound("fish");
      showToast(count === fish.length ? "🐟 Full snack pouch! Now pounce." : "🐟 Pocket fish acquired");
      if (count === 3 && !surpriseTriggered) triggerSurprise();
    }
  });
  if (!won && Math.hypot(player.x - mouse.x, player.y - mouse.y) < 0.5) finishGame();
}

function triggerSurprise() {
  surpriseTriggered = true;
  paletteIndex = 1 + Math.floor(Math.random() * (palettes.length - 1));
  objective.textContent = "The maze is moon-charged!";
  showToast("✨ The moon sneezed! Secret portals woke up.");
}

function usePortal() {
  if (!surpriseTriggered || performance.now() < portalCooldown || portals.length < 2) return;
  const entrance = portals.findIndex((portal) => Math.hypot(player.x - portal.x, player.y - portal.y) < 0.38);
  if (entrance < 0) return;
  const exit = portals[1 - entrance];
  player.x = exit.x;
  player.y = exit.y;
  portalCooldown = performance.now() + 1100;
  shakeUntil = performance.now() + 260;
  burst(exit.x, exit.y, exit.color, 18);
  playSound("portal");
  showToast("🌀 Whisker wormhole!");
}

function finishGame() {
  won = true;
  playing = false;
  game.dataset.state = "end";
  mouse.state = "caught";
  shakeUntil = performance.now() + 650;
  burst(mouse.x, mouse.y, "#ff7d9c", 30);
  playSound("catch");
  const found = fish.filter(({ found }) => found).length;
  const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  document.querySelector("#end-title").textContent = found === fish.length ? "Snack master!" : "A purrfect pursuit";
  document.querySelector("#result").textContent = `${found}/${fish.length} fish · ${seconds}s · ${Math.floor(steps * 2)} pawsteps`;
  window.setTimeout(() => {
    endScreen.hidden = false;
    document.querySelector("#play-again").focus();
  }, 350);
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function sniff() {
  const now = performance.now();
  if (!playing || won || now < sniffReadyAt) return;
  sniffUntil = performance.now() + 3000;
  sniffReadyAt = now + 6500;
  playSound("sniff");
  showToast("👃 Moon-scent trail revealed!");
}

function dash() {
  const now = performance.now();
  if (!playing || won || now < dashReadyAt) return;
  dashUntil = now + 750;
  dashReadyAt = now + 2600;
  shakeUntil = now + 180;
  dashButton.classList.add("active");
  burst(player.x, player.y, "#6ee7ff", 14);
  playSound("dash");
  window.setTimeout(() => dashButton.classList.remove("active"), 750);
  showToast("⚡ Midnight zoomies!");
}

function layout() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const controlsSpace = Math.min(155, height * 0.2);
  const availableHeight = Math.max(280, height - controlsSpace - 70);
  const tileWidth = Math.max(24, Math.min(width / (MAP_SIZE + 1.8), availableHeight / (MAP_SIZE * 0.52 + 1.8)));
  const tileHeight = tileWidth * 0.52;
  const boardHeight = MAP_SIZE * tileHeight;
  return {
    width,
    height,
    tileWidth,
    tileHeight,
    wallHeight: tileWidth * 0.48,
    originX: width / 2,
    originY: Math.max(76, (availableHeight - boardHeight) / 2 + 64),
  };
}

function project(x, y, board) {
  return {
    x: board.originX + (x - y) * board.tileWidth / 2,
    y: board.originY + (x + y) * board.tileHeight / 2,
  };
}

function diamond(x, y, board, fill) {
  const halfWidth = board.tileWidth / 2;
  const halfHeight = board.tileHeight / 2;
  context.beginPath();
  context.moveTo(x, y - halfHeight);
  context.lineTo(x + halfWidth, y);
  context.lineTo(x, y + halfHeight);
  context.lineTo(x - halfWidth, y);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
}

function drawWall(x, y, board, palette) {
  const center = project(x + 0.5, y + 0.5, board);
  const halfWidth = board.tileWidth / 2;
  const halfHeight = board.tileHeight / 2;
  const raisedY = center.y - board.wallHeight;

  context.beginPath();
  context.moveTo(center.x - halfWidth, center.y);
  context.lineTo(center.x, center.y + halfHeight);
  context.lineTo(center.x, raisedY + halfHeight);
  context.lineTo(center.x - halfWidth, raisedY);
  context.closePath();
  context.fillStyle = palette.left;
  context.fill();

  context.beginPath();
  context.moveTo(center.x + halfWidth, center.y);
  context.lineTo(center.x, center.y + halfHeight);
  context.lineTo(center.x, raisedY + halfHeight);
  context.lineTo(center.x + halfWidth, raisedY);
  context.closePath();
  context.fillStyle = palette.right;
  context.fill();
  diamond(center.x, raisedY, board, palette.top);

  context.strokeStyle = "rgba(255,255,255,.12)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(center.x, raisedY - halfHeight);
  context.lineTo(center.x + halfWidth, raisedY);
  context.stroke();
}

function drawPortal(portal, board, now) {
  const point = project(portal.x, portal.y, board);
  const pulse = 0.72 + Math.sin(now / 180) * 0.14;
  context.save();
  context.translate(point.x, point.y - board.tileHeight * 0.18);
  context.scale(1, 0.48);
  context.strokeStyle = portal.color;
  context.lineWidth = Math.max(2, board.tileWidth * 0.08);
  context.shadowColor = portal.color;
  context.shadowBlur = 16;
  context.beginPath();
  context.arc(0, 0, board.tileWidth * 0.31 * pulse, 0, Math.PI * 1.65);
  context.stroke();
  context.restore();
}

function drawEmoji(item, emoji, board, now, scale = 0.58) {
  const point = project(item.x, item.y, board);
  const bob = Math.sin(now / 260 + (item.phase || 0)) * board.tileHeight * 0.12;
  context.save();
  context.textAlign = "center";
  context.textBaseline = "bottom";
  context.font = `${Math.max(18, board.tileWidth * scale)}px system-ui`;
  context.shadowColor = emoji === "🐟" ? "#ffd166" : "#ff7d9c";
  context.shadowBlur = 9;
  context.fillText(emoji, point.x, point.y - board.tileHeight * 0.1 + bob);
  context.restore();
}

function drawCat(board, now) {
  const point = project(player.x, player.y, board);
  const size = board.tileWidth * 0.54;
  const moving = Object.values(keys).some(Boolean) || Math.hypot(stick.x, stick.y) > 0.08;
  const stride = moving ? Math.sin(now / 90) : 0;
  const bounce = Math.abs(stride) * board.tileHeight * 0.08;
  const screenFacing = player.facingX - player.facingY;
  context.save();
  context.translate(point.x, point.y - size * 0.5 + bounce);
  context.scale(screenFacing < 0 ? -1 : 1, 1);
  context.shadowColor = "rgba(20,10,35,.55)";
  context.shadowBlur = 8;

  context.strokeStyle = "#b8522f";
  context.lineWidth = size * 0.12;
  context.lineCap = "round";
  context.beginPath();
  context.arc(-size * 0.25, size * 0.2, size * 0.42, 0.2, Math.PI * 1.3);
  context.stroke();

  for (const pair of [-1, 1]) {
    for (const side of [-1, 1]) {
      const legStride = side * pair * stride;
      const hipX = side * size * (0.18 + pair * 0.035);
      const hipY = size * (0.23 + pair * 0.025);
      const pawX = hipX + legStride * size * 0.15;
      const pawY = size * (0.47 - Math.abs(legStride) * 0.035);
      context.strokeStyle = pair < 0 ? "#d96f35" : "#f28b42";
      context.lineWidth = size * 0.12;
      context.beginPath();
      context.moveTo(hipX, hipY);
      context.lineTo(pawX, pawY);
      context.stroke();
      context.fillStyle = "#fff4d8";
      context.beginPath();
      context.ellipse(pawX + legStride * size * 0.035, pawY,
        size * 0.09, size * 0.055, legStride * 0.2, 0, Math.PI * 2);
      context.fill();
    }
  }

  context.fillStyle = "#f28b42";
  context.beginPath();
  context.ellipse(0, size * 0.18, size * 0.34, size * 0.28, 0, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.moveTo(-size * 0.31, -size * 0.14);
  context.lineTo(-size * 0.24, -size * 0.48);
  context.lineTo(-size * 0.05, -size * 0.29);
  context.lineTo(size * 0.2, -size * 0.46);
  context.lineTo(size * 0.3, -size * 0.12);
  context.arc(0, -size * 0.1, size * 0.31, -0.1, Math.PI + 0.2, true);
  context.fill();

  context.fillStyle = "#fff4d8";
  context.beginPath();
  context.ellipse(size * 0.03, -size * 0.02, size * 0.2, size * 0.15, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#272038";
  context.beginPath();
  context.arc(-size * 0.1, -size * 0.15, size * 0.035, 0, Math.PI * 2);
  context.arc(size * 0.12, -size * 0.15, size * 0.035, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#df536d";
  context.beginPath();
  context.moveTo(-size * 0.03, -size * 0.04);
  context.lineTo(size * 0.07, -size * 0.04);
  context.lineTo(size * 0.02, size * 0.03);
  context.closePath();
  context.fill();
  context.restore();
}

function pathBetween(from, to) {
  const start = { x: Math.floor(from.x), y: Math.floor(from.y) };
  const goal = { x: Math.floor(to.x), y: Math.floor(to.y) };
  const queue = [start];
  const previous = new Map([[`${start.x},${start.y}`, null]]);
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.x === goal.x && current.y === goal.y) break;
    directions.forEach(({ row, col }) => {
      const next = { x: current.x + col, y: current.y + row };
      const key = `${next.x},${next.y}`;
      if (map[next.y]?.[next.x] === 0 && !previous.has(key)) {
        previous.set(key, current);
        queue.push(next);
      }
    });
  }
  const path = [];
  let current = goal;
  while (current && previous.has(`${current.x},${current.y}`)) {
    path.push(current);
    current = previous.get(`${current.x},${current.y}`);
  }
  return path.reverse();
}

function findPath() {
  return pathBetween(player, mouse);
}

function chooseMouseEscape() {
  const cells = openCellsByDistance();
  const choices = cells
    .filter((cell) => Math.hypot(cell.x + 0.5 - player.x, cell.y + 0.5 - player.y) > 3.2)
    .map((cell) => ({
      ...cell,
      score: Math.hypot(cell.x + 0.5 - player.x, cell.y + 0.5 - player.y) * 2 +
        Math.hypot(cell.x + 0.5 - mouse.x, cell.y + 0.5 - mouse.y) * 0.22 +
        Math.random() * 1.8,
    }))
    .sort((first, second) => second.score - first.score);
  return choices[0] || cells[cells.length - 1];
}

function updateMouse(delta, now) {
  if (won) return;
  const distance = Math.hypot(player.x - mouse.x, player.y - mouse.y);
  const alertRadius = surpriseTriggered ? 4.8 : 4.1;
  const wasFleeing = mouse.state === "fleeing";
  if (distance < alertRadius) mouse.state = "fleeing";
  else if (distance > alertRadius + 1.2) mouse.state = "hiding";

  if (mouse.state === "fleeing" && !wasFleeing) {
    mouse.path = [];
    mouse.repathAt = 0;
    burst(mouse.x, mouse.y, "#ff7d9c", 9);
    playSound("squeak");
    showToast(mouseWasAlerted ? "🐭 The mouse heard you again!" : "🐭 Spotted! Corner the moon mouse!");
    mouseWasAlerted = true;
  }

  if (mouse.state === "fleeing" &&
      (mouse.pathIndex >= mouse.path.length || now >= mouse.repathAt)) {
    const target = chooseMouseEscape();
    mouse.path = pathBetween(mouse, { x: target.x + 0.5, y: target.y + 0.5 });
    mouse.pathIndex = Math.min(1, mouse.path.length);
    mouse.repathAt = now + 1250;
  }

  if (mouse.state === "fleeing" && mouse.pathIndex < mouse.path.length) {
    const cell = mouse.path[mouse.pathIndex];
    const targetX = cell.x + 0.5;
    const targetY = cell.y + 0.5;
    const dx = targetX - mouse.x;
    const dy = targetY - mouse.y;
    const length = Math.hypot(dx, dy);
    const speed = surpriseTriggered ? 1.42 : 1.28;
    if (length < 0.06) {
      mouse.pathIndex += 1;
    } else {
      const travel = Math.min(length, speed * delta);
      mouse.x += dx / length * travel;
      mouse.y += dy / length * travel;
      mouse.facingX = dx / length;
      mouse.facingY = dy / length;
    }
  }

  const closeness = Math.max(0, Math.min(1, 1 - distance / 8));
  proximityFill.style.width = `${Math.round(closeness * 100)}%`;
  if (distance < 1.4) {
    objective.textContent = "Pounce!";
    mouseStatus.textContent = "Almost in paw's reach";
  } else if (mouse.state === "fleeing") {
    objective.textContent = "The moon mouse is running!";
    mouseStatus.textContent = distance < 3 ? "Close—cut it off!" : "Follow those tiny paws";
  } else {
    objective.textContent = "Find the moon mouse";
    mouseStatus.textContent = distance < 6 ? "You hear a squeak…" : "Quiet paws…";
  }

  if (distance < 0.52) finishGame();
}

function drawEffects(board, delta) {
  effects = effects.filter((effect) => {
    effect.age += delta;
    if (effect.age >= effect.life) return false;
    const point = project(effect.x, effect.y, board);
    const fade = 1 - effect.age / effect.life;
    context.globalAlpha = fade;
    context.fillStyle = effect.color;
    context.beginPath();
    context.arc(
      point.x + effect.vx * effect.age,
      point.y + effect.vy * effect.age + 45 * effect.age * effect.age,
      effect.size * fade,
      0,
      Math.PI * 2,
    );
    context.fill();
    return true;
  });
  context.globalAlpha = 1;
}

function drawScentTrail(board, now) {
  if (now >= sniffUntil) return;
  const path = findPath().slice(1);
  context.save();
  context.fillStyle = "#ff77bd";
  context.shadowColor = "#ff77bd";
  context.shadowBlur = 10;
  path.forEach((cell, index) => {
    if (index % 2) return;
    const point = project(cell.x + 0.5, cell.y + 0.5, board);
    const pulse = 0.7 + Math.sin(now / 150 + index) * 0.25;
    context.globalAlpha = Math.max(0.2, 0.9 - index / path.length * 0.55);
    context.beginPath();
    context.arc(point.x, point.y - board.tileHeight * 0.12, Math.max(2, board.tileWidth * 0.06 * pulse), 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
}

function drawWorld(now, delta) {
  const board = layout();
  const palette = palettes[paletteIndex];
  const background = context.createLinearGradient(0, 0, 0, board.height);
  background.addColorStop(0, "#171936");
  background.addColorStop(1, "#0c0c1c");
  context.fillStyle = background;
  context.fillRect(0, 0, board.width, board.height);

  context.fillStyle = "rgba(255,255,255,.38)";
  for (let star = 0; star < 42; star += 1) {
    const x = (star * 193 + 41) % board.width;
    const y = (star * 71 + 29) % board.height;
    context.fillRect(x, y, star % 4 ? 1 : 2, star % 4 ? 1 : 2);
  }

  for (let depth = 0; depth <= (MAP_SIZE - 1) * 2; depth += 1) {
    for (let y = 0; y < MAP_SIZE; y += 1) {
      const x = depth - y;
      if (x < 0 || x >= MAP_SIZE) continue;
      const center = project(x + 0.5, y + 0.5, board);
      diamond(center.x, center.y, board, (x + y) % 2 ? palette.floorAlt : palette.floor);
      if (map[y][x] === 1) drawWall(x, y, board, palette);
    }
    fish.filter((item) => !item.found && Math.floor(item.x) + Math.floor(item.y) === depth)
      .forEach((item) => drawEmoji(item, "🐟", board, now));
    if (surpriseTriggered) {
      portals.filter((portal) => Math.floor(portal.x) + Math.floor(portal.y) === depth)
        .forEach((portal) => drawPortal(portal, board, now));
    }
  }
  drawScentTrail(board, now);
  drawEffects(board, delta);
  if (window.cat3D) {
    window.cat3D.render(
      player,
      mouse,
      board,
      now,
      playing && !won &&
        (Object.values(keys).some(Boolean) || Math.hypot(stick.x, stick.y) > 0.08),
      now < dashUntil,
    );
  } else {
    drawEmoji(mouse, "🐭", board, now, 0.66);
    drawCat(board, now);
  }
}

function resize() {
  const scale = Math.min(window.devicePixelRatio || 1, 1.75);
  canvas.width = Math.round(innerWidth * scale);
  canvas.height = Math.round(innerHeight * scale);
  context.setTransform(scale, 0, 0, scale, 0, 0);
}

function updateCompass() {
  const dx = mouse.x - player.x;
  const dy = mouse.y - player.y;
  const angle = Math.atan2((dx + dy) * 0.52, dx - dy) + Math.PI / 2;
  compass.style.transform = `rotate(${angle}rad)`;
}

function updateFeedback(now) {
  const dashRemaining = Math.max(0, dashReadyAt - now);
  const sniffRemaining = Math.max(0, sniffReadyAt - now);
  dashButton.classList.toggle("cooling", dashRemaining > 0);
  sniffButton.classList.toggle("cooling", sniffRemaining > 0);
  dashLabel.textContent = dashRemaining > 0 ? `${(dashRemaining / 1000).toFixed(1)}s` : "Zoom";
  sniffLabel.textContent = sniffRemaining > 0 ? `${Math.ceil(sniffRemaining / 1000)}s` : "Sniff";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shaking = !reducedMotion && now < shakeUntil;
  const x = shaking ? (Math.random() - 0.5) * 7 : 0;
  const y = shaking ? (Math.random() - 0.5) * 5 : 0;
  const scale = !reducedMotion && now < dashUntil ? 1.012 : 1;
  const transform = `translate(${x}px, ${y}px) scale(${scale})`;
  canvas.style.transform = transform;
  document.querySelector("#cat-layer").style.transform = transform;
}

function frame(now) {
  const delta = Math.min(0.04, (now - lastFrame) / 1000);
  lastFrame = now;
  if (playing && !won) {
    const horizontal = (keys.KeyD || keys.ArrowRight ? 1 : 0) -
      (keys.KeyA || keys.ArrowLeft ? 1 : 0) + stick.x;
    const vertical = (keys.KeyS || keys.ArrowDown ? 1 : 0) -
      (keys.KeyW || keys.ArrowUp ? 1 : 0) + stick.y;
    movePlayer(horizontal, vertical, delta);
    updateMouse(delta, now);
    updateCompass();
  }
  updateFeedback(now);
  drawWorld(now, delta);
  requestAnimationFrame(frame);
}

function begin() {
  intro.hidden = true;
  playing = true;
  game.dataset.state = "playing";
  showToast("🐾 The moon mouse is hiding on the board…");
}

function restart() {
  playing = true;
  intro.hidden = true;
  resetGame();
  showToast("🌙 The board shuffled while you blinked.");
}

function updateStick(event) {
  const bounds = joystick.getBoundingClientRect();
  const radius = bounds.width * 0.31;
  let x = event.clientX - bounds.left - bounds.width / 2;
  let y = event.clientY - bounds.top - bounds.height / 2;
  const length = Math.hypot(x, y);
  if (length > radius) {
    x = x / length * radius;
    y = y / length * radius;
  }
  stick = { x: x / radius, y: y / radius };
  joystickKnob.style.transform = `translate(${x}px, ${y}px)`;
}

joystick.addEventListener("pointerdown", (event) => {
  joystick.setPointerCapture(event.pointerId);
  updateStick(event);
});
joystick.addEventListener("pointermove", (event) => {
  if (joystick.hasPointerCapture(event.pointerId)) updateStick(event);
});
function releaseStick() {
  stick = { x: 0, y: 0 };
  joystickKnob.style.transform = "";
}
joystick.addEventListener("pointerup", releaseStick);
joystick.addEventListener("pointercancel", releaseStick);

document.addEventListener("keydown", (event) => {
  keys[event.code] = true;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
  if ((event.code === "Enter" || event.code === "Space") && !intro.hidden) begin();
  if (event.code === "ShiftLeft" || event.code === "ShiftRight" || event.code === "Space") dash();
  if (event.code === "KeyF") sniff();
});
document.addEventListener("keyup", (event) => { keys[event.code] = false; });
window.addEventListener("blur", () => { keys = {}; releaseStick(); });
window.addEventListener("resize", resize);
document.querySelector("#start").addEventListener("click", begin);
document.querySelector("#new-game").addEventListener("click", restart);
document.querySelector("#play-again").addEventListener("click", restart);
document.querySelector("#dash").addEventListener("pointerdown", dash);
document.querySelector("#sniff").addEventListener("pointerdown", sniff);

resize();
resetGame();
requestAnimationFrame(frame);
