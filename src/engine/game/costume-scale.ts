// The classic renderer phases its row and column thresholds around the actor origin.
const thresholds = (() => {
  const order = [255];
  for (let block = 64; block >= 1; block /= 2) {
    for (let value = 255 - block; value > 255 - block * 2; value--) order.push(value);
  }
  for (let value = 0; value < 128; value++) order.push(value);
  return Uint8Array.from(order, value => {
    let reversed = 0;
    for (let bit = 0; bit < 8; bit++) { reversed = (reversed << 1) | (value & 1); value >>= 1; }
    return reversed;
  });
})();

export function scalePhase(offset: number, step: number) { return 128 - Math.abs(offset) * step; }

export function scalePixel(scale: number, phase: number) { return scale === 255 || thresholds[phase & 255] < scale; }

export function scaleOffset(offset: number, scale: number, step: number) {
  let phase = scalePhase(offset, step);
  let kept = 0;
  for (let i = 0; i < Math.abs(offset); i++, phase += step) {
    if (thresholds[phase & 255] < scale) kept++;
  }
  return Math.sign(offset) * kept;
}
