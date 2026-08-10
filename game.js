"use strict";

const canvas = document.querySelector("#maze");
const context = canvas.getContext("2d", { alpha: false });
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

const CELL_COUNT = 8;
const MAP_SIZE = CELL_COUNT * 2 + 1;
const FOV = Math.PI / 2.9;
const WALL_COLORS = [
  [113, 85, 170],
  [63, 116, 139],
  [157, 77, 113],
  [93, 122, 80],
];
const directions = [
  { row: -1, col: 0 },
  { row: 0, col: 1 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
];

let map = [];
let player = { x: 1.5, y: 1.5, angle: 0 };
let mouse = { x: 0, y: 0, emoji: "🐭" };
let fish = [];
let keys = {};
let stick = { x: 0, y: 0 };
let playing = false;
let won = false;
let steps = 0;
let startedAt = 0;
let lastFrame = performance.now();
let dashUntil = 0;
let sniffUntil = 0;
let toastTimer;
let dragLook;
let surpriseTriggered = false;

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
      return nextRow >= 0 && nextRow < CELL_COUNT && nextCol >= 0 && nextCol < CELL_COUNT && !visited[nextRow][nextCol];
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
  mouse = { x: farthest.x + 0.5, y: farthest.y + 0.5, emoji: Math.random() < 0.18 ? "🦄" : "🐭" };
  const candidates = openCells.slice(8, -4).filter((_, index) => index % 4 === 0);
  fish = shuffle(candidates).slice(0, 6).map((cell, index) => ({
    x: cell.x + 0.5,
    y: cell.y + 0.5,
    found: false,
    phase: index * 0.8,
  }));
  player = { x: 1.5, y: 1.5, angle: 0 };
  steps = 0;
  startedAt = 0;
  won = false;
  surpriseTriggered = false;
  stepsElement.textContent = "0";
  fishCount.textContent = "0";
  fishTotal.textContent = String(fish.length);
  objective.textContent = "Find the moon mouse";
  endScreen.hidden = true;
  game.dataset.state = playing ? "playing" : "intro";
}

function isWall(x, y) {
  return map[Math.floor(y)]?.[Math.floor(x)] !== 0;
}

function canStand(x, y) {
  const radius = 0.19;
  return !isWall(x - radius, y - radius) && !isWall(x + radius, y - radius) &&
    !isWall(x - radius, y + radius) && !isWall(x + radius, y + radius);
}

function movePlayer(forward, strafe, turn, delta) {
  player.angle += turn * delta * 2.05;
  const boost = performance.now() < dashUntil ? 2 : 1;
  const speed = delta * 2.05 * boost;
  const dx = (Math.cos(player.angle) * forward + Math.cos(player.angle + Math.PI / 2) * strafe) * speed;
  const dy = (Math.sin(player.angle) * forward + Math.sin(player.angle + Math.PI / 2) * strafe) * speed;
  const oldX = player.x;
  const oldY = player.y;
  if (canStand(player.x + dx, player.y)) player.x += dx;
  if (canStand(player.x, player.y + dy)) player.y += dy;
  const travelled = Math.hypot(player.x - oldX, player.y - oldY);
  if (travelled > 0) {
    steps += travelled;
    stepsElement.textContent = String(Math.floor(steps * 2));
    if (!startedAt) startedAt = Date.now();
    collectNearby();
  }
}

function collectNearby() {
  fish.forEach((item) => {
    if (!item.found && Math.hypot(player.x - item.x, player.y - item.y) < 0.48) {
      item.found = true;
      const count = fish.filter(({ found }) => found).length;
      fishCount.textContent = String(count);
      showToast(count === fish.length ? "🐟 Every snack found! Legendary whiskers." : "🐟 Pocket fish acquired");
      if (count === 3 && !surpriseTriggered) triggerSurprise();
    }
  });
  if (!won && Math.hypot(player.x - mouse.x, player.y - mouse.y) < 0.52) finishGame();
}

function triggerSurprise() {
  surpriseTriggered = true;
  mouse.emoji = "🦄";
  showToast("✨ Plot twist: that mouse is wearing a unicorn hat!");
  objective.textContent = "Catch the suspicious unicorn mouse";
}

function finishGame() {
  won = true;
  playing = false;
  game.dataset.state = "end";
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
  if (!playing || won) return;
  sniffUntil = performance.now() + 2800;
  const angle = angleTo(mouse.x, mouse.y);
  const difference = normalizeAngle(angle - player.angle);
  const direction = Math.abs(difference) < 0.45 ? "straight ahead" : difference > 0 ? "to your right" : "to your left";
  showToast(`👃 Squeak detected ${direction}! Follow the pink glow.`);
}

function dash() {
  if (!playing || won) return;
  dashUntil = performance.now() + 900;
  document.querySelector("#dash").classList.add("active");
  window.setTimeout(() => document.querySelector("#dash").classList.remove("active"), 900);
  showToast("⚡ Midnight zoomies!");
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function angleTo(x, y) {
  return Math.atan2(y - player.y, x - player.x);
}

function castRay(angle) {
  const rayX = Math.cos(angle);
  const rayY = Math.sin(angle);
  let mapX = Math.floor(player.x);
  let mapY = Math.floor(player.y);
  const deltaX = Math.abs(1 / (rayX || 0.00001));
  const deltaY = Math.abs(1 / (rayY || 0.00001));
  const stepX = rayX < 0 ? -1 : 1;
  const stepY = rayY < 0 ? -1 : 1;
  let sideX = rayX < 0 ? (player.x - mapX) * deltaX : (mapX + 1 - player.x) * deltaX;
  let sideY = rayY < 0 ? (player.y - mapY) * deltaY : (mapY + 1 - player.y) * deltaY;
  let side = 0;
  while (map[mapY]?.[mapX] === 0) {
    if (sideX < sideY) {
      sideX += deltaX;
      mapX += stepX;
      side = 0;
    } else {
      sideY += deltaY;
      mapY += stepY;
      side = 1;
    }
  }
  const distance = side === 0
    ? (mapX - player.x + (1 - stepX) / 2) / rayX
    : (mapY - player.y + (1 - stepY) / 2) / rayY;
  const hit = side === 0 ? player.y + distance * rayY : player.x + distance * rayX;
  return { distance: Math.max(0.01, distance), side, texture: hit - Math.floor(hit), mapX, mapY };
}

function drawWorld(now) {
  const width = canvas.width;
  const height = canvas.height;
  const horizon = height * 0.47;
  const sky = context.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#11152f");
  sky.addColorStop(1, "#4f396b");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, horizon);
  const floor = context.createLinearGradient(0, horizon, 0, height);
  floor.addColorStop(0, "#332a45");
  floor.addColorStop(1, "#100e1c");
  context.fillStyle = floor;
  context.fillRect(0, horizon, width, height - horizon);

  context.fillStyle = "rgba(255,255,255,.22)";
  for (let star = 0; star < 35; star += 1) {
    const x = (star * 193 + 41) % width;
    const y = (star * 71 + 29) % Math.max(1, horizon * 0.8);
    context.fillRect(x, y, 1.5, 1.5);
  }

  const columns = Math.min(width, 720);
  const columnWidth = width / columns;
  const depthBuffer = new Array(columns);
  for (let column = 0; column < columns; column += 1) {
    const camera = (column / columns - 0.5) * FOV;
    const ray = castRay(player.angle + camera);
    const distance = ray.distance * Math.cos(camera);
    depthBuffer[column] = distance;
    const wallHeight = Math.min(height * 1.8, height / distance);
    const top = horizon - wallHeight / 2;
    const color = WALL_COLORS[Math.abs(ray.mapX + ray.mapY * 3) % WALL_COLORS.length];
    const shade = Math.max(0.28, 1 - distance / 18) * (ray.side ? 0.77 : 1);
    const mortar = ray.texture < 0.045 || ray.texture > 0.955;
    context.fillStyle = mortar ? `rgb(${color.map((value) => Math.round(value * shade * 0.48)).join(",")})`
      : `rgb(${color.map((value) => Math.round(value * shade)).join(",")})`;
    context.fillRect(column * columnWidth, top, columnWidth + 1, wallHeight);
    context.fillStyle = `rgba(255,255,255,${Math.max(0, 0.06 - distance * 0.003)})`;
    context.fillRect(column * columnWidth, top, columnWidth + 1, Math.max(1, wallHeight * 0.018));
  }

  const sprites = fish.filter(({ found }) => !found).map((item) => ({ ...item, emoji: "🐟", scale: 0.72 }))
    .concat([{ ...mouse, scale: 1.02 }])
    .sort((a, b) => Math.hypot(player.x - b.x, player.y - b.y) - Math.hypot(player.x - a.x, player.y - a.y));
  sprites.forEach((sprite) => drawSprite(sprite, depthBuffer, columns, now));

  if (performance.now() < sniffUntil) {
    const glow = context.createRadialGradient(width / 2, horizon, 10, width / 2, horizon, width * 0.45);
    glow.addColorStop(0, "rgba(255,125,156,.18)");
    glow.addColorStop(1, "rgba(255,125,156,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);
  }
}

function drawSprite(sprite, depthBuffer, columns, now) {
  const dx = sprite.x - player.x;
  const dy = sprite.y - player.y;
  const distance = Math.hypot(dx, dy);
  const relative = normalizeAngle(Math.atan2(dy, dx) - player.angle);
  if (Math.abs(relative) > FOV * 0.72 || distance < 0.18) return;
  const screenX = canvas.width * (0.5 + relative / FOV);
  const size = Math.min(canvas.height * 0.72, canvas.height / distance * sprite.scale);
  const column = Math.floor(screenX / canvas.width * columns);
  if (depthBuffer[column] < distance - 0.35) return;
  const bob = Math.sin(now / 320 + (sprite.phase || 0)) * size * 0.055;
  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `${Math.max(18, size)}px system-ui`;
  context.shadowColor = sprite.emoji === "🐟" ? "#ffd166" : "#ff7d9c";
  context.shadowBlur = Math.max(10, size * (performance.now() < sniffUntil ? 0.42 : 0.2));
  context.fillText(sprite.emoji, screenX, canvas.height * 0.48 + size * 0.17 + bob);
  context.restore();
}

function resize() {
  const scale = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.round(innerWidth * scale);
  canvas.height = Math.round(innerHeight * scale);
}

function updateCompass() {
  const difference = normalizeAngle(angleTo(mouse.x, mouse.y) - player.angle);
  compass.style.transform = `rotate(${difference}rad)`;
}

function frame(now) {
  const delta = Math.min(0.04, (now - lastFrame) / 1000);
  lastFrame = now;
  if (playing && !won) {
    const forward = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - stick.y;
    const strafe = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    const turn = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0) + stick.x;
    movePlayer(forward, strafe, turn, delta);
    updateCompass();
  }
  drawWorld(now);
  requestAnimationFrame(frame);
}

function begin() {
  intro.hidden = true;
  playing = true;
  game.dataset.state = "playing";
  showToast("🐾 The moon mouse is somewhere ahead…");
}

function restart() {
  playing = true;
  intro.hidden = true;
  resetGame();
  showToast("🌙 The maze shuffled while you blinked.");
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

canvas.addEventListener("pointerdown", (event) => {
  dragLook = { pointerId: event.pointerId, x: event.clientX };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  if (!dragLook || dragLook.pointerId !== event.pointerId || !playing) return;
  player.angle += (event.clientX - dragLook.x) * 0.007;
  dragLook.x = event.clientX;
});
canvas.addEventListener("pointerup", () => { dragLook = undefined; });
canvas.addEventListener("pointercancel", () => { dragLook = undefined; });

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
