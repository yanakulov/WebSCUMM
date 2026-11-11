import type { GameArchive } from '../archive.ts';
import { readCostume, type Costume } from '../costume.ts';
import { readGameFont, type GameFont } from './font.ts';
import { getObjectVerb, readObjectImage, readObjectVerbs, readScene, type ObjectImage, type Scene, type SceneObject } from './scene.ts';

export type RoomCode = 'ENCD' | 'EXCD';
export type SoundCue = { type: 'cd'; loops: number; frames: number } | { type: 'effect' };

export interface GameResources {
  bootVariables?: Readonly<Record<number, number>>;
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

export function archiveResources(archive: GameArchive): GameResources {
  return {
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
