// A tiny memory: 32 slots of 8 bytes at addresses 0x00 … 0xF8. Slot 0 is never
// handed out, because address 0 is null. New nodes land wherever a seeded
// random pick says, so a list's nodes end up scattered, as they do in real memory.

import { mulberry } from '../../core/random';

export const MEM_SLOTS = 32;
export const SLOT_BYTES = 8;

/** 0xB8-style text for an address. */
export const addrText = (a: number): string => '0x' + a.toString(16).toUpperCase().padStart(2, '0');

export class Memory {
  private readonly used = new Set<number>();
  private readonly rnd: () => number;

  constructor(seed: number) {
    this.rnd = mulberry(seed);
  }

  get free(): number {
    return MEM_SLOTS - 1 - this.used.size;
  }

  /** A free address, picked at random. */
  alloc(): number {
    const free: number[] = [];
    for (let k = 1; k < MEM_SLOTS; k++) if (!this.used.has(k)) free.push(k);
    if (!free.length) throw new Error('Out of memory');
    const k = free[Math.floor(this.rnd() * free.length)];
    this.used.add(k);
    return k * SLOT_BYTES;
  }

  release(addr: number): void {
    this.used.delete(addr / SLOT_BYTES);
  }

  isUsed(addr: number): boolean {
    return this.used.has(addr / SLOT_BYTES);
  }
}
