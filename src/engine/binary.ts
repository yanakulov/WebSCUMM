export interface Chunk {
  tag: string;
  start: number;
  data: number;
  end: number;
}

export class Binary {
  private readonly view: DataView;
  readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  u8(at: number) { return this.view.getUint8(at); }
  u16(at: number) { return this.view.getUint16(at, true); }
  i16(at: number) { return this.view.getInt16(at, true); }
  u32(at: number) { return this.view.getUint32(at, true); }
  ascii(at: number, length: number) {
    return String.fromCharCode(...this.bytes.subarray(at, at + length));
  }

  chunk(start: number, limit = this.bytes.length): Chunk {
    if (start < 0 || start + 8 > limit) throw new Error(`Truncated SCUMM header at ${start}`);
    const end = start + this.view.getUint32(start + 4);
    const tag = this.ascii(start, 4);
    if (end < start + 8 || end > limit) throw new Error(`Invalid ${tag} chunk at ${start}`);
    return { tag, start, data: start + 8, end };
  }

  *chunks(start = 0, end = this.bytes.length) {
    while (start < end) {
      const chunk = this.chunk(start, end);
      yield chunk;
      start = chunk.end;
    }
  }

  children(parent: Chunk) { return [...this.chunks(parent.data, parent.end)]; }
}

export function required(chunks: Chunk[], tag: string) {
  const chunk = chunks.find(item => item.tag === tag);
  if (!chunk) throw new Error(`Missing ${tag} resource`);
  return chunk;
}
