import * as THREE from 'three';

// ─── State ────────────────────────────────────────────────────────────────────
let isGameRunning = false;
let isARMode      = false;
let score         = 0;
let bestScore     = 0;
let gameLevel     = 1;
let currentLane   = 1;
let gameTime      = 0;
let touchStartX   = 0;

const lanes            = [-2, 0, 2];
const baseSpeed        = 0.05;
const baseObstacleSpeed = 0.06;
const levelDuration    = 10_000; // ms

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const hud             = document.getElementById('hud');
const scoreElement    = document.getElementById('score');
const bestScoreEl     = document.getElementById('best-score');
const levelElement    = document.getElementById('game-level');
const speedElement    = document.getElementById('game-speed');
const startScreen     = document.getElementById('start-screen');
const gameOverScreen  = document.getElementById('game-over-screen');
const finalScoreEl    = document.getElementById('final-score');
const startBtn        = document.getElementById('start-btn');
const restartBtn      = document.getElementById('restart-btn');
const arStartBtn      = document.getElementById('ar-start-btn');
const arContainer     = document.getElementById('arContainer');
const arInfo          = document.getElementById('ar-info');

try {
  bestScore = parseInt(localStorage.getItem('neonRunnerBest')) || 0;
  if (bestScoreEl) bestScoreEl.innerText = 'BEST: ' + bestScore;
} catch { /* storage blocked */ }

// ─── Three.js objects ─────────────────────────────────────────────────────────
let scene, camera, renderer, clock;
let playerCar, gridHelper;
let gameAnchor;       // contains all gameplay objects — scaled in AR mode
let backgroundGroup;  // stars + sun — hidden in AR mode
let obstacles    = [];
let collectibles = [];
let timeMultiplier = 1.0;
let xrSession = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
function initScene() {
  scene = new THREE.Scene();
  scene.fog        = new THREE.FogExp2(0x000000, 0.015);
  scene.background = new THREE.Color(0x000011);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(0, 3, 7);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.xr.enabled = true;          // ← must be TRUE before any XR session
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  arContainer.appendChild(renderer.domElement);

  clock = new THREE.Clock();
  buildGameScene();

  window.addEventListener('resize', onResize);

  // setAnimationLoop drives both normal rendering AND WebXR frames
  renderer.setAnimationLoop(animate);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ─── Main render loop (called by setAnimationLoop every frame) ────────────────
function animate() {
  const delta = clock.getDelta();
  updateGameLogic(delta);
  renderer.render(scene, camera);
}

// ─── AR ───────────────────────────────────────────────────────────────────────
async function startARMode() {
  // 1. Check API availability
  if (!navigator.xr) {
    alert(
      'WebXR is not available.\n\n' +
      '• Android: use Chrome/Edge with ARCore installed\n' +
      '• iOS: Safari 16+ (limited support)\n' +
      '• Must be served over HTTPS'
    );
    return;
  }

  // 2. Check session support before requesting
  let supported = false;
  try { supported = await navigator.xr.isSessionSupported('immersive-ar'); }
  catch { /* ignore — some browsers throw instead of returning false */ }

  if (!supported) {
    alert(
      'Immersive AR is not supported on this device.\n\n' +
      'Requirements:\n' +
      '• Android phone with ARCore\n' +
      '• Chrome or Edge browser\n' +
      '• Site served over HTTPS'
    );
    return;
  }

  // 3. Request the session
  try {
    const sessionInit = {
      requiredFeatures: ['local'],           // 'local' is widely supported
      optionalFeatures: ['local-floor', 'hit-test', 'dom-overlay'],
    };

    // dom-overlay surfaces the HTML HUD over the camera feed
    try { sessionInit.domOverlay = { root: document.body }; } catch { /* optional */ }

    const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
    xrSession = session;
    isARMode  = true;

    // 4. Switch visuals to AR mode
    scene.background = null;     // transparent → shows camera feed
    scene.fog        = null;
    backgroundGroup.visible = false;

    // Scale the game world down to tabletop size and place ~1.5 m in front
    // gameAnchor local units: road width = 6, so 6 × 0.04 = 0.24 m ≈ 24 cm
    gameAnchor.scale.setScalar(0.04);
    gameAnchor.position.set(0, -0.6, -1.5);   // 0.6 m below eye, 1.5 m forward
    gameAnchor.rotation.x = 0;                 // keep upright

    // 5. Hand session to Three.js — it takes over camera transforms automatically
    await renderer.xr.setSession(session);

    // 6. Cleanup when the user exits AR (browser back button, etc.)
    session.addEventListener('end', onARSessionEnd);

    // 7. Update UI
    startScreen.style.display = 'none';
    hud.style.display         = 'block';
    if (arInfo) arInfo.innerText = '📷 AR MODE ACTIVE';

    startGame();

  } catch (err) {
    console.error('AR session failed:', err);
    alert('Failed to start AR:\n' + err.message);
  }
}

function onARSessionEnd() {
  isARMode  = false;
  xrSession = null;

  // Restore desktop scene
  scene.background = new THREE.Color(0x000011);
  scene.fog        = new THREE.FogExp2(0x000000, 0.015);
  backgroundGroup.visible = true;

  // Reset game anchor to full-size desktop position
  gameAnchor.scale.setScalar(1);
  gameAnchor.position.set(0, 0, 0);

  // Restore desktop camera
  camera.position.set(0, 3, 7);
  camera.lookAt(0, 0, 0);

  isGameRunning = false;
  if (hud) hud.style.display = 'none';
  if (gameOverScreen) gameOverScreen.style.display = 'none';
  if (startScreen) startScreen.style.display = 'flex';
  if (arInfo) arInfo.innerText = '';
}

// ─── Scene construction ───────────────────────────────────────────────────────
function buildGameScene() {
  // Background — hidden in AR
  backgroundGroup = new THREE.Group();
  scene.add(backgroundGroup);

  const sunMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        vec3 col = mix(vec3(1.0,0.9,0.0), vec3(1.0,0.1,0.4), vUv.y);
        col *= step(0.15, mod(vUv.y * 20.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const neonSun = new THREE.Mesh(new THREE.SphereGeometry(18, 64, 64), sunMat);
  neonSun.position.set(0, 8, -120);
  backgroundGroup.add(neonSun);

  const starCoords = [];
  for (let i = 0; i < 800; i++) {
    starCoords.push(
      THREE.MathUtils.randFloatSpread(300),
      THREE.MathUtils.randFloat(5, 80),
      THREE.MathUtils.randFloat(-200, 10)
    );
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starCoords, 3));
  backgroundGroup.add(new THREE.Points(starGeo,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.3, transparent: true, opacity: 0.8 })
  ));

  // ── Gameplay objects all go inside gameAnchor (scales in AR) ─────────────────
  gameAnchor = new THREE.Group();
  scene.add(gameAnchor);

  // Road
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 300),
    new THREE.MeshBasicMaterial({ color: 0x0a0a1a })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, -1.01, -150);
  gameAnchor.add(road);

  // Grid
  gridHelper = new THREE.GridHelper(300, 150, 0xff00ff, 0x45a29e);
  gridHelper.position.y = -1;
  gameAnchor.add(gridHelper);

  // Lane dividers
  [-1, 1].forEach(x => {
    const div = new THREE.Mesh(
      new THREE.PlaneGeometry(0.05, 300),
      new THREE.MeshBasicMaterial({ color: 0x66fcf1, transparent: true, opacity: 0.4 })
    );
    div.rotation.x = -Math.PI / 2;
    div.position.set(x, -0.99, -150);
    gameAnchor.add(div);
  });

  // Player car
  const carGeo = new THREE.BoxGeometry(1, 0.5, 2);
  playerCar = new THREE.Mesh(carGeo, new THREE.MeshBasicMaterial({ color: 0x66fcf1 }));
  playerCar.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(carGeo),
    new THREE.LineBasicMaterial({ color: 0xffffff })
  ));
  playerCar.position.set(lanes[1], -0.75, 4);
  gameAnchor.add(playerCar);

  // Headlights
  [-0.4, 0.4].forEach(x => {
    const light = new THREE.PointLight(0x66fcf1, 1.5, 6);
    light.position.set(x, 0, -1.1);
    playerCar.add(light);
  });
}

// ─── Game logic ───────────────────────────────────────────────────────────────
function updateGameLogic(delta) {
  if (!isGameRunning) return;

  gameTime += delta * 1000;

  const newLevel = Math.floor(gameTime / levelDuration) + 1;
  if (newLevel > gameLevel) {
    gameLevel      = newLevel;
    timeMultiplier = 1.0 + (gameLevel - 1) * 0.15;
    if (levelElement) levelElement.innerText = 'LEVEL: ' + gameLevel;
    if (speedElement) speedElement.innerText = 'SPEED: ' + timeMultiplier.toFixed(1) + 'x';
  }

  const currentSpeed          = baseSpeed          * timeMultiplier;
  const currentObstacleSpeed  = baseObstacleSpeed  * timeMultiplier;

  // Smooth lane switching
  playerCar.position.x += (lanes[currentLane] - playerCar.position.x) * 0.15;

  // Scroll grid
  gridHelper.position.z += currentSpeed;
  if (gridHelper.position.z > 2) gridHelper.position.z = 0;

  // Move & check obstacles + collectibles
  const all = [...obstacles, ...collectibles];
  for (let i = all.length - 1; i >= 0; i--) {
    const obj          = all[i];
    const isCollectible = collectibles.includes(obj);

    obj.position.z += currentObstacleSpeed;
    if (isCollectible) obj.rotation.y += 0.05;

    // Collision
    if (
      obj.position.z > playerCar.position.z - 1.5 &&
      obj.position.z < playerCar.position.z + 1.5 &&
      Math.abs(obj.position.x - playerCar.position.x) < 0.8
    ) {
      if (isCollectible) {
        score += 100;
        if (scoreElement) scoreElement.innerText = 'SCORE: ' + score;
        gameAnchor.remove(obj);
        collectibles.splice(collectibles.indexOf(obj), 1);
      } else {
        triggerGameOver();
        return;
      }
      continue;
    }

    // Cull past-camera objects
    const cullZ = playerCar.position.z + 5;
    if (obj.position.z > cullZ) {
      gameAnchor.remove(obj);
      if (isCollectible) {
        collectibles.splice(collectibles.indexOf(obj), 1);
      } else {
        obstacles.splice(obstacles.indexOf(obj), 1);
        score += 10;
        if (scoreElement) scoreElement.innerText = 'SCORE: ' + score;
      }
    }
  }
}

function startGame() {
  isGameRunning  = true;
  score          = 0;
  gameLevel      = 1;
  gameTime       = 0;
  timeMultiplier = 1.0;
  currentLane    = 1;

  if (scoreElement)  scoreElement.innerText  = 'SCORE: 0';
  if (levelElement)  levelElement.innerText  = 'LEVEL: 1';
  if (speedElement)  speedElement.innerText  = 'SPEED: 1.0x';
  if (startScreen)   startScreen.style.display   = 'none';
  if (gameOverScreen) gameOverScreen.style.display = 'none';
  if (hud)           hud.style.display           = 'block';

  playerCar.position.set(lanes[1], -0.75, 4);

  obstacles.forEach(o => gameAnchor.remove(o));
  obstacles.length = 0;
  collectibles.forEach(c => gameAnchor.remove(c));
  collectibles.length = 0;

  clock.getDelta(); // flush accumulated delta
  spawnObstacles();
  spawnCollectibles();
}

function triggerGameOver() {
  isGameRunning = false;

  if (score > bestScore) {
    bestScore = score;
    try { localStorage.setItem('neonRunnerBest', bestScore); } catch { /* blocked */ }
    if (bestScoreEl) bestScoreEl.innerText = 'BEST: ' + bestScore;
  }

  if (hud)           hud.style.display           = 'none';
  if (gameOverScreen) gameOverScreen.style.display = 'flex';
  if (finalScoreEl)  finalScoreEl.innerText       = 'FINAL SCORE: ' + score;
}

function spawnObstacles() {
  if (!isGameRunning) return;

  const types = [
    { geom: new THREE.BoxGeometry(1, 1, 1),     color: 0xff00ff },
    { geom: new THREE.BoxGeometry(0.5, 2, 0.5), color: 0x00ccff },
    { geom: new THREE.BoxGeometry(2.5, 0.8, 1), color: 0xff5500 },
  ];

  const t   = types[Math.floor(Math.random() * types.length)];
  const obs = new THREE.Mesh(t.geom, new THREE.MeshBasicMaterial({ color: t.color }));
  obs.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(t.geom),
    new THREE.LineBasicMaterial({ color: 0xffffff })
  ));
  obs.position.set(lanes[Math.floor(Math.random() * lanes.length)], t.geom.parameters.height / 2 - 1, -80);
  gameAnchor.add(obs);   // ← add to gameAnchor, not scene
  obstacles.push(obs);

  const delay = Math.max(400, 1000 - (gameLevel - 1) * 50);
  setTimeout(spawnObstacles, delay);
}

function spawnCollectibles() {
  if (!isGameRunning) return;

  if (Math.random() > 0.35) {
    setTimeout(spawnCollectibles, 3000);
    return;
  }

  let lane = Math.floor(Math.random() * lanes.length);
  if (obstacles.some(o => o.position.x === lanes[lane] && o.position.z < -75))
    lane = (lane + 1) % lanes.length;

  const coin = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.15, 16, 64),
    new THREE.MeshBasicMaterial({ color: 0xffd700, wireframe: true })
  );
  coin.position.set(lanes[lane], 0, -80);
  gameAnchor.add(coin);   // ← add to gameAnchor, not scene
  collectibles.push(coin);

  setTimeout(spawnCollectibles, 3000);
}

// ─── Controls ─────────────────────────────────────────────────────────────────
function moveLeft()  { if (isGameRunning && currentLane > 0)  currentLane--; }
function moveRight() { if (isGameRunning && currentLane < 2)  currentLane++; }

document.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; });
document.addEventListener('touchend',   e => {
  const diff = touchStartX - e.changedTouches[0].screenX;
  if (Math.abs(diff) > 50) diff > 0 ? moveRight() : moveLeft();
});

document.getElementById('btn-left').addEventListener('click',  moveLeft);
document.getElementById('btn-right').addEventListener('click', moveRight);

window.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft')  moveLeft();
  if (e.key === 'ArrowRight') moveRight();
});

// ─── Button wiring ────────────────────────────────────────────────────────────
if (startBtn)   startBtn.addEventListener('click',   startGame);
if (restartBtn) restartBtn.addEventListener('click', startGame);

if (arStartBtn) {
  // Show or hide AR button based on support
  if (!navigator.xr) {
    arStartBtn.style.display = 'none';
  } else {
    navigator.xr.isSessionSupported('immersive-ar')
      .then(ok => { if (!ok) arStartBtn.style.display = 'none'; })
      .catch(() => { arStartBtn.style.display = 'none'; });
    arStartBtn.addEventListener('click', startARMode);
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
initScene();
