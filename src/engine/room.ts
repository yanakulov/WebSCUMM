import type { GameArchive } from './archive.ts';
import { required } from './binary.ts';
import type { Binary, Chunk } from './binary.ts';
import type { RGB } from './palette.ts';
export type { RGB } from './palette.ts';
export interface WalkBox { points: [number, number][]; mask: number; flags: number; scale: number }

export function readPalette(disk: Binary, room: Chunk[]): RGB[] {
  const pals = room.find(chunk => chunk.tag === 'PALS');
  const clut = room.find(chunk => chunk.tag === 'CLUT') ?? (pals &&
    required(disk.children(required(disk.children(pals), 'WRAP')), 'APAL'));
  if (!clut) throw new Error('Missing room palette (CLUT or APAL)');
  if (clut.end - clut.data !== 768) throw new Error('Invalid VGA palette');
  return Array.from({ length: 256 }, (_, index) => {
    const at = clut.data + index * 3;
    return [disk.u8(at), disk.u8(at + 1), disk.u8(at + 2)];
  });
}

export function readRoom(game: GameArchive, id: number) {
  const disk = game.disk;
  const room = game.room(id);
  const header = required(room, 'RMHD');
  const width = disk.u16(header.data);
  const height = disk.u16(header.data + 2);
  const objects = disk.u16(header.data + 4);
  if (!width || width % 8 || !height || width * height > 2_000_000) throw new Error('Invalid room dimensions');
  const image = required(disk.children(required(room, 'RMIM')), 'IM00');
  const imageChunks = disk.children(image);
  const palette = readPalette(disk, room);
  const smap = required(imageChunks, 'SMAP');
  const transparent = room.find(chunk => chunk.tag === 'TRNS');
  const pixels = decodeSmap(disk, smap, width, height, transparent ? disk.u8(transparent.data) : 255);
  const masks = imageChunks.filter(chunk => /^ZP\d\d$/.test(chunk.tag))
    .map(chunk => ({ tag: chunk.tag, pixels: decodeMask(disk, chunk, width, height) }));
  const boxTable = room.find(chunk => chunk.tag === 'BOXD');
  const boxes: WalkBox[] = [];
  if (boxTable) {
    const count = disk.u16(boxTable.data);
    if (boxTable.data + 2 + count * 20 > boxTable.end) throw new Error('Invalid walkbox table');
    // Box zero is the engine's sentinel, not a navigable polygon.
    for (let i = 1; i < count; i++) {
      const at = boxTable.data + 2 + i * 20;
      boxes.push({
        points: Array.from({ length: 4 }, (_, n) => [disk.i16(at + n * 4), disk.i16(at + n * 4 + 2)]),
        mask: disk.u8(at + 16), flags: disk.u8(at + 17), scale: disk.u16(at + 18),
      });
    }
  }
  return { width, height, palette, pixels, masks, boxes, objects };
}

export function decodeSmap(disk: Binary, chunk: Chunk, width: number, height: number, transparent: number, opacity?: Uint8Array) {
  const strips = width / 8;
  const tableEnd = chunk.data + strips * 4;
  if (tableEnd > chunk.end) throw new Error('Truncated SMAP strip table');
  const offsets = Array.from({ length: strips }, (_, n) => chunk.start + disk.u32(chunk.data + n * 4));
  const boundaries = [...new Set(offsets)].sort((a, b) => a - b);
  const ends = new Map(boundaries.map((start, i) => [start, boundaries[i + 1] ?? chunk.end]));
  const pixels = new Uint8Array(width * height);
  for (const [strip, start] of offsets.entries()) {
    const end = ends.get(start)!;
    if (start < tableEnd || start >= chunk.end || end > chunk.end) throw new Error('Invalid SMAP strip offset');
    const code = disk.u8(start);
    if (code === 1) {
      if (start + 1 + 8 * height > end) throw new Error('Truncated raw strip');
      for (let y = 0; y < height; y++) {
        const target = y * width + strip * 8;
        pixels.set(disk.bytes.subarray(start + 1 + y * 8, start + 9 + y * 8), target);
        opacity?.fill(1, target, target + 8);
      }
      continue;
    }
    const family = Math.floor(code / 10);
    const colorBits = code % 10;
    const basic = family >= 1 && family <= 4;
    const majorMinor = [6, 8, 10, 12].includes(family);
    const vertical = family === 1 || family === 3;
    const keyed = [3, 4, 8, 12].includes(family);
    if ((!basic && !majorMinor) || colorBits < 4 || colorBits > 8 || start + 1 >= end) {
      throw new Error(`Unsupported SMAP codec ${code}`);
    }
    let bit = (start + 2) * 8;
    function read(count: number) {
      if (bit + count > end * 8) throw new Error('Truncated compressed strip');
      let value = 0;
      for (let i = 0; i < count; i++, bit++) value |= ((disk.u8(bit >> 3) >> (bit & 7)) & 1) << i;
      return value;
    }
    let color = disk.u8(start + 1);
    let increment = -1;
    let repeat = 0;
    for (let n = 0; n < height * 8; n++) {
      const x = strip * 8 + (vertical ? Math.floor(n / height) : n % 8);
      const y = vertical ? n % height : Math.floor(n / 8);
      if (!keyed || color !== transparent) {
        pixels[y * width + x] = color;
        if (opacity) opacity[y * width + x] = 1;
      }
      if (n === height * 8 - 1) break;
      if (repeat) {
        repeat--;
      } else if (read(1)) {
        if (!read(1)) {
          color = read(colorBits);
          increment = -1;
        } else if (basic) {
          if (read(1)) increment = -increment;
          color = (color + increment) & 255;
        } else {
          const delta = read(3) - 4;
          if (delta) color = (color + delta) & 255;
          else repeat = (read(8) - 1) & 255;
        }
      }
    }
  }
  return pixels;
}

export function decodeMask(disk: Binary, chunk: Chunk, width: number, height: number) {
  const strips = width / 8;
  const pixels = new Uint8Array(width * height);
  if (chunk.data + strips * 2 > chunk.end) throw new Error('Truncated z-plane table');
  for (let x = 0; x < strips; x++) {
    const offset = disk.u16(chunk.data + x * 2);
    if (!offset) continue;
    let at = chunk.start + offset;
    if (at < chunk.data + strips * 2) throw new Error('Invalid z-plane offset');
    let y = 0;
    while (y < height) {
      if (at >= chunk.end) throw new Error('Truncated z-plane strip');
      const command = disk.u8(at++);
      const run = command & 127;
      const repeated = command >= 128;
      if (!run || at + (repeated ? 1 : run) > chunk.end) throw new Error('Invalid z-plane run');
      for (let n = 0; n < run && y < height; n++, y++) {
        const bits = disk.u8(at + (repeated ? 0 : n));
        for (let bit = 0; bit < 8; bit++) pixels[y * width + x * 8 + bit] = (bits >> (7 - bit)) & 1;
      }
      at += repeated ? 1 : run;
    }
  }
  return pixels;
}
