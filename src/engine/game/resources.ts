import type { GameArchive } from '../archive.ts';
import { readCostume, type Costume } from '../costume.ts';
import { readGameFont, type GameFont } from './font.ts';
import { getObjectVerb, readObjectImage, readObjectVerbs, readScene, type ObjectImage, type Scene, type SceneObject } from './scene.ts';

export const MONKEY1_CD = 'monkey1-dos-cd-en';
export type RoomCode = 'ENCD' | 'EXCD';
export type SoundCue = { type: 'cd'; loops: number; frames: number } | { type: 'effect' };

export interface GameResources {
  edition?: typeof MONKEY1_CD;
  variableCount: number;
  bitVariableCount: number;
  objects: GameArchive['objects'];
  scene(id: number): Scene;
  script(id: number, room: number): Uint8Array;
  roomCode(tag: RoomCode, room: number): Uint8Array | undefined;
  costume(id: number): Costume;
  font(id: number): GameFont;
  image(room: number, object: SceneObject, state: number, transparent: number): ObjectImage | undefined;
  objectVerb(room: number, object: SceneObject, verb: number): Uint8Array | undefined;
  sound(id: number): SoundCue | undefined;
}

export function isMonkeyIslandCd(archive: GameArchive) {
  if (![[10, 'logo'], [33, 'dock'], [38, 'lookout']].every(([id, name]) =>
    archive.rooms.some(room => room.id === id && room.name === name))) return false;
  if (!archive.resources('DSCR').some(entry => entry.id === 176)) return false;
  const cdCheck = new TextDecoder().decode(archive.script(176, 0));
  return cdCheck.includes('Game Requires Monkey Island CD in Drive!');
}

export function archiveResources(archive: GameArchive): GameResources {
  return {
    edition: isMonkeyIslandCd(archive) ? MONKEY1_CD : undefined,
    variableCount: archive.variableCount,
    bitVariableCount: archive.bitVariableCount,
    objects: archive.objects,
    scene: id => readScene(archive, id),
    script: (id, room) => archive.script(id, room),
    roomCode: (tag, room) => {
      const chunk = archive.room(room).find(chunk => chunk.tag === tag);
      return chunk && archive.disk.bytes.subarray(chunk.data, chunk.end);
    },
    costume: id => readCostume(archive, id),
    font: id => readGameFont(archive, id),
    image: (_room, object, state, transparent) => readObjectImage(archive, object, state, transparent),
    objectVerb: (_room, object, verb) => getObjectVerb(readObjectVerbs(archive, object), verb),
    sound: id => readSoundCue(archive, id),
  };
}

function readSoundCue(archive: GameArchive, id: number): SoundCue | undefined {
  if (!archive.resources('DSOU').some(sound => sound.id === id)) return undefined;
  const { chunk } = archive.resource('DSOU', id);
  const disk = archive.disk;
  if (chunk.end - chunk.data !== 24 || disk.u8(chunk.data + 7) !== 2) return { type: 'effect' };
  const cdFrame = (at: number) => (disk.u8(at) * 60 + disk.u8(at + 1)) * 75 + disk.u8(at + 2);
  return { type: 'cd', loops: disk.u8(chunk.data + 17), frames: cdFrame(chunk.data + 21) - cdFrame(chunk.data + 18) };
}
