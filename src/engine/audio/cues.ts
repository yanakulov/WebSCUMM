import type { Binary, Chunk } from '../binary.ts';
import { readMidi, type SoundSequence } from './midi.ts';

export type SoundCue =
  | { type: 'cd'; loops: number; frames: number; track?: number; start?: number }
  | { type: 'effect'; adlib?: SoundSequence; pcm?: { rate: number; samples: Uint8Array } };

export function readSound(disk: Binary, { data, end }: Chunk): SoundCue {
  if (end - data === 24 && disk.u8(data + 7) === 2) {
    const frame = (at: number) => (disk.u8(at) * 60 + disk.u8(at + 1)) * 75 + disk.u8(at + 2);
    const start = frame(data + 18);
    return { type: 'cd', track: disk.u8(data + 16), loops: disk.u8(data + 17), start, frames: Math.max(0, frame(data + 21) - start) };
  }
  const effect: Extract<SoundCue, { type: 'effect' }> = { type: 'effect' };
  if (disk.ascii(data, 4) !== 'SOU ') return effect;
  const view = new DataView(disk.bytes.buffer, disk.bytes.byteOffset, disk.bytes.byteLength);
  // Unlike ordinary SCUMM chunks, the lengths inside SOU exclude their headers.
  for (let at = data + 8; at + 8 <= end;) {
    const next = at + 8 + view.getUint32(at + 4);
    if (next > end) break;
    const tag = disk.ascii(at, 4);
    if (tag === 'ADL ' && next - at >= 38 && disk.ascii(at + 24, 4) === 'MThd') {
      const sequence = readMidi(disk.bytes.subarray(at + 24, next), true);
      if (sequence.events.some(event => event.type === 'patch') && sequence.events.some(event => event.type === 'noteOn')) {
        effect.adlib = sequence;
      }
    } else if (tag === 'SBL ' && at + 33 < next) {
      const voc = at + 27;
      const size = disk.u8(voc + 1) | disk.u8(voc + 2) << 8 | disk.u8(voc + 3) << 16;
      const timeConstant = disk.u8(voc + 4);
      if (disk.u8(voc) === 1 && disk.u8(voc + 5) === 0 && size > 2 && voc + 4 + size <= next) {
        const rate = timeConstant === 0xa5 || timeConstant === 0xa6 ? 11025 : Math.round(1_000_000 / (256 - timeConstant));
        effect.pcm = { rate, samples: disk.bytes.subarray(voc + 6, voc + 4 + size) };
      }
    }
    at = next;
  }
  return effect;
}

export interface SoundPlayback { seconds?: number }
export interface GameAudio {
  start(id: number, cue: SoundCue): SoundPlayback | undefined;
  stop(id: number): void;
  masterVolume?(value?: number): number;
  volume?(id: number, value: number, seconds: number): number;
}
