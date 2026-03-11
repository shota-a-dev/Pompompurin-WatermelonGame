/**
 * 定数定義：画面サイズ、容器サイズ、落下位置など
 */
const GAME_WIDTH = 380;
const GAME_HEIGHT = 680;
const CONTAINER_W = 300;
const CONTAINER_H = 352; // 高さを調整して難易度を上げている
const CONTAINER_BOTTOM_MARGIN = 90;
const CONTAINER_CENTER_Y =
  GAME_HEIGHT - CONTAINER_H / 2 - CONTAINER_BOTTOM_MARGIN;
const DEADLINE_Y = CONTAINER_CENTER_Y - CONTAINER_H / 2 + 50; // ゲームオーバー判定線
const DROP_Y = 130; // プリンを生成する高さ

/**
 * プリンの進化データ：サイズ、色、スコアなど
 */
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

/**
 * 各種状態・Matter.js関連の変数
 */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('nextCanvas');
const nextCtx = nextCanvas.getContext('2d');

const { Engine, Runner, Bodies, Composite, Events, Vector } = Matter;
let engine, world, runner;

let gameState = 'START';
let score = 0;
let bestScore = localStorage.getItem('pomEvoBest_v6') || 0;

let currentType = 0; // 現在操作中のプリンのレベル
let nextType = 0; // 次に出てくるプリンのレベル
let isDropping = false; // 落下中フラグ
let currentX = GAME_WIDTH / 2; // 操作中のX座標
let particles = []; // 合体時のエフェクト
let sparkles = []; // 虹プリンのキラキラ

let magicPoints = 0; // 魔法ゲージ
const MAX_MAGIC_POINTS = 100;

// サウンド（Web Audio API）関連
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

/**
 * ゲームの初期化：キャンバス設定、物理エンジン起動、イベント登録
 */
function init() {
  canvas.width = GAME_WIDTH;
  canvas.height = GAME_HEIGHT;
  document.getElementById('bestVal').innerText = bestScore;

  resizeGame();
  window.addEventListener('resize', resizeGame);

  // 物理エンジンの生成
  engine = Engine.create();
  world = engine.world;
  engine.gravity.y = 1.4;

  runner = Runner.create();
  Runner.run(runner, engine);

  // 進化図解を生成してHTMLに追加
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

  // 容器（壁）の生成
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
    ), // 床
    Bodies.rectangle(
      containerX - CONTAINER_W / 2 - 10,
      CONTAINER_CENTER_Y,
      20,
      CONTAINER_H + 40,
      wallOpt,
    ), // 左壁
    Bodies.rectangle(
      containerX + CONTAINER_W / 2 + 10,
      CONTAINER_CENTER_Y,
      20,
      CONTAINER_H + 40,
      wallOpt,
    ), // 右壁
  ]);

  // 物理エンジンの衝突イベント
  Events.on(engine, 'collisionStart', handleCollision);
  requestAnimationFrame(render);

  // ボタンイベントの紐付け
  document.getElementById('start-btn').onclick = startGame;
  document.getElementById('retry-btn').onclick = startGame;
  document.getElementById('magic-btn').onclick = (e) => {
    e.stopPropagation();
    useMagic();
  };

  /**
   * マウス・タッチ入力の制御
   */
  const handleInput = (e) => {
    if (gameState !== 'PLAYING' || isDropping) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const rect = canvas.getBoundingClientRect();
    const relX = (clientX - rect.left) * (GAME_WIDTH / rect.width);
    const relY = (clientY - rect.top) * (GAME_HEIGHT / rect.height);

    if (relY < 120) return; // 上部のUIエリアでは操作を無視

    const radius = EVOLUTION[currentType].radius;
    // 容器の幅からはみ出さないように制限
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
    if (relY < 120) return;
    handleDrop();
  });
  window.addEventListener('touchstart', handleInput, { passive: false });
  window.addEventListener('touchmove', handleInput, { passive: false });
  window.addEventListener('touchend', (e) => {
    if (e.changedTouches && e.changedTouches[0]) {
      const rect = canvas.getBoundingClientRect();
      const relY =
        (e.changedTouches[0].clientY - rect.top) * (GAME_HEIGHT / rect.height);
      if (relY < 120) return;
    }
    handleDrop();
  });
}

/**
 * ゲーム開始処理：初期化とUIの表示切り替え
 */
function startGame() {
  initAudio();
  gameState = 'PLAYING';
  isDropping = false;
  currentX = GAME_WIDTH / 2;
  score = 0;
  updateScore(0);
  magicPoints = 0;
  updateMagicGauge();

  // 画面に残っている物理オブジェクトを削除
  const allBodies = Composite.allBodies(world);
  allBodies.forEach((b) => {
    if (b.label === 'pudding') Composite.remove(world, b);
  });
  sparkles = [];
  document.getElementById('title-screen').classList.add('hidden');
  document.getElementById('gameover-screen').classList.add('hidden');
  document.getElementById('gameover-screen').style.opacity = 0;
  document.getElementById('magic-container').classList.remove('hidden');

  currentType = Math.floor(Math.random() * 3);
  nextType = Math.floor(Math.random() * 3);
  updateNextPreview();
  nextNoteTime = audioCtx.currentTime;
  startBGM();
}

/**
 * プリンを落下させる
 */
function handleDrop() {
  if (gameState !== 'PLAYING' || isDropping) return;
  isDropping = true;

  // 物理エンジンの円形オブジェクトを作成
  const p = Bodies.circle(currentX, DROP_Y, EVOLUTION[currentType].radius, {
    restitution: 0.2, // 少し跳ねるように
    friction: 0.01, // 摩擦を極限まで下げて転がりを良くする
    frictionAir: 0.01, // 空気抵抗もわずかに調整
    label: 'pudding',
    custom: {
      level: currentType,
      squish: 1.1, // 生成時のわずかな歪み
      life: 0,
      dangerTime: 0,
      isProcessing: false,
    },
  });
  Composite.add(world, p);
  playTone(440, 'sine', 0.1, 0.04);

  // 次のプリンを準備
  setTimeout(() => {
    if (gameState !== 'PLAYING') return;
    currentType = nextType;
    nextType = Math.floor(Math.random() * 3);
    updateNextPreview();
    isDropping = false;
  }, 600);
}

/**
 * 衝突時の進化ロジック
 */
function handleCollision(event) {
  event.pairs.forEach((pair) => {
    const a = pair.bodyA,
      b = pair.bodyB;
    // プリン同士かつ同じレベルの場合のみ進化
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
          addMagicPoints(5 + newLevel * 2);

          // 虹プリンへの進化時のみ特別な演出
          if (newLevel === 6) {
            createSpecialParticles(newX, newY, 60);
            playTone(880, 'sine', 0.2, 0.1);
            showCutin('にじプリン だよ！');
          } else {
            createParticles(newX, newY, EVOLUTION[newLevel].color);
            playTone(523 + newLevel * 50, 'sine', 0.15, 0.08);
          }
        } else if (level === 6) {
          // 虹プリン同士が合体した場合、消滅して大量加点
          Composite.remove(world, [a, b]);
          updateScore(500);
          addMagicPoints(50);
          createSpecialParticles(newX, newY, 120);
          showCutin('きらきら！ はじけたよ');
        }
      }
    }
  });
}

/**
 * スコア更新と、状況に応じたポムポムプリン画像の切り替え
 */
function updateScore(add) {
  score += add;
  document.getElementById('scoreVal').innerText = score;
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem('pomEvoBest_v6', bestScore);
    document.getElementById('bestVal').innerText = bestScore;
  }

  // スコアの進行に合わせて左側の画像を差し替え
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

/**
 * 魔法ゲージ・機能関連
 */
function addMagicPoints(pts) {
  magicPoints = Math.min(MAX_MAGIC_POINTS, magicPoints + pts);
  updateMagicGauge();
}

function updateMagicGauge() {
  const fill = document.getElementById('magic-gauge-fill');
  const btn = document.getElementById('magic-btn');
  const percent = (magicPoints / MAX_MAGIC_POINTS) * 100;
  fill.style.width = percent + '%';
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

  // 盤面にある最小レベル（豆）のプリンをすべて消去する魔法
  const puddings = Composite.allBodies(world).filter(
    (b) => b.label === 'pudding',
  );
  const beans = puddings.filter((p) => p.custom.level === 0);

  beans.forEach((b) => {
    createParticles(b.position.x, b.position.y, '#FFFFFF');
    Composite.remove(world, b);
  });
  showCutin('まめ消し 魔法！');
}

/**
 * 描画ループ
 */
function render() {
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // 1. 容器の描画
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

  // 2. ゲームオーバー境界線
  ctx.setLineDash([5, 8]);
  ctx.strokeStyle = '#FCA5A5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo((GAME_WIDTH - CONTAINER_W) / 2, DEADLINE_Y);
  ctx.lineTo((GAME_WIDTH + CONTAINER_W) / 2, DEADLINE_Y);
  ctx.stroke();
  ctx.setLineDash([]);

  // 3. 落下位置のプレビュー（半透明）
  if (gameState === 'PLAYING' && !isDropping) {
    ctx.globalAlpha = 0.5;
    drawPudding(
      ctx,
      currentX,
      DROP_Y,
      EVOLUTION[currentType].radius,
      EVOLUTION[currentType].color,
      EVOLUTION[currentType].borderColor,
      0,
    );
    ctx.globalAlpha = 1.0;
    // ガイドライン
    ctx.strokeStyle = 'rgba(94, 58, 33, 0.05)';
    ctx.beginPath();
    ctx.moveTo(currentX, DROP_Y);
    ctx.lineTo(currentX, 650);
    ctx.stroke();
  }

  // 4. 盤面のプリンたちを描画
  const puddings = Composite.allBodies(world).filter(
    (b) => b.label === 'pudding',
  );
  puddings.forEach((p) => {
    const config = EVOLUTION[p.custom.level];
    ctx.save();
    ctx.translate(p.position.x, p.position.y);
    ctx.rotate(p.angle);
    // 弾力を表現するスケーリング
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

    // ゲームオーバー判定
    p.custom.life++;
    if (p.position.y - config.radius < DEADLINE_Y && p.custom.life > 60) {
      const speed = Vector.magnitude(p.velocity);
      if (speed < 0.4) {
        p.custom.dangerTime++;
        if (p.custom.dangerTime > 120) gameOver();
        // 警告演出（赤く光る）
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

  // 5. エフェクト（パーティクル等）
  sparkles.forEach((s, i) => {
    s.x += s.vx;
    s.y += s.vy;
    s.life -= 0.03;
    ctx.fillStyle = `rgba(255, 255, 255, ${s.life})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size * (0.5 + Math.sin(Date.now() * 0.01) * 0.5), 0, 7);
    ctx.fill();
    if (s.life <= 0) sparkles.splice(i, 1);
  });

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

/**
 * ポムポムプリンを描画する共通関数（光沢強化版）
 */
function drawPudding(ctx, x, y, radius, color, borderColor, level) {
  ctx.save();

  // 1. 本体と色の描画
  if (color === 'rainbow') {
    const grad = ctx.createLinearGradient(
      x - radius,
      y - radius,
      x + radius,
      y + radius,
    );
    grad.addColorStop(0, '#FFADAD');
    grad.addColorStop(0.5, '#FDFFB6');
    grad.addColorStop(1, '#A0C4FF');
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = color;
  }
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // 2. 「つや」光沢（グラデーション）：ぷるぷる感のベース
  const gloss = ctx.createRadialGradient(
    x - radius * 0.35,
    y - radius * 0.35,
    0,
    x - radius * 0.35,
    y - radius * 0.35,
    radius * 1.2,
  );
  gloss.addColorStop(0, 'rgba(255, 255, 255, 0.8)'); // 中心は強く
  gloss.addColorStop(0.2, 'rgba(255, 255, 255, 0.4)');
  gloss.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gloss;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // 【新規追加】ハイライト（白い光の点）：さらに光沢感を出すための修正
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.beginPath();
  ctx.ellipse(
    x - radius * 0.4,
    y - radius * 0.4,
    radius * 0.2,
    radius * 0.1,
    Math.PI / 4,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  // 3. 枠線
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = Math.max(2.5, radius * 0.1);
  ctx.stroke();

  // 4. カラメル部分
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

  // 5. 顔の描画
  const s = radius / 40;
  ctx.fillStyle = '#5E3A21';
  ctx.beginPath();
  ctx.arc(x - 8 * s, y, 2.5 * s, 0, 7);
  ctx.fill(); // 左目
  ctx.beginPath();
  ctx.arc(x + 8 * s, y, 2.5 * s, 0, 7);
  ctx.fill(); // 右目
  ctx.strokeStyle = '#5E3A21';
  ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  ctx.arc(x, y + 4 * s, 2 * s, 0, Math.PI);
  ctx.stroke(); // 口

  ctx.restore();
}

/**
 * ゲームオーバー処理
 */
function gameOver() {
  if (gameState === 'GAMEOVER') return;
  gameState = 'GAMEOVER';
  clearTimeout(bgmTimer);
  document.getElementById('finalScore').innerText = score;
  const screen = document.getElementById('gameover-screen');
  screen.classList.remove('hidden');
  document.getElementById('magic-container').classList.add('hidden');

  setTimeout(() => {
    screen.style.opacity = 1;
    screen.classList.add('pointer-events-auto');
  }, 50);
  playTone(150, 'sawtooth', 0.6, 0.1);
}

// ゲームの初期化を実行
init();
