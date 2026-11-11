import type { Cel, Costume } from '../engine/costume.ts';
import type { RGB } from '../engine/room.ts';
import { editorIndices, editorPalette } from '../engine/palette.ts';

export const blankCostume = (): Costume => ({
  version: 1,
  name: 'Untitled',
  palette: editorPalette,
  paletteIndices: editorIndices,
  limbs: Array.from({ length: 16 }, () => ({})),
  chores: {},
  sourceFacing: true,
});

export function practiceCostume(): Costume {
  const costume = blankCostume();
  costume.name = 'BOUNCE';
  const ball = [
    '......44444......', '....448888844....', '...48888888884...', '..4889F98888884..',
    '.4889FFF98888884.', '.48889F988888884.', '48888888888888884', '48888188888188884',
    '48888188888188884', '48888888888888884', '.488888111888884.', '.448888888888844.',
    '..4448888888444..', '...44444444444...', '.....4444444.....',
  ];
  const inks: Record<string, number> = { 4: 12, 8: 13, 9: 14, F: 15, 1: 1 };
  costume.limbs[0] = Object.fromEntries([-15, -24, -29].map((y, i) => [i, {
    width: 17, height: 15, x: -8, y, moveX: 0, moveY: 0,
    pixels: ball.flatMap(row => [...row].map(pixel => inks[pixel] ?? 0)),
  }]));
  costume.chores[2] = { tracks: [{ cels: [0, 1, 2, 1], loop: true }, ...Array<null>(15).fill(null)] };
  return costume;
}

export function parseProject(text: string): Costume {
  const value = JSON.parse(text);
  const valid = value && value.version === 1 && typeof value.name === 'string' &&
    typeof value.sourceFacing === 'boolean' &&
    (value.baseChore === undefined || (Number.isInteger(value.baseChore) && value.baseChore >= 0 && value.baseChore < 64)) &&
    Array.isArray(value.palette) && [16, 32].includes(value.palette.length) &&
    value.palette.every((color: RGB) => Array.isArray(color) && color.length === 3 && color.every(byte)) &&
    (value.paletteIndices === undefined || (Array.isArray(value.paletteIndices) &&
      value.paletteIndices.length === value.palette.length && value.paletteIndices.every(byte))) &&
    Array.isArray(value.limbs) && value.limbs.length === 16 &&
    value.limbs.every((limb: Record<number, Cel>) => dictionary(limb) && Object.entries(limb).every(([key, cel]) =>
      index(key, 0x77) && dictionary(cel) && Number.isInteger(cel.width) && Number.isInteger(cel.height) &&
      cel.width >= 0 && cel.height >= 0 && cel.width <= 2048 && cel.height <= 2048 &&
      cel.width * cel.height <= 512_000 && [cel.x, cel.y, cel.moveX, cel.moveY].every(number =>
        Number.isInteger(number) && number >= -32768 && number <= 32767) &&
      Array.isArray(cel.pixels) && cel.pixels.length === cel.width * cel.height &&
      cel.pixels.every(pixel => byte(pixel) && pixel < value.palette.length))) &&
    dictionary(value.chores) && Object.entries(value.chores as Costume['chores']).every(([key, chore]) =>
      index(key, 255) && dictionary(chore) && Array.isArray(chore.tracks) && chore.tracks.length === 16 &&
      chore.tracks.every(track => track === null || (dictionary(track) && typeof track.loop === 'boolean' &&
        Array.isArray(track.cels) && track.cels.length <= 128 &&
        (track.disabled === undefined || (track.disabled === true && track.cels.length === 0)) && track.cels.every(cel =>
          Number.isInteger(cel) && ((cel >= -1 && cel <= 0x77) || (cel >= -0x7f && cel <= -0x78))))));
  if (!valid) throw new Error('Choose a valid WebSCUMM BYLE project (.byle.json).');
  return value;
}

const dictionary = (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value);
const byte = (value: number) => Number.isInteger(value) && value >= 0 && value <= 255;
const index = (key: string, max: number) => /^\d+$/.test(key) && +key <= max;

export type Point = [number, number];

export function stroke(from: Point, to: Point, paint: (x: number, y: number) => void) {
  let [x, y] = from;
  const [endX, endY] = to;
  const dx = Math.abs(endX - x);
  const dy = -Math.abs(endY - y);
  let error = dx + dy;
  while (true) {
    paint(x, y);
    if (x === endX && y === endY) return;
    const doubled = 2 * error;
    if (doubled >= dy) { error += dy; x += Math.sign(endX - x); }
    if (doubled <= dx) { error += dx; y += Math.sign(endY - y); }
  }
}

export function flood(pixels: Uint8Array, width: number, height: number, start: Point, color: number) {
  const first = start[1] * width + start[0];
  const target = pixels[first];
  if (target === color) return;
  const queue = [first];
  pixels[first] = color;
  function visit(index: number) {
    if (pixels[index] === target) {
      pixels[index] = color;
      queue.push(index);
    }
  }
  while (queue.length) {
    const at = queue.pop()!;
    if (at % width > 0) visit(at - 1);
    if (at % width < width - 1) visit(at + 1);
    if (at >= width) visit(at - width);
    if (at < width * (height - 1)) visit(at + width);
  }
}

export function celFromSurface(surface: Uint8Array, width: number, height: number, anchor: Point, original?: Cel): Cel {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  const originalX = anchor[0] + (original?.x ?? 0);
  const originalY = anchor[1] + (original?.y ?? 0);
  function get(x: number, y: number) {
    if (x >= 0 && x < width && y >= 0 && y < height) return surface[y * width + x];
    if (!original || x < originalX || y < originalY || x >= originalX + original.width || y >= originalY + original.height) return 0;
    return original.pixels[(y - originalY) * original.width + x - originalX];
  }
  function expand(x: number, y: number) {
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  surface.forEach((color, i) => {
    if (color) expand(i % width, Math.floor(i / width));
  });
  original?.pixels.forEach((color, i) => {
    if (color) {
      const x = originalX + i % original.width;
      const y = originalY + Math.floor(i / original.width);
      if (x < 0 || y < 0 || x >= width || y >= height) expand(x, y);
    }
  });
  const moveX = original?.moveX ?? 0;
  const moveY = original?.moveY ?? 0;
  if (right < left) return { width: 0, height: 0, x: 0, y: 0, moveX, moveY, pixels: [] };
  const celWidth = right - left + 1;
  const celHeight = bottom - top + 1;
  if (celWidth > 2048 || celHeight > 2048 || celWidth * celHeight > 512_000) {
    throw new Error('The edited cel would exceed the supported dimensions.');
  }
  return {
    width: celWidth, height: celHeight, x: left - anchor[0], y: top - anchor[1], moveX, moveY,
    pixels: Array.from({ length: celWidth * celHeight }, (_, i) =>
      get(left + i % celWidth, top + Math.floor(i / celWidth))),
  };
}
