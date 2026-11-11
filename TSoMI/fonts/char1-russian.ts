import type { CharsetGlyph } from '../../src/engine/charset.ts';
import { char1Latin } from './char1-latin.ts';

const uppercase = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
const lowercase = 'абвгдежзийклмнопрстуфхцчшщъыьэюя';

export const char1RussianSlots: ReadonlyMap<string, number> = new Map([
  ...Array.from(uppercase, (letter, index) => [letter, 0x80 + index] as const),
  ...Array.from(lowercase, (letter, index) => [letter, index < 16 ? 0xa0 + index : 0xe0 + index - 16] as const),
  ['Ё', 0xf0], ['ё', 0xf1],
]);

const shared: Readonly<Record<string, string>> = {
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X',
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x',
};

// Rows start at the top of the 8-pixel cell. A trailing blank column supplies the advance.
const caps: Readonly<Record<string, string>> = {
  Б: '#####/#..../#..../####./#...#/#...#/####.',
  Г: '#####/#..../#..../#..../#..../#..../#....',
  Д: '..###./..#.#./..#.#./.#..#./.#..#./.#..#./######/#....#',
  Ё: '.#.#.//#####/#..../####./#..../#####',
  Ж: '#..#..#/.#.#.#./..###../...#.../..###../.#.#.#./#..#..#',
  З: '.###./#...#/....#/..##./....#/#...#/.###.',
  И: '#...#/#...#/#..##/#.#.#/##..#/#...#/#...#',
  Й: '.#..#./..##../#....#/#...##/#.##.#/##...#/#....#',
  Л: '..###/..#.#/..#.#/..#.#/..#.#/.#..#/#...#',
  П: '#####/#...#/#...#/#...#/#...#/#...#/#...#',
  У: '#...#/#...#/#...#/.####/....#/...#./###..',
  Ф: '...#.../.#####./#..#..#/#..#..#/#..#..#/.#####./...#...',
  Ц: '#...#./#...#./#...#./#...#./#...#./#...#./######/.....#',
  Ч: '#...#/#...#/#...#/.####/....#/....#/....#',
  Ш: '#..#..#/#..#..#/#..#..#/#..#..#/#..#..#/#..#..#/#######',
  Щ: '#..#..#./#..#..#./#..#..#./#..#..#./#..#..#./#..#..#./########/.......#',
  Ъ: '##..../.#..../.#..../.####./.#...#/.#...#/.####.',
  Ы: '#.....#/#.....#/#.....#/####..#/#...#.#/#...#.#/####..#',
  Ь: '#..../#..../#..../####./#...#/#...#/####.',
  Э: '.###./#...#/....#/..###/....#/#...#/.###.',
  Ю: '#...##./#..#..#/#..#..#/####..#/#..#..#/#..#..#/#...##.',
  Я: '.####/#...#/#...#/.####/..#.#/.#..#/#...#',
};

const small: Readonly<Record<string, string>> = {
  в: '####./#...#/####./#...#/####.',
  г: '#####/#..../#..../#..../#....',
  д: '..###./..#.#./.#..#./.#..#./######/#....#',
  ж: '#..#..#/.#.#.#./..###../.#.#.#./#..#..#',
  з: '.###./....#/..##./....#/.###.',
  и: '#...#/#..##/#.#.#/##..#/#...#',
  к: '#...#/#..#./###../#..#./#...#',
  л: '..###/..#.#/..#.#/.#..#/#...#',
  м: '#.....#/##...##/#.#.#.#/#..#..#/#.....#',
  н: '#...#/#...#/#####/#...#/#...#',
  п: '#####/#...#/#...#/#...#/#...#',
  т: '#####/..#../..#../..#../..#..',
  ц: '#...#./#...#./#...#./#...#./######/.....#',
  ч: '#...#/#...#/.####/....#/....#',
  ш: '#..#..#/#..#..#/#..#..#/#..#..#/#######',
  щ: '#..#..#./#..#..#./#..#..#./#..#..#./########/.......#',
  ъ: '##..../.#..../.####./.#...#/.####.',
  ы: '#.....#/#.....#/####..#/#...#.#/####..#',
  ь: '#..../#..../####./#...#/####.',
  э: '.###./....#/..###/....#/.###.',
  ю: '#...##./#..#..#/####..#/#..#..#/#...##.',
  я: '.####/#...#/.####/..#.#/.#..#',
};

const accentsAndDescenders: Readonly<Record<string, string>> = {
  б: '...##/..#../.#.../####./#...#/#...#/.###.',
  ё: '.#.#.//.###./#...#/####./#..../.####',
  й: '.#.#./..#../#...#/#..##/#.#.#/##..#/#...#',
  ф: '/...#.../.#####./#..#..#/#..#..#/#..#..#/.#####./...#...',
};

export const char1Russian: Readonly<Record<string, CharsetGlyph>> = Object.fromEntries(
  Array.from(char1RussianSlots.keys(), letter => {
    const alias = shared[letter];
    if (alias) return [letter, char1Latin[alias]];
    if (small[letter]) return [letter, drawGlyph(small[letter], 2)];
    return [letter, drawGlyph(caps[letter] ?? accentsAndDescenders[letter], 0)];
  }),
);

function drawGlyph(drawing: string, top: number): CharsetGlyph {
  const drawnRows = drawing.split('/');
  const inkWidth = Math.max(...drawnRows.map(row => row.length));
  if (drawnRows.length + top > 8 || drawnRows.some(row => row && row.length !== inkWidth)) {
    throw new Error(`Inconsistent CHAR 1 drawing: ${drawing}`);
  }
  const rows = Array.from({ length: 8 }, (_, y) => {
    const ink = drawnRows[y - top];
    return ink ? parseInt(ink.replaceAll('#', '1').replaceAll('.', '0'), 2) << 1 : 0;
  });
  return { width: inkWidth + 1, rows };
}

export function encodeChar1RussianText(text: string) {
  return Uint8Array.from(text.normalize('NFC'), letter => {
    const slot = char1RussianSlots.get(letter);
    if (slot !== undefined) return slot;
    const ascii = letter.charCodeAt(0);
    if (ascii >= 32 && ascii < 127) return ascii;
    throw new Error(`Unsupported character ${JSON.stringify(letter)} in CHAR 1 text.`);
  });
}
