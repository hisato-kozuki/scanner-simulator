import * as THREE from './vendor/three.module.min.js';
import { azimuthOf, directionFromAngles, elevationOf } from './orientation.js';

const CUBE_SIZE = 1.8;
const CUBE_TEXTURE_SIZE = 512;
const LOGO_PADDING_RATIO = 0.08;
const RING_COLOR = 0x2f80ff;
const RING_LABEL_COLOR = '#4d9bff';
const RING_RADIUS = 1.6;
const RING_Y = -3.2;
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
    ctx.fillStyle = RING_LABEL_COLOR;
    ctx.fillText(text, 64, 64);
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  }));
  // 立方体の奥に回ったラベルも読めるように手前へ重ねる
  sprite.renderOrder = 2;
  sprite.scale.setScalar(0.6);
  return sprite;
}

function createRing() {
  const group = new THREE.Group();
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: RING_COLOR,
    transparent: true,
    opacity: 0.55,
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
    new THREE.LineBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0.55 }),
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
    color: RING_COLOR,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
}

// 白地の面の中央にロゴの縦横比を保って描いたテクスチャを作る
function createCubeFaceTexture(image) {
  const size = CUBE_TEXTURE_SIZE;
  return createCanvasTexture(size, size, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    const available = size * (1 - LOGO_PADDING_RATIO * 2);
    const scale = available / Math.max(image.width, image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
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

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  let cameraDistance = 10;

  scene.add(createRing());
  const headingMarker = createHeadingMarker();
  scene.add(headingMarker);

  const cubeMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
  });
  const flashMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const cubeGeometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
  const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
  const flash = new THREE.Mesh(cubeGeometry, flashMaterial);
  cube.renderOrder = 1;
  flash.renderOrder = 3;
  flash.scale.setScalar(1.04);
  cube.add(flash);
  scene.add(cube);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createGlowTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  }));
  halo.scale.setScalar(CUBE_SIZE * 4.6);
  halo.renderOrder = 4;
  scene.add(halo);

  new THREE.ImageLoader().load('image/logo.png', (image) => {
    const texture = createCubeFaceTexture(image);
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    cubeMaterial.map = texture;
    flashMaterial.map = texture;
    cubeMaterial.needsUpdate = true;
    flashMaterial.needsUpdate = true;
  }, undefined, () => {
    console.warn('image/logo.png を読み込めないため白い立方体を表示します');
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
    setCubeOpacity(opacity) {
      cubeMaterial.opacity = opacity;
    },
    setGlow(intensity) {
      flashMaterial.opacity = intensity;
      halo.material.opacity = intensity;
    },
    render() {
      // コンテキストの消失中はシェーダーのコンパイルで例外が出るので、復帰まで描画しない
      if (renderer.getContext().isContextLost()) return;
      renderer.render(scene, camera);
    },
  };
}
