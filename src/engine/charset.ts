import { Binary } from './binary.ts';

export interface CharsetGlyph {
  width: number;
  rows: readonly number[];
  xOffset?: number;
  yOffset?: number;
}

const fontHeader = 29;
const glyphTable = fontHeader + 4;

export function readMonochromeCharset(bytes: Uint8Array) {
  const binary = new Binary(bytes);
  const chunk = binary.chunk(0);
  if (chunk.tag !== 'CHAR' || chunk.end !== bytes.length || chunk.end < glyphTable) {
    throw new Error('Choose a standalone SCUMM v5 CHAR resource.');
  }
  if (binary.u8(fontHeader) !== 1) throw new Error('This reader expects a 1-bit CHAR font.');
  const height = binary.u8(fontHeader + 1);
  const count = binary.u16(fontHeader + 2);
  const dataStart = glyphTable + count * 4;
  if (!height || !count || count > 256 || dataStart > chunk.end) throw new Error('Invalid CHAR header.');

  const glyphs = Array.from({ length: count }, (_, index): CharsetGlyph | undefined => {
    const relative = binary.u32(glyphTable + index * 4);
    if (!relative) return undefined;
    const offset = fontHeader + relative;
    if (offset < dataStart || offset + 4 > chunk.end) throw new Error(`Invalid CHAR offset for glyph ${index}.`);
    const width = binary.u8(offset);
    const height = binary.u8(offset + 1);
    if (width > 32 || offset + 4 + Math.ceil(width * height / 8) > chunk.end) {
      throw new Error(`Invalid CHAR bitmap for glyph ${index}.`);
    }
    const rows = Array.from({ length: height }, (_, y) => {
      let mask = 0;
      for (let x = 0; x < width; x++) {
        const bit = y * width + x;
        mask = (mask << 1) | ((binary.u8(offset + 4 + (bit >> 3)) >> (7 - (bit & 7))) & 1);
      }
      return mask >>> 0;
    });
    return { width, rows, xOffset: signedByte(binary.u8(offset + 2)), yOffset: signedByte(binary.u8(offset + 3)) };
  });
  return { height, glyphs };
}

export function replaceMonochromeGlyphs(source: Uint8Array, replacements: ReadonlyMap<number, CharsetGlyph>) {
  const { glyphs } = readMonochromeCharset(source);
  const sourceHeader = new DataView(source.buffer, source.byteOffset, source.byteLength);
  if (sourceHeader.getUint32(8, true) !== source.length - 23) throw new Error('Unsupported CHAR size header.');
  const records = [...replacements].map(([slot, glyph]) => {
    if (!Number.isInteger(slot) || slot < 0 || slot >= glyphs.length) throw new Error(`Invalid CHAR slot ${slot}.`);
    return { slot, bytes: packGlyph(glyph) };
  });
  // Append records so the original glyphs and offsets of unmodified slots stay byte-identical.
  const output = new Uint8Array(source.length + records.reduce((length, item) => length + item.bytes.length, 0));
  output.set(source);
  const header = new DataView(output.buffer);
  header.setUint32(4, output.length);
  header.setUint32(8, output.length - 23, true);
  let offset = source.length;
  for (const { slot, bytes } of records) {
    header.setUint32(glyphTable + slot * 4, offset - fontHeader, true);
    output.set(bytes, offset);
    offset += bytes.length;
  }
  return output;
}

function packGlyph(glyph: CharsetGlyph) {
  const { width, rows, xOffset = 0, yOffset = 0 } = glyph;
  const validOffset = (value: number) => Number.isInteger(value) && value >= -128 && value <= 127;
  if (!Number.isInteger(width) || width < 1 || width > 32 || !rows.length || rows.length > 255 ||
    !rows.every(row => Number.isInteger(row) && row >= 0 && row < 2 ** width) ||
    !validOffset(xOffset) || !validOffset(yOffset)) throw new Error('Invalid monochrome CHAR glyph.');
  const bytes = new Uint8Array(4 + Math.ceil(width * rows.length / 8));
  bytes.set([width, rows.length, xOffset, yOffset]);
  for (const [y, row] of rows.entries()) {
    for (let x = 0; x < width; x++) {
      const bit = y * width + x;
      bytes[4 + (bit >> 3)] |= ((row >>> (width - 1 - x)) & 1) << (7 - (bit & 7));
    }
  }
  return bytes;
}

const signedByte = (value: number) => value < 128 ? value : value - 256;
