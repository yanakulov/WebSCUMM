import assert from 'node:assert/strict';
import test from 'node:test';
import { readMonochromeCharset, replaceMonochromeGlyphs } from '../../src/engine/charset.ts';
import { readCostume, readCostumeFile } from '../../src/engine/costume.ts';
import { writeCostume } from '../../src/engine/costume-writer.ts';
import { readRoom } from '../../src/engine/room.ts';
import { char1Latin } from '../fonts/char1-latin.ts';
import { char1Russian, char1RussianSlots, encodeChar1RussianText } from '../fonts/char1-russian.ts';
import { loadOriginal } from './fixtures.ts';

test('all 66 Russian CHAR 1 glyphs round-trip through CP866', () => {
  const letters = [...char1RussianSlots.keys()].join('');
  assert.equal(char1RussianSlots.size, 66);
  assert.equal(new Set(char1RussianSlots.values()).size, 66);
  assert.equal(new TextDecoder('ibm866').decode(encodeChar1RussianText(letters)), letters);
  for (const [letter, glyph] of Object.entries(char1Russian)) {
    assert.equal(glyph.rows.length, 8, letter);
    assert.ok(glyph.rows.some(row => row !== 0), letter);
    assert.ok(glyph.rows.every(row => row < 2 ** glyph.width), letter);
  }
  assert.deepEqual(encodeChar1RussianText('Ёжик, ёжик!'), Uint8Array.of(0xf0, 0xa6, 0xa8, 0xaa, 44, 32, 0xf1, 0xa6, 0xa8, 0xaa, 33));
  assert.throws(() => encodeChar1RussianText('🙂'), /Unsupported character/);
});

const directory = process.env.WEBSCUMM_GAME_DIR;
test('the original PC CD decodes every room and costume and preserves jump 18', { skip: !directory }, () => {
  const game = loadOriginal(directory!);
  assert.equal(game.rooms.length, 83);
  for (const { id } of game.rooms) assert.doesNotThrow(() => readRoom(game, id), `room ${id}`);
  for (const { id } of game.resources('DCOS')) {
    const costume = readCostume(game, id);
    const roundTrip = readCostumeFile(writeCostume(costume), costume.name);
    assert.deepEqual(roundTrip.chores, costume.chores, `choreography of costume ${id}`);
    assert.deepEqual(roundTrip.limbs, costume.limbs, `cels of costume ${id}`);
    assert.deepEqual(roundTrip.paletteIndices, costume.paletteIndices, `palette indices of costume ${id}`);
  }
  const dock = readRoom(game, 33);
  assert.deepEqual([dock.width, dock.height, dock.boxes.length, dock.masks[0]?.tag], [1008, 144, 13, 'ZP01']);
  const guybrush = readCostume(game, 44);
  assert.equal(game.resources('DCOS').length, 119);
  assert.equal(game.resources('DSCR').length, 178);
  assert.deepEqual(guybrush.chores[18 * 4].tracks[1], { cels: [0, 8, 8, 7, 7, 8, 2], loop: false });
  assert.equal(game.resource('DSCR', 1).chunk.tag, 'SCRP');

  const { chunk } = game.resource('DCHR', 1);
  const source = game.disk.bytes.subarray(chunk.start, chunk.end);
  const original = readMonochromeCharset(source);
  for (const [letter, glyph] of Object.entries(char1Latin)) {
    assert.deepEqual(original.glyphs[letter.charCodeAt(0)], { xOffset: 0, yOffset: 0, ...glyph }, letter);
  }
  const russian = new Map(Array.from(char1RussianSlots, ([letter, slot]) => [slot, char1Russian[letter]]));
  const compiled = replaceMonochromeGlyphs(source, russian);
  const decoded = readMonochromeCharset(compiled);
  assert.equal(decoded.height, original.height);
  assert.equal(decoded.glyphs.length, original.glyphs.length);
  for (const [slot, existing] of original.glyphs.entries()) {
    const replacement = russian.get(slot);
    assert.deepEqual(decoded.glyphs[slot], replacement ? { xOffset: 0, yOffset: 0, ...replacement } : existing);
  }
  assert.deepEqual(compiled.subarray(1057, source.length), source.subarray(1057));
});
