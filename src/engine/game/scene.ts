import type { GameArchive } from '../archive.ts';
import type { Chunk } from '../binary.ts';
import { decodeMask, decodeSmap, readRoom } from '../room.ts';

export interface SceneObject {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  walkX: number;
  walkY: number;
  direction: number;
  parent: number;
  parentState: number;
  code?: Chunk;
  image?: Chunk;
}

export function readScene(archive: GameArchive, id: number) {
  const disk = archive.disk;
  const chunks = archive.room(id);
  const objects = new Map<number, SceneObject>();
  const codes = chunks.filter(chunk => chunk.tag === 'OBCD');
  const transparent = chunks.find(chunk => chunk.tag === 'TRNS');
  for (const chunk of codes) {
    const children = disk.children(chunk);
    const header = children.find(child => child.tag === 'CDHD');
    if (!header || header.end - header.data < 13) continue;
    const name = children.find(child => child.tag === 'OBNA');
    const p = header.data;
    const id = disk.u16(p);
    const parent = disk.u8(p + 7);
    const flags = disk.u8(p + 6);
    objects.set(id, {
      id, name: name ? disk.ascii(name.data, name.end - name.data).split('\0')[0] : '',
      x: disk.u8(p + 2) * 8, y: disk.u8(p + 3) * 8, width: disk.u8(p + 4) * 8, height: disk.u8(p + 5) * 8,
      walkX: disk.i16(p + 8), walkY: disk.i16(p + 10), direction: disk.u8(p + 12) & 3,
      parent, parentState: flags === 0x80 ? 1 : flags & 15, code: chunk,
    });
  }
  for (const chunk of chunks.filter(item => item.tag === 'OBIM')) {
    const header = disk.children(chunk).find(child => child.tag === 'IMHD');
    if (!header || header.end - header.data < 16) continue;
    const p = header.data;
    const id = disk.u16(p);
    const object = objects.get(id);
    if (object) object.image = chunk;
    else objects.set(id, {
      id, name: '', x: disk.u16(p + 8), y: disk.u16(p + 10), width: disk.u16(p + 12), height: disk.u16(p + 14),
      walkX: 0, walkY: 0, direction: 0, parent: 0, parentState: 0, image: chunk,
    });
  }
  const matrix = chunks.find(chunk => chunk.tag === 'BOXM');
  const scaleTable = chunks.find(chunk => chunk.tag === 'SCAL');
  const scales: { start: number; y1: number; end: number; y2: number }[] = [];
  for (let at = scaleTable?.data ?? 0; scaleTable && at + 8 <= scaleTable.end; at += 8) {
    scales.push({ start: disk.u16(at), y1: disk.i16(at + 2), end: disk.u16(at + 4), y2: disk.i16(at + 6) });
  }
  return { ...readRoom(archive, id), objects, order: [...objects.keys()], scales,
    matrix: matrix ? disk.bytes.subarray(matrix.data, matrix.end) : undefined,
    transparent: transparent ? disk.u8(transparent.data) : 255 };
}

export function readObjectImage(archive: GameArchive, object: SceneObject, state: number, transparent: number) {
  if (!object.image || !object.width || !object.height) return undefined;
  const disk = archive.disk;
  const frame = disk.children(object.image).find(chunk => chunk.tag === `IM${state.toString(16).padStart(2, '0').toUpperCase()}`);
  if (!frame) return undefined;
  const chunks = disk.children(frame);
  const smap = chunks.find(chunk => chunk.tag === 'SMAP');
  if (!smap) return undefined;
  const opacity = new Uint8Array(object.width * object.height);
  const pixels = decodeSmap(disk, smap, object.width, object.height, transparent, opacity);
  const masks = chunks.filter(chunk => /^ZP\d\d$/.test(chunk.tag))
    .map(chunk => ({ tag: chunk.tag, pixels: decodeMask(disk, chunk, object.width, object.height) }));
  return { pixels, opacity, masks, width: object.width, height: object.height };
}

export function objectVerb(archive: GameArchive, object: SceneObject | undefined, verb: number) {
  if (!object?.code) return undefined;
  const disk = archive.disk;
  const table = disk.children(object.code).find(chunk => chunk.tag === 'VERB');
  if (!table) return undefined;
  let fallback: number | undefined;
  for (let at = table.data; at + 2 < table.end && disk.u8(at); at += 3) {
    const id = disk.u8(at);
    const start = table.start + disk.u16(at + 1);
    if (start < table.data || start >= table.end) throw new Error(`Invalid object ${object.id} verb offset`);
    if (id === verb) return disk.bytes.subarray(start, table.end);
    if (id === 0xff) fallback = start;
  }
  return fallback === undefined ? undefined : disk.bytes.subarray(fallback, table.end);
}
