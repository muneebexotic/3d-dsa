// Sizes and colours of the Graph Net pieces, in world units and sRGB.

import type { VisitState } from './algorithms';

export const R = 0.4; // disc radius
export const PEG = 0.2; // knot to the bottom of the disc
export const KNOT = 0.065; // knot radius, where the strings are tied
export const PH = 0.55; // plinth height (its top is y = 0)
export const MARGIN = 1.25; // plinth margin around the knots
export const L0 = 0.42; // how far a knot rises when it leaves the plinth
export const LIFT_MAX = 5.2; // the start's height above the last lifted knot at the end of a lift
export const PHI_FLAT = 0.84; // camera polar angle for a flat net
export const PHI_LIFT = 1.17; // and for a lifted one
export const REGION = { x: 14, z: 8.5 }; // knots stay inside this area

export type RGB = readonly [number, number, number];
const rgb = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

export const COL = {
  paper: rgb(0xf8f5ee),
  ink: rgb(0x1b1a17),
  graphite: rgb(0x57524a),
  faint: rgb(0x8c857a),
  string: rgb(0x837b6f),
  yellow: rgb(0xe8a817),
  yellowDeep: rgb(0xc48a0a),
  red: rgb(0xd1361e),
  cobalt: rgb(0x2346a8),
  cobaltDeep: rgb(0x172f78),
  light: rgb(0xefe8da),
  white: [1, 1, 1] as RGB,
} as const;

/** How a knot looks in each state: unvisited is hollow, waiting yellow, processing cobalt, done ink. */
export const STATE: Readonly<Record<VisitState, { fill: RGB; glyph: RGB; rim: RGB; rimW: number }>> = {
  unseen: { fill: COL.paper, glyph: COL.ink, rim: COL.ink, rimW: 0.036 },
  wait: { fill: COL.yellow, glyph: COL.ink, rim: COL.yellowDeep, rimW: 0.02 },
  active: { fill: COL.cobalt, glyph: COL.white, rim: COL.cobaltDeep, rimW: 0.02 },
  done: { fill: COL.ink, glyph: COL.light, rim: COL.ink, rimW: 0.02 },
};
/** The same states as CSS colours, for the panels. */
export const HEX_FILL: Readonly<Record<VisitState, string>> = {
  unseen: '#F8F5EE',
  wait: '#E8A817',
  active: '#2346A8',
  done: '#1B1A17',
};
export const HEX_GLYPH: Readonly<Record<VisitState, string>> = {
  unseen: '#1B1A17',
  wait: '#1B1A17',
  active: '#FFFFFF',
  done: '#EFE8DA',
};

export const mix3 = (a: RGB, b: RGB, t: number): RGB =>
  a === b || t <= 0 ? a : t >= 1 ? b : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
