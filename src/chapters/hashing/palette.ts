// How Hash Clock paints its discs, in sRGB for the scene and hex for the panels.

import { TONE, rgb, type RGB } from '../../core/color';
import type { Tone } from './diagram';

export const COL = { ...TONE, redDeep: rgb(0xa82812), spoke: rgb(0xc9c0b0), cell: rgb(0xf4efe6) } as const;

export interface Paint {
  fill: RGB;
  glyph: RGB;
  rim: RGB;
  rimW: number;
  halo: number;
}

/** Ink for a key in the table, yellow for one on its way in, cobalt for the one being compared, red for one leaving, paper for the key looked for. */
export const PAINT: Readonly<Record<Tone, Paint>> = {
  rest: { fill: COL.ink, glyph: COL.light, rim: COL.ink, rimW: 0.02, halo: 0 },
  new: { fill: COL.yellow, glyph: COL.ink, rim: COL.yellowDeep, rimW: 0.02, halo: 0 },
  cur: { fill: COL.cobalt, glyph: COL.white, rim: COL.cobaltDeep, rimW: 0.02, halo: 0.55 },
  hit: { fill: COL.cobalt, glyph: COL.white, rim: COL.cobaltDeep, rimW: 0.02, halo: 1 },
  gone: { fill: COL.red, glyph: COL.white, rim: COL.redDeep, rimW: 0.02, halo: 0 },
  query: { fill: COL.paper, glyph: COL.ink, rim: COL.ink, rimW: 0.036, halo: 0 },
};

export const HEX: Readonly<Record<Tone, { fill: string; glyph: string; rim: string }>> = {
  rest: { fill: '#1B1A17', glyph: '#EFE8DA', rim: '#1B1A17' },
  new: { fill: '#E8A817', glyph: '#1B1A17', rim: '#C48A0A' },
  cur: { fill: '#2346A8', glyph: '#FFFFFF', rim: '#172F78' },
  hit: { fill: '#2346A8', glyph: '#FFFFFF', rim: '#172F78' },
  gone: { fill: '#D1361E', glyph: '#FFFFFF', rim: '#A82812' },
  query: { fill: '#F8F5EE', glyph: '#1B1A17', rim: '#1B1A17' },
};
