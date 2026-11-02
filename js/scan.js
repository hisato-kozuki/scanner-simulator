// スキャンの進行と完了演出のタイミングを管理する。描画やDOMには触れない。

export const SCAN_SECONDS = 5;
export const DECAY_SECONDS = 15;
export const GLOW_SECONDS = 0.5;
export const MESSAGE_SECONDS = 3;
const ERROR_MIN_SECONDS = 0.8;

// スキャンできる目標方向からの角度差（度）
const ALIGNED_ANGLE = 10;
const OPPOSITE_ANGLE = 180;
// 完了率100%のときの不透明度（ALIGNED_ANGLE以内で1、OPPOSITE_ANGLEで0.1）を
// 完了率0%では1/5に抑える
const OPPOSITE_ANGLE_OPACITY = 0.1;
const OPACITY_SCALE = 0.2;

export function isAligned(angle) {
  return angle <= ALIGNED_ANGLE;
}

export function opacityFor(angle, progress) {
  const t = Math.max(0, (angle - ALIGNED_ANGLE) / (OPPOSITE_ANGLE - ALIGNED_ANGLE));
  const smooth = t * t * (3 - 2 * t);
  const angleFactor = 1 - (1 - OPPOSITE_ANGLE_OPACITY) * smooth;
  return angleFactor * OPACITY_SCALE * (progress * 4 + 1);
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
    } else if (!holding) {
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
