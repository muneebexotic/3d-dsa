// How Heap Pyramid paints its discs, in sRGB for the scene and hex for the panels.

import { TONE, rgb, type RGB } from '../../core/color';
import type { Tone } from './diagram';

export const COL = {
  ...TONE,
  redDeep: rgb(0xa82812),
  cell: rgb(0xf4efe6),
  ochre: rgb(0xb07b08),
  spare: rgb(0xe3dccf),
} as const;

export interface Paint {
  fill: RGB;
  glyph: RGB;
  rim: RGB;
  rimW: number;
  halo: number;
}

/**
 * Ink for a key at rest, yellow for one on its way in, cobalt for the one being
 * sifted, a cobalt ring for the one it is compared with, a cobalt halo for the top
 * as it comes off, and paper for a key on the out tray.
 */
export const PAINT: Readonly<Record<Tone, Paint>> = {
  rest: { fill: COL.ink, glyph: COL.light, rim: COL.ink, rimW: 0.02, halo: 0 },
  new: { fill: COL.yellow, glyph: COL.ink, rim: COL.yellowDeep, rimW: 0.02, halo: 0 },
  cur: { fill: COL.cobalt, glyph: COL.white, rim: COL.cobaltDeep, rimW: 0.02, halo: 0.55 },
  look: { fill: COL.ink, glyph: COL.light, rim: COL.cobalt, rimW: 0.075, halo: 0 },
  top: { fill: COL.cobalt, glyph: COL.white, rim: COL.cobaltDeep, rimW: 0.02, halo: 1 },
  out: { fill: COL.paper, glyph: COL.ink, rim: COL.ink, rimW: 0.036, halo: 0 },
};

export const HEX: Readonly<Record<Tone, { fill: string; glyph: string; rim: string }>> = {
  rest: { fill: '#1B1A17', glyph: '#EFE8DA', rim: '#1B1A17' },
  new: { fill: '#E8A817', glyph: '#1B1A17', rim: '#C48A0A' },
  cur: { fill: '#2346A8', glyph: '#FFFFFF', rim: '#172F78' },
  look: { fill: '#1B1A17', glyph: '#EFE8DA', rim: '#2346A8' },
  top: { fill: '#2346A8', glyph: '#FFFFFF', rim: '#172F78' },
  out: { fill: '#F8F5EE', glyph: '#1B1A17', rim: '#1B1A17' },
};
