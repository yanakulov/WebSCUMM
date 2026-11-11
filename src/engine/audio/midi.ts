import { parseMidi, type MidiEvent } from 'midi-file';

export type SoundEvent =
  | { at: number; channel: number; type: 'noteOn' | 'noteOff' | 'controller' | 'programChange' | 'pitchBend'; a: number; b: number }
  | { at: number; channel: number; type: 'patch'; registers: Uint8Array };

export interface SoundSequence { seconds: number; events: SoundEvent[] }

export function readMidi(bytes: Uint8Array, adlib = false): SoundSequence {
  const { header, tracks } = parseMidi(bytes);
  if (!tracks.length || (header.format === 2 && tracks.length !== 1)) throw new Error('Unsupported MIDI track layout');
  const ticksPerBeat = header.ticksPerBeat ?? 480;
  const timed = tracks.flatMap(track => {
    let tick = 0;
    return track.map(event => ({ tick: tick += event.deltaTime, event }));
  }).sort((a, b) => a.tick - b.tick);

  let at = 0, previous = 0, tempo = 500_000;
  const events: SoundEvent[] = [];
  for (const { tick, event } of timed) {
    const secondsPerTick = header.framesPerSecond && header.ticksPerFrame
      ? 1 / (header.framesPerSecond * header.ticksPerFrame)
      : tempo / ticksPerBeat / 1_000_000;
    at += (tick - previous) * secondsPerTick;
    previous = tick;
    if (event.type === 'setTempo') tempo = event.microsecondsPerBeat;
    else if (adlib && event.type === 'sysEx' && event.data[0] === 0x7d) {
      const data = event.data;
      const channel = data[2] & 15;
      // iMUSE part allocation and per-part AdLib instruments use nibble-packed data.
      if (data[1] === 0 && data.length >= 20) {
        events.push({ at, channel, type: 'controller', a: 7, b: (data[7] << 4) | data[8] });
      } else if (data[1] === 16 && data.length >= 65) {
        const registers = Uint8Array.from({ length: 30 }, (_, i) => (data[4 + i * 2] << 4) | data[5 + i * 2]);
        events.push({ at, channel, type: 'patch', registers });
      }
    } else {
      const message = channelEvent(at, event);
      if (message) events.push(message);
    }
  }
  return { seconds: at, events };
}

function channelEvent(at: number, event: MidiEvent): SoundEvent | undefined {
  switch (event.type) {
    case 'noteOn':
    case 'noteOff':
      return { at, channel: event.channel, type: event.type, a: event.noteNumber, b: event.velocity };
    case 'controller':
      return { at, channel: event.channel, type: event.type, a: event.controllerType, b: event.value };
    case 'programChange':
      return { at, channel: event.channel, type: event.type, a: event.programNumber, b: 0 };
    case 'pitchBend':
      return { at, channel: event.channel, type: event.type, a: event.value + 8192, b: 0 };
  }
}
