import { EMPTY } from './engine/costume.ts';
import type { Cel, Costume, Track } from './engine/costume.ts';
import type { RGB } from './engine/room.ts';

export function blitCel(destination: Uint8Array, width: number, height: number, cel: Cel, x: number, y: number, mirror = false) {
  for (let row = 0; row < cel.height; row++) {
    if (y + row < 0 || y + row >= height) continue;
    for (let col = 0; col < cel.width; col++) {
      const color = cel.pixels[row * cel.width + col];
      const targetX = mirror ? x - col - 1 : x + col;
      if (color && targetX >= 0 && targetX < width) destination[(y + row) * width + targetX] = color;
    }
  }
}

export function frameSlots(track?: Track | null) {
  return track?.cels.flatMap((code, slot) => code === -0x78 || code === -0x7c ? [] : [slot]) ?? [];
}

function trackCel(track: Track, frame: number) {
  const slots = frameSlots(track);
  const slot = track.loop ? frame % slots.length : Math.min(frame, slots.length - 1);
  return track.cels[slots[slot]] ?? EMPTY;
}

export function drawChore(destination: Uint8Array, width: number, height: number, costume: Costume,
  chore: number, direction: number, frame: number, x: number, y: number) {
  const tracks = costume.chores[chore * 4 + direction]?.tracks;
  if (!tracks) return;
  const base = costume.baseChore === undefined ? undefined : costume.chores[costume.baseChore * 4 + direction];
  const mirror = direction === 0 && !costume.sourceFacing;
  for (const [limb, track] of tracks.entries()) {
    if (track?.disabled) continue;
    const code = track?.cels.length ? trackCel(track, frame) : base?.tracks[limb]?.cels[0];
    if (code === undefined) continue;
    const cel = costume.limbs[limb][code];
    if (!cel) continue;
    blitCel(destination, width, height, cel, x + (mirror ? -cel.x : cel.x), y + cel.y, mirror);
    x += mirror ? -cel.moveX : cel.moveX;
    y -= cel.moveY;
  }
}

export function paintIndexed(canvas: HTMLCanvasElement, pixels: Uint8Array, palette: RGB[], width: number, height: number) {
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(width, height);
  for (let i = 0; i < pixels.length; i++) {
    const [r, g, b] = palette[pixels[i]];
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}
