import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';

let isARMode = false;
const arInfo = document.getElementById('ar-info');

// --- 1. SETUP SCENE ---
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.03); 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 6); 

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); 
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0); 
document.body.appendChild(renderer.domElement);

// Procedural Neon Sun Background
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
    `
};
const sunMaterial = new THREE.ShaderMaterial(sunShader);
const neonSun = new THREE.Mesh(sunGeometry, sunMaterial);
neonSun.position.set(0, 5, -80); 
scene.add(neonSun);

const horizonPlane = new THREE.PlaneGeometry(300, 50);
const horizonMaterial = new THREE.MeshBasicMaterial({ color: 0x003366, transparent: true, opacity: 0.3 });
const horizonGlow = new THREE.Mesh(horizonPlane, horizonMaterial);
horizonGlow.position.set(0, 5, -79);
scene.add(horizonGlow);

// THE FIX: Using BufferGeometry instead of the deprecated PointsGeometry
const starCount = 500;
const starGeometry = new THREE.BufferGeometry(); 
const starCoords = [];
for (let i = 0; i < starCount; i++) {
    starCoords.push(THREE.MathUtils.randFloatSpread(400), THREE.MathUtils.randFloatSpread(400), -300);
}
starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starCoords, 3));
const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0.7 });
const starfield = new THREE.Points(starGeometry, starMaterial);
scene.add(starfield);

const gridHelper = new THREE.GridHelper(200, 100, 0xff00ff, 0x45A29E); 
gridHelper.position.y = -1;
scene.add(gridHelper);

const carGeometry = new THREE.BoxGeometry(1, 0.5, 2);
const carMaterial = new THREE.MeshBasicMaterial({ color: 0x66FCF1, wireframe: false }); 
const playerCar = new THREE.Mesh(carGeometry, carMaterial);
playerCar.add(new THREE.LineSegments(new THREE.EdgesGeometry(carGeometry), new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 })));
scene.add(playerCar);

const lanes = [-2, 0, 2]; 
let currentLane = 1; 

// --- 2. GAME STATE & UI VARIABLES ---
let isGameRunning = false;
let score = 0;
let bestScore = 0;

try {
    bestScore = localStorage.getItem('neonRunnerBest') || 0; 
} catch (error) {
    console.warn("Local storage blocked. High scores will not save.");
}

let gameLevel = 1;
let baseSpeed = 0.05;
let baseObstacleSpeed = 0.06;
let timeMultiplier = 1.0;
let gameTime = 0;
let levelDuration = 10000; 

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

if (bestScoreElement) bestScoreElement.innerText = "BEST: " + bestScore;

// --- 3. UI FUNCTIONS ---
function startGame() {
    isGameRunning = true;
    score = 0;
    gameLevel = 1;
    gameTime = 0;
    timeMultiplier = 1.0;
    if(scoreElement) scoreElement.innerText = "SCORE: 0";
    if(levelElement) levelElement.innerText = "LEVEL: 1";
    if(speedElement) speedElement.innerText = "SPEED: 1.0x";
    
    if(startScreen) startScreen.style.display = 'none';
    if(gameOverScreen) gameOverScreen.style.display = 'none';
    if(hud) hud.style.display = 'block';

    playerCar.position.x = lanes[1];
    currentLane = 1;
    obstacles.forEach(obs => scene.remove(obs));
    obstacles.length = 0;
    collectibles.forEach(col => scene.remove(col));
    collectibles.length = 0;
}

function triggerGameOver() {
    isGameRunning = false;
    
    if (score > bestScore) {
        bestScore = score;
        try {
            localStorage.setItem('neonRunnerBest', bestScore);
        } catch (error) {}
        if(bestScoreElement) bestScoreElement.innerText = "BEST: " + bestScore;
    }

    if(hud) hud.style.display = 'none';
    if(gameOverScreen) gameOverScreen.style.display = 'flex';
    if(finalScoreElement) finalScoreElement.innerText = "FINAL SCORE: " + score;
}

if (startBtn) startBtn.addEventListener('click', startGame);
if (restartBtn) restartBtn.addEventListener('click', startGame);

window.addEventListener('keydown', (event) => {
    if (!isGameRunning) return; 
    if (event.key === 'ArrowLeft' && currentLane > 0) currentLane--;
    if (event.key === 'ArrowRight' && currentLane < 2) currentLane++;
});

// --- 4. OBSTACLES & COLLECTIBLES ---
const obstacles = [];
const collectibles = [];

const obstacleTypes = [
    { geom: new THREE.BoxGeometry(1, 1, 1), color: 0xff00ff }, // Magenta Cube
    { geom: new THREE.BoxGeometry(0.5, 4, 0.5), color: 0x00ccff }, // Blue Pillar
    { geom: new THREE.BoxGeometry(3, 1, 1), color: 0xff5500 } // Neon Orange Barrier (No longer matches car)
];

// Changed wireframe to FALSE to make them opaque
const obstacleMaterials = obstacleTypes.map(type => new THREE.MeshBasicMaterial({ color: type.color, wireframe: false }));

const goldCoinGeometry = new THREE.TorusGeometry(0.7, 0.2, 16, 100);
const goldCoinMaterial = new THREE.MeshBasicMaterial({ color: 0xFFD700, emissive: 0xFFD700, transparent: true, opacity: 0.9, wireframe: true });

function spawnObstacle() {
    if (!isGameRunning) return; 
    const typeIndex = Math.floor(Math.random() * obstacleTypes.length);
    const type = obstacleTypes[typeIndex];
    const material = obstacleMaterials[typeIndex];
    
    const obstacle = new THREE.Mesh(type.geom, material);
    
    // Adding a white outline to the solid blocks for the neon aesthetic
    const edges = new THREE.EdgesGeometry(type.geom);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 }));
    obstacle.add(line);

    const randomLane = Math.floor(Math.random() * lanes.length);
    obstacle.position.set(lanes[randomLane], type.geom.parameters.height / 2 - 1, -100);
    scene.add(obstacle);
    obstacles.push(obstacle);
}

function spawnCollectible() {
  if (!isGameRunning) return;
  if (Math.random() > 0.2) return;
  
  const coin = new THREE.Mesh(goldCoinGeometry, goldCoinMaterial);
  let randomLane = Math.floor(Math.random() * lanes.length);
  
  // --- THE FIX: Anti-Overlap Logic ---
  // Check if an obstacle is currently spawning in this exact lane
  const isOccupied = obstacles.some(obs => 
      obs.position.x === lanes[randomLane] && obs.position.z < -95
  );
  
  if (isOccupied) {
      // If occupied, shift the coin one lane over
      randomLane = (randomLane + 1) % lanes.length; 
  }
  // -----------------------------------

  coin.position.set(lanes[randomLane], 0.5, -100); 
  scene.add(coin);
  collectibles.push(coin);
}

setInterval(spawnObstacle, 1000); 
setInterval(spawnCollectible, 5000);

// --- 5. GAME LOOP & AR ---
renderer.xr.enabled = true;
const arButton = ARButton.createButton(renderer, {
  requiredFeatures: ['hit-test'],
  optionalFeatures: ['dom-overlay', 'dom-overlay-for-handheld-ar'],
  domOverlay: { root: document.body }
});

arButton.style.position = 'fixed';
arButton.style.bottom = '20px';
arButton.style.right = '20px';
arButton.style.zIndex = '15';

document.body.appendChild(arButton);

renderer.xr.addEventListener('sessionstart', () => {
  isARMode = true;
  if (arInfo) arInfo.textContent = 'AR MODE: ACTIVE';
});

renderer.xr.addEventListener('sessionend', () => {
  isARMode = false;
  if (arInfo) arInfo.textContent = '';
});

const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
    if (isGameRunning) {
        gameTime += clock.getDelta() * 1000;
        
        const newLevel = Math.floor(gameTime / levelDuration) + 1;
        if (newLevel > gameLevel) {
            gameLevel = newLevel;
            timeMultiplier = 1.0 + (gameLevel - 1) * 0.15; 
            if(levelElement) levelElement.innerText = "LEVEL: " + gameLevel;
            if(speedElement) speedElement.innerText = "SPEED: " + timeMultiplier.toFixed(1) + "x";
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

            if (obj.position.z > playerCar.position.z - 1.5 && 
                obj.position.z < playerCar.position.z + 1.5 && 
                Math.abs(obj.position.x - playerCar.position.x) < 0.8) {
                
                if (obj.material === goldCoinMaterial) {
                    score += 100;
                    if(scoreElement) scoreElement.innerText = "SCORE: " + score;
                    scene.remove(obj);
                    collectibles.splice(collectibles.indexOf(obj), 1);
                } else {
                    triggerGameOver();
                    continue;
                }
            }

            if (obj.position.z > camera.position.z) {
                scene.remove(obj);
                if (obj.material !== goldCoinMaterial) {
                    obstacles.splice(obstacles.indexOf(obj), 1);
                    score += 10;
                    if(scoreElement) scoreElement.innerText = "SCORE: " + score;
                } else {
                    collectibles.splice(collectibles.indexOf(obj), 1);
                }
            }
            
            if (obj.material === goldCoinMaterial) {
                obj.rotation.y += 0.05;
            }
        }
    } else {
        clock.getDelta(); 
    }
    renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
    if (!isARMode) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
});
