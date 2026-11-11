import type { SoundSequence } from './midi.ts';
// @ts-expect-error Pinned Emscripten loader, shipped with its corresponding source.
import createModule from './vendor/tsf.js';
import wasmUrl from './vendor/tsf.wasm?url';

interface TsfModule {
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
  _tsf_wasm_malloc(size: number): number;
  _tsf_wasm_free_buf(pointer: number): void;
  _tsf_wasm_load(pointer: number, size: number): number;
  _tsf_wasm_close(handle: number): void;
  _tsf_wasm_get_presetcount(handle: number): number;
  _tsf_wasm_set_output(handle: number, rate: number, gain: number): void;
  _tsf_wasm_set_max_voices(handle: number, voices: number): number;
  _tsf_wasm_channel_setup(handle: number, channels: number): void;
  _tsf_wasm_channel_note_on(handle: number, channel: number, note: number, velocity: number): number;
  _tsf_wasm_channel_note_off(handle: number, channel: number, note: number): void;
  _tsf_wasm_channel_midi_control(handle: number, channel: number, controller: number, value: number): number;
  _tsf_wasm_channel_set_pitchwheel(handle: number, channel: number, pitch: number): number;
  _tsf_wasm_channel_set_presetnumber(handle: number, channel: number, program: number, drums: number): number;
  _tsf_wasm_render_float(handle: number, pointer: number, frames: number, mix: number): void;
}

export async function loadSoundFont(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'sfbk') throw new Error('INVALID SOUNDFONT FILE.');
  const response = await fetch(wasmUrl);
  if (!response.ok) throw new Error('COULD NOT LOAD THE SOUNDFONT SYNTH.');
  const module: TsfModule = await createModule({ wasmBinary: await response.arrayBuffer() });
  const pointer = module._tsf_wasm_malloc(bytes.length);
  if (!pointer) throw new Error('SOUNDFONT IS TOO LARGE.');
  let handle: number;
  try {
    module.HEAPU8.set(bytes, pointer);
    handle = module._tsf_wasm_load(pointer, bytes.length);
  } finally {
    module._tsf_wasm_free_buf(pointer);
  }
  if (!handle || !module._tsf_wasm_get_presetcount(handle)) {
    if (handle) module._tsf_wasm_close(handle);
    throw new Error('SOUNDFONT HAS NO PLAYABLE PRESETS.');
  }
  module._tsf_wasm_close(handle);
  return { module, bytes };
}

export function renderSoundFont(context: BaseAudioContext, font: Awaited<ReturnType<typeof loadSoundFont>>, sequence: SoundSequence) {
  const { module: m, bytes } = font;
  const rate = 22050;
  const count = 1024;
  const bank = m._tsf_wasm_malloc(bytes.length);
  if (!bank) throw new Error('SOUNDFONT IS TOO LARGE.');
  let handle = 0, pointer = 0;
  try {
    m.HEAPU8.set(bytes, bank);
    handle = m._tsf_wasm_load(bank, bytes.length);
    pointer = m._tsf_wasm_malloc(count * 2 * 4);
    if (!handle || !pointer || !m._tsf_wasm_set_max_voices(handle, 64)) throw new Error('COULD NOT START THE SOUNDFONT SYNTH.');
    m._tsf_wasm_set_output(handle, rate, -8);
    m._tsf_wasm_channel_setup(handle, 16);
    m._tsf_wasm_channel_set_presetnumber(handle, 9, 0, 1);
    const length = Math.ceil((sequence.seconds + 0.25) * rate);
    const buffer = context.createBuffer(2, length, rate);
    const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
    let frame = 0;
    function renderTo(end: number) {
      while (frame < end) {
        const frames = Math.min(end - frame, count);
        m._tsf_wasm_render_float(handle, pointer, frames, 0);
        const data = m.HEAPF32, start = pointer / 4;
        for (let i = 0; i < frames; i++) {
          left[frame + i] = data[start + i * 2];
          right[frame + i] = data[start + i * 2 + 1];
        }
        frame += frames;
      }
    }
    for (const event of sequence.events) {
      renderTo(Math.round(event.at * rate));
      if (event.type === 'patch') continue;
      const { type, channel, a, b } = event;
      if (type === 'noteOn' && b) m._tsf_wasm_channel_note_on(handle, channel, a, b / 127);
      else if (type === 'noteOff' || type === 'noteOn') m._tsf_wasm_channel_note_off(handle, channel, a);
      else if (type === 'controller') m._tsf_wasm_channel_midi_control(handle, channel, a, b);
      else if (type === 'pitchBend') m._tsf_wasm_channel_set_pitchwheel(handle, channel, a);
      else if (type === 'programChange') m._tsf_wasm_channel_set_presetnumber(handle, channel, a, Number(channel === 9));
    }
    for (let ch = 0; ch < 16; ch++) m._tsf_wasm_channel_midi_control(handle, ch, 123, 0);
    renderTo(length);
    return buffer;
  } finally {
    if (handle) m._tsf_wasm_close(handle);
    if (pointer) m._tsf_wasm_free_buf(pointer);
    m._tsf_wasm_free_buf(bank);
  }
}
