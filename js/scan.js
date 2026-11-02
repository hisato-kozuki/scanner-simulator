// スキャンの進行と完了演出のタイミングを管理する。描画やDOMには触れない。

export const SCAN_SECONDS = 5;
export const DECAY_SECONDS = 15;
export const GLOW_SECONDS = 0.5;
export const MESSAGE_SECONDS = 3;
const ERROR_MIN_SECONDS = 0.8;

// 目標方向からの角度差（度）の段階。先頭の段階でのみスキャンできる。
// held: ボタンを押している間の不透明度
// idle: 押していない間の不透明度の基準値（完了率に応じた係数を掛けて使う）
const OPACITY_STEPS = [
  { within: 10, held: 1, idle: 0.2 },
  { within: 20, held: 0.7, idle: 0.14 },
  { within: 35, held: 0.45, idle: 0.09 },
  { within: 60, held: 0.25, idle: 0.05 },
  { within: 180, held: 0.1, idle: 0 },
];
const IDLE_PERCENT_DIVISOR = 20;

export function isAligned(angle) {
  return angle <= OPACITY_STEPS[0].within;
}

export function opacityFor(angle, holding, progress) {
  const step = OPACITY_STEPS.find((candidate) => angle <= candidate.within);
  return holding ? step.held : step.idle * (progress * 100) / IDLE_PERCENT_DIVISOR;
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
