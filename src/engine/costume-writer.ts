import { EMPTY } from './costume.ts';
import type { Cel, Costume } from './costume.ts';
import { nearestEga } from './palette.ts';

export function writeCostume(costume: Costume): Uint8Array<ArrayBuffer> {
  const animations = Object.entries(costume.chores);
  const lastAnimation = Math.max(0, ...animations.map(([id]) => Number(id)));
  const palette = costume.paletteIndices ?? costume.palette.map(nearestEga);
  const widePalette = palette.length === 32;
  const offsets = 10 + palette.length;
  const frameTable = offsets + 2;
  const choreTable = frameTable + 32;
  const output: number[] = Array(choreTable + (lastAnimation + 1) * 2).fill(0);
  output.splice(0, 4, 67, 79, 83, 84);
  output[8] = lastAnimation;
  output[9] = (widePalette ? 0x59 : 0x58) | (costume.sourceFacing ? 128 : 0);
  output.splice(10, palette.length, ...palette);

  function pointer(at: number) {
    const offset = output.length - 2;
    if (offset > 0xffff) throw new Error('This costume exceeds the SCUMM v5 offset limit.');
    output[at] = offset & 255;
    output[at + 1] = offset >> 8;
  }

  const commands: number[] = [];
  for (const [key, animation] of animations) {
    pointer(choreTable + Number(key) * 2);
    const active = animation.tracks.flatMap((track, i) => track && (track.disabled || track.cels.length) ? [{ track, i }] : []);
    pushWord(output, active.reduce((mask, { i }) => mask | (0x8000 >> i), 0));
    for (const { track, i } of active) {
      if (track.disabled) { pushWord(output, 0xffff); continue; }
      if (track.cels.length > 128 || commands.length >= 0xffff) throw new Error('The costume has too many animation commands.');
      pushWord(output, commands.length);
      output.push((track.cels.length - 1) | (track.loop ? 0 : 128));
      for (const code of track.cels) {
        if (code >= 0 && !costume.limbs[i][code]) throw new Error(`Limb ${i}, cel ${code} is missing.`);
        commands.push(code === EMPTY ? 0x7b : Math.abs(code));
      }
    }
  }

  pointer(offsets);
  for (const command of commands) output.push(command);
  for (const [limb, cels] of costume.limbs.entries()) {
    const entries = Object.entries(cels);
    if (!entries.length) continue;
    pointer(frameTable + limb * 2);
    const table = output.length;
    const count = Math.max(...entries.map(([id]) => Number(id))) + 1;
    for (let i = 0; i < count; i++) pushWord(output, 0);
    for (const [key, cel] of entries) {
      pointer(table + Number(key) * 2);
      writeCel(output, cel, widePalette ? 3 : 4);
    }
  }
  const bytes = Uint8Array.from(output);
  new DataView(bytes.buffer).setUint32(4, bytes.length);
  return bytes;
}

function pushWord(output: number[], value: number) {
  output.push(value & 255, (value >>> 8) & 255);
}

function writeCel(output: number[], cel: Cel, runBits: number) {
  for (const word of [cel.width, cel.height, cel.x, cel.y, cel.moveX, cel.moveY]) pushWord(output, word);
  let color = 0;
  let run = 0;
  const inlineLimit = (1 << runBits) - 1;
  function flush() {
    if (!run) return;
    if (run <= inlineLimit) output.push((color << runBits) | run);
    else output.push(color << runBits, run);
  }
  for (let x = 0; x < cel.width; x++) {
    for (let y = 0; y < cel.height; y++) {
      const next = cel.pixels[y * cel.width + x];
      if (next !== color || run === 255) { flush(); color = next; run = 0; }
      run++;
    }
  }
  flush();
}
