import {
  angleBetween,
  azimuthOf,
  directionFromAngles,
  elevationOf,
  createOrientationSource,
} from './orientation.js';
import { createScanSession, isAligned, opacityFor } from './scan.js';
import { createScene } from './scene.js';

const INITIAL_TARGET = { azimuth: 0, elevation: 45 };
const TARGET_ELEVATION_MIN = 15;
const TARGET_ELEVATION_MAX = 75;
const TARGET_MIN_CHANGE_DEGREES = 30;
const SMOOTHING_RATE = 12;
const SENSOR_WAIT_MS = 1500;
const CAMERA_PLAY_WAIT_MS = 1500;
const CAMERA_ERROR = 'カメラを利用できません';
const CAMERA_HTTPS_ERROR = 'カメラを利用できません（HTTPS接続が必要です）';
const NO_SENSOR_NOTICE = '傾きセンサーがないため、ドラッグで操作します';
const DRAG_DEGREES_PER_PIXEL = 0.3;

const $ = (id) => document.getElementById(id);
const video = $('camera');
const stage = $('stage');
const scanButton = $('scan-button');
const resetButton = $('reset-button');
const startOverlay = $('start-overlay');

const orientation = createOrientationSource();
const session = createScanSession();
const scene = createScene(stage);

let target = INITIAL_TARGET;
let targetDirection = directionFromAngles(target.azimuth, target.elevation);
let viewDirection = orientation.direction;
let holding = false;
let dragEnabled = false;
let manual = { azimuth: 0, elevation: 0 };

const notices = new Set();
function renderNotices() {
  $('notice').textContent = [...notices].join(' / ');
}
function addNotice(text) {
  notices.add(text);
  renderNotices();
}
function removeNotice(text) {
  notices.delete(text);
  renderNotices();
}

function showTarget() {
  $('target').textContent = `目標　方位 ${target.azimuth}°　仰角 ${target.elevation}°`;
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// 移動しなくても完了できてしまわないよう、今の目標から十分に離れた方向を選ぶ
function setRandomTarget() {
  let next;
  let nextDirection;
  do {
    next = {
      azimuth: randomInt(0, 359),
      elevation: randomInt(TARGET_ELEVATION_MIN, TARGET_ELEVATION_MAX),
    };
    nextDirection = directionFromAngles(next.azimuth, next.elevation);
  } while (angleBetween(nextDirection, targetDirection) < TARGET_MIN_CHANGE_DEGREES);
  target = next;
  targetDirection = nextDirection;
  showTarget();
}

// play()は許可直後などに映像が流れていても拒否されることがあるので、
// 成否はplayingイベントと実際の再生状態で判断する
video.addEventListener('playing', () => {
  video.classList.add('active');
  removeNotice(CAMERA_ERROR);
});

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    addNotice(CAMERA_HTTPS_ERROR);
    return;
  }
  try {
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
  } catch (error) {
    console.warn(error);
    addNotice(CAMERA_ERROR);
    return;
  }
  try {
    await video.play();
  } catch (error) {
    console.warn(error);
    setTimeout(() => {
      if (video.paused) addNotice(CAMERA_ERROR);
    }, CAMERA_PLAY_WAIT_MS);
  }
}

function enableDragIfNoSensor() {
  if (orientation.hasSensor) {
    if (orientation.isRelative) addNotice('方位センサーが北を基準にしていません');
    return;
  }
  dragEnabled = true;
  addNotice(NO_SENSOR_NOTICE);
}

$('start-button').addEventListener('click', () => {
  startOverlay.hidden = true;
  // iOSの許可ダイアログはタップの処理中に要求する必要があるので、awaitを挟まずに呼ぶ
  orientation.start().then(() => setTimeout(enableDragIfNoSensor, SENSOR_WAIT_MS));
  startCamera();
});

function setHolding(value) {
  holding = value;
  scanButton.classList.toggle('holding', value);
}

scanButton.addEventListener('pointerdown', (e) => {
  scanButton.setPointerCapture(e.pointerId);
  setHolding(true);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  scanButton.addEventListener(type, () => setHolding(false));
}
resetButton.addEventListener('click', () => {
  session.reset();
  setRandomTarget();
});
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
  scanButton.hidden = session.completed;
  resetButton.hidden = !session.completed;
  $('target').hidden = session.completed;
}

let previousTime = performance.now();
function frame(now) {
  const dt = Math.min((now - previousTime) / 1000, 0.1);
  previousTime = now;

  if (dragEnabled && orientation.hasSensor) {
    dragEnabled = false;
    removeNotice(NO_SENSOR_NOTICE);
  }

  const source = orientation.hasSensor
    ? orientation.direction
    : directionFromAngles(manual.azimuth, manual.elevation);
  viewDirection = smoothDirection(viewDirection, source, dt);

  const angle = angleBetween(viewDirection, targetDirection);
  session.update(dt, holding, isAligned(angle));

  scene.setView(viewDirection);
  scene.setCubeOpacity(session.completed ? 1 : opacityFor(angle, session.progress));
  scene.setGlow(session.glow);
  scene.render();
  updateHud();

  requestAnimationFrame(frame);
}
showTarget();
requestAnimationFrame(frame);
