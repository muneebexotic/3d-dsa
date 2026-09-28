// The gallery's colours as linear-free sRGB triples, for instanced meshes and
// label shaders, and night(), which turns any of them into its dark-mode twin.
// The CSS versions of the same colours live in styles/tokens.css.

export type RGB = readonly [number, number, number];

/** 0xRRGGBB to an sRGB triple in [0, 1]. */
export const rgb = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

/** Blend two colours; returns one of the inputs unchanged at the ends. */
export const mix3 = (a: RGB, b: RGB, t: number): RGB =>
  a === b || t <= 0 ? a : t >= 1 ? b : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The design tokens every chapter paints with. */
export const TONE = {
  paper: rgb(0xf8f5ee),
  ink: rgb(0x1b1a17),
  graphite: rgb(0x57524a),
  faint: rgb(0x8c857a),
  yellow: rgb(0xe8a817),
  yellowDeep: rgb(0xc48a0a),
  red: rgb(0xd1361e),
  cobalt: rgb(0x2346a8),
  cobaltDeep: rgb(0x172f78),
  /** Numerals on ink discs. */
  light: rgb(0xefe8da),
  white: [1, 1, 1] as RGB,
} as const;

/* ---------- the gallery after dark ---------- */
// Dark mode is the same picture with its lightness turned inside out: ink becomes
// bone, paper becomes charcoal, and every colour keeps its hue. The map only ever
// reverses lightness, so any two colours keep their contrast, just the other way
// round: a numeral that reads on its disc by day still reads at night, whatever
// the pair. That is why every chapter, panel and drawing can be painted with its
// daylight colours and passed through night() at the last moment, with no dark
// palette of its own.

/** OKLab lightness by day → by night, a falling curve through these knots. Accents land mid-way, so both ink and white numerals keep reading on them. */
const NIGHT_L: readonly (readonly [number, number])[] = [
  [0, 0.97],
  [0.22, 0.915], // ink → bone
  [0.44, 0.77],
  [0.6, 0.615],
  [0.77, 0.55], // yellow → bronze
  [0.87, 0.3],
  [0.93, 0.265],
  [1, 0.215], // white → charcoal
];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** sRGB to OKLab (Björn Ottosson's matrices). */
export function oklab(c: RGB): [number, number, number] {
  const r = toLinear(c[0]),
    g = toLinear(c[1]),
    b = toLinear(c[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab to linear sRGB, which may fall outside [0, 1]. */
function linearOf(L: number, a: number, b: number, out: number[]): number[] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  out[0] = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  out[1] = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  out[2] = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return out;
}

function nightL(L: number): number {
  for (let i = 1; i < NIGHT_L.length; i++) {
    const [x1, y1] = NIGHT_L[i];
    if (L <= x1) {
      const [x0, y0] = NIGHT_L[i - 1];
      return y0 + ((Math.max(L, x0) - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return NIGHT_L[NIGHT_L.length - 1][1];
}

const _lin = [0, 0, 0];
const inGamut = (L: number, a: number, b: number) => linearOf(L, a, b, _lin).every(v => v >= -1e-5 && v <= 1 + 1e-5);

function nightOf(c: RGB): RGB {
  const [L, a, b] = oklab(c),
    L2 = nightL(L),
    C = Math.hypot(a, b);
  // greys darken without turning brown: their faint warmth shrinks with their lightness; accents keep their chroma
  const accent = Math.min(1, Math.max(0, (C - 0.03) / 0.06)),
    grey = Math.min(1, Math.max(0.3, L2 / Math.max(L, 1e-6)));
  let k = grey + (1 - grey) * accent;
  if (!inGamut(L2, a * k, b * k)) {
    // the darker end of a hue holds less chroma: keep the lightness and hue, give up chroma
    let lo = 0,
      hi = k;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(L2, a * mid, b * mid)) lo = mid;
      else hi = mid;
    }
    k = lo;
  }
  linearOf(L2, a * k, b * k, _lin);
  return [
    toGamma(Math.min(1, Math.max(0, _lin[0]))),
    toGamma(Math.min(1, Math.max(0, _lin[1]))),
    toGamma(Math.min(1, Math.max(0, _lin[2]))),
  ];
}

const nightCache = new Map<number, RGB>();
// the last colour asked for, by value: callers may hand over the same scratch array with new contents
let lastR = -1,
  lastG = -1,
  lastB = -1,
  lastNight: RGB = [0, 0, 0];

/**
 * A daylight colour as it looks in the dark room. Scenes call this tens of
 * thousands of times a frame, so results are kept per 8-bit colour: a hit costs
 * one lookup, and the same colour twice in a row (a run of wires) costs nothing.
 */
export function night(c: RGB): RGB {
  if (c[0] === lastR && c[1] === lastG && c[2] === lastB) return lastNight;
  const key = (((c[0] * 255 + 0.5) | 0) << 16) | (((c[1] * 255 + 0.5) | 0) << 8) | ((c[2] * 255 + 0.5) | 0);
  let n = nightCache.get(key);
  if (!n) {
    if (nightCache.size > 1 << 16) nightCache.clear();
    n = nightOf([((key >> 16) & 255) / 255, ((key >> 8) & 255) / 255, (key & 255) / 255]);
    nightCache.set(key, n);
  }
  lastR = c[0];
  lastG = c[1];
  lastB = c[2];
  lastNight = n;
  return n;
}

/** 0xRRGGBB by night. */
export const nightHex = (h: number): number => {
  const [r, g, b] = night(rgb(h));
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
};
