import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { GameArchive } from '../../src/engine/archive.ts';
import { readMonochromeCharset, replaceMonochromeGlyphs } from '../../src/engine/charset.ts';
import { char1Latin } from '../fonts/char1-latin.ts';
import { char1Russian, char1RussianSlots } from '../fonts/char1-russian.ts';

const [directory = process.env.WEBSCUMM_GAME_DIR, filename = '.local/char1-ru/CHAR_0001'] = process.argv.slice(2);
if (!directory) throw new Error('Usage: npm run font:char1 -- <Monkey Island DOS CD directory> [output file]');

const files = new Map((await readdir(directory)).map(name => [name.toLowerCase(), name]));
const base = ['monkey1', 'monkey'].find(stem => files.has(`${stem}.000`) && files.has(`${stem}.001`));
if (!base) throw new Error('Expected MONKEY1.000/.001 or MONKEY.000/.001 in the input directory.');
const [index, disk] = await Promise.all(['000', '001'].map(ext => readFile(join(directory, files.get(`${base}.${ext}`)!))));
const game = new GameArchive(index, disk);
const { chunk } = game.resource('DCHR', 1);
const source = game.disk.bytes.subarray(chunk.start, chunk.end);
const font = readMonochromeCharset(source);
const matchesOriginal = Object.entries(char1Latin).every(([letter, glyph]) => {
  const original = font.glyphs[letter.charCodeAt(0)];
  return original?.width === glyph.width && original.xOffset === (glyph.xOffset ?? 0) &&
    original.yOffset === (glyph.yOffset ?? 0) && original.rows.length === glyph.rows.length &&
    original.rows.every((row, y) => row === glyph.rows[y]);
});
if (font.height !== 8 || font.glyphs.length !== 256 || !matchesOriginal) {
  throw new Error('The input CHAR 1 does not match the Monkey Island DOS CD font.');
}

const replacements = new Map(Array.from(char1RussianSlots, ([letter, slot]) => [slot, char1Russian[letter]]));
const compiled = replaceMonochromeGlyphs(source, replacements);
const output = resolve(filename);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, compiled);
console.log(`${output} (${compiled.length} bytes, ${replacements.size} CP866 glyphs)`);
