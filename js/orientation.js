// 端末の姿勢を「背面カメラが向いている方向」の単位ベクトルとして扱う。
// 座標系は x: 東, y: 北, z: 上。
// 仰角は背面が水平より下を向くときを正とする。

const DEG = Math.PI / 180;

export function directionFromAngles(azimuth, elevation) {
  const az = azimuth * DEG;
  const el = elevation * DEG;
  return {
    x: Math.sin(az) * Math.cos(el),
    y: Math.cos(az) * Math.cos(el),
    z: -Math.sin(el),
  };
}

export function azimuthOf(d) {
  return (Math.atan2(d.x, d.y) / DEG + 360) % 360;
}

export function elevationOf(d) {
  return -Math.asin(Math.max(-1, Math.min(1, d.z))) / DEG;
}

export function angleBetween(a, b) {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  return Math.acos(Math.max(-1, Math.min(1, dot))) / DEG;
}

// DeviceOrientationの回転行列 Rz(alpha) * Rx(beta) * Ry(gamma) から背面方向を求める
export function backDirection(alpha, beta, gamma) {
  const sa = Math.sin(alpha * DEG);
  const ca = Math.cos(alpha * DEG);
  const sb = Math.sin(beta * DEG);
  const cb = Math.cos(beta * DEG);
  const sg = Math.sin(gamma * DEG);
  const cg = Math.cos(gamma * DEG);
  return {
    x: -(ca * sg + sa * sb * cg),
    y: -(sa * sg - ca * sb * cg),
    z: -(cb * cg),
  };
}

function topDirection(alpha, beta) {
  const sa = Math.sin(alpha * DEG);
  const ca = Math.cos(alpha * DEG);
  const sb = Math.sin(beta * DEG);
  const cb = Math.cos(beta * DEG);
  return { x: -sa * cb, y: ca * cb, z: sb };
}

function rotateAzimuth(d, degrees) {
  const s = Math.sin(degrees * DEG);
  const c = Math.cos(degrees * DEG);
  return { x: d.x * c + d.y * s, y: -d.x * s + d.y * c, z: d.z };
}

export function createOrientationSource() {
  const source = {
    direction: directionFromAngles(0, 0),
    hasSensor: false,
    // 方位の基準が北でない（相対値しか取れない）場合はtrue
    isRelative: false,
  };

  let hasAbsolute = false;
  let compassOffset = null;

  // iOSのalphaは起動時の向きが基準なので、webkitCompassHeadingとの差で北基準に補正する。
  // コンパス値は端末が水平に近いと上端、立てると背面の方位を指す。
  function updateCompassOffset(e) {
    if (e.webkitCompassAccuracy < 0) return;
    const reference = Math.abs(e.beta) < 45
      ? topDirection(e.alpha, e.beta)
      : backDirection(e.alpha, e.beta, e.gamma);
    const measured = e.webkitCompassHeading - azimuthOf(reference);
    if (compassOffset === null) {
      compassOffset = measured;
      return;
    }
    const diff = ((measured - compassOffset + 540) % 360 + 360) % 360 - 180;
    compassOffset += diff * 0.02;
  }

  function handle(e, isAbsolute) {
    if (e.alpha === null || e.beta === null || e.gamma === null) return;
    if (isAbsolute) hasAbsolute = true;
    else if (hasAbsolute) return;

    const hasCompass = typeof e.webkitCompassHeading === 'number';
    if (hasCompass) updateCompassOffset(e);

    const raw = backDirection(e.alpha, e.beta, e.gamma);
    source.direction = compassOffset === null ? raw : rotateAzimuth(raw, compassOffset);
    source.hasSensor = true;
    source.isRelative = !hasCompass && !hasAbsolute && !e.absolute;
  }

  // iOSではユーザー操作の中から呼ぶ必要がある
  source.start = async () => {
    if (typeof DeviceOrientationEvent === 'undefined') return false;
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const state = await DeviceOrientationEvent.requestPermission().catch(() => 'denied');
      if (state !== 'granted') return false;
    }
    window.addEventListener('deviceorientationabsolute', (e) => handle(e, true));
    window.addEventListener('deviceorientation', (e) => handle(e, false));
    return true;
  };

  return source;
}
