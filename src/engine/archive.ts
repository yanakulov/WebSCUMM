import { Binary, required } from './binary.ts';
import type { Chunk } from './binary.ts';

const resourceTags = { DSCR: 'SCRP', DSOU: 'SOUN', DCOS: 'COST', DCHR: 'CHAR' } as const;
type Directory = keyof typeof resourceTags;
interface ResourceEntry { id: number; room: number; offset: number }

export class GameArchive {
  readonly disk: Binary;
  readonly rooms: { id: number; name: string }[];
  readonly variableCount: number;
  readonly bitVariableCount: number;
  readonly objects: { owner: number; state: number; classes: number }[];
  private readonly roomChunks = new Map<number, Chunk>();
  private readonly directories = new Map<Directory, ResourceEntry[]>();

  constructor(indexFile: Uint8Array, diskFile: Uint8Array) {
    const index = archiveBinary(indexFile, ['RNAM', 'MAXS']);
    this.disk = archiveBinary(diskFile, ['LECF']);
    if (this.disk.ascii(0, 4) !== 'LECF' || !['RNAM', 'MAXS'].includes(index.ascii(0, 4))) {
      throw new Error('Choose the .000 and .001 files from the same SCUMM v5 PC game.');
    }
    const indexChunks = [...index.chunks()];
    const limits = required(indexChunks, 'MAXS');
    if (limits.end - limits.data !== 18) throw new Error('This archive uses a different SCUMM version.');
    this.variableCount = index.u16(limits.data);
    this.bitVariableCount = index.u16(limits.data + 4);
    const objects = required(indexChunks, 'DOBJ');
    const objectCount = index.u16(objects.data);
    if (objects.data + 2 + objectCount * 5 > objects.end) throw new Error('Truncated DOBJ table');
    this.objects = Array.from({ length: objectCount }, (_, id) => {
      const packed = index.u8(objects.data + 2 + id);
      return { owner: packed & 15, state: packed >> 4, classes: index.u32(objects.data + 2 + objectCount + id * 4) };
    });
    const root = this.disk.chunk(0);
    const offsets = required(this.disk.children(root), 'LOFF');
    const count = this.disk.u8(offsets.data);
    if (offsets.data + 1 + count * 5 > offsets.end) throw new Error('Truncated LOFF table');
    const names = new Map<number, string>();
    const nameTable = indexChunks.find(chunk => chunk.tag === 'RNAM');
    if (nameTable) {
      for (let at = nameTable.data; at + 10 <= nameTable.end && index.u8(at); at += 10) {
        const chars = index.bytes.subarray(at + 1, at + 10).map(byte => byte ^ 0xff);
        names.set(index.u8(at), String.fromCharCode(...chars).split('\0')[0]);
      }
    }

    for (let i = 0; i < count; i++) {
      const entry = offsets.data + 1 + 5 * i;
      const id = this.disk.u8(entry);
      const start = this.disk.u32(entry + 1);
      const container = this.disk.chunk(start - 8, root.end);
      if (container.tag !== 'LFLF') throw new Error(`Invalid LFLF for room ${id}`);
      const room = this.disk.chunk(start, container.end);
      if (room.tag !== 'ROOM') throw new Error(`Invalid ROOM for room ${id}`);
      this.roomChunks.set(id, room);
    }
    this.rooms = [...this.roomChunks.keys()].sort((a, b) => a - b)
      .map(id => ({ id, name: names.get(id) || `room-${id}` }));
    if (!this.rooms.length) throw new Error('The SCUMM archive contains no rooms.');

    for (const directory of Object.keys(resourceTags) as Directory[]) {
      const table = required(indexChunks, directory);
      const size = index.u16(table.data);
      if (table.data + 2 + size * 5 > table.end) throw new Error(`Truncated ${directory} table`);
      const entries: ResourceEntry[] = [];
      for (let id = 1; id < size; id++) {
        const room = index.u8(table.data + 2 + id);
        const offset = index.u32(table.data + 2 + size + id * 4);
        if (this.roomChunks.has(room) && offset !== 0xffffffff) entries.push({ id, room, offset });
      }
      this.directories.set(directory, entries);
    }
  }

  room(id: number) {
    const chunk = this.roomChunks.get(id);
    if (!chunk) throw new Error(`Room ${id} is not on this disk`);
    return this.disk.children(chunk);
  }

  resources(directory: Directory) { return this.directories.get(directory) ?? []; }

  script(id: number, room: number) {
    if (id < 200) {
      const { chunk } = this.resource('DSCR', id);
      return this.disk.bytes.subarray(chunk.data, chunk.end);
    }
    const local = this.room(room).find(chunk => chunk.tag === 'LSCR' && this.disk.u8(chunk.data) === id);
    if (!local) throw new Error(`Local script ${id} is missing in room ${room}`);
    return this.disk.bytes.subarray(local.data + 1, local.end);
  }

  resource(directory: Directory, id: number) {
    const entry = this.resources(directory).find(item => item.id === id);
    if (!entry) throw new Error(`${directory} resource ${id} is not on this disk`);
    const room = this.roomChunks.get(entry.room)!;
    const chunk = this.disk.chunk(room.start + entry.offset);
    if (chunk.tag !== resourceTags[directory]) throw new Error(`Invalid ${directory} resource ${id}`);
    return { entry, chunk };
  }
}

function archiveBinary(file: Uint8Array, plainTags: string[]) {
  const signature = String.fromCharCode(...file.subarray(0, 4));
  return new Binary(plainTags.includes(signature) ? file : Uint8Array.from(file, byte => byte ^ 0x69));
}
