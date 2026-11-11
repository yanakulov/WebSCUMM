import type { GameArchive } from '../src/engine/archive.ts';
import { archiveResources } from '../src/engine/game/resources.ts';

export const MONKEY1_CD = 'monkey1-dos-cd-en';
export const MONKEY1_TITLE = 'THE SECRET OF MONKEY ISLAND';
export const MONKEY1_CD_PICKER = 'SELECT MONKEY ISLAND DOS CD .000 AND .001.';
export const MONKEY1_CD_ERROR = 'ONLY MONKEY ISLAND DOS CD (ENGLISH) CAN BE PLAYED.';

// The DOS CD interpreter supplies the track-B sector count to its boot script.
export const monkeyBootVariables = { 74: 1225 } as const;

export function monkeyCdResources(archive: GameArchive) {
  const hasRoom = (id: number, name: string) => archive.rooms.some(room => room.id === id && room.name === name);
  if (!hasRoom(10, 'logo') || !hasRoom(33, 'dock') || !hasRoom(38, 'lookout')) return undefined;
  if (!archive.resources('DSCR').some(entry => entry.id === 176)) return undefined;
  const cdCheck = new TextDecoder().decode(archive.script(176, 0));
  if (!cdCheck.includes('Game Requires Monkey Island CD in Drive!')) return undefined;
  return { ...archiveResources(archive), bootVariables: monkeyBootVariables };
}
