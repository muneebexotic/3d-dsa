// Viewer preferences and viewport checks, safe to import outside a browser (e.g. in unit tests).

/** The viewer asked for less motion. */
export const REDUCED: boolean =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Phone layout: the dock becomes a bottom sheet. */
export const isPhone = (): boolean => innerWidth <= 760;
