import type { GameArchive } from '../archive.ts';

interface Glyph { width: number; height: number; x: number; y: number; pixels: Uint8Array }

export interface GameFont {
  height: number;
  glyphs: (Glyph | undefined)[];
  colors: Uint8Array;
}

export function readGameFont(archive: GameArchive, id: number): GameFont {
  const { chunk } = archive.resource('DCHR', id);
  const disk = archive.disk;
  const header = chunk.start + 29;
  if (header + 4 > chunk.end) throw new Error(`Truncated CHAR ${id}`);
  const bits = disk.u8(header), height = disk.u8(header + 1), count = disk.u16(header + 2);
  const dataStart = header + 4 + count * 4;
  if (![1, 2, 4, 8].includes(bits) || !height || count > 256 || dataStart > chunk.end) {
    throw new Error(`Invalid CHAR ${id} header`);
  }
  const colors = new Uint8Array(16);
  colors.set(disk.bytes.subarray(chunk.start + 14, header), 1);
  const glyphs = Array.from({ length: count }, (_, index): Glyph | undefined => {
    const relative = disk.u32(header + 4 + index * 4);
    if (!relative) return;
    const at = header + relative;
    if (at < dataStart || at + 4 > chunk.end) throw new Error(`Invalid CHAR ${id} glyph offset`);
    const width = disk.u8(at), height = disk.u8(at + 1);
    if (at + 4 + Math.ceil(width * height * bits / 8) > chunk.end) throw new Error(`Truncated CHAR ${id} glyph`);
    const pixels = Uint8Array.from({ length: width * height }, (_, i) => {
      const bit = i * bits;
      return (disk.u8(at + 4 + (bit >> 3)) >> (8 - bits - (bit & 7))) & ((1 << bits) - 1);
    });
    return { width, height, x: disk.u8(at + 2) << 24 >> 24, y: disk.u8(at + 3) << 24 >> 24, pixels };
  });
  return { height, glyphs, colors };
}

export function measureText(font: GameFont, text: ArrayLike<number>) {
  let width = 0;
  for (let i = 0; i < text.length && text[i] > 0; i++) {
    const glyph = font.glyphs[text[i]];
    if (glyph) width += glyph.width + glyph.x;
  }
  return width;
}
