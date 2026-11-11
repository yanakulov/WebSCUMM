import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { ScummGame } from '../../src/engine/game/game.ts';
import { HEIGHT, WIDTH, hitVerb, renderGame } from '../../src/engine/game/render.ts';
import { monkeyCdResources } from '../game.ts';
import { parseMonkeyPack } from '../pack.ts';
import { loadOriginal } from './fixtures.ts';

const directory = process.env.WEBSCUMM_GAME_DIR;
const packed = parseMonkeyPack(gunzipSync(readFileSync(new URL('../assets/monkey1.wsc.gz', import.meta.url))));

function start(random = () => 0.5) {
  const game = new ScummGame(packed, random);
  game.boot();
  return game;
}

function seededRandom(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function advanceUntil(game: ScummGame, condition: () => boolean, timeout: number) {
  const pixels = new Uint8Array(WIDTH * HEIGHT);
  for (let i = 0; i <= timeout * 60; i++) {
    assert.equal(game.error, '');
    assert.equal(game.stopped, false);
    if (condition()) {
      renderGame(game, pixels);
      return pixels;
    }
    game.advance(1 / 60);
  }
  assert.fail(`Timed out in room ${game.room} after ${timeout}s`);
}

test('the web pack executes the original credits, lookout dialogue and part card', () => {
  const game = start();
  const title = advanceUntil(game, () => game.room === 10 && game.objects[109].state === 1, 25);
  assert.equal(game.camera, 160);
  assert.ok(new Set(title).size > 40);
  assert.equal(game.verbs.has(100), false);
  advanceUntil(game, () => game.room === 38 && !!game.message, 100);
  assert.equal(String.fromCharCode(...game.message!.pages[0]), 'Hi!');
  advanceUntil(game, () => game.room === 96, 85);
  advanceUntil(game, () => game.room === 33 && !game.actor(1).target, 35);
  assert.equal(game.actor(1).x, 346);
  assert.equal(game.followedActor, 1);
});

test('the web pack can skip cutscenes, read the dock poster and enter the SCUMM Bar', () => {
  const game = start(seededRandom(45));
  advanceUntil(game, () => game.room === 10 && game.vm.variables[14] >= 1260, 25);
  game.key(27);
  advanceUntil(game, () => game.room === 38, 2);
  game.key(27);
  advanceUntil(game, () => game.room === 33 && !game.actor(1).target, 35);

  assert.equal(hitVerb(game, 72, 173)?.id, 8);
  game.click(72, 173, 1, 8);
  game.click(264 - game.viewX, 103, 1);
  advanceUntil(game, () => !!game.message, 8);
  assert.equal(String.fromCharCode(...game.message!.pages[0]), 'Re-elect Governor Marley.');
  advanceUntil(game, () => !game.sentencePending && !game.message, 10);

  for (let i = 0; i < 5 && game.viewX < 416; i++) {
    const x = game.actor(1).x;
    game.click(300, 138, 1);
    advanceUntil(game, () => game.actor(1).x !== x && !game.actor(1).target && game.camera === game.cameraTarget, 10);
  }
  assert.ok(game.viewX >= 416);
  game.click(22, 175, 1, hitVerb(game, 22, 175)?.id);
  game.click(710 - game.viewX, 106, 1);
  advanceUntil(game, () => game.objects[428].state === 1 && !game.sentencePending, 10);
  game.click(710 - game.viewX, 106, 1);
  const bar = advanceUntil(game, () => game.room === 28 && !game.actor(1).target, 10);
  assert.ok(new Set(bar).size > 40);
  assert.ok(animationFrames(game, 152, 24, 64, 48) > 1, 'the chandelier animates');

  game.walk(game.actor(1), 472, 125);
  advanceUntil(game, () => !game.actor(1).target && game.camera === 480, 20);
  assert.equal(animationFrames(game, 520, 80, 16, 16), 3, 'the fireplace draws all three frames');
  advanceUntil(game, () => game.actor(6).room === 28 && !!game.actor(6).target, 60);
});

function animationFrames(game: ScummGame, x: number, y: number, width: number, height: number) {
  const frames = new Set<string>();
  const pixels = new Uint8Array(WIDTH * HEIGHT);
  for (let i = 0; i < 36; i++) {
    game.advance(0.1);
    assert.equal(game.error, '');
    renderGame(game, pixels);
    const left = x - game.viewX;
    frames.add(Array.from({ length: height }, (_, row) => {
      const start = (y + row) * WIDTH + left;
      return pixels.subarray(start, start + width).join(',');
    }).join('/'));
  }
  return frames.size;
}

test('the web pack cycles all three jail torches and allows talking to the prisoner', () => {
  const game = start(seededRandom(42));
  const ego = () => game.actor(1);
  const settled = () => !ego().target && game.camera === game.cameraTarget && game.vm.variables[53] > 0;
  const walk = (x: number, y: number) => {
    const previousX = ego().x;
    game.click(x, y, 1);
    advanceUntil(game, () => ego().x !== previousX && settled(), 10);
  };

  advanceUntil(game, () => game.room === 10 && game.vm.variables[14] >= 1260, 25);
  game.key(27);
  advanceUntil(game, () => game.room === 38, 2);
  game.key(27);
  advanceUntil(game, () => game.room === 33 && settled(), 35);
  for (let i = 0; i < 6 && game.viewX < 688; i++) walk(304, 134);
  game.click(998 - game.viewX, 114, 1);
  advanceUntil(game, () => game.room === 35 && settled(), 12);
  walk(30, 108);
  game.click(159 - game.viewX, 78, 1);
  advanceUntil(game, () => game.room === 34 && settled(), 45);
  walk(70, 128);
  game.click(465 - game.viewX, 76, 1);
  advanceUntil(game, () => game.room === 31 && settled(), 15);

  const seen = [new Set<number>(), new Set<number>(), new Set<number>()];
  for (let tick = 0; tick < 120; tick++) {
    game.advance(1 / 60);
    assert.equal(game.error, '');
    for (const [index, frames] of seen.entries()) {
      const first = 411 + index * 3;
      const lit = game.objects.slice(first, first + 3).flatMap((object, frame) => object.state ? [frame] : []);
      assert.equal(lit.length, 1);
      frames.add(lit[0]);
    }
  }
  assert.deepEqual(seen.map(frames => frames.size), [3, 3, 3]);

  walk(124, 135);
  game.click(72, 189, 1, hitVerb(game, 72, 189)?.id);
  game.click(46, 90, 1);
  advanceUntil(game, () => !!game.message, 10);
  assert.equal(String.fromCharCode(...game.message!.pages[0]), 'You gotta get me out of here!');
});

test('the original CD and the web pack draw the same title frame', { skip: !directory }, () => {
  const resources = monkeyCdResources(loadOriginal(directory!));
  assert.ok(resources);
  const local = new ScummGame(resources, () => 0.5);
  local.boot();
  const title = (game: ScummGame) => advanceUntil(game, () => game.room === 10 && game.objects[109].state === 1, 25);
  assert.deepEqual(title(start()), title(local));
});

test('a tap skips the title before its override is armed and advances in-game dialogue', () => {
  const game = start();
  advanceUntil(game, () => game.room === 10, 2);
  game.tap(160, 100);
  advanceUntil(game, () => game.room === 38, 5);
  game.tap(160, 100);
  advanceUntil(game, () => game.room === 33 && !game.actor(1).target, 35);

  game.tap(72, 173, hitVerb(game, 72, 173)?.id);
  game.tap(264 - game.viewX, 103);
  advanceUntil(game, () => !!game.message, 8);
  assert.equal(String.fromCharCode(...game.message!.pages[0]), 'Re-elect Governor Marley.');
  game.tap(160, 100);
  assert.equal(String.fromCharCode(...game.message!.pages[0]), "`When there's only one candidate, there's only one choice.`");
});

test('Guybrush keeps his eye pixel and the camera follows only past the dock trigger', () => {
  const game = start();
  advanceUntil(game, () => game.room === 10, 2);
  game.tap(160, 100);
  advanceUntil(game, () => game.room === 38, 5);
  game.tap(160, 100);
  const pixels = advanceUntil(game, () => game.room === 33 && !game.actor(1).target && game.camera === game.cameraTarget, 35);
  const ego = game.actor(1);
  const costume = game.getCostume(ego.costume);
  assert.equal(ego.scaleX, 210);
  const eye = (ego.y - 35) * WIDTH + ego.x - game.viewX + 1;
  assert.equal(pixels[eye], costume.paletteIndices![7]);

  game.chore(ego, ego.talkChore);
  game.face(ego, 3);
  assert.equal(ego.limbs[0]?.track?.cels[0], 21, 'standing body turns with the talking head');
  assert.equal(ego.limbs[1]?.track?.cels[0], 12);

  const initialCamera = game.camera;
  game.walk(ego, ego.x + 40, ego.y);
  advanceUntil(game, () => !ego.target, 10);
  assert.equal(game.camera, initialCamera);
  game.walk(ego, ego.x + 192, ego.y);
  let previous = game.camera;
  for (let i = 0; i < 80 && (ego.target || game.camera !== game.cameraTarget); i++) {
    game.advance(0.1);
    assert.ok([0, 8].includes(game.camera - previous));
    previous = game.camera;
  }
  assert.equal(game.error, '');
  assert.ok(!ego.target && game.camera > initialCamera);
});
