import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GameArchive } from '../../src/engine/archive.ts';

export function loadOriginal(directory: string) {
  const load = (ext: string) => {
    try { return readFileSync(join(directory, `MONKEY1.${ext}`)); }
    catch { return readFileSync(join(directory, `MONKEY.${ext}`)); }
  };
  return new GameArchive(load('000'), load('001'));
}
