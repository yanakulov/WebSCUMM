import { char1Latin } from '../../TSoMI/fonts/char1-latin.ts';
import { char1Russian } from '../../TSoMI/fonts/char1-russian.ts';

// BYLE uses 3 × 5 pixel letters with a one-pixel advance between them.
const alphabet: Record<string, string> = {
  A: '75755', B: '75657', C: '74447', D: '65556', E: '74647', F: '74644', G: '74757',
  H: '55755', I: '22222', J: '11157', K: '55655', L: '44447', M: '57555', N: '57775',
  O: '75557', P: '75744', Q: '75576', R: '75765', S: '74717', T: '72222', U: '55557',
  V: '55552', W: '55575', X: '55255', Y: '55222', Z: '71247',
  '0': '75557', '1': '22222', '2': '71747', '3': '71317', '4': '55711', '5': '74717',
  '6': '44757', '7': '71111', '8': '75757', '9': '75711', '<': '12421', '>': '42124',
  '-': '00700', '+': '02720', '=': '07070', '.': '00002', ' ': '00000',
  '/': '11244', '\\': '44211', ':': '02020', '?': '71202', '!': '22202', ',': '00024',
  '(': '24442', ')': '21112', '_': '00007', '&': '25253', '*': '05250', '#': '57575',
  'А': '75755', 'Б': '74657', 'В': '75657', 'Г': '74444', 'Д': '35577', 'Е': '74647', 'Ё': '57647',
  'Ж': '75757', 'З': '71317', 'И': '55775', 'Й': '25775', 'К': '55655', 'Л': '35555', 'М': '57555',
  'Н': '55755', 'О': '75557', 'П': '75555', 'Р': '75744', 'С': '74447', 'Т': '72222', 'У': '55317',
  'Ф': '27772', 'Х': '55255', 'Ц': '55571', 'Ч': '55311', 'Ш': '55577', 'Щ': '55573', 'Ъ': '62457',
  'Ы': '55575', 'Ь': '44657', 'Э': '71317', 'Ю': '57575', 'Я': '75735',
};

const cache = new Map<string, { bitmap: string; width: number; height: number }>();
export function glyph(text: string, font: 'byle' | 'help' = 'byle') {
  const key = `${font}:${text}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  let width: number;
  if (font === 'help') {
    const letters = Array.from(text, letter => char1Russian[letter] ?? char1Latin[letter] ?? char1Latin['?']);
    width = letters.reduce((total, letter) => total + letter.width + (letter.xOffset ?? 0), 0);
    canvas.width = Math.max(1, width);
    canvas.height = 8;
    const ctx = canvas.getContext('2d')!;
    let pen = 0;
    for (const { rows, width, xOffset = 0, yOffset = 0 } of letters) {
      pen += xOffset;
      for (const [y, row] of rows.entries()) {
        for (let x = 0; x < width; x++) if (row & (1 << (width - 1 - x))) ctx.fillRect(pen + x, y + yOffset, 1, 1);
      }
      pen += width;
    }
  } else {
    width = text.length * 4;
    canvas.width = Math.max(1, width - 1);
    canvas.height = 5;
    const ctx = canvas.getContext('2d')!;
    text.toUpperCase().split('').forEach((char, n) => {
      const rows = alphabet[char] ?? alphabet['?'];
      for (let y = 0; y < 5; y++) {
        const bits = parseInt(rows[y], 16);
        for (let x = 0; x < 3; x++) if (bits & (4 >> x)) ctx.fillRect(n * 4 + x, y, 1, 1);
      }
    });
  }
  const ink = { bitmap: `url(${canvas.toDataURL()})`, width, height: canvas.height };
  cache.set(key, ink);
  return ink;
}
