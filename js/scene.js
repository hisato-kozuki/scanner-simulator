import * as THREE from './vendor/three.module.min.js';
import { azimuthOf, directionFromAngles, elevationOf } from './orientation.js';

const LOGO_SIZE = 2.6;
const RING_RADIUS = 1.6;
const RING_Y = -3;
const LABEL_RADIUS = RING_RADIUS + 0.38;
const VISIBLE_HALF_WIDTH = 2.9;
const VISIBLE_HALF_HEIGHT = 4.5;
const VIEW_SHIFT_UP = 0.06;
const FOV = 45;
// 真上・真下ではカメラの上方向が定まらないので描画時の仰角を制限する
const MAX_VIEW_ELEVATION = 85;

function ringPoint(azimuthDeg, radius) {
  const a = THREE.MathUtils.degToRad(azimuthDeg);
  return new THREE.Vector3(Math.sin(a) * radius, RING_Y, -Math.cos(a) * radius);
}

function createCanvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createLabel(text) {
  const texture = createCanvasTexture(128, 128, (ctx) => {
    ctx.font = '700 56px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 8;
    ctx.fillText(text, 64, 64);
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  }));
  sprite.scale.setScalar(0.6);
  return sprite;
}

function createRing() {
  const group = new THREE.Group();
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const ringGeometry = new THREE.RingGeometry(RING_RADIUS - 0.06, RING_RADIUS, 128);
  ringGeometry.rotateX(-Math.PI / 2);
  ringGeometry.translate(0, RING_Y, 0);
  group.add(new THREE.Mesh(ringGeometry, ringMaterial));

  const tickPoints = [];
  for (let deg = 0; deg < 360; deg += 30) {
    const length = deg % 90 === 0 ? 0.2 : 0.1;
    tickPoints.push(ringPoint(deg, RING_RADIUS), ringPoint(deg, RING_RADIUS + length));
  }
  group.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(tickPoints),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
  ));

  for (const deg of [0, 90, 180, 270]) {
    const label = createLabel(String(deg));
    label.position.copy(ringPoint(deg, LABEL_RADIUS));
    group.add(label);
  }
  return group;
}

// リングの内側で、現在スマホが向いている方位を指す矢印
function createHeadingMarker() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, RING_Y, -(RING_RADIUS - 0.1),
    -0.13, RING_Y, -(RING_RADIUS - 0.36),
    0.13, RING_Y, -(RING_RADIUS - 0.36),
  ], 3));
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    color: 0xffb300,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
}

function createPlaceholderLogo() {
  return createCanvasTexture(512, 512, (ctx) => {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 16;
    ctx.strokeRect(16, 16, 480, 480);
    ctx.fillStyle = '#fff';
    ctx.font = '700 88px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('logo.png', 256, 256);
  });
}

function createGlowTexture() {
  return createCanvasTexture(256, 256, (ctx) => {
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.35, 'rgba(190,240,255,0.65)');
    gradient.addColorStop(1, 'rgba(120,210,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
  });
}

export function createScene(canvas, targetDirection) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  let cameraDistance = 10;

  scene.add(createRing());
  const headingMarker = createHeadingMarker();
  scene.add(headingMarker);

  const logoMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const flashMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const logoGeometry = new THREE.PlaneGeometry(1, 1);
  const logo = new THREE.Mesh(logoGeometry, logoMaterial);
  const flash = new THREE.Mesh(logoGeometry, flashMaterial);
  logo.renderOrder = 1;
  flash.renderOrder = 2;
  flash.scale.setScalar(1.04);
  logo.add(flash);
  scene.add(logo);

  // 目標方向から見たときに正面を向くように画像を空中へ配置する
  logo.lookAt(-targetDirection.x, -targetDirection.z, targetDirection.y);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createGlowTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  }));
  halo.scale.setScalar(LOGO_SIZE * 3.2);
  halo.renderOrder = 3;
  scene.add(halo);

  function applyLogoTexture(texture, width, height) {
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    logoMaterial.map = texture;
    flashMaterial.map = texture;
    logoMaterial.needsUpdate = true;
    flashMaterial.needsUpdate = true;
    const scale = LOGO_SIZE / Math.max(width, height);
    logo.scale.set(width * scale, height * scale, 1);
    flash.scale.set(1.04, 1.04, 1);
  }

  applyLogoTexture(createPlaceholderLogo(), 1, 1);
  new THREE.TextureLoader().load('image/logo.png', (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    applyLogoTexture(texture, texture.image.width, texture.image.height);
  }, undefined, () => {
    console.warn('image/logo.png を読み込めないため代替画像を表示します');
  });

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // 下部のパネルにリングが隠れないよう、描画全体を少し上にずらす
    camera.setViewOffset(width, height, 0, height * VIEW_SHIFT_UP, width, height);
    // 縦長の画面でもリングのラベルが左右に切れない距離まで下がる
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    cameraDistance = Math.max(
      VISIBLE_HALF_HEIGHT / tanHalfFov,
      VISIBLE_HALF_WIDTH / (tanHalfFov * camera.aspect),
    );
  }
  window.addEventListener('resize', resize);
  resize();

  return {
    setView(direction) {
      const azimuth = azimuthOf(direction);
      const elevation = THREE.MathUtils.clamp(
        elevationOf(direction), -MAX_VIEW_ELEVATION, MAX_VIEW_ELEVATION,
      );
      const view = directionFromAngles(azimuth, elevation);
      // 方向(東,北,上)を向く視点なので、カメラは物体を挟んだ反対側に置く
      camera.position.set(-view.x, -view.z, view.y).multiplyScalar(cameraDistance);
      camera.lookAt(0, 0, 0);
      headingMarker.rotation.y = -THREE.MathUtils.degToRad(azimuth);
    },
    setLogoOpacity(opacity) {
      logoMaterial.opacity = opacity;
    },
    setGlow(intensity) {
      flashMaterial.opacity = intensity;
      halo.material.opacity = intensity;
    },
    render() {
      renderer.render(scene, camera);
    },
  };
}
