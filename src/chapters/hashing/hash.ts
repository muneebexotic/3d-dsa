// The two hash functions on show, and the clock arithmetic that turns a hash into
// a bucket. Keys are whole numbers from 0 to 99, so every sum here can be checked
// by hand.

/** Plain: a number is its own hash, as in Python and Java. Scrambled: (37k + 11) mod 101. */
export type HashFn = 'plain' | 'scrambled';

/** The scrambled hash, from the textbook family ((a·k + b) mod p) mod m, with p prime. */
export const SCRAMBLE = { a: 37, b: 11, p: 101 } as const;

export const MIN_KEY = 0;
export const MAX_KEY = 99;

/** The number a key turns into before the clock. */
export function hashCode(k: number, fn: HashFn): number {
  return fn === 'plain' ? k : (SCRAMBLE.a * k + SCRAMBLE.b) % SCRAMBLE.p;
}

/** The bucket a key belongs in: wind its hash round an m-hour clock. */
export function bucketOf(k: number, m: number, fn: HashFn): number {
  return hashCode(k, fn) % m;
}

/** The hash as a short sum, for the callout: "57 mod 8 = 1", or "hash 27 · mod 8 = 3" when scrambled. */
export function hashSum(k: number, m: number, fn: HashFn): string {
  const h = hashCode(k, fn);
  return fn === 'plain' ? `${k} mod ${m} = ${h % m}` : `hash ${h} · mod ${m} = ${h % m}`;
}

/** Winding h hours round an m-hour clock, in words, to follow "h hours is": "seven full turns and 1 more". */
export function windWords(h: number, m: number): string {
  const turns = Math.floor(h / m),
    rest = h % m;
  if (turns === 0) return 'less than one full turn';
  const t = turns === 1 ? 'one full turn' : `${spell(turns)} full turns`;
  return rest ? `${t} and ${rest} more` : `exactly ${t}`;
}

const WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];
const spell = (n: number): string => WORDS[n] ?? String(n);
