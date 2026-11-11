import type { GameArchive } from './archive.ts';
import { Binary } from './binary.ts';
import type { Chunk } from './binary.ts';
import { fallbackPalette } from './palette.ts';
import { readPalette } from './room.ts';
import type { RGB } from './room.ts';

export interface Cel {
  width: number;
  height: number;
  x: number;
  y: number;
  moveX: number;
  moveY: number;
  pixels: number[];
}
export interface Track { cels: number[]; loop: boolean; disabled?: true }
export interface Chore { tracks: (Track | null)[] }
export interface Costume {
  version: 1;
  name: string;
  palette: RGB[];
  paletteIndices?: number[];
  limbs: Record<number, Cel>[];
  chores: Record<number, Chore>;
  sourceFacing: boolean;
  baseChore?: number;
}

export const EMPTY = -1;
export const DIRECTIONS = ['LEFT', 'RIGHT', 'FRONT', 'BACK'] as const;

export function readCostume(game: GameArchive, id: number): Costume {
  const { entry, chunk } = game.resource('DCOS', id);
  let roomPalette: RGB[] | undefined;
  try { roomPalette = readPalette(game.disk, game.room(entry.room)); } catch { /* Costume data is independent of the preview palette. */ }
  return decodeCostume(game.disk, chunk, `COST ${id}`, roomPalette);
}

export function readCostumeFile(bytes: Uint8Array, name: string): Costume {
  const binary = new Binary(bytes);
  const chunk = binary.chunk(0);
  if (chunk.tag !== 'COST' || chunk.end !== bytes.length) throw new Error('Choose a standalone SCUMM v5 COST block.');
  return decodeCostume(binary, chunk, name);
}

function decodeCostume(disk: Binary, chunk: Chunk, name: string, roomPalette?: RGB[]): Costume {
  const base = chunk.start + 2;
  const lastAnimation = disk.u8(chunk.data);
  const flags = disk.u8(chunk.data + 1);
  const format = flags & 127;
  if (format !== 0x58 && format !== 0x59) throw new Error(`Unsupported COST format ${format.toString(16)}`);
  const colors = format === 0x58 ? 16 : 32;
  const paletteIndices = Array.from({ length: colors }, (_, n) => disk.u8(chunk.data + 2 + n));
  const palette = paletteIndices.map(index => roomPalette?.[index] ?? fallbackPalette(index));
  const tables = chunk.data + 2 + colors;
  const commandStart = base + disk.u16(tables);
  const frameTable = tables + 2;
  const choreTable = frameTable + 32;
  if (choreTable + (lastAnimation + 1) * 2 > chunk.end || commandStart > chunk.end) {
    throw new Error(`Invalid COST tables for ${name}`);
  }
  const limbs: Costume['limbs'] = Array.from({ length: 16 }, () => ({}));
  const chores: Costume['chores'] = {};

  for (let animation = 0; animation <= lastAnimation; animation++) {
    const offset = disk.u16(choreTable + animation * 2);
    if (!offset) continue;
    let at = base + offset;
    if (at + 2 > chunk.end) throw new Error('Invalid COST animation offset');
    const mask = disk.u16(at);
    at += 2;
    const tracks: Chore['tracks'] = Array.from({ length: 16 }, () => null);
    chores[animation] = { tracks };
    for (let limb = 0; limb < 16; limb++) {
      if (!(mask & (0x8000 >> limb))) continue;
      if (at + 2 > chunk.end) throw new Error('Truncated COST track');
      const start = disk.u16(at);
      at += 2;
      if (start === 0xffff) {
        tracks[limb] = { cels: [], loop: false, disabled: true };
        continue;
      }
      if (at >= chunk.end) throw new Error('Truncated COST track length');
      const length = disk.u8(at++);
      const last = start + (length & 127);
      if (commandStart + last >= chunk.end) throw new Error('Invalid COST command range');
      const cels: number[] = [];
      for (let slot = start; slot <= last; slot++) {
        const code = disk.u8(commandStart + slot) & 127;
        if (code >= 0x78) {
          cels.push(code === 0x7b ? EMPTY : -code);
          continue;
        }
        cels.push(code);
        if (limbs[limb][code]) continue;
        const table = base + disk.u16(frameTable + limb * 2);
        const pointer = table + code * 2;
        if (pointer + 2 > chunk.end) throw new Error('Invalid COST frame table');
        limbs[limb][code] = readCel(disk.bytes, base + disk.u16(pointer), chunk.end, colors);
      }
      if (cels.length) tracks[limb] = { cels, loop: !(length & 128) };
    }
  }
  return { version: 1, name, palette, paletteIndices, limbs, chores, sourceFacing: !!(flags & 128) };
}

function readCel(bytes: Uint8Array, start: number, end: number, colors: number): Cel {
  if (start + 12 > end) throw new Error('Truncated COST cel header');
  const header = new DataView(bytes.buffer, bytes.byteOffset + start, 12);
  const width = header.getUint16(0, true);
  const height = header.getUint16(2, true);
  const x = header.getInt16(4, true);
  const y = header.getInt16(6, true);
  const moveX = header.getInt16(8, true);
  const moveY = header.getInt16(10, true);
  if (width * height > 512_000) throw new Error('Invalid COST cel dimensions');
  const pixels: number[] = Array(width * height);
  const runBits = colors === 16 ? 4 : 3;
  const runMask = (1 << runBits) - 1;
  let at = start + 12;
  let written = 0;
  while (written < pixels.length) {
    if (at >= end) throw new Error('Truncated COST pixels');
    const command = bytes[at++];
    const color = command >> runBits;
    const run = (command & runMask) || (at < end ? bytes[at++] : 0);
    if (!run || written + run > pixels.length) throw new Error('Invalid COST pixel run');
    for (let i = 0; i < run; i++, written++) {
      const x = Math.floor(written / height);
      const y = written % height;
      pixels[y * width + x] = color;
    }
  }
  return { width, height, x, y, moveX, moveY, pixels };
}
