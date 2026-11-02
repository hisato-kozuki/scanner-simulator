// スキャンの進行と完了演出のタイミングを管理する。描画やDOMには触れない。

export const SCAN_SECONDS = 5;
export const GLOW_SECONDS = 0.5;
export const MESSAGE_SECONDS = 3;
const ERROR_MIN_SECONDS = 0.8;

// 目標方向からの角度差（度）ごとの不透明度。先頭の段階でのみスキャンできる。
const OPACITY_STEPS = [
  { within: 10, opacity: 1 },
  { within: 20, opacity: 0.7 },
  { within: 35, opacity: 0.45 },
  { within: 60, opacity: 0.25 },
  { within: 180, opacity: 0.1 },
];

export function opacityForAngle(angle) {
  return OPACITY_STEPS.find((step) => angle <= step.within).opacity;
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
    }
  };

  return session;
}
