// Sizes and colours of the Graph Net pieces, in world units and sRGB.

import { TONE, rgb, type RGB } from '../../core/color';
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

export type { RGB } from '../../core/color';
export { mix3 } from '../../core/color';

export const COL = {
  ...TONE,
  string: rgb(0x837b6f),
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
