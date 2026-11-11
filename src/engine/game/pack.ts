import type { Cel, Costume } from '../costume.ts';
import type { GameFont } from './font.ts';
import { MONKEY1_CD, type GameResources, type RoomCode, type SoundCue } from './resources.ts';
import { getObjectVerb, type ObjectImage, type ObjectVerbs, type Scene, type SceneObject } from './scene.ts';

export const MONKEY_PACK_PATH = 'assets/monkey1.wsc.gz';
const magic = [0x57, 0x53, 0x43, 0x31]; // WSC1
const headerSize = 8;

export interface PackedScene {
  scene: Omit<Scene, 'objects'> & { objects: SceneObject[] };
  verbs: Record<number, ObjectVerbs>;
  images: Record<string, ObjectImage>;
  scripts: Record<number, Uint8Array>;
  code: Partial<Record<RoomCode, Uint8Array>>;
}

type PackedCel = Omit<Cel, 'pixels'> & { pixels: Uint8Array };
type PackedCostume = Omit<Costume, 'limbs'> & { limbs: Record<number, PackedCel>[] };

export interface MonkeyPack {
  edition: typeof MONKEY1_CD;
  variableCount: number;
  bitVariableCount: number;
  objects: GameResources['objects'];
  rooms: Record<number, PackedScene>;
  scripts: Record<number, Uint8Array>;
  costumes: Record<number, PackedCostume>;
  fonts: Record<number, GameFont>;
  sounds: Record<number, SoundCue>;
}

export function packCostume(costume: Costume): PackedCostume {
  const limbs = costume.limbs.map(limb => Object.fromEntries(Object.entries(limb).map(([id, cel]) =>
    [id, { ...cel, pixels: Uint8Array.from(cel.pixels) }])));
  return { ...costume, limbs };
}

function unpackCostume(costume: PackedCostume): Costume {
  const limbs = costume.limbs.map(limb => Object.fromEntries(Object.entries(limb).map(([id, cel]) =>
    [id, { ...cel, pixels: Array.from(cel.pixels) }])));
  return { ...costume, limbs };
}

// The JSON directory describes decoded resources. Byte arrays are ranges in the binary payload.
export function encodeMonkeyPack(pack: MonkeyPack) {
  const chunks: Uint8Array[] = [];
  let payloadSize = 0;
  const json = JSON.stringify(pack, (_key, value) => {
    if (!(value instanceof Uint8Array)) return value;
    const range = { bytes: [payloadSize, value.length] };
    chunks.push(value);
    payloadSize += value.length;
    return range;
  });
  const directory = new TextEncoder().encode(json);
  const bytes = new Uint8Array(headerSize + directory.length + payloadSize);
  bytes.set(magic);
  new DataView(bytes.buffer).setUint32(4, directory.length, true);
  bytes.set(directory, headerSize);
  let offset = headerSize + directory.length;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export function parseMonkeyPack(bytes: Uint8Array): GameResources {
  if (bytes.length < headerSize || !magic.every((byte, index) => bytes[index] === byte)) {
    throw new Error('Invalid WebSCUMM resource pack');
  }
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
  const payloadStart = headerSize + size;
  if (payloadStart > bytes.length || size > 16 * 1024 * 1024) throw new Error('Invalid resource directory size');
  const payload = bytes.subarray(payloadStart);
  const pack: MonkeyPack = JSON.parse(new TextDecoder().decode(bytes.subarray(headerSize, payloadStart)), (_key, value) => {
    if (!value || !Object.hasOwn(value, 'bytes')) return value;
    if (!Array.isArray(value.bytes) || value.bytes.length !== 2) throw new Error('Invalid resource range');
    const [offset, length] = value.bytes;
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) ||
      offset < 0 || length < 0 || offset + length > payload.length) throw new Error('Invalid resource range');
    return payload.subarray(offset, offset + length);
  });
  if (!pack || pack.edition !== MONKEY1_CD || !Array.isArray(pack.objects) ||
    !Number.isSafeInteger(pack.variableCount) || pack.variableCount <= 0 || pack.variableCount > 4096 ||
    !Number.isSafeInteger(pack.bitVariableCount) || pack.bitVariableCount <= 0 || pack.bitVariableCount > 4096 ||
    !pack.rooms?.[10] || !pack.scripts?.[1]?.length || !pack.costumes || !pack.fonts || !pack.sounds) {
    throw new Error('Unsupported Monkey Island resource pack');
  }

  const room = (id: number) => required(pack.rooms[id], `room ${id}`);
  return {
    edition: pack.edition,
    variableCount: pack.variableCount,
    bitVariableCount: pack.bitVariableCount,
    objects: pack.objects,
    scene: id => {
      const source = room(id).scene;
      return { ...source, boxes: source.boxes.map(box => ({ ...box })),
        objects: new Map(source.objects.map(object => [object.id, { ...object }])) };
    },
    script: (id, sceneId) => id < 200 ? required(pack.scripts[id], `SCRP ${id}`) :
      required(room(sceneId).scripts[id], `room ${sceneId} LSCR ${id}`),
    roomCode: (tag, id) => room(id).code[tag],
    costume: id => unpackCostume(required(pack.costumes[id], `COST ${id}`)),
    font: id => required(pack.fonts[id], `CHAR ${id}`),
    image: (id, object, state) => room(id).images[`${object.id}:${state}`],
    objectVerb: (id, object, verb) => getObjectVerb(room(id).verbs[object.id], verb),
    sound: id => pack.sounds[id],
  };
}

function required<T>(item: T | undefined, name: string): T {
  if (item === undefined) throw new Error(`Missing ${name} in the resource pack`);
  return item;
}

export async function loadMonkeyPack(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Resource pack request failed (${response.status})`);
  const blob = await response.blob();
  const signature = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  const buffer = signature[0] === 0x1f && signature[1] === 0x8b
    ? await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    : await blob.arrayBuffer();
  return parseMonkeyPack(new Uint8Array(buffer));
}
