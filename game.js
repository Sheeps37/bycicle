const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const distanceEl = document.getElementById("distance");
const scoreEl = document.getElementById("score");
const speedEl = document.getElementById("speed");
const timeEl = document.getElementById("time");
const needleEl = document.getElementById("balanceNeedle");
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlayText");
const startButton = document.getElementById("startButton");
const toast = document.getElementById("toast");

const sprite = new Image();
sprite.decoding = "async";
const spriteSources = [
  "./assets/laoba-sprite-mobile.webp",
  "./assets/laoba-sprite-mobile.png",
  "./assets/laoba-cutout-trimmed.png",
  "./assets/laoba-cutout.png",
];
let spriteReady = false;
let spriteSourceIndex = 0;

const input = {
  left: false,
  right: false,
  pedal: false,
};

const state = {
  mode: "ready",
  width: 0,
  height: 0,
  dpr: 1,
  timeLeft: 60,
  elapsed: 0,
  distance: 0,
  score: 0,
  speed: 0,
  lean: 0,
  leanVelocity: 0,
  wobbleSeed: Math.random() * 100,
  combo: 0,
  crashTimer: 0,
  hitFlash: 0,
  nextObstacle: 22,
  obstacles: [],
  lastTime: performance.now(),
  toastTimer: 0,
};

const obstacleTypes = [
  { name: "brick", label: "砖缝", color: "#6f6658", kick: 30, speedLoss: 0.96, width: 150, height: 14 },
  { name: "bottle", label: "瓶子", color: "#2779a7", kick: 40, speedLoss: 0.94, width: 34, height: 58 },
  { name: "bump", label: "减速带", color: "#e85f44", kick: 34, speedLoss: 0.91, width: 210, height: 20 },
];

startButton.disabled = true;
startButton.textContent = "加载中";

function loadSprite() {
  sprite.onload = async () => {
    if (sprite.decode) {
      await sprite.decode().catch(() => {});
    }
    spriteReady = true;
    startButton.disabled = false;
    if (state.mode === "ready") startButton.textContent = "开始";
  };

  sprite.onerror = () => {
    spriteSourceIndex += 1;
    if (spriteSourceIndex < spriteSources.length) {
      sprite.src = spriteSources[spriteSourceIndex];
      return;
    }
    startButton.textContent = "素材失败";
    overlayText.textContent = "图片素材没有加载成功，刷新页面再试。";
    showToast("素材加载失败", 2);
  };

  sprite.src = spriteSources[spriteSourceIndex];
}

function tryStartGame() {
  if (!spriteReady) {
    showToast("素材加载中", 0.8);
    return;
  }
  resetGame();
}

function resize() {
  state.dpr = Math.min(window.devicePixelRatio || 1, 2);
  state.width = Math.max(320, window.innerWidth);
  state.height = Math.max(520, window.innerHeight);
  canvas.width = Math.round(state.width * state.dpr);
  canvas.height = Math.round(state.height * state.dpr);
  canvas.style.width = `${state.width}px`;
  canvas.style.height = `${state.height}px`;
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
}

function resetGame() {
  state.mode = "playing";
  state.timeLeft = 60;
  state.elapsed = 0;
  state.distance = 0;
  state.score = 0;
  state.speed = 5;
  state.lean = (Math.random() - 0.5) * 5;
  state.leanVelocity = 0;
  state.combo = 0;
  state.crashTimer = 0;
  state.hitFlash = 0;
  state.nextObstacle = 18;
  state.obstacles = [];
  state.wobbleSeed = Math.random() * 100;
  state.lastTime = performance.now();
  showToast("稳住", 0.8);
  overlay.classList.add("hidden");
}

function endGame(reason) {
  state.mode = "ended";
  canvas.classList.remove("shake");
  const dist = Math.floor(state.distance);
  const score = Math.floor(state.score);
  overlayText.textContent = reason === "crash"
    ? `老八飞了 ${dist} 米，拿到 ${score} 分。`
    : `老八撑满 60 秒，骑出 ${dist} 米，拿到 ${score} 分。`;
  startButton.textContent = "再来";
  overlay.classList.remove("hidden");
}

function showToast(text, duration = 1) {
  toast.textContent = text;
  toast.classList.add("show");
  state.toastTimer = duration;
}

function setTouchButton(id, key) {
  const button = document.getElementById(id);
  const on = (event) => {
    event.preventDefault();
    input[key] = true;
    button.classList.add("active");
    if (state.mode !== "playing") tryStartGame();
  };
  const off = (event) => {
    event.preventDefault();
    input[key] = false;
    button.classList.remove("active");
  };
  button.addEventListener("pointerdown", on);
  button.addEventListener("pointerup", off);
  button.addEventListener("pointercancel", off);
  button.addEventListener("pointerleave", off);
}

function spawnObstacle() {
  const type = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
  const lane = Math.floor(Math.random() * 3) - 1;
  state.obstacles.push({
    type,
    lane,
    distance: state.distance + 24 + Math.random() * 18,
    hit: false,
  });
  state.nextObstacle = state.distance + 12 + Math.random() * 18 + Math.max(0, 8 - state.speed);
}

function update(dt) {
  if (state.mode !== "playing") {
    updateHud();
    return;
  }

  state.timeLeft -= dt;
  state.elapsed += dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    endGame("time");
    return;
  }

  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const pedaling = input.pedal;
  const cruiseSpeed = Math.min(9, 5 + state.elapsed * 0.2);
  const targetSpeed = pedaling ? 10 : cruiseSpeed;
  const accel = pedaling ? 4.2 : 1.05;
  state.speed += (targetSpeed - state.speed) * Math.min(1, dt * accel);

  const wobble =
    Math.sin(performance.now() * 0.0031 + state.wobbleSeed) * (0.42 + state.speed * 0.08) +
    Math.sin(performance.now() * 0.0067 + state.wobbleSeed * 0.3) * 0.18;

  state.leanVelocity += wobble * dt * 17;
  state.leanVelocity += steer * dt * 104;
  state.leanVelocity += state.lean * dt * (0.52 + state.speed * 0.16);
  state.leanVelocity *= Math.pow(0.62, dt);
  state.lean += state.leanVelocity * dt;

  const maxLean = 34;
  state.lean = Math.max(-maxLean, Math.min(maxLean, state.lean));

  state.distance += state.speed * dt * 3.25;
  const danger = Math.max(0, Math.abs(state.lean) - 10);
  const speedBonus = Math.max(0, state.speed - 3);
  state.score += dt * (10 + state.speed * 5 + speedBonus * 7) * (danger < 8 ? 1 + state.combo * 0.015 : 0.8);

  if (Math.abs(state.lean) < 10 && state.speed > 4.8) {
    state.combo += dt;
    if (state.combo > 5) {
      state.score += 120;
      state.combo = 0;
      showToast("稳如老八", 0.9);
    }
  } else if (Math.abs(state.lean) > 18) {
    state.combo = Math.max(0, state.combo - dt * 2);
  }

  if (state.distance > state.nextObstacle) spawnObstacle();
  updateObstacles(dt);

  if (Math.abs(state.lean) > 26) {
    state.crashTimer += dt;
    if (state.crashTimer > 0.65) {
      endGame("crash");
      return;
    }
  } else {
    state.crashTimer = Math.max(0, state.crashTimer - dt * 2);
  }

  if (Math.abs(state.lean) > 21 && state.toastTimer <= 0) {
    showToast("要歪了", 0.45);
  }
  canvas.classList.toggle("shake", Math.abs(state.lean) > 24);

  state.hitFlash = Math.max(0, state.hitFlash - dt * 3);
  if (state.toastTimer > 0) {
    state.toastTimer -= dt;
    if (state.toastTimer <= 0) toast.classList.remove("show");
  }

  updateHud();
}

function updateObstacles() {
  for (const obstacle of state.obstacles) {
    const ahead = obstacle.distance - state.distance;
    if (!obstacle.hit && ahead < 1.2 && ahead > -1.8) {
      const laneInfluence = obstacle.lane * 0.45;
      const drift = Math.sin(state.distance * 0.08) * 0.25;
      const nearCenter = Math.abs(laneInfluence - drift) < 0.58 || obstacle.type.name !== "bottle";
      if (nearCenter) {
        obstacle.hit = true;
        const laneNudge = laneInfluence || Math.sin(state.distance * 1.7 + obstacle.distance);
        const direction = Math.sign(laneNudge || Math.random() - 0.5);
        const speedScale = 0.35 + Math.min(1, Math.max(0, (state.speed - 5) / 5)) * 0.65;
        state.leanVelocity += direction * obstacle.type.kick * speedScale;
        state.speed *= obstacle.type.speedLoss;
        state.hitFlash = 1;
        state.combo = 0;
        showToast(obstacle.type.label, 0.6);
      }
    }
  }
  state.obstacles = state.obstacles.filter((obstacle) => obstacle.distance - state.distance > -12);
}

function updateHud() {
  distanceEl.textContent = `${Math.max(0, Math.floor(state.distance))}m`;
  scoreEl.textContent = `${Math.max(0, Math.floor(state.score))}`;
  speedEl.textContent = state.speed.toFixed(1);
  timeEl.textContent = state.timeLeft.toFixed(1);
  const needle = Math.max(-1, Math.min(1, state.lean / 30));
  needleEl.style.left = `${50 + needle * 47}%`;
}

function draw() {
  const w = state.width;
  const h = state.height;
  ctx.clearRect(0, 0, w, h);
  drawBackground(w, h);
  drawRoad(w, h);
  drawObstacles(w, h);
  drawPlayer(w, h);
  drawForeground(w, h);
}

function drawBackground(w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.54);
  sky.addColorStop(0, "#cae2e9");
  sky.addColorStop(0.66, "#edf0dc");
  sky.addColorStop(1, "#d8d3bc");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#f5f1e8";
  for (let i = 0; i < 6; i++) {
    const x = ((i * 220 - state.distance * 18) % (w + 260)) - 120;
    const y = h * 0.13 + (i % 2) * 16;
    ctx.fillRect(x, y, 132, 120);
    ctx.fillStyle = "#9ca89b";
    ctx.fillRect(x + 12, y + 12, 35, 72);
    ctx.fillRect(x + 62, y + 12, 35, 72);
    ctx.fillStyle = "#f5f1e8";
  }
}

function drawRoad(w, h) {
  const top = h * 0.38;
  const bottom = h + 80;
  const road = ctx.createLinearGradient(0, top, 0, bottom);
  road.addColorStop(0, "#ded8c6");
  road.addColorStop(1, "#a99c89");
  ctx.fillStyle = road;
  ctx.beginPath();
  ctx.moveTo(w * 0.18, top);
  ctx.lineTo(w * 0.82, top);
  ctx.lineTo(w + 110, bottom);
  ctx.lineTo(-110, bottom);
  ctx.closePath();
  ctx.fill();

  const offset = (state.distance * 28) % 92;
  ctx.strokeStyle = "rgba(87, 76, 62, 0.28)";
  ctx.lineWidth = 2;
  for (let y = top - offset; y < h + 100; y += 46) {
    const t = (y - top) / (h - top);
    const left = w * (0.18 - t * 0.18);
    const right = w * (0.82 + t * 0.18);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }

  for (let i = -3; i <= 3; i++) {
    const xTop = w * 0.5 + i * w * 0.105;
    const xBottom = w * 0.5 + i * w * 0.19;
    ctx.beginPath();
    ctx.moveTo(xTop, top);
    ctx.lineTo(xBottom, bottom);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(232, 95, 68, 0.32)";
  ctx.fillRect(w * 0.78, top, Math.max(12, w * 0.018), h - top + 80);
}

function drawObstacles(w, h) {
  for (const obstacle of state.obstacles) {
    const ahead = obstacle.distance - state.distance;
    if (ahead < -5 || ahead > 32) continue;
    const depth = 1 - ahead / 32;
    const y = h * (0.43 + depth * 0.48);
    const scale = 0.32 + depth * 1.1;
    const laneWidth = w * (0.12 + depth * 0.12);
    const x = w * 0.5 + obstacle.lane * laneWidth + Math.sin(state.distance * 0.08) * laneWidth * 0.2;
    const type = obstacle.type;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = obstacle.hit ? 0.34 : 1;
    ctx.fillStyle = type.color;
    if (type.name === "bottle") {
      ctx.rotate(0.45);
      roundRect(ctx, -type.width / 2, -type.height, type.width, type.height, 8);
      ctx.fill();
      ctx.fillStyle = "#d5f3ff";
      ctx.fillRect(-8, -type.height - 10, 16, 12);
    } else {
      roundRect(ctx, -type.width / 2, -type.height / 2, type.width, type.height, 5);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      ctx.fillRect(-type.width / 2 + 10, -3, type.width - 20, 4);
    }
    ctx.restore();
  }
}

function drawPlayer(w, h) {
  const groundY = h * 0.89;
  const spriteHeight = Math.min(h * 0.76, w * 1.18, 720);
  const spriteWidth = spriteHeight * (695 / 1403);
  const bob = Math.sin(performance.now() * 0.018) * (2 + state.speed * 0.22);
  const x = w * 0.5 + Math.sin(state.distance * 0.08) * w * 0.035;
  const y = groundY + bob;
  const leanRad = (state.lean * Math.PI) / 180;
  const flash = state.hitFlash;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(leanRad);
  ctx.shadowColor = "rgba(23, 32, 24, 0.28)";
  ctx.shadowBlur = 20 + flash * 18;
  ctx.shadowOffsetY = 16;

  if (spriteReady && sprite.naturalWidth) {
    ctx.drawImage(sprite, -spriteWidth * 0.52, -spriteHeight, spriteWidth, spriteHeight);
  }
  ctx.restore();

  if (Math.abs(state.lean) > 18) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.5, (Math.abs(state.lean) - 18) / 18);
    ctx.strokeStyle = "#e85f44";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y - spriteHeight * 0.58, spriteWidth * 0.55, -0.7, 0.7);
    ctx.stroke();
    ctx.restore();
  }
}

function drawForeground(w, h) {
  if (state.mode === "playing") return;
  ctx.fillStyle = "rgba(23, 32, 24, 0.08)";
  ctx.fillRect(0, 0, w, h);
}

function roundRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
}

function loop(now) {
  const dt = Math.min(0.033, (now - state.lastTime) / 1000 || 0);
  state.lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  const controlKey =
    event.key === "ArrowLeft" ||
    event.key === "ArrowRight" ||
    event.key === "ArrowUp" ||
    event.key.toLowerCase() === "a" ||
    event.key.toLowerCase() === "d" ||
    event.key.toLowerCase() === "w" ||
    event.code === "Space" ||
    event.key === "Enter";
  if (controlKey) event.preventDefault();
  if (event.repeat) return;
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") input.left = true;
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") input.right = true;
  if (event.key === "ArrowUp" || event.key.toLowerCase() === "w" || event.code === "Space") input.pedal = true;
  if (event.key === "Enter" && state.mode !== "playing") tryStartGame();
});
window.addEventListener("keyup", (event) => {
  const controlKey =
    event.key === "ArrowLeft" ||
    event.key === "ArrowRight" ||
    event.key === "ArrowUp" ||
    event.key.toLowerCase() === "a" ||
    event.key.toLowerCase() === "d" ||
    event.key.toLowerCase() === "w" ||
    event.code === "Space";
  if (controlKey) event.preventDefault();
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") input.left = false;
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") input.right = false;
  if (event.key === "ArrowUp" || event.key.toLowerCase() === "w" || event.code === "Space") input.pedal = false;
});

startButton.addEventListener("click", tryStartGame);
setTouchButton("leftTouch", "left");
setTouchButton("rightTouch", "right");
setTouchButton("pedalTouch", "pedal");

loadSprite();
resize();
updateHud();
requestAnimationFrame(loop);
