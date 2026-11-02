export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const DEG = Math.PI / 180;
/** Suavização independente de FPS: fração a aplicar neste dt para uma constante de tempo tau. */
export const damp = (dt, tau) => (tau <= 0 ? 1 : 1 - Math.exp(-dt / tau));
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const angleLerp = (a, b, t) => a + wrapAngle(b - a) * t;
export const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const percentile = (sortedAsc, p) => {
  if (!sortedAsc.length) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1));
  return sortedAsc[idx];
};
