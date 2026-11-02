import {
  angleBetween,
  azimuthOf,
  directionFromAngles,
  elevationOf,
  createOrientationSource,
} from './orientation.js';
import { createScanSession, opacityForAngle } from './scan.js';
import { createScene } from './scene.js';

const TARGET_DIRECTION = directionFromAngles(0, 45);
const ALIGNED_OPACITY = 1;
const SMOOTHING_RATE = 12;
const SENSOR_WAIT_MS = 1500;
const DRAG_DEGREES_PER_PIXEL = 0.3;

const $ = (id) => document.getElementById(id);
const video = $('camera');
const stage = $('stage');
const scanButton = $('scan-button');
const startOverlay = $('start-overlay');

const orientation = createOrientationSource();
const session = createScanSession();
const scene = createScene(stage, TARGET_DIRECTION);

let viewDirection = orientation.direction;
let holding = false;
let dragEnabled = false;
let manual = { azimuth: 0, elevation: 0 };

const notices = new Set();
function addNotice(text) {
  notices.add(text);
  $('notice').textContent = [...notices].join(' / ');
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    addNotice('カメラを利用できません（HTTPS接続が必要です）');
    return;
  }
  try {
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    await video.play();
    video.classList.add('active');
  } catch (error) {
    console.warn(error);
    addNotice('カメラを利用できません');
  }
}

function enableDragIfNoSensor() {
  if (orientation.hasSensor) {
    if (orientation.isRelative) addNotice('方位センサーが北を基準にしていません');
    return;
  }
  dragEnabled = true;
  addNotice('傾きセンサーがないため、ドラッグで操作します');
}

$('start-button').addEventListener('click', () => {
  startOverlay.hidden = true;
  // iOSの許可ダイアログはタップの処理中に要求する必要があるので、awaitを挟まずに呼ぶ
  orientation.start().then(() => setTimeout(enableDragIfNoSensor, SENSOR_WAIT_MS));
  startCamera();
});

function setHolding(value) {
  holding = value;
  scanButton.classList.toggle('holding', value && !session.completed);
}

scanButton.addEventListener('pointerdown', (e) => {
  scanButton.setPointerCapture(e.pointerId);
  setHolding(true);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  scanButton.addEventListener(type, () => setHolding(false));
}
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', () => setHolding(false));

stage.addEventListener('pointermove', (e) => {
  if (!dragEnabled || e.buttons === 0) return;
  manual = {
    azimuth: manual.azimuth - e.movementX * DRAG_DEGREES_PER_PIXEL,
    elevation: Math.max(-90, Math.min(90, manual.elevation + e.movementY * DRAG_DEGREES_PER_PIXEL)),
  };
});

function smoothDirection(current, target, dt) {
  const k = 1 - Math.exp(-SMOOTHING_RATE * dt);
  const x = current.x + (target.x - current.x) * k;
  const y = current.y + (target.y - current.y) * k;
  const z = current.z + (target.z - current.z) * k;
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

function updateHud() {
  const percent = Math.floor(session.progress * 100);
  $('progress-value').textContent = `${percent}%`;
  $('progress-bar').style.transform = `scaleX(${session.progress})`;
  $('azimuth-value').textContent = `${Math.round(azimuthOf(viewDirection)) % 360}°`;
  $('elevation-value').textContent = `${Math.round(elevationOf(viewDirection))}°`;
  $('error').classList.toggle('visible', session.error);
  $('complete').classList.toggle('visible', session.messageVisible);
  if (session.completed && !scanButton.classList.contains('finished')) {
    scanButton.classList.add('finished');
    scanButton.classList.remove('holding');
    scanButton.textContent = 'スキャン完了済み';
    $('target').hidden = true;
  }
}

let previousTime = performance.now();
function frame(now) {
  const dt = Math.min((now - previousTime) / 1000, 0.1);
  previousTime = now;

  const source = orientation.hasSensor
    ? orientation.direction
    : directionFromAngles(manual.azimuth, manual.elevation);
  viewDirection = smoothDirection(viewDirection, source, dt);

  const angleOpacity = opacityForAngle(angleBetween(viewDirection, TARGET_DIRECTION));
  session.update(dt, holding, angleOpacity === ALIGNED_OPACITY);

  scene.setView(viewDirection);
  scene.setLogoOpacity(session.completed ? 1 : angleOpacity);
  scene.setGlow(session.glow);
  scene.render();
  updateHud();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
