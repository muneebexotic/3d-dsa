// Sizes and places for Hash Clock, in world units. The plinth top is y = 0, x runs
// to the right and z toward the viewer. Bucket 0 sits at twelve o'clock (the far
// side) and the hours run clockwise seen from above, like a clock face.

export const R = 0.42; // disc radius
export const PH = 0.5; // plinth height
export const KNOB = 0.07; // the ball where a pointer is tied

/* the hub: the hash function, with the hand on top */
export const HUB_R = 0.78;
export const HUB_H = 0.3;
export const HUB_Y = HUB_H + R + 0.34; // a key waiting on the hub
export const HAND_Y = HUB_H + 0.07;

/* buckets */
export const CELL_W = 1.0; // along the ring
export const CELL_D = 0.84; // across it
export const CELL_H = 0.24;
export const SLOT_Y = CELL_H + R + 0.04; // a probing key standing in its bucket
export const LEVEL0 = CELL_H + 0.34 + R; // the first key of a chain, room for the bucket's pointer under it
export const LEVEL = 1.0; // chain level pitch
export const HOVER_CHAIN = 0.34; // a key waiting above a chain
export const HOVER_SLOT = 1.05; // a key looking at a slot from above
export const LIFT = 3.4; // the old arrangement, held up during a rehash

/** The radius of a clock of m buckets: more buckets, a bigger face. */
export function ringRadius(m: number): number {
  return m <= 8 ? 2.7 : m <= 16 ? 4.35 : 7.7;
}

/** Where bucket i of m sits, and the angle of its hour (0 at twelve o'clock, clockwise). */
export function bucketAt(m: number, i: number): { x: number; z: number; ang: number; r: number } {
  const ang = (i / m) * Math.PI * 2,
    r = ringRadius(m);
  return { x: r * Math.sin(ang), z: -r * Math.cos(ang), ang, r };
}

/** Height of a key's centre in its bucket. */
export function levelY(chain: boolean, level: number): number {
  return chain ? LEVEL0 + level * LEVEL : SLOT_Y;
}

/** Where a ring's hours are printed: inside it, at the end of each spoke, where no bucket hides them. */
export const numeralRadius = (m: number): number => ringRadius(m) - CELL_D / 2 - (m > 16 ? 0.36 : 0.44);

/** The hand reaches from the hub to just short of the hours. */
export const handLength = (m: number): number => numeralRadius(m) - (m > 16 ? 0.3 : 0.36);

/** The plinth is a disc a little wider than its outer ring. */
export const plinthRadius = (r: number): number => r + CELL_D / 2 + 0.75;

/* the load gauge stands off the plinth at half past four */
export const GAUGE_ANG = (Math.PI * 3) / 4;
export const GAUGE_H = 2.2;
export const GAUGE_W = 0.36;
export const GAUGE_OUT = 1.0; // beyond the plinth's edge
export function gaugeAt(plinthR: number): { x: number; z: number } {
  const d = plinthR + GAUGE_OUT;
  return { x: d * Math.sin(GAUGE_ANG), z: -d * Math.cos(GAUGE_ANG) };
}

/* camera */
export const PHI = 0.9;
