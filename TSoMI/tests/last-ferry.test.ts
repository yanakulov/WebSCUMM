import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { ScummGame } from '../../src/engine/game/game.ts';
import { hitVerb, renderGame, WIDTH, HEIGHT } from '../../src/engine/game/render.ts';
import { VAR } from '../../src/engine/game/vm.ts';
import { animated } from '../last-ferry/art-data.ts';
import { lastFerryResources } from '../last-ferry/game.ts';
import { Item, Room, Verb } from '../last-ferry/scripts.ts';
import { parseMonkeyPack } from '../pack.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url));
const original = parseMonkeyPack(gunzipSync(read('../assets/monkey1.wsc.gz')));
const source = lastFerryResources(original, read('../last-ferry/art.bin'));

test('Last Ferry animates water and the skipper in the native renderer', () => {
  const game = new ScummGame(source, () => 0.5);
  game.boot();
  const skipper = game.actor(2);
  const origin = [skipper.x, skipper.y];
  const pixels = new Uint8Array(WIDTH * HEIGHT);
  const colors = new Set<string>();
  const poses = new Set<string>();
  for (let tick = 0; tick < 38; tick++) {
    game.advance(1 / 15);
    assert.equal(game.error, '');
    assert.deepEqual([skipper.x, skipper.y], origin);
    colors.add(game.palette[animated.wave0].join(','));
    renderGame(game, pixels);
    poses.add(Array.from({ length: 40 }, (_, row) => {
      const start = (row + 76) * WIDTH + 249;
      return pixels.subarray(start, start + 33).join(',');
    }).join('/'));
  }
  assert.equal(colors.size, 4);
  assert.ok(poses.size >= 4);
});

test('Last Ferry plays through the native verbs, cargo lift, ferry and original Mêlée arrival', () => {
  const game = new ScummGame(source, () => 0.5);
  game.boot();
  const actor = game.actor(1);
  const pixels = new Uint8Array(WIDTH * HEIGHT);
  const wait = (done: () => boolean, skip = true) => {
    for (let i = 0; i < 900; i++) {
      assert.equal(game.error, '');
      if (i > 0 && done()) return;
      if (skip && game.message) game.key(46);
      game.advance(1 / 15);
      renderGame(game, pixels);
    }
    assert.fail('Timed out in room ' + game.room + ' at ' + actor.x + ',' + actor.y);
  };
  const idle = () => !actor.target && !game.message && game.vm.variables[VAR.userInput] > 0;
  const clickVerb = (id: number) => {
    const { x, y } = game.verbs.get(id)!;
    assert.equal(hitVerb(game, x + 1, y + 2)?.id, id);
    game.click(x + 1, y + 2, 1, id);
    game.advance(1 / 15);
  };
  const clickObject = (id: number) => {
    const object = game.object(id)!;
    const { x, y } = game.positions.get(id) ?? object;
    game.click(x + Math.floor(object.width / 2) - game.viewX, y + Math.floor(object.height / 2), 1);
  };
  const act = (verb: number, id: number, slot?: number) => {
    if (verb !== Verb.walk) clickVerb(verb);
    if (slot) clickVerb(slot);
    clickObject(id);
    wait(idle);
  };

  assert.equal(game.room, Room.office);
  act(Verb.talk, Item.skipper);
  assert.deepEqual(game.inventory(1), [Item.receipt]);
  act(Verb.walk, Item.office);
  assert.equal(game.room, Room.clerk);
  act(Verb.talk, Item.clerk);
  assert.equal(game.verbs.get(111)?.mode, 1);
  clickVerb(111);
  wait(idle);
  act(Verb.give, Item.clerk, 201);
  assert.deepEqual(game.inventory(1), [Item.tag, Item.handle]);
  act(Verb.walk, Item.warehouse);
  assert.equal(game.room, Room.warehouse);
  act(Verb.open, Item.nine);
  assert.equal(game.objects[Item.nine].state, 2);
  act(Verb.open, Item.six);
  assert.deepEqual(game.inventory(1), [Item.tag, Item.handle, Item.plug]);
  act(Verb.use, Item.upper, 203);
  act(Verb.pull, Item.upper); // Send it down empty.
  assert.equal(game.positions.get(Item.lift)?.y, 125);
  act(Verb.pull, Item.upper); // Call it back.
  assert.equal(game.positions.get(Item.lift)?.y, 88);

  clickVerb(Verb.pull);
  clickObject(Item.lift);
  wait(() => game.platformMoving, false);
  assert.equal(actor.walkBox, 3);
  const offset = actor.y - game.positions.get(Item.lift)!.y;
  wait(() => !game.platformMoving, false);
  assert.equal(actor.y - game.positions.get(Item.lift)!.y, offset);
  wait(idle);
  act(Verb.use, Item.leak, 204);
  assert.deepEqual(game.inventory(1), [Item.tag]);
  assert.equal(game.objects[Item.leak].state, 4);
  act(Verb.give, Item.skipper, 202);
  act(Verb.pull, Item.rope);
  clickObject(Item.boarding);
  wait(() => game.room === Room.crossing, false);
  game.key(27);
  wait(() => game.room === Room.melee, false);
  clickObject(Item.trail);
  wait(() => game.stopped, false);
  assert.equal(game.room, Room.melee);
});
