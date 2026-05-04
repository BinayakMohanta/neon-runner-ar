// No `import` statements — THREE and THREEx come from the CDN globals loaded in index.html.
// Using two separate THREE instances (one from CDN, one from npm/Vite) breaks AR.js entirely
// because THREEx attaches itself to whichever THREE was on window at load time.

'use strict';

let isGameRunning = false;
let score = 0;
let bestScore = 0;
let gameLevel = 1;
let currentLane = 1;
let gameTime = 0;
let touchStartX = 0;

const lanes = [-2, 0, 2];
const baseSpeed      = 0.05;
const baseObstacleSpeed = 0.06;
const levelDuration  = 10000; // ms per level

// DOM refs
const arInfoEl        = document.getElementById('ar-info');
const hud             = document.getElementById('hud');
const scoreEl         = document.getElementById('score');
const bestScoreEl     = document.getElementById('best-score');
const levelEl         = document.getElementById('game-level');
const speedEl         = document.getElementById('game-speed');
const startScreen     = document.getElementById('start-screen');
const gameOverScreen  = document.getElementById('game-over-screen');
const finalScoreEl    = document.getElementById('final-score');
const arContainer     = document.getElementById('arContainer');

try {
  bestScore = parseInt(localStorage.getItem('neonRunnerBest')) || 0;
  if (bestScoreEl) bestScoreEl.innerText = 'BEST: ' + bestScore;
} catch (e) {}

// Three / AR globals
let scene, camera, renderer, markerGroup;
let playerCar, gridHelper;
let obstacles    = [];
let collectibles = [];
let timeMultiplier = 1.0;
let arReady = false;

function initARScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.03);

  // Renderer — alpha:true so the webcam video shows through the canvas
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.top = '0';
  renderer.domElement.style.left = '0';
  arContainer.appendChild(renderer.domElement);

  // AR.js source — puts webcam video behind the canvas
  const arSource = new THREEx.ArToolkitSource({ sourceType: 'webcam' });

  arSource.init(
    function onReady() {
      arReady = true;
      syncSize();
      if (arInfoEl) arInfoEl.innerText = '📷 Point at Hiro marker to play';
    },
    function onError(err) {
      console.error('AR source error:', err);
      if (arInfoEl) arInfoEl.innerText = '⚠ Camera unavailable';
    }
  );

  // AR.js context — does the marker detection
  const arContext = new THREEx.ArToolkitContext({
    cameraParametersUrl: 'https://raw.githack.com/AR-js-org/AR.js/3.4.5/data/data/camera_para.dat',
    detectionMode: 'mono',
  });

  arContext.init(function() {
    // Once context is ready, copy the AR projection matrix to our camera
    camera.projectionMatrix.copy(arContext.getProjectionMatrix());
  });

  // Plain camera — AR.js will control its projection matrix
  camera = new THREE.Camera();
  scene.add(camera);

  // Marker group — all game objects go here; AR.js moves/hides this group
  markerGroup = new THREE.Group();
  scene.add(markerGroup);

  new THREEx.ArMarkerControls(arContext, markerGroup, {
    type: 'pattern',
    patternUrl: 'https://raw.githack.com/AR-js-org/AR.js/3.4.5/data/data/patt.hiro',
  });

  function syncSize() {
    arSource.onResize();
    arSource.copySizeTo(renderer.domElement);
    if (arContext.arController) {
      arSource.copySizeTo(arContext.arController.canvas);
    }
  }
  window.addEventListener('resize', function() { if (arReady) syncSize(); });

  buildGameScene();

  var clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    // Update AR marker detection only when webcam source is ready
    if (arReady) {
      arContext.update(arSource.domElement);
    }

    if (isGameRunning) {
      gameTime += clock.getDelta() * 1000;

      var newLevel = Math.floor(gameTime / levelDuration) + 1;
      if (newLevel > gameLevel) {
        gameLevel = newLevel;
        timeMultiplier = 1.0 + (gameLevel - 1) * 0.15;
        if (levelEl) levelEl.innerText = 'LEVEL: ' + gameLevel;
        if (speedEl) speedEl.innerText = 'SPEED: ' + timeMultiplier.toFixed(1) + 'x';
      }

      var spd  = baseSpeed * timeMultiplier;
      var ospd = baseObstacleSpeed * timeMultiplier;

      playerCar.position.x += (lanes[currentLane] - playerCar.position.x) * 0.2;
      gridHelper.position.z += spd;
      if (gridHelper.position.z > 2) gridHelper.position.z = 0;

      var all = obstacles.concat(collectibles);
      for (var i = all.length - 1; i >= 0; i--) {
        var obj = all[i];
        obj.position.z += ospd;

        // Collision check
        if (
          obj.position.z > playerCar.position.z - 1.5 &&
          obj.position.z < playerCar.position.z + 1.5 &&
          Math.abs(obj.position.x - playerCar.position.x) < 0.8
        ) {
          var ci = collectibles.indexOf(obj);
          if (ci !== -1) {
            score += 100;
            if (scoreEl) scoreEl.innerText = 'SCORE: ' + score;
            markerGroup.remove(obj);
            collectibles.splice(ci, 1);
          } else {
            triggerGameOver();
            continue;
          }
        }

        // Off-screen removal
        if (obj.position.z > 8) {
          markerGroup.remove(obj);
          var oi = obstacles.indexOf(obj);
          if (oi !== -1) {
            obstacles.splice(oi, 1);
            score += 10;
            if (scoreEl) scoreEl.innerText = 'SCORE: ' + score;
          } else {
            var ci2 = collectibles.indexOf(obj);
            if (ci2 !== -1) collectibles.splice(ci2, 1);
          }
        }

        if (collectibles.indexOf(obj) !== -1) obj.rotation.y += 0.05;
      }
    } else {
      clock.getDelta(); // drain clock so delta doesn't explode on resume
    }

    renderer.render(scene, camera);
  }

  animate();
}

function buildGameScene() {
  // Neon retro sun
  var sunGeo  = new THREE.SphereGeometry(30, 64, 64);
  var sunMat  = new THREE.ShaderMaterial({
    vertexShader: [
      'varying vec2 vUv;',
      'void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}'
    ].join('\n'),
    fragmentShader: [
      'varying vec2 vUv;',
      'void main(){',
      '  vec3 c=mix(vec3(1,1,0),vec3(1,0,0.5),vUv.y);',
      '  c*=step(0.1,mod(vUv.y*30.0,1.0));',
      '  gl_FragColor=vec4(c,1.0);',
      '}'
    ].join('\n'),
  });
  var sun = new THREE.Mesh(sunGeo, sunMat);
  sun.position.set(0, 5, -80);
  markerGroup.add(sun);

  // Horizon
  var hGeo = new THREE.PlaneGeometry(300, 50);
  var hMat = new THREE.MeshBasicMaterial({ color: 0x003366, transparent: true, opacity: 0.3 });
  var horizon = new THREE.Mesh(hGeo, hMat);
  horizon.position.set(0, 5, -79);
  markerGroup.add(horizon);

  // Stars
  var starGeo = new THREE.BufferGeometry();
  var coords  = [];
  for (var i = 0; i < 500; i++) {
    coords.push(
      THREE.MathUtils.randFloatSpread(400),
      THREE.MathUtils.randFloatSpread(400),
      -300
    );
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
  var starfield = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0.7 }));
  markerGroup.add(starfield);

  // Grid
  gridHelper = new THREE.GridHelper(200, 100, 0xff00ff, 0x45a29e);
  gridHelper.position.y = -1;
  markerGroup.add(gridHelper);

  // Player car
  var carGeo = new THREE.BoxGeometry(1, 0.5, 2);
  playerCar  = new THREE.Mesh(carGeo, new THREE.MeshBasicMaterial({ color: 0x66fcf1 }));
  playerCar.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(carGeo),
    new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 })
  ));
  markerGroup.add(playerCar);
}

function startGame() {
  isGameRunning = true;
  score = 0; gameLevel = 1; gameTime = 0; timeMultiplier = 1.0; currentLane = 1;
  if (scoreEl)  scoreEl.innerText  = 'SCORE: 0';
  if (levelEl)  levelEl.innerText  = 'LEVEL: 1';
  if (speedEl)  speedEl.innerText  = 'SPEED: 1.0x';
  if (startScreen)    startScreen.style.display    = 'none';
  if (gameOverScreen) gameOverScreen.style.display = 'none';
  if (hud) hud.style.display = 'block';
  playerCar.position.set(lanes[1], 0, 0);
  obstacles.forEach(function(o){ markerGroup.remove(o); }); obstacles.length = 0;
  collectibles.forEach(function(c){ markerGroup.remove(c); }); collectibles.length = 0;
  spawnObstacles();
  spawnCollectibles();
}

function triggerGameOver() {
  isGameRunning = false;
  if (score > bestScore) {
    bestScore = score;
    try { localStorage.setItem('neonRunnerBest', bestScore); } catch(e){}
    if (bestScoreEl) bestScoreEl.innerText = 'BEST: ' + bestScore;
  }
  if (hud) hud.style.display = 'none';
  if (gameOverScreen) { gameOverScreen.style.display = 'flex'; }
  if (finalScoreEl) finalScoreEl.innerText = 'FINAL SCORE: ' + score;
}

function spawnObstacles() {
  if (!isGameRunning) return;
  var types = [
    { geom: new THREE.BoxGeometry(1, 1, 1),   color: 0xff00ff },
    { geom: new THREE.BoxGeometry(0.5, 4, 0.5), color: 0x00ccff },
    { geom: new THREE.BoxGeometry(3, 1, 1),   color: 0xff5500 },
  ];
  var t = types[Math.floor(Math.random() * types.length)];
  var obs = new THREE.Mesh(t.geom, new THREE.MeshBasicMaterial({ color: t.color }));
  obs.add(new THREE.LineSegments(new THREE.EdgesGeometry(t.geom), new THREE.LineBasicMaterial({ color: 0xffffff })));
  obs.position.set(lanes[Math.floor(Math.random() * lanes.length)], t.geom.parameters.height / 2 - 1, -20);
  markerGroup.add(obs);
  obstacles.push(obs);
  setTimeout(spawnObstacles, 1200);
}

function spawnCollectibles() {
  if (!isGameRunning) return;
  if (Math.random() > 0.35) { setTimeout(spawnCollectibles, 3000); return; }
  var coin = new THREE.Mesh(
    new THREE.TorusGeometry(0.7, 0.2, 16, 100),
    new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.9, wireframe: true })
  );
  var lane = Math.floor(Math.random() * lanes.length);
  coin.position.set(lanes[lane], 0.5, -20);
  markerGroup.add(coin);
  collectibles.push(coin);
  setTimeout(spawnCollectibles, 3000);
}

function moveLeft()  { if (isGameRunning && currentLane > 0) currentLane--; }
function moveRight() { if (isGameRunning && currentLane < 2) currentLane++; }

document.addEventListener('touchstart', function(e){ touchStartX = e.changedTouches[0].screenX; });
document.addEventListener('touchend',   function(e){
  var diff = touchStartX - e.changedTouches[0].screenX;
  if (Math.abs(diff) > 50) diff > 0 ? moveRight() : moveLeft();
});
document.getElementById('btn-left').addEventListener('click',  moveLeft);
document.getElementById('btn-right').addEventListener('click', moveRight);
window.addEventListener('keydown', function(e){
  if (e.key === 'ArrowLeft')  moveLeft();
  if (e.key === 'ArrowRight') moveRight();
});

document.getElementById('start-btn').addEventListener('click',   startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

initARScene();
