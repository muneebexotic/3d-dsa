// How Prefix Sunburst is painted, in sRGB for the scene and hex for the panels.
// Letters are ink discs on wire. Gold is for words: the centre every word starts
// from, the ring where a word ends, the wedge of words under a prefix. Cobalt is
// the path being followed, yellow a node just made, red a node being taken away
// or a slot that is empty.

import { TONE, rgb } from '../../core/color';

export const COL = {
  ...TONE,
  plinth: rgb(0xf7f3eb),
  back: rgb(0xe2dacb),
  /** Word marks and the centre. */
  gold: rgb(0xe8a817),
  goldDeep: rgb(0xb07b08),
  /** The rings and the baseline, drawn faint like a protractor's. */
  guide: rgb(0xc9c0b0),
  wire: rgb(0x3a3732),
  /** A slot with nothing in it. */
  slot: rgb(0xe9e2d4),
  slotEdge: rgb(0xd3cab9),
  redDeep: rgb(0xa82812),
  /** A branch the spell check cut. */
  cut: rgb(0xd9a497),
} as const;

export const HEX = {
  ink: '#1B1A17',
  light: '#EFE8DA',
  gold: '#E8A817',
  goldDeep: '#B07B08',
  cobalt: '#2346A8',
  red: '#D1361E',
  graphite: '#57524A',
  faint: '#8C857A',
  paper: '#F8F5EE',
} as const;
