import * as THREE from 'three';

let isGameRunning = false;
let score = 0;
let bestScore = 0;
let gameLevel = 1;
let currentLane = 1;
let gameTime = 0;
let touchStartX = 0;
let touchEndX = 0;

const lanes = [-2, 0, 2];
const baseSpeed = 0.05;
const baseObstacleSpeed = 0.06;
const levelDuration = 10000;

const hud = document.getElementById('hud');
const scoreElement = document.getElementById('score');
const bestScoreElement = document.getElementById('best-score');
const levelElement = document.getElementById('game-level');
const speedElement = document.getElementById('game-speed');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreElement = document.getElementById('final-score');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const arContainer = document.getElementById('arContainer');

try {
  bestScore = parseInt(localStorage.getItem('neonRunnerBest')) || 0;
  if (bestScoreElement) bestScoreElement.innerText = 'BEST: ' + bestScore;
} catch (error) {
  console.warn('Local storage blocked. High scores will not save.');
}

let scene, camera, renderer;
let playerCar, gridHelper;
let obstacles = [];
let collectibles = [];
let timeMultiplier = 1.0;

const markerGroup = new THREE.Group();

function initScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.03);
  scene.add(markerGroup);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 2, 6);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setClearColor(0x000000, 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.top = '0px';
  renderer.domElement.style.left = '0px';
  arContainer.appendChild(renderer.domElement);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  buildGameScene();

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    if (isGameRunning) {
      gameTime += clock.getDelta() * 1000;

      const newLevel = Math.floor(gameTime / levelDuration) + 1;
      if (newLevel > gameLevel) {
        gameLevel = newLevel;
        timeMultiplier = 1.0 + (gameLevel - 1) * 0.15;
        if (levelElement) levelElement.innerText = 'LEVEL: ' + gameLevel;
        if (speedElement) speedElement.innerText = 'SPEED: ' + timeMultiplier.toFixed(1) + 'x';
      }

      const currentSpeed = baseSpeed * timeMultiplier;
      const currentObstacleSpeed = baseObstacleSpeed * timeMultiplier;

      playerCar.position.x += (lanes[currentLane] - playerCar.position.x) * 0.2;
      gridHelper.position.z += currentSpeed;
      if (gridHelper.position.z > 2) gridHelper.position.z = 0;

      const gameObjects = [...obstacles, ...collectibles];
      for (let i = gameObjects.length - 1; i >= 0; i--) {
        let obj = gameObjects[i];
        obj.position.z += currentObstacleSpeed;

        if (
          obj.position.z > playerCar.position.z - 1.5 &&
          obj.position.z < playerCar.position.z + 1.5 &&
          Math.abs(obj.position.x - playerCar.position.x) < 0.8
        ) {
          const isCollectible = collectibles.includes(obj);
          if (isCollectible) {
            score += 100;
            if (scoreElement) scoreElement.innerText = 'SCORE: ' + score;
            markerGroup.remove(obj);
            collectibles.splice(collectibles.indexOf(obj), 1);
          } else {
            triggerGameOver();
            continue;
          }
        }

        if (obj.position.z > camera.position.z) {
          markerGroup.remove(obj);
          if (!collectibles.includes(obj)) {
            obstacles.splice(obstacles.indexOf(obj), 1);
            score += 10;
            if (scoreElement) scoreElement.innerText = 'SCORE: ' + score;
          } else {
            collectibles.splice(collectibles.indexOf(obj), 1);
          }
        }

        if (collectibles.includes(obj)) {
          obj.rotation.y += 0.05;
        }
      }
    } else {
      clock.getDelta();
    }

    renderer.render(scene, camera);
  }

  animate();
}

function buildGameScene() {
  const sunGeometry = new THREE.SphereGeometry(30, 64, 64);
  const sunShader = {
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        vec3 coreColor = vec3(1.0, 1.0, 0.0);
        vec3 rimColor = vec3(1.0, 0.0, 0.5);
        vec3 color = mix(coreColor, rimColor, vUv.y);
        float linePattern = step(0.1, mod(vUv.y * 30.0, 1.0));
        color *= linePattern;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  };
  const sunMaterial = new THREE.ShaderMaterial(sunShader);
  const neonSun = new THREE.Mesh(sunGeometry, sunMaterial);
  neonSun.position.set(0, 5, -80);
  markerGroup.add(neonSun);

  const horizonPlane = new THREE.PlaneGeometry(300, 50);
  const horizonMaterial = new THREE.MeshBasicMaterial({ color: 0x003366, transparent: true, opacity: 0.3 });
  const horizonGlow = new THREE.Mesh(horizonPlane, horizonMaterial);
  horizonGlow.position.set(0, 5, -79);
  markerGroup.add(horizonGlow);

  const starCount = 500;
  const starGeometry = new THREE.BufferGeometry();
  const starCoords = [];
  for (let i = 0; i < starCount; i++) {
    starCoords.push(THREE.MathUtils.randFloatSpread(400), THREE.MathUtils.randFloatSpread(400), -300);
  }
  starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starCoords, 3));
  const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0.7 });
  const starfield = new THREE.Points(starGeometry, starMaterial);
  markerGroup.add(starfield);

  gridHelper = new THREE.GridHelper(200, 100, 0xff00ff, 0x45a29e);
  gridHelper.position.y = -1;
  markerGroup.add(gridHelper);

  const carGeometry = new THREE.BoxGeometry(1, 0.5, 2);
  const carMaterial = new THREE.MeshBasicMaterial({ color: 0x66fcf1 });
  playerCar = new THREE.Mesh(carGeometry, carMaterial);
  playerCar.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(carGeometry),
    new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 })
  ));
  markerGroup.add(playerCar);
}

function startGame() {
  isGameRunning = true;
  score = 0;
  gameLevel = 1;
  gameTime = 0;
  timeMultiplier = 1.0;
  currentLane = 1;

  if (scoreElement) scoreElement.innerText = 'SCORE: 0';
  if (levelElement) levelElement.innerText = 'LEVEL: 1';
  if (speedElement) speedElement.innerText = 'SPEED: 1.0x';

  if (startScreen) startScreen.style.display = 'none';
  if (gameOverScreen) gameOverScreen.style.display = 'none';
  if (hud) hud.style.display = 'block';

  playerCar.position.set(lanes[1], 0, 0);

  obstacles.forEach((obs) => markerGroup.remove(obs));
  obstacles.length = 0;
  collectibles.forEach((col) => markerGroup.remove(col));
  collectibles.length = 0;

  spawnObstacles();
  spawnCollectibles();
}

function triggerGameOver() {
  isGameRunning = false;

  if (score > bestScore) {
    bestScore = score;
    try { localStorage.setItem('neonRunnerBest', bestScore); } catch (e) {}
    if (bestScoreElement) bestScoreElement.innerText = 'BEST: ' + bestScore;
  }

  if (hud) hud.style.display = 'none';
  if (gameOverScreen) gameOverScreen.style.display = 'flex';
  if (finalScoreElement) finalScoreElement.innerText = 'FINAL SCORE: ' + score;
}

function spawnObstacles() {
  if (!isGameRunning) return;

  const obstacleTypes = [
    { geom: new THREE.BoxGeometry(1, 1, 1), color: 0xff00ff },
    { geom: new THREE.BoxGeometry(0.5, 4, 0.5), color: 0x00ccff },
    { geom: new THREE.BoxGeometry(3, 1, 1), color: 0xff5500 },
  ];

  const typeIndex = Math.floor(Math.random() * obstacleTypes.length);
  const type = obstacleTypes[typeIndex];
  const material = new THREE.MeshBasicMaterial({ color: type.color });

  const obstacle = new THREE.Mesh(type.geom, material);
  const edges = new THREE.EdgesGeometry(type.geom);
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 }));
  obstacle.add(line);

  const randomLane = Math.floor(Math.random() * lanes.length);
  obstacle.position.set(lanes[randomLane], type.geom.parameters.height / 2 - 1, -30);
  markerGroup.add(obstacle);
  obstacles.push(obstacle);

  setTimeout(spawnObstacles, 1000);
}

function spawnCollectibles() {
  if (!isGameRunning) return;
  if (Math.random() > 0.4) {
    setTimeout(spawnCollectibles, 3000);
    return;
  }

  const goldCoinGeometry = new THREE.TorusGeometry(0.7, 0.2, 16, 100);
  const goldCoinMaterial = new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.9, wireframe: true });
  const coin = new THREE.Mesh(goldCoinGeometry, goldCoinMaterial);

  let randomLane = Math.floor(Math.random() * lanes.length);
  const isOccupied = obstacles.some((obs) => obs.position.x === lanes[randomLane] && obs.position.z < -25);
  if (isOccupied) randomLane = (randomLane + 1) % lanes.length;

  coin.position.set(lanes[randomLane], 0.5, -30);
  markerGroup.add(coin);
  collectibles.push(coin);

  setTimeout(spawnCollectibles, 3000);
}

function moveLeft() {
  if (!isGameRunning) return;
  if (currentLane > 0) currentLane--;
}

function moveRight() {
  if (!isGameRunning) return;
  if (currentLane < 2) currentLane++;
}

document.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].screenX; });
document.addEventListener('touchend', (e) => {
  touchEndX = e.changedTouches[0].screenX;
  const diff = touchStartX - touchEndX;
  if (Math.abs(diff) > 50) diff > 0 ? moveRight() : moveLeft();
});

document.getElementById('btn-left').addEventListener('click', moveLeft);
document.getElementById('btn-right').addEventListener('click', moveRight);

window.addEventListener('keydown', (event) => {
  if (!isGameRunning) return;
  if (event.key === 'ArrowLeft') moveLeft();
  if (event.key === 'ArrowRight') moveRight();
});

if (startBtn) startBtn.addEventListener('click', startGame);
if (restartBtn) restartBtn.addEventListener('click', startGame);

initScene();
