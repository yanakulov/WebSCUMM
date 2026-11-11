import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { renderAdlib, type OplChip } from '../../src/engine/audio/adlib.ts';
import { readAudioCue } from '../../src/engine/audio/cd.ts';
import { ScummGame } from '../../src/engine/game/game.ts';
import { VAR } from '../../src/engine/game/vm.ts';
import { parseMonkeyPack } from '../pack.ts';

const resources = parseMonkeyPack(gunzipSync(readFileSync(new URL('../assets/monkey1.wsc.gz', import.meta.url))));

test('the original CD cues resolve to bundled audio, including the second use of the intro track', () => {
  assert.deepEqual(resources.sound(110), { type: 'cd', track: 17, start: 0, frames: 0, loops: 1 });
  assert.deepEqual(resources.sound(108), { type: 'cd', track: 17, start: 7173, frames: 0, loops: 1 });
  assert.deepEqual(resources.sound(101), { type: 'cd', track: 8, start: 0, frames: 0, loops: 255 });
  for (let track = 1; track <= 24; track++) {
    const bytes = readFileSync(new URL(`../assets/cd/track${String(track).padStart(2, '0')}.mp3`, import.meta.url));
    assert.equal(bytes.subarray(0, 3).toString(), 'ID3');
  }
});

test('SCUMM AdLib patches render audible OPL audio and digital cues preserve their sample rate', () => {
  const sound = resources.sound(4);
  assert.equal(sound?.type, 'effect');
  assert.ok(sound.adlib?.events.some(event => event.type === 'patch'));
  const wasm = readFileSync(new URL('../../src/engine/audio/vendor/opl.wasm', import.meta.url));
  const { exports } = new WebAssembly.Instance(new WebAssembly.Module(wasm));
  const { samples, sampleRate } = renderAdlib(exports as unknown as OplChip, sound.adlib!);
  assert.equal(sampleRate, 22050);
  assert.ok(samples.some(sample => Math.abs(sample) > 0.015));
  const pcm = resources.sound(6);
  assert.equal(pcm?.type, 'effect');
  assert.ok(pcm.pcm?.rate && pcm.pcm.samples.length > 1000);
});

test('SCUMM queues iMUSE commands, reports sound status and applies per-sound fades', () => {
  const calls: number[][] = [];
  const game = new ScummGame(resources, Math.random, {
    start: id => { calls.push([8, id]); return { seconds: 3 }; },
    stop: id => { calls.push([9, id]); },
    volume: (id, volume, seconds) => { calls.push([0x10d, id, volume, seconds]); return 0; },
  });
  game.soundCommand([8, 4]);
  assert.equal(game.soundRunning(4), false);
  game.soundCommand([13, 4]);
  game.soundCommand([-1]);
  assert.equal(game.vm.variables[VAR.soundResult], 1);
  game.soundCommand([0x10d, 4, 0, 90]);
  game.soundCommand([9, 4]);
  game.advance(1 / 60);
  assert.equal(game.soundRunning(4), false);
  assert.deepEqual(calls, [[8, 4], [0x10d, 4, 0, 1.5], [9, 4]]);
});

test('mixed-mode CUE reads physical tracks after the data track and excludes indexed pregaps', () => {
  const sheet = `FILE "MONKEY CD.BIN" BINARY
    TRACK 01 MODE1/2352
      INDEX 01 00:00:00
    TRACK 02 AUDIO
      INDEX 00 01:00:00
      INDEX 01 01:02:00
    TRACK 03 AUDIO
      INDEX 00 01:25:00
      INDEX 01 01:27:00
  `;
  const bytes = 90 * 75 * 2352;
  assert.deepEqual(readAudioCue(sheet, () => bytes), [
    { file: 'MONKEY CD.BIN', track: 2, start: 62 * 75, end: 85 * 75 },
    { file: 'MONKEY CD.BIN', track: 3, start: 87 * 75, end: 90 * 75 },
  ]);
  assert.throws(() => readAudioCue(sheet, () => undefined), /BIN FILES/);
});
