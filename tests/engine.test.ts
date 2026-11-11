import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { blankCostume, celFromSurface, flood, parseProject, practiceCostume, stroke } from '../src/byle/project.ts';
import { GameArchive } from '../src/engine/archive.ts';
import { Binary } from '../src/engine/binary.ts';
import { readMonochromeCharset, replaceMonochromeGlyphs } from '../src/engine/charset.ts';
import { readCostume, readCostumeFile } from '../src/engine/costume.ts';
import { writeCostume } from '../src/engine/costume-writer.ts';
import { decodeSmap, readRoom } from '../src/engine/room.ts';
import { char1Latin } from '../src/fonts/char1-latin.ts';
import { char1Russian, char1RussianSlots, encodeChar1RussianText } from '../src/fonts/char1-russian.ts';
import { drawChore } from '../src/render.ts';

test('SMAP vertical strips scatter into rows and reject truncated streams', () => {
  const bytes = Uint8Array.of(83, 77, 65, 80, 0, 0, 0, 17, 12, 0, 0, 0, 14, 3, 3, 0, 0);
  const binary = new Binary(bytes);
  const expected = [3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];
  assert.deepEqual([...decodeSmap(binary, binary.chunk(0), 8, 2, 255)], expected);
  assert.throws(() => decodeSmap(binary, binary.chunk(0), 8, 10, 255), /Truncated/);
});

test('SCUMM CHAR packs continuous rows and preserves signed glyph offsets', () => {
  const source = new Uint8Array(33 + 4);
  source.set([67, 72, 65, 82]);
  const header = new DataView(source.buffer);
  header.setUint32(4, source.length);
  header.setUint32(8, source.length - 23, true);
  source.set([1, 8, 1, 0], 29);
  const glyph = { width: 5, rows: [0b10110, 0b00011, 0b00111], xOffset: -1, yOffset: 2 };
  const compiled = replaceMonochromeGlyphs(source, new Map([[0, glyph]]));
  assert.deepEqual([...compiled.subarray(source.length)], [5, 3, 255, 2, 0xb0, 0xce]);
  assert.deepEqual(readMonochromeCharset(compiled), { height: 8, glyphs: [glyph] });
  assert.equal(header.getUint32(33, true), 0);
});

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

test('the standalone example compiles and opens as a SCUMM v5 COST resource', () => {
  const costume = parseProject(JSON.stringify(practiceCostume()));
  costume.chores[2].tracks[0]!.cels.push(-0x78, -1);
  costume.chores[2].tracks[1] = { cels: [], loop: false, disabled: true };
  const bytes = writeCostume(costume);
  const chunk = new Binary(bytes).chunk(0);
  assert.deepEqual(chunk, { tag: 'COST', start: 0, data: 8, end: bytes.length });
  const imported = readCostumeFile(bytes, 'BOUNCE');
  assert.deepEqual(imported, costume);
});

test('BYLE drawing retains pixels outside the viewport and round-trips a layered project', () => {
  const surface = new Uint8Array(9);
  stroke([0, 0], [2, 2], (x, y) => { surface[y * 3 + x] = 1; });
  flood(surface, 3, 3, [0, 2], 2);
  assert.deepEqual([...surface], [1, 0, 0, 2, 1, 0, 2, 2, 1]);
  const cel = celFromSurface(surface, 3, 3, [0, 0], { width: 1, height: 1, x: -1, y: 0, moveX: 1, moveY: 0, pixels: [3] });
  assert.deepEqual(cel.pixels, [3, 1, 0, 0, 0, 2, 1, 0, 0, 2, 2, 1]);
  const costume = blankCostume();
  costume.limbs[0][0] = cel;
  costume.limbs[1][0] = { width: 1, height: 1, x: 0, y: 0, moveX: 0, moveY: 0, pixels: [4] };
  costume.chores[2] = { tracks: Array.from({ length: 16 }, (_, i) => i < 2 ? { cels: [0], loop: true } : null) };
  costume.chores[6] = { tracks: Array.from({ length: 16 }, (_, i) => i === 0 ? { cels: [0], loop: true } : null) };
  costume.baseChore = 0;
  assert.deepEqual(parseProject(JSON.stringify(costume)), costume);
  const rendered = new Uint8Array(9);
  drawChore(rendered, 3, 3, costume, 1, 2, 0, 0, 0);
  assert.deepEqual([...rendered], [1, 4, 0, 2, 1, 0, 2, 2, 1]);
});

const directory = process.env.WEBSCUMM_GAME_DIR;
test('the original PC CD decodes every room and costume and preserves jump 18', { skip: !directory }, () => {
  const load = (ext: string) => {
    try { return readFileSync(join(directory!, `MONKEY1.${ext}`)); }
    catch { return readFileSync(join(directory!, `MONKEY.${ext}`)); }
  };
  const game = new GameArchive(load('000'), load('001'));
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
