// Small numeric helpers shared by every chapter's motion code.

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Where t sits between a and b, clamped to [0, 1]. */
export const seg = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));
/** Smoothstep of t between a and b. */
export const smooth = (a: number, b: number, t: number): number => {
  const x = seg(t, a, b);
  return x * x * (3 - 2 * x);
};
export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
/** Rises over [a, b] and falls over [c, d]. */
export const fadeInOut = (t: number, a: number, b: number, c: number, d: number): number =>
  smooth(a, b, t) * (1 - smooth(c, d, t));
export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
