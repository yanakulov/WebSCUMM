import assert from 'node:assert/strict';
import test from 'node:test';
import { inflateSync } from 'node:zlib';
import { blankCostume, celFromSurface, flood, parseProject, practiceCostume, stroke } from '../src/byle/project.ts';
import { Binary } from '../src/engine/binary.ts';
import { readMonochromeCharset, replaceMonochromeGlyphs } from '../src/engine/charset.ts';
import { readCostumeFile } from '../src/engine/costume.ts';
import { writeCostume } from '../src/engine/costume-writer.ts';
import { decodeSmap } from '../src/engine/room.ts';
import { indexedPng, indexOpaquePixels } from '../src/indexed-png.ts';
import { drawChore } from '../src/render.ts';

test('room paint exports opaque pixels on the original indexed PNG grid', async () => {
  const data = Uint8ClampedArray.of(3, 7, 19, 255, 247, 201, 75, 255, 247, 201, 75, 255, 3, 7, 19, 255);
  const { pixels, palette } = indexOpaquePixels(data);
  const png = Buffer.from(await (await indexedPng(2, 2, pixels, palette)).arrayBuffer());
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20), png[24], png[25]], [2, 2, 8, 3]);
  assert.equal(png.toString('ascii', 37, 41), 'PLTE');
  assert.deepEqual([...png.subarray(41, 47)], [3, 7, 19, 247, 201, 75]);
  assert.equal(png.toString('ascii', 55, 59), 'IDAT');
  assert.deepEqual([...inflateSync(png.subarray(59, 59 + png.readUInt32BE(51)))], [0, 0, 1, 0, 1, 0]);
  assert.throws(() => indexOpaquePixels(Uint8ClampedArray.of(1, 2, 3, 127)), /opaque/);
});

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
