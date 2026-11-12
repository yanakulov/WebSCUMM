import type { RGB } from './engine/palette.ts';

function chunk(name: string, bytes: Uint8Array) {
  const result = new Uint8Array(12 + bytes.length);
  const view = new DataView(result.buffer);
  view.setUint32(0, bytes.length);
  result.set(new TextEncoder().encode(name), 4);
  result.set(bytes, 8);
  let crc = 0xffffffff;
  for (const byte of result.subarray(4, 8 + bytes.length)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  view.setUint32(8 + bytes.length, crc ^ 0xffffffff);
  return result;
}

export async function indexedPng(width: number, height: number, pixels: Uint8Array, palette: RGB[]) {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 3], 8);
  const rows = new Uint8Array(height * (width + 1));
  for (let y = 0; y < height; y++) rows.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  const compressed = await new Response(new Blob([rows]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer();
  return new Blob([Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), chunk('IHDR', header),
    chunk('PLTE', Uint8Array.from(palette.flat())), chunk('IDAT', new Uint8Array(compressed)),
    chunk('IEND', new Uint8Array())], { type: 'image/png' });
}

export function indexOpaquePixels(rgba: Uint8ClampedArray) {
  const palette: RGB[] = [];
  const indices = new Map<number, number>();
  const pixels = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < pixels.length; i++) {
    const at = 4 * i;
    if (rgba[at + 3] !== 255) throw new Error('Room backgrounds must be opaque.');
    const rgb: RGB = [rgba[at], rgba[at + 1], rgba[at + 2]];
    const key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
    let index = indices.get(key);
    if (index === undefined) {
      if (palette.length === 256) throw new Error('Use a PNG with at most 256 colors.');
      index = palette.length;
      indices.set(key, index);
      palette.push(rgb);
    }
    pixels[i] = index;
  }
  return { pixels, palette };
}
