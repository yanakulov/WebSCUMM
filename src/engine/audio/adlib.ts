import type { SoundEvent, SoundSequence } from './midi.ts';

export interface OplChip {
  memory: WebAssembly.Memory;
  opl_reset(rate: number): void;
  opl_write(register: number, value: number): void;
  opl_output(): number;
  opl_render(frames: number): void;
}

const operatorOffsets = [0, 1, 2, 8, 9, 10, 16, 17, 18];
const sampleRate = 22050;
const releaseSeconds = 0.18;

interface Voice { slot: number; channel: number; note: number; velocity: number; key: number; patch: Uint8Array; held: boolean }

export function renderAdlib(chip: OplChip, sequence: SoundSequence) {
  const samples = new Float32Array(Math.ceil((sequence.seconds + releaseSeconds) * sampleRate));
  const patches = new Map<number, Uint8Array>();
  const voices: (Voice | undefined)[] = Array(9).fill(undefined);
  const volume = new Uint8Array(16).fill(127);
  const sustain = new Uint8Array(16);
  const output = new Int16Array(chip.memory.buffer, chip.opl_output(), 2048);
  const write = (register: number, value: number) => chip.opl_write(register, value & 255);
  chip.opl_reset(sampleRate);
  write(1, 0x20);

  function levels(voice: Voice) {
    for (const [index, offset] of [0, 3].entries()) {
      const register = voice.patch[index * 5 + 1];
      const wave = voice.patch[index * 5 + 4];
      // SCUMM instruments store levels as gain and envelope registers inverted.
      const gain = Math.min(63, (register & 63) + (wave >> 2 ? ((voice.velocity >> 1) * ((wave >> 2) + 1)) >> 5 : 0));
      const scaled = index || (voice.patch[10] & 1) ? gain * volume[voice.channel] / 127 : gain;
      const attenuation = scaled > 0 ? Math.min(63, Math.round(-20 * Math.log10(scaled / 63) / 0.75)) : 63;
      write(0x40 + operatorOffsets[voice.slot] + offset, (register & 0xc0) | attenuation);
    }
  }

  function release(voice: Voice) {
    write(0xb0 + voice.slot, voice.key);
    voices[voice.slot] = undefined;
  }

  function play(event: Exclude<SoundEvent, { type: 'patch' }>) {
    const { channel, a, b } = event;
    if (event.type === 'controller') {
      if (a === 7) volume[channel] = b;
      if (a === 64) sustain[channel] = b;
      for (const voice of voices) {
        if (voice?.channel !== channel) continue;
        if (a === 7) levels(voice);
        else if (a === 120 || a === 123 || (a === 64 && b < 64 && voice.held)) release(voice);
      }
      return;
    }
    if (event.type === 'noteOff' || (event.type === 'noteOn' && !b)) {
      for (const voice of voices) {
        if (voice?.channel !== channel || voice.note !== a) continue;
        if (sustain[channel] >= 64) voice.held = true;
        else release(voice);
      }
      return;
    }
    if (event.type !== 'noteOn') return;
    const patch = patches.get(channel);
    if (!patch) return;
    const free = voices.findIndex(voice => !voice);
    const slot = free === -1 ? 0 : free;
    const replaced = voices[slot];
    if (replaced) release(replaced);
    const pitch = Math.max(0, a - 4);
    const block = Math.min(7, Math.floor(pitch / 12));
    const fNumber = Math.round(107 * 2 ** ((pitch % 12) / 12));
    const key = (block << 2) | (fNumber >> 8);
    const voice = { slot, channel, note: a, velocity: b, key, patch, held: false };
    voices[slot] = voice;
    for (const [index, offset] of [0, 3].entries()) {
      const base = operatorOffsets[slot] + offset;
      const at = index * 5;
      write(0x20 + base, patch[at]);
      write(0x60 + base, ~patch[at + 2]);
      write(0x80 + base, ~patch[at + 3]);
      write(0xe0 + base, patch[at + 4] & 3);
    }
    levels(voice);
    write(0xc0 + slot, patch[10] & 15);
    write(0xa0 + slot, fNumber);
    write(0xb0 + slot, 0x20 | key);
  }

  let frame = 0;
  function renderTo(end: number) {
    while (frame < end) {
      const length = Math.min(1024, end - frame);
      chip.opl_render(length);
      for (let i = 0; i < length; i++) samples[frame + i] = (output[i * 2] + output[i * 2 + 1]) / 65536;
      frame += length;
    }
  }
  for (const event of sequence.events) {
    renderTo(Math.round(event.at * sampleRate));
    if (event.type === 'patch') patches.set(event.channel, event.registers);
    else play(event);
  }
  renderTo(Math.round(sequence.seconds * sampleRate));
  for (const voice of voices) if (voice) release(voice);
  renderTo(samples.length);
  return { samples, sampleRate };
}
