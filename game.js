"use strict";

const canvas = document.querySelector("#maze");
const context = canvas.getContext("2d");
const timerElement = document.querySelector("#timer");
const stepsElement = document.querySelector("#steps");
const messageElement = document.querySelector("#message");
const dialog = document.querySelector("#win-dialog");
const resultElement = document.querySelector("#result");
const playAgainButton = document.querySelector("#play-again");

const GRID_SIZE = 15;
const directions = {
  up: { row: -1, col: 0, wall: 0, opposite: 2 },
  right: { row: 0, col: 1, wall: 1, opposite: 3 },
  down: { row: 1, col: 0, wall: 2, opposite: 0 },
  left: { row: 0, col: -1, wall: 3, opposite: 1 },
};

let maze = [];
let cat = { row: 0, col: 0 };
let mouse = { row: GRID_SIZE - 1, col: GRID_SIZE - 1 };
let steps = 0;
let startedAt = 0;
let elapsed = 0;
let timerHandle;
let gameWon = false;
let swipeStart;

function shuffle(values) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[randomIndex]] = [values[randomIndex], values[index]];
  }
  return values;
}

function generateMaze() {
  maze = Array.from({ length: GRID_SIZE }, (_, row) =>
    Array.from({ length: GRID_SIZE }, (_, col) => ({
      row,
      col,
      walls: [true, true, true, true],
      visited: false,
    })),
  );

  const stack = [maze[0][0]];
  maze[0][0].visited = true;

  while (stack.length) {
    const current = stack[stack.length - 1];
    const available = shuffle(Object.values(directions).slice()).filter(({ row, col }) => {
      const nextRow = current.row + row;
      const nextCol = current.col + col;
      return (
        nextRow >= 0 &&
        nextRow < GRID_SIZE &&
        nextCol >= 0 &&
        nextCol < GRID_SIZE &&
        !maze[nextRow][nextCol].visited
      );
    });

    if (!available.length) {
      stack.pop();
      continue;
    }

    const nextDirection = available[0];
    const next = maze[current.row + nextDirection.row][current.col + nextDirection.col];
    current.walls[nextDirection.wall] = false;
    next.walls[nextDirection.opposite] = false;
    next.visited = true;
    stack.push(next);
  }

  mouse = findFarthestCell();
}

function findFarthestCell() {
  const queue = [{ row: 0, col: 0, distance: 0 }];
  const visited = new Set(["0,0"]);
  let farthest = queue[0];
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;
    if (current.distance > farthest.distance) farthest = current;

    Object.values(directions).forEach((direction) => {
      const nextRow = current.row + direction.row;
      const nextCol = current.col + direction.col;
      const key = `${nextRow},${nextCol}`;
      if (
        !maze[current.row][current.col].walls[direction.wall] &&
        !visited.has(key)
      ) {
        visited.add(key);
        queue.push({ row: nextRow, col: nextCol, distance: current.distance + 1 });
      }
    });
  }

  return { row: farthest.row, col: farthest.col };
}

function resizeCanvas() {
  const displaySize = canvas.clientWidth;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(displaySize * scale);
  canvas.height = Math.round(displaySize * scale);
  context.setTransform(scale, 0, 0, scale, 0, 0);
  draw();
}

function drawRoundedRect(x, y, width, height, radius, fill) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
}

function draw() {
  const size = canvas.clientWidth;
  if (!size || !maze.length) return;
  const cellSize = size / GRID_SIZE;

  context.clearRect(0, 0, size, size);
  context.fillStyle = "#f7e8c9";
  context.fillRect(0, 0, size, size);

  context.fillStyle = "#eed7ae";
  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      if ((row + col) % 2 === 0) {
        context.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
      }
    }
  }

  const goalX = mouse.col * cellSize;
  const goalY = mouse.row * cellSize;
  drawRoundedRect(
    goalX + cellSize * 0.12,
    goalY + cellSize * 0.12,
    cellSize * 0.76,
    cellSize * 0.76,
    cellSize * 0.18,
    "#f5cbd0",
  );

  context.strokeStyle = "#55466f";
  context.lineWidth = Math.max(2, cellSize * 0.12);
  context.lineCap = "round";
  context.beginPath();
  maze.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const x = colIndex * cellSize;
      const y = rowIndex * cellSize;
      if (cell.walls[0]) { context.moveTo(x, y); context.lineTo(x + cellSize, y); }
      if (cell.walls[1]) { context.moveTo(x + cellSize, y); context.lineTo(x + cellSize, y + cellSize); }
      if (cell.walls[2]) { context.moveTo(x, y + cellSize); context.lineTo(x + cellSize, y + cellSize); }
      if (cell.walls[3]) { context.moveTo(x, y); context.lineTo(x, y + cellSize); }
    });
  });
  context.stroke();

  drawMouse(goalX + cellSize / 2, goalY + cellSize / 2, cellSize);
  drawCat(cat.col * cellSize + cellSize / 2, cat.row * cellSize + cellSize / 2, cellSize);
}

function drawMouse(x, y, size) {
  context.save();
  context.translate(x, y);
  context.fillStyle = "#9a91a3";
  context.beginPath();
  context.arc(-size * 0.22, -size * 0.19, size * 0.17, 0, Math.PI * 2);
  context.moveTo(size * 0.39, -size * 0.19);
  context.arc(size * 0.22, -size * 0.19, size * 0.17, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#686071";
  context.beginPath();
  context.ellipse(0, size * 0.03, size * 0.33, size * 0.27, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#fff";
  context.beginPath();
  context.arc(-size * 0.1, -size * 0.02, size * 0.045, 0, Math.PI * 2);
  context.moveTo(size * 0.145, -size * 0.02);
  context.arc(size * 0.1, -size * 0.02, size * 0.045, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#ee7280";
  context.beginPath();
  context.arc(0, size * 0.12, size * 0.055, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawCat(x, y, size) {
  context.save();
  context.translate(x, y);
  context.fillStyle = "#e98636";
  context.beginPath();
  context.moveTo(-size * 0.32, -size * 0.15);
  context.lineTo(-size * 0.25, -size * 0.42);
  context.lineTo(-size * 0.08, -size * 0.26);
  context.lineTo(size * 0.08, -size * 0.26);
  context.lineTo(size * 0.25, -size * 0.42);
  context.lineTo(size * 0.32, -size * 0.15);
  context.arc(0, 0, size * 0.34, -0.2, Math.PI + 0.2, true);
  context.fill();
  context.fillStyle = "#fff8db";
  context.beginPath();
  context.ellipse(0, size * 0.08, size * 0.24, size * 0.19, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#3d3748";
  context.beginPath();
  context.arc(-size * 0.12, -size * 0.05, size * 0.045, 0, Math.PI * 2);
  context.moveTo(size * 0.165, -size * 0.05);
  context.arc(size * 0.12, -size * 0.05, size * 0.045, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#d85f69";
  context.beginPath();
  context.moveTo(-size * 0.06, size * 0.08);
  context.lineTo(size * 0.06, size * 0.08);
  context.lineTo(0, size * 0.15);
  context.closePath();
  context.fill();
  context.restore();
}

function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function startTimer() {
  if (startedAt) return;
  startedAt = Date.now();
  timerHandle = window.setInterval(() => {
    elapsed = Date.now() - startedAt;
    timerElement.textContent = formatTime(elapsed);
  }, 250);
}

function move(directionName) {
  if (gameWon) return;
  const direction = directions[directionName];
  if (!direction) return;
  startTimer();

  const cell = maze[cat.row][cat.col];
  if (cell.walls[direction.wall]) {
    messageElement.textContent = "That way is blocked!";
    return;
  }

  cat.row += direction.row;
  cat.col += direction.col;
  steps += 1;
  stepsElement.textContent = String(steps);
  messageElement.textContent = "Keep going, Mochi!";
  draw();

  if (cat.row === mouse.row && cat.col === mouse.col) win();
}

function win() {
  gameWon = true;
  elapsed = startedAt ? Date.now() - startedAt : 0;
  window.clearInterval(timerHandle);
  timerElement.textContent = formatTime(elapsed);
  messageElement.textContent = "Mouse found!";
  resultElement.textContent = `${steps} steps · ${formatTime(elapsed)}`;
  window.setTimeout(() => {
    dialog.hidden = false;
    playAgainButton.focus();
  }, 180);
}

function newGame() {
  window.clearInterval(timerHandle);
  generateMaze();
  cat = { row: 0, col: 0 };
  steps = 0;
  startedAt = 0;
  elapsed = 0;
  gameWon = false;
  stepsElement.textContent = "0";
  timerElement.textContent = "0:00";
  messageElement.textContent = "Help Mochi find the mouse!";
  dialog.hidden = true;
  draw();
}

document.querySelectorAll(".move").forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.classList.add("is-pressed");
    move(button.dataset.direction);
  });
  button.addEventListener("pointerup", () => button.classList.remove("is-pressed"));
  button.addEventListener("pointercancel", () => button.classList.remove("is-pressed"));
});

document.addEventListener("keydown", (event) => {
  const keyDirections = {
    ArrowUp: "up", w: "up", W: "up",
    ArrowRight: "right", d: "right", D: "right",
    ArrowDown: "down", s: "down", S: "down",
    ArrowLeft: "left", a: "left", A: "left",
  };
  if (keyDirections[event.key]) {
    event.preventDefault();
    move(keyDirections[event.key]);
  }
});

canvas.addEventListener("pointerdown", (event) => {
  swipeStart = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointerup", (event) => {
  if (!swipeStart) return;
  const xDistance = event.clientX - swipeStart.x;
  const yDistance = event.clientY - swipeStart.y;
  swipeStart = undefined;
  if (Math.max(Math.abs(xDistance), Math.abs(yDistance)) < 20) return;
  if (Math.abs(xDistance) > Math.abs(yDistance)) {
    move(xDistance > 0 ? "right" : "left");
  } else {
    move(yDistance > 0 ? "down" : "up");
  }
});

document.querySelector("#new-game").addEventListener("click", newGame);
playAgainButton.addEventListener("click", newGame);
window.addEventListener("resize", resizeCanvas);

generateMaze();
requestAnimationFrame(resizeCanvas);
