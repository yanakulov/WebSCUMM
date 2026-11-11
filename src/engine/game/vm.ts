import type { ScummGame } from './game.ts';
import { executeOpcode } from './opcodes.ts';

export const VAR = {
  result: 0, ego: 1, cameraX: 2, message: 3, room: 4, override: 5, machineSpeed: 6, lights: 9,
  timer1: 11, timer2: 12, timer3: 13, music: 14, cameraMin: 17, cameraMax: 18, nextFrame: 19,
  virtualX: 20, virtualY: 21, roomResource: 22, lastSound: 23, cutsceneKey: 24, talkActor: 25,
  entry: 28, entry2: 29, exit: 30, exit2: 31, input: 32, sentence: 33, cutsceneStart: 35,
  cutsceneEnd: 36, charIncrement: 37, debug: 39, mouseX: 44, mouseY: 45, timer: 46, total: 47,
  soundCard: 48, videoMode: 49, cursor: 52, userInput: 53, talkY: 54, inputMode: 67,
} as const;

export class Script {
  readonly id: number;
  readonly code: Uint8Array;
  readonly room: number | undefined;
  readonly name: string;
  readonly freezeResistant: boolean;
  readonly locals = new Int16Array(26);
  pc = 0;
  delay = 0;
  yielded = false;
  done = false;
  frozen = 0;

  constructor(id: number, code: Uint8Array, room: number | undefined, name: string, freezeResistant: boolean, args: number[]) {
    this.id = id;
    this.code = code;
    this.room = room;
    this.name = name;
    this.freezeResistant = freezeResistant;
    this.locals.set(args.slice(0, this.locals.length));
  }

  byte() {
    if (this.pc >= this.code.length) throw new Error('Script read past the end');
    return this.code[this.pc++];
  }

  word() { return this.byte() | (this.byte() << 8); }
  signed() { return this.word() << 16 >> 16; }
  literalText() {
    const bytes: number[] = [];
    let byte: number;
    while ((byte = this.byte()) !== 0) {
      bytes.push(byte);
      if (byte === 0xff || byte === 0xfe) {
        const control = this.byte();
        bytes.push(control);
        if (control >= 4 && control !== 8) bytes.push(this.byte(), this.byte());
      }
    }
    return Uint8Array.from(bytes);
  }

  jump(displacement: number) {
    const target = this.pc + displacement;
    if (target < 0 || target >= this.code.length) throw new Error('Invalid script jump');
    this.pc = target;
  }
}

export class ScummVM {
  readonly game: ScummGame;
  readonly variables: Int16Array;
  readonly bits: Uint8Array;
  private scripts: Script[] = [];
  private depth = 0;

  constructor(game: ScummGame) {
    this.game = game;
    this.variables = new Int16Array(game.archive.variableCount);
    this.bits = new Uint8Array(game.archive.bitVariableCount);
  }

  start(id: number, args: number[] = [], flags = 0) {
    if (!id) return;
    const room = id >= 200 ? this.game.physicalRoom : undefined;
    if (!(flags & 0x40)) this.stop(id, room);
    const code = this.game.archive.script(id, room ?? 0);
    this.launch(new Script(id, code, room, room === undefined ? `SCRP ${id}` : `ROOM ${room} LSCR ${id}`, !!(flags & 0x20), args));
  }

  runRoomCode(tag: 'ENCD' | 'EXCD', room: number) {
    if (!room) return;
    const code = this.game.archive.room(room).find(chunk => chunk.tag === tag);
    if (code && code.data < code.end) this.launch(new Script(0, this.game.archive.disk.bytes.subarray(code.data, code.end), room, `ROOM ${room} ${tag}`, false, []));
  }

  runObject(id: number, code: Uint8Array, room: number, args: number[]) {
    this.launch(new Script(id, code, room, `ROOM ${room} VERB ${id}`, false, args));
  }

  private launch(script: Script) {
    this.scripts = this.scripts.filter(slot => !slot.done);
    if (this.scripts.length >= 256) throw new Error('Too many running SCUMM scripts');
    this.scripts.push(script);
    this.run(script);
  }

  frame(delta: number) {
    for (const script of [...this.scripts]) {
      if (script.done || script.frozen) continue;
      script.delay -= delta;
      if (script.delay <= 0) this.run(script);
    }
    this.scripts = this.scripts.filter(script => !script.done);
  }

  private run(script: Script) {
    if (++this.depth > 32) throw new Error('SCUMM script nesting limit exceeded');
    script.yielded = false;
    let remaining = 24_000;
    try {
      while (!script.done && !script.yielded) {
        const offset = script.pc;
        const opcode = script.byte();
        try {
          if (--remaining < 0) throw new Error('Script ran without yielding');
          executeOpcode(this, script, opcode, offset);
        } catch (error) {
          if (error instanceof ScriptError) throw error;
          throw new ScriptError(`${script.name} +${hex(offset, 4)} ($${hex(opcode, 2)}): ${error instanceof Error ? error.message : error}`);
        }
      }
    } finally { this.depth--; }
  }

  stop(id: number, room?: number) {
    for (const script of this.scripts) if (script.id === id && script.room === room) script.done = true;
  }

  leaveRoom(room: number) {
    for (const script of this.scripts) if (script.room === room) script.done = true;
  }

  running(id: number, includeFrozen = true) {
    return this.scripts.some(script => script.id === id && !script.done && (includeFrozen || !script.frozen));
  }

  freeze(source: Script, value: number, cutscene?: Script) {
    for (const script of this.scripts) {
      if (!value) script.frozen = Math.max(0, script.frozen - 1);
      else if (!script.done && script !== source && script !== cutscene && (!script.freezeResistant || value >= 0x80)) script.frozen++;
    }
  }

  address(script: Script): number {
    const address = script.word();
    if (!(address & 0x2000)) return address;
    const index = script.word();
    return (address & ~0x2000) + (index & 0x2000 ? this.get(script, index & ~0x2000) : index & 0xfff);
  }

  private variable(script: Script, address: number) {
    const bank = address & 0xf000;
    const values = bank === 0x8000 ? this.bits : bank === 0x4000 ? script.locals : this.variables;
    const index = address & 0xfff;
    if (![0, 0x4000, 0x8000].includes(bank) || index >= values.length) throw new Error(`Invalid variable $${hex(address, 4)}`);
    return { values, index };
  }

  get(script: Script, address = this.address(script)): number {
    const { values, index } = this.variable(script, address);
    return values[index];
  }

  set(script: Script, address: number, value: number) {
    const { values, index } = this.variable(script, address);
    values[index] = values === this.bits ? Number(!!value) : value;
  }

  operand(script: Script, flags: number, param = 0, word = false) {
    if (flags & (0x80 >> param)) return this.get(script);
    return word ? script.signed() : script.byte();
  }

  arguments(script: Script) {
    const args: number[] = [];
    for (let mode = script.byte(); mode !== 0xff; mode = script.byte()) args.push(this.operand(script, mode, 0, true));
    return args;
  }
}

class ScriptError extends Error {}
const hex = (number: number, width: number) => number.toString(16).toUpperCase().padStart(width, '0');
