// スキャンの進行と完了演出のタイミングを管理する。描画やDOMには触れない。

export const SCAN_SECONDS = 5;
export const DECAY_SECONDS = 15;
export const GLOW_SECONDS = 0.5;
export const MESSAGE_SECONDS = 3;
const ERROR_MIN_SECONDS = 0.8;

// スキャンできる目標方向からの角度差（度）
const ALIGNED_ANGLE = 10;
const OPPOSITE_ANGLE = 180;
// 角度係数は0度で1、180度で0.1とし、ALIGNED_ANGLE付近で大きく変化させる。
// 緩やかな成分（0度で0.4、180度で0.1）に急な段差を足した形にする
const FAR_FACTOR_AT_ZERO = 0.4;
const FAR_FACTOR_AT_OPPOSITE = 0.1;
const EDGE_WIDTH_DEGREES = 2;
// 完了率0%では不透明度を1/5に抑える
const OPACITY_SCALE = 0.2;

function edgeAt(angle) {
  return 1 / (1 + Math.exp((angle - ALIGNED_ANGLE) / EDGE_WIDTH_DEGREES));
}

export function angleFactor(angle) {
  const far = FAR_FACTOR_AT_ZERO
    + (FAR_FACTOR_AT_OPPOSITE - FAR_FACTOR_AT_ZERO) * (angle / OPPOSITE_ANGLE);
  const edge = edgeAt(angle) / edgeAt(0);
  return far + (1 - far) * edge;
}

export function isAligned(angle) {
  return angle <= ALIGNED_ANGLE;
}

export function opacityFor(angle, progress) {
  return angleFactor(angle) * OPACITY_SCALE * (progress * 4 + 1);
}

export function createScanSession() {
  const session = {
    progress: 0,
    completed: false,
    error: false,
    glow: 0,
    messageVisible: false,
  };

  let errorTime = 0;
  let sinceComplete = 0;

  session.update = (dt, holding, aligned) => {
    if (session.completed) {
      sinceComplete += dt;
      const inGlow = sinceComplete < GLOW_SECONDS;
      session.glow = inGlow ? Math.sin((Math.PI * sinceComplete) / GLOW_SECONDS) ** 0.5 : 0;
      session.messageVisible = !inGlow && sinceComplete < GLOW_SECONDS + MESSAGE_SECONDS;
      return;
    }

    errorTime = holding && !aligned ? ERROR_MIN_SECONDS : Math.max(0, errorTime - dt);
    session.error = errorTime > 0;

    if (holding && aligned) {
      session.progress = Math.min(1, session.progress + dt / SCAN_SECONDS);
      if (session.progress === 1) {
        session.completed = true;
        session.error = false;
      }
    } else {
      session.progress = Math.max(0, session.progress - dt / DECAY_SECONDS);
    }
  };

  session.reset = () => {
    session.progress = 0;
    session.completed = false;
    session.error = false;
    session.glow = 0;
    session.messageVisible = false;
    errorTime = 0;
    sinceComplete = 0;
  };

  return session;
}
