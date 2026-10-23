// "Two hearts, one pick": the approved match animation's timing and particle
// plan, kept free of the DOM so it can be checked on its own.

export const HEART_DURATION = 1050;
export const HEART_EASING = [0.25, 0.65, 0.35, 1]; // cubic-bezier(.25,.65,.35,1)
export const MEET_OFFSET = 0.54;
export const PARTICLES = 44;
export const BEHIND_SHARE = 0.6;
export const FLIGHT_MS = 2700;
export const BOUNCE_MS = 720;
export const HEART_TRAVEL = 96;
export const HEART_SIZE = 46;

const bezier = (t, a, b) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;

/**
 * Clock time at which the hearts meet. The meeting keyframe sits at eased
 * progress MEET_OFFSET, so invert the easing curve rather than taking a raw
 * percentage of the duration (that would fire the burst ~330ms late).
 */
export function collisionMs(duration = HEART_DURATION, offset = MEET_OFFSET, [x1, y1, x2, y2] = HEART_EASING) {
  let low = 0, high = 1;
  for (let i = 0; i < 40; i++) {
    const t = (low + high) / 2;
    if (bezier(t, y1, y2) < offset) low = t; else high = t;
  }
  return duration * bezier((low + high) / 2, x1, x2);
}

export function heartKeyframes(side) {
  return [
    { transform: `translateX(${side * HEART_TRAVEL}px) scale(.7)`, opacity: 0 },
    { opacity: 1, offset: 0.12 },
    { transform: "translateX(0) scale(1)", opacity: 1, offset: MEET_OFFSET },
    { transform: "translateX(0) scale(1.05)", opacity: 1, offset: 0.82 },
    { transform: "translateX(0) scale(1.28)", opacity: 0 },
  ];
}

export const BOUNCE_KEYFRAMES = [{ transform: "scale(1)" }, { transform: "scale(1.018)", offset: 0.5 }, { transform: "scale(1)" }];

/**
 * One entry per particle: which layer, what it is, its size and its flight
 * keyframes (low-gravity arc, gentle sway and rotation, soft fade). Every
 * particle launches at the same moment; only trajectories and sizes vary.
 */
export function burstPlan(random = Math.random, { pieces = PARTICLES, behind = BEHIND_SHARE, duration = FLIGHT_MS, gravity = 1 } = {}) {
  const seconds = duration / 1000;
  const backCount = Math.round(pieces * behind);
  return Array.from({ length: pieces }, (_, i) => {
    const rear = i < backCount, heart = i % 5 === 0;
    const size = rear ? 12 + random() * 6 : 18 + random() * 7;
    const spread = (i % 2 ? -1 : 1) * (0.4 + random() * 0.6);
    const vx = spread * (rear ? 130 : 74);
    const vy = rear ? -(265 + random() * 45) : -(145 + random() * 55);
    const g = (rear ? 190 : 145) * gravity;
    const rotation = (random() - 0.5) * 90;
    const frames = Array.from({ length: 61 }, (__, f) => {
      const progress = f / 60, t = progress * seconds;
      const x = vx * t + Math.sin(progress * 5 + i) * 7 * progress;
      const y = vy * t + 0.5 * g * t * t;
      const opacity = (rear ? 0.72 : 1) * Math.min(1, Math.max(0, (1 - progress) / 0.28));
      const scale = 0.55 + 0.45 * Math.min(1, progress / 0.12);
      return { offset: progress, transform: `translate(calc(-50% + ${x}px),calc(-50% + ${y}px)) rotate(${rotation * progress}deg) scale(${scale})`, opacity, visibility: "visible" };
    });
    return { rear, heart, color: heart ? (i % 2 ? "pink" : "cyan") : "kernel", size, frames };
  });
}
