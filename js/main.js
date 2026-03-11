const GAME_WIDTH = 380;
const GAME_HEIGHT = 680;
const CONTAINER_W = 300;
const CONTAINER_H = 352; // 変更: 440の0.8倍に高さを変更して難易度を上げる
const CONTAINER_BOTTOM_MARGIN = 90;
const CONTAINER_CENTER_Y =
  GAME_HEIGHT - CONTAINER_H / 2 - CONTAINER_BOTTOM_MARGIN;
const DEADLINE_Y = CONTAINER_CENTER_Y - CONTAINER_H / 2 + 50;
const DROP_Y = 130;

const EVOLUTION = [
  {
    radius: 18,
    color: '#FFFFFF',
    borderColor: '#5E3A21',
    label: '豆',
    score: 2,
  },
  {
    radius: 26,
    color: '#FDE68A',
    borderColor: '#5E3A21',
    label: '小',
    score: 4,
  },
  {
    radius: 36,
    color: '#FACC15',
    borderColor: '#5E3A21',
    label: '中',
    score: 8,
  },
  {
    radius: 46,
    color: '#FB923C',
    borderColor: '#5E3A21',
    label: '大',
    score: 16,
  },
  {
    radius: 58,
    color: '#F87171',
    borderColor: '#5E3A21',
    label: '特',
    score: 32,
  },
  {
    radius: 72,
    color: '#EC4899',
    borderColor: '#5E3A21',
    label: '苺',
    score: 64,
  },
  {
    radius: 88,
    color: 'rainbow',
    borderColor: '#5E3A21',
    label: '神',
    score: 150,
  },
];

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('nextCanvas');
const nextCtx = nextCanvas.getContext('2d');

const { Engine, Runner, Bodies, Composite, Events, Vector } = Matter;
let engine, world, runner;

let gameState = 'START';
let score = 0;
let bestScore = localStorage.getItem('pomEvoBest_v6') || 0;

let currentType = 0;
let nextType = 0;
let isDropping = false;
let currentX = GAME_WIDTH / 2;
let particles = [];
let sparkles = [];

// 魔法ゲージ関連
let magicPoints = 0;
const MAX_MAGIC_POINTS = 100;

let audioCtx, bgmTimer;
const melody = [
  { f: 392, d: 0.5 },
  { f: 330, d: 0.5 },
  { f: 261, d: 0.5 },
  { f: 330, d: 0.5 },
  { f: 392, d: 0.5 },
  { f: 440, d: 0.5 },
  { f: 392, d: 1.0 },
];
let noteIdx = 0,
  nextNoteTime = 0;

function resizeGame() {
  const wrapper = document.getElementById('game-wrapper');
  const container = document.getElementById('game-container');
  const winW = wrapper.clientWidth;
  const winH = wrapper.clientHeight;
  const scale = Math.min(winW / GAME_WIDTH, winH / GAME_HEIGHT);
  container.style.transform = `scale(${scale})`;
}

function initAudio() {
  if (!audioCtx)
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, type, dur, vol = 0.1, time = audioCtx.currentTime) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator(),
    gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(time);
  osc.stop(time + dur);
}

function startBGM() {
  if (gameState !== 'PLAYING') return;
  if (nextNoteTime < audioCtx.currentTime + 0.1) {
    const n = melody[noteIdx];
    playTone(n.f, 'triangle', n.d * 0.4, 0.03, nextNoteTime);
    nextNoteTime += n.d * 0.4;
    noteIdx = (noteIdx + 1) % melody.length;
  }
  bgmTimer = setTimeout(startBGM, 50);
}

function showCutin(text) {
  const container = document.getElementById('cutin-container');
  const textEl = document.getElementById('cutin-text');
  textEl.innerText = text;
  container.classList.remove('animate-cutin');
  void container.offsetWidth;
  container.classList.add('animate-cutin');
}

function init() {
  canvas.width = GAME_WIDTH;
  canvas.height = GAME_HEIGHT;
  document.getElementById('bestVal').innerText = bestScore;

  resizeGame();
  window.addEventListener('resize', resizeGame);

  engine = Engine.create();
  world = engine.world;
  engine.gravity.y = 1.4;

  runner = Runner.create();
  Runner.run(runner, engine);

  const chart = document.getElementById('evolution-chart');
  EVOLUTION.forEach((evo, i) => {
    const item = document.createElement('div');
    item.className = 'flex flex-col items-center gap-0.5 mx-0.5';
    const bg =
      evo.color === 'rainbow'
        ? 'linear-gradient(45deg, #FFADAD, #FFFF99, #A0C4FF)'
        : evo.color;
    item.innerHTML = `
            <div style="background:${bg}; width:24px; height:24px; border-radius:50%; border:2px solid ${evo.borderColor};"></div>
            <span class="text-[9px] font-black leading-none">${evo.label}</span>
        `;
    chart.appendChild(item);
    if (i < EVOLUTION.length - 1) {
      const arrow = document.createElement('div');
      arrow.innerHTML = '›';
      arrow.className = 'text-[12px] font-black opacity-30 mx-0.5';
      chart.appendChild(arrow);
    }
  });

  const wallOpt = {
    isStatic: true,
    friction: 0.1,
    restitution: 0.2,
    label: 'wall',
  };
  const containerX = GAME_WIDTH / 2;
  Composite.add(world, [
    Bodies.rectangle(
      containerX,
      CONTAINER_CENTER_Y + CONTAINER_H / 2 + 10,
      CONTAINER_W + 40,
      40,
      wallOpt,
    ),
    Bodies.rectangle(
      containerX - CONTAINER_W / 2 - 10,
      CONTAINER_CENTER_Y,
      20,
      CONTAINER_H + 40,
      wallOpt,
    ),
    Bodies.rectangle(
      containerX + CONTAINER_W / 2 + 10,
      CONTAINER_CENTER_Y,
      20,
      CONTAINER_H + 40,
      wallOpt,
    ),
  ]);

  Events.on(engine, 'collisionStart', handleCollision);
  requestAnimationFrame(render);

  document.getElementById('start-btn').onclick = startGame;
  document.getElementById('retry-btn').onclick = startGame;
  document.getElementById('magic-btn').onclick = (e) => {
    e.stopPropagation(); // バブリング防止
    useMagic();
  };

  const handleInput = (e) => {
    if (gameState !== 'PLAYING' || isDropping) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const rect = canvas.getBoundingClientRect();

    const relX = (clientX - rect.left) * (GAME_WIDTH / rect.width);
    const relY = (clientY - rect.top) * (GAME_HEIGHT / rect.height);

    // 【修正】UIエリアを少し広めに保護 (80 -> 120)
    if (relY < 120) return;

    const radius = EVOLUTION[currentType].radius;
    currentX = Math.max(
      containerX - CONTAINER_W / 2 + radius,
      Math.min(containerX + CONTAINER_W / 2 - radius, relX),
    );
    if (e.cancelable) e.preventDefault();
  };

  window.addEventListener('mousedown', handleInput);
  window.addEventListener('mousemove', handleInput);
  window.addEventListener('mouseup', (e) => {
    const rect = canvas.getBoundingClientRect();
    const relY = (e.clientY - rect.top) * (GAME_HEIGHT / rect.height);
    if (relY < 120) return; // 【修正】120に変更
    handleDrop();
  });
  window.addEventListener('touchstart', handleInput, { passive: false });
  window.addEventListener('touchmove', handleInput, { passive: false });
  window.addEventListener('touchend', (e) => {
    if (e.changedTouches && e.changedTouches[0]) {
      const rect = canvas.getBoundingClientRect();
      const relY =
        (e.changedTouches[0].clientY - rect.top) * (GAME_HEIGHT / rect.height);
      if (relY < 120) return; // 【修正】120に変更
    }
    handleDrop();
  });
}

function startGame() {
  initAudio();
  gameState = 'PLAYING';
  isDropping = false;
  currentX = GAME_WIDTH / 2;
  score = 0;
  updateScore(0);
  magicPoints = 0;
  updateMagicGauge();
  const allBodies = Composite.allBodies(world);
  allBodies.forEach((b) => {
    if (b.label === 'pudding') Composite.remove(world, b);
  });
  sparkles = [];
  document.getElementById('title-screen').classList.add('hidden');
  document.getElementById('gameover-screen').classList.add('hidden');
  document.getElementById('gameover-screen').style.opacity = 0;

  // 変更: ゲーム開始時に魔法ゲージを表示する
  document.getElementById('magic-container').classList.remove('hidden');

  currentType = Math.floor(Math.random() * 3);
  nextType = Math.floor(Math.random() * 3);
  updateNextPreview();
  nextNoteTime = audioCtx.currentTime;
  startBGM();
}

function updateNextPreview() {
  nextCtx.clearRect(0, 0, 48, 48);
  const config = EVOLUTION[nextType];
  drawPudding(nextCtx, 24, 24, 14, config.color, config.borderColor, 0);
}

function handleDrop() {
  if (gameState !== 'PLAYING' || isDropping) return;
  isDropping = true;
  // 【修正】100 を DROP_Y に変更
  const p = Bodies.circle(currentX, DROP_Y, EVOLUTION[currentType].radius, {
    restitution: 0.1,
    friction: 0.1,
    label: 'pudding',
    custom: {
      level: currentType,
      squish: 1.1,
      life: 0,
      dangerTime: 0,
      isProcessing: false,
    },
  });
  Composite.add(world, p);
  playTone(440, 'sine', 0.1, 0.04);
  setTimeout(() => {
    if (gameState !== 'PLAYING') return;
    currentType = nextType;
    nextType = Math.floor(Math.random() * 3);
    updateNextPreview();
    isDropping = false;
  }, 600);
}

function handleCollision(event) {
  event.pairs.forEach((pair) => {
    const a = pair.bodyA,
      b = pair.bodyB;
    if (a.label === 'pudding' && b.label === 'pudding') {
      if (
        a.custom.level === b.custom.level &&
        !a.custom.isProcessing &&
        !b.custom.isProcessing
      ) {
        const level = a.custom.level;
        const newX = (a.position.x + b.position.x) / 2;
        const newY = (a.position.y + b.position.y) / 2;

        a.custom.isProcessing = true;
        b.custom.isProcessing = true;

        if (level < EVOLUTION.length - 1) {
          const newLevel = level + 1;
          Composite.remove(world, [a, b]);
          const evolved = Bodies.circle(
            newX,
            newY,
            EVOLUTION[newLevel].radius,
            {
              restitution: 0.3,
              friction: 0.1,
              label: 'pudding',
              custom: {
                level: newLevel,
                squish: 1.5,
                life: 60,
                dangerTime: 0,
                isProcessing: false,
              },
            },
          );
          Composite.add(world, evolved);
          updateScore(EVOLUTION[newLevel].score);
          addMagicPoints(5 + newLevel * 2); // 合体で魔法ゲージを貯める

          if (newLevel === 6) {
            createSpecialParticles(newX, newY, 60);
            playTone(880, 'sine', 0.2, 0.1);
            playTone(1046, 'sine', 0.3, 0.1, audioCtx.currentTime + 0.1);
            showCutin('にじプリン だよ！');
          } else {
            createParticles(newX, newY, EVOLUTION[newLevel].color);
            playTone(523 + newLevel * 50, 'sine', 0.15, 0.08);
          }
        } else if (level === 6) {
          Composite.remove(world, [a, b]);
          updateScore(500);
          addMagicPoints(50);
          createSpecialParticles(newX, newY, 120);
          playTone(1046, 'square', 0.2, 0.1);
          playTone(1318, 'square', 0.2, 0.1, audioCtx.currentTime + 0.1);
          playTone(1567, 'square', 0.4, 0.1, audioCtx.currentTime + 0.2);
          showCutin('きらきら！ はじけたよ');
        }
      }
    }
  });
}

function updateScore(add) {
  score += add;
  document.getElementById('scoreVal').innerText = score;
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem('pomEvoBest_v6', bestScore);
    document.getElementById('bestVal').innerText = bestScore;
  }

  // 状況画像の切り替え（閾値はゲームバランスに合わせて適宜変更してください）
  const statusImg = document.getElementById('status-img');
  if (statusImg) {
    if (score >= 1000) {
      statusImg.src = 'assets/image/purin_late.png';
    } else if (score >= 300) {
      statusImg.src = 'assets/image/purin_mid.png';
    } else {
      statusImg.src = 'assets/image/purin_early.png';
    }
  }
}

// 魔法ゲージ処理
function addMagicPoints(pts) {
  magicPoints = Math.min(MAX_MAGIC_POINTS, magicPoints + pts);
  updateMagicGauge();
}

function updateMagicGauge() {
  const fill = document.getElementById('magic-gauge-fill');
  const btn = document.getElementById('magic-btn');
  const percent = (magicPoints / MAX_MAGIC_POINTS) * 100;
  fill.style.width = percent + '%'; // 横方向に変更
  if (percent >= 100) {
    btn.classList.add('ready');
    btn.classList.remove('disabled');
  } else {
    btn.classList.remove('ready');
    btn.classList.add('disabled');
  }
}

function useMagic() {
  if (magicPoints < MAX_MAGIC_POINTS || gameState !== 'PLAYING') return;
  magicPoints = 0;
  updateMagicGauge();

  const puddings = Composite.allBodies(world).filter(
    (b) => b.label === 'pudding',
  );
  const beans = puddings.filter((p) => p.custom.level === 0);

  beans.forEach((b) => {
    createParticles(b.position.x, b.position.y, '#FFFFFF');
    Composite.remove(world, b);
  });

  playTone(880, 'sine', 0.1, 0.1);
  playTone(1760, 'sine', 0.3, 0.05, audioCtx.currentTime + 0.05);
  showCutin('まめ消し 魔法！');
}

function render() {
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // 容器
  ctx.strokeStyle = '#5E3A21';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(
    (GAME_WIDTH - CONTAINER_W) / 2,
    CONTAINER_CENTER_Y - CONTAINER_H / 2,
  );
  ctx.lineTo(
    (GAME_WIDTH - CONTAINER_W) / 2,
    CONTAINER_CENTER_Y + CONTAINER_H / 2,
  );
  ctx.lineTo(
    (GAME_WIDTH + CONTAINER_W) / 2,
    CONTAINER_CENTER_Y + CONTAINER_H / 2,
  );
  ctx.lineTo(
    (GAME_WIDTH + CONTAINER_W) / 2,
    CONTAINER_CENTER_Y - CONTAINER_H / 2,
  );
  ctx.stroke();

  // 境界線
  ctx.setLineDash([5, 8]);
  ctx.strokeStyle = '#FCA5A5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo((GAME_WIDTH - CONTAINER_W) / 2, DEADLINE_Y);
  ctx.lineTo((GAME_WIDTH + CONTAINER_W) / 2, DEADLINE_Y);
  ctx.stroke();
  ctx.setLineDash([]);

  // プレビュー
  if (gameState === 'PLAYING' && !isDropping) {
    ctx.globalAlpha = 0.5;
    drawPudding(
      ctx,
      currentX,
      DROP_Y, // 【修正】100 を DROP_Y に変更
      EVOLUTION[currentType].radius,
      EVOLUTION[currentType].color,
      EVOLUTION[currentType].borderColor,
      0,
    );
    ctx.globalAlpha = 1.0;
    ctx.strokeStyle = 'rgba(94, 58, 33, 0.05)';
    ctx.beginPath();
    ctx.moveTo(currentX, DROP_Y); // 【修正】100 を DROP_Y に変更
    ctx.lineTo(currentX, 650);
    ctx.stroke();
  }

  // 物理オブジェクト
  const puddings = Composite.allBodies(world).filter(
    (b) => b.label === 'pudding',
  );
  puddings.forEach((p) => {
    const config = EVOLUTION[p.custom.level];
    ctx.save();
    ctx.translate(p.position.x, p.position.y);
    ctx.rotate(p.angle);
    if (p.custom.squish > 1) p.custom.squish -= 0.03;
    ctx.scale(p.custom.squish, 1 / p.custom.squish);
    drawPudding(
      ctx,
      0,
      0,
      config.radius,
      config.color,
      config.borderColor,
      p.custom.level,
    );
    ctx.restore();

    // 変更: 虹専用キラキラ生成を豪華に（確率アップ、生成数増加、動きの拡大）
    if (p.custom.level === 6 && Math.random() < 0.4) {
      for (let j = 0; j < 2; j++) {
        const ang = Math.random() * Math.PI * 2;
        const r = Math.random() * config.radius;
        sparkles.push({
          x: p.position.x + Math.cos(ang) * r,
          y: p.position.y + Math.sin(ang) * r,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2 - 1,
          size: Math.random() * 4 + 2,
          life: 1.0,
        });
      }
    }

    p.custom.life++;
    if (p.position.y < DEADLINE_Y && p.custom.life > 120) {
      const speed = Vector.magnitude(p.velocity);
      if (speed < 0.4) {
        p.custom.dangerTime++;
        if (p.custom.dangerTime > 120) gameOver();
        ctx.fillStyle = `rgba(239, 68, 68, ${0.1 + Math.sin(Date.now() * 0.01) * 0.1})`;
        ctx.beginPath();
        ctx.arc(p.position.x, p.position.y, config.radius + 8, 0, 7);
        ctx.fill();
      } else {
        p.custom.dangerTime = 0;
      }
    } else {
      p.custom.dangerTime = 0;
    }
  });

  // キラキラエフェクト
  sparkles.forEach((s, i) => {
    s.x += s.vx;
    s.y += s.vy;
    s.life -= 0.03;
    ctx.fillStyle = `rgba(255, 255, 255, ${s.life})`;
    ctx.beginPath();
    const sz = s.size * (0.5 + Math.sin(Date.now() * 0.01) * 0.5);
    ctx.arc(s.x, s.y, sz, 0, 7);
    ctx.fill();
    if (s.life <= 0) sparkles.splice(i, 1);
  });

  // パーティクル
  particles.forEach((p, i) => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.2;
    p.life -= 0.02;
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, 7);
    ctx.fill();
    if (p.life <= 0) particles.splice(i, 1);
  });
  ctx.globalAlpha = 1.0;
  requestAnimationFrame(render);
}

function drawPudding(ctx, x, y, radius, color, borderColor, level) {
  ctx.save();

  if (color === 'rainbow') {
    const grad = ctx.createLinearGradient(
      x - radius,
      y - radius,
      x + radius,
      y + radius,
    );
    grad.addColorStop(0, '#FFADAD');
    grad.addColorStop(0.2, '#FFD6A5');
    grad.addColorStop(0.4, '#FDFFB6');
    grad.addColorStop(0.6, '#CAFFBF');
    grad.addColorStop(0.8, '#9BFBC0');
    grad.addColorStop(1, '#A0C4FF');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // 全プリン共通の「つや」光沢
  const gloss = ctx.createRadialGradient(
    x - radius / 2.5,
    y - radius / 2.5,
    0,
    x - radius / 2.5,
    y - radius / 2.5,
    radius,
  );
  gloss.addColorStop(0, 'rgba(255,255,255,0.6)');
  gloss.addColorStop(0.2, 'rgba(255,255,255,0.3)');
  gloss.addColorStop(0.8, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = Math.max(2.5, radius * 0.1);
  ctx.stroke();

  // カラメル
  ctx.fillStyle = '#5E3A21';
  ctx.beginPath();
  ctx.ellipse(
    x,
    y - radius * 0.78,
    radius * 0.55,
    radius * 0.2,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // 顔
  const s = radius / 40;
  ctx.fillStyle = '#5E3A21';
  ctx.beginPath();
  ctx.arc(x - 8 * s, y, 2.5 * s, 0, 7);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 8 * s, y, 2.5 * s, 0, 7);
  ctx.fill();
  ctx.strokeStyle = '#5E3A21';
  ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  ctx.arc(x, y + 4 * s, 2 * s, 0, Math.PI);
  ctx.stroke();

  ctx.restore();
}

function createParticles(x, y, color) {
  const c = color === 'rainbow' ? '#FFD6A5' : color;
  for (let i = 0; i < 10; i++) {
    particles.push({
      x,
      y,
      color: c,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.8) * 8,
      size: Math.random() * 4 + 2,
      life: 1.0,
    });
  }
}

function createSpecialParticles(x, y, count) {
  const colors = [
    '#FFADAD',
    '#FFD6A5',
    '#FDFFB6',
    '#CAFFBF',
    '#9BFBC0',
    '#A0C4FF',
  ];
  for (let i = 0; i < count; i++) {
    const c = colors[Math.floor(Math.random() * colors.length)];
    particles.push({
      x,
      y,
      color: c,
      vx: (Math.random() - 0.5) * 15,
      vy: (Math.random() - 0.8) * 15,
      size: Math.random() * 6 + 3,
      life: 1.0,
    });
  }
}

function gameOver() {
  if (gameState === 'GAMEOVER') return;
  gameState = 'GAMEOVER';
  clearTimeout(bgmTimer);
  document.getElementById('finalScore').innerText = score;
  const screen = document.getElementById('gameover-screen');
  screen.classList.remove('hidden');

  // 変更: ゲームオーバー時に魔法ゲージを非表示にする
  document.getElementById('magic-container').classList.add('hidden');

  setTimeout(() => {
    screen.style.opacity = 1;
    screen.classList.add('pointer-events-auto');
  }, 50);
  playTone(150, 'sawtooth', 0.6, 0.1);
}

init();
