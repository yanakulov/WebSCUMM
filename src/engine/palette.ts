export type RGB = [number, number, number];

export const ega: RGB[] = [
  [0, 0, 0], [85, 85, 85], [0, 0, 162], [85, 85, 255],
  [0, 162, 0], [85, 255, 85], [0, 162, 162], [85, 255, 255],
  [162, 0, 0], [255, 85, 85], [162, 0, 162], [255, 85, 255],
  [162, 81, 0], [255, 255, 85], [162, 162, 162], [255, 255, 255],
];

// EGA color numbers in the two-column order used by BYLE.
const egaIndices = [0, 8, 1, 9, 2, 10, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
const egaByIndex = egaIndices.map((_, index) => ega[egaIndices.indexOf(index)]);
export const editorPalette = [ega[2], ega[0], ...ega.filter((_, i) => i !== 0 && i !== 2)];
export const editorIndices = [1, 0, 8, ...egaIndices.slice(3)];

export function fallbackPalette(index: number): RGB {
  return egaByIndex[index] ?? [index, index, index];
}

export function nearestEga([r, g, b]: RGB) {
  let best = 0;
  let distance = Infinity;
  for (const [i, [er, eg, eb]] of egaByIndex.entries()) {
    const difference = (r - er) ** 2 + (g - eg) ** 2 + (b - eb) ** 2;
    if (difference < distance) { distance = difference; best = i; }
  }
  return best;
}
