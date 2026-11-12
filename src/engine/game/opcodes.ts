import { directionTo, type Actor } from './game.ts';
import { type ScummVM, type Script, VAR } from './vm.ts';

const unsupported = (type: string, code: number) => { throw new Error(`Unsupported ${type} $${code.toString(16)}`); };

export function executeOpcode(vm: ScummVM, s: Script, opcode: number, offset: number) {
  const g = vm.game;
  const b = (n = 0) => vm.operand(s, opcode, n);
  const w = (n = 0) => vm.operand(s, opcode, n, true);
  const result = (value: () => number) => { const addr = vm.address(s); vm.set(s, addr, value()); };
  const branch = (condition: boolean) => { const rel = s.signed(); if (!condition) s.jump(rel); };
  const arithmetic = (calculate: (a: number, b: number) => number) => {
    const addr = vm.address(s);
    vm.set(s, addr, calculate(vm.get(s, addr), w()));
  };

  switch (opcode) {
    case 0x00: case 0xa0: s.done = true; return;
    case 0x80: s.yielded = true; return;
    case 0x18: s.jump(s.signed()); return;
    case 0x20: g.stopSound(0); return;
    case 0x27: stringOps(vm, s); return;
    case 0x28: branch(vm.get(s) === 0); return;
    case 0xa8: branch(vm.get(s) !== 0); return;
    case 0x2b: s.delay = vm.get(s); s.yielded = true; return;
    case 0x2c: cursorOps(vm, s); return;
    case 0x2e: s.delay = s.word() | s.byte() << 16; s.yielded = true; return;
    case 0x40: g.beginCutscene(s, vm.arguments(s)); return;
    case 0xc0: g.endCutscene(); return;
    case 0x46: case 0xc6: {
      const addr = vm.address(s);
      vm.set(s, addr, vm.get(s, addr) + (opcode === 0x46 ? 1 : -1));
      return;
    }
    case 0x4c: g.soundCommand(vm.arguments(s)); return;
    case 0x58: {
      if (!s.byte()) { g.setOverride(s, undefined); return; }
      if (s.byte() !== 0x18) throw new Error('Expected jump at cutscene override');
      const rel = s.signed();
      g.setOverride(s, s.pc + rel);
      return;
    }
    case 0x98: {
      const mode = s.byte();
      if (mode === 3) { g.stopped = true; s.done = true; return; }
      unsupported('system operation', mode);
      return;
    }
    case 0xa7: return;
    case 0xab: saveVerbs(vm, s); return;
    case 0xac: expression(vm, s); return;
    case 0xae: {
      const mode = s.byte();
      let waiting = false;
      switch (mode & 0x1f) {
        case 1: waiting = !!g.actor(vm.operand(s, mode)).target; break;
        case 2: waiting = !!g.message; break;
        case 3: waiting = Math.floor(g.camera / 8) !== Math.floor(g.cameraTarget / 8); break;
        case 4: waiting = g.sentencePending; break;
        case 5:
          if (!g.scene?.platform) unsupported('wait operation', mode);
          waiting = g.platformMoving;
          break;
        default: unsupported('wait operation', mode);
      }
      if (waiting) { s.pc = offset; s.yielded = true; }
      return;
    }
    case 0xcc: {
      const room = s.byte();
      for (let alias = s.byte(); alias; alias = s.byte()) if (alias & 0x80) g.aliases.set(alias, room);
      return;
    }
    case 0xd8: print(vm, s, vm.variables[VAR.ego]); return;
  }

  switch (opcode & 0x7f) {
    case 0x01: case 0x21: case 0x41: case 0x61: g.putActor(g.actor(b()), w(1), w(2)); return;
    case 0x02: case 0x1c: g.startSound(b()); return;
    case 0x03: result(() => g.actor(b()).room); return;
    case 0x04: case 0x08: case 0x38: case 0x44: case 0x48: case 0x78: {
      const a = vm.get(s), value = w();
      const test = opcode & 0x7f;
      branch(test === 0x04 ? a <= value : test === 0x08 ? a !== value : test === 0x38 ? a >= value :
        test === 0x44 ? a > value : test === 0x48 ? a === value : a < value);
      return;
    }
    case 0x05: {
      const id = w();
      const sub = s.byte();
      let state = 1;
      let position;
      switch (sub & 0x1f) {
        case 1: {
          const x = vm.operand(s, sub, 0, true), y = vm.operand(s, sub, 1, true);
          if (x !== 0xff) position = { x: x * 8, y: y * 8 };
          break;
        }
        case 2: state = vm.operand(s, sub, 0, true); break;
        case 31: break;
        default: unsupported('draw-object operation', sub);
      }
      g.drawRoomObject(id, state, position);
      return;
    }
    case 0x06: result(() => g.actor(b()).elevation); return;
    case 0x07: case 0x47: {
      const id = w(), state = b(1);
      if (g.objects[id]) g.objects[id].state = state;
      return;
    }
    case 0x09: case 0x49: {
      const actor = g.actor(b()), target = g.target(w(1));
      if (target) g.face(actor, directionTo(actor, target));
      return;
    }
    case 0x0a: case 0x2a: case 0x4a: case 0x6a: vm.start(b(), vm.arguments(s), opcode); return;
    case 0x0b: case 0x4b: result(() => Number(!!g.objectVerb(w(), w(1)))); return;
    case 0x0c: resourceOps(vm, s); return;
    case 0x0d: case 0x4d: {
      const actor = g.actor(b()), target = g.actor(b(1)), distance = s.byte();
      g.walk(actor, target.x + (actor.x <= target.x ? -distance : distance), target.y);
      return;
    }
    case 0x0e: case 0x4e: {
      const actor = g.actor(b()), target = g.target(w(1));
      if (target) g.putActor(actor, target.x, target.y);
      return;
    }
    case 0x0f: result(() => g.objects[w()]?.state ?? 0); return;
    case 0x10: result(() => g.objects[w()]?.owner ?? 0); return;
    case 0x11: case 0x51: g.animate(g.actor(b()), b(1)); return;
    case 0x12: g.panCamera(w()); return;
    case 0x13: case 0x53: actorOps(vm, s, g.actor(b())); return;
    case 0x14: print(vm, s, b()); return;
    case 0x15: case 0x55: result(() => g.actorFromPoint(w(), w(1))); return;
    case 0x16: result(() => g.randomNumber(b())); return;
    case 0x17: arithmetic((a, b) => a & b); return;
    case 0x19: case 0x39: case 0x59: case 0x79: {
      const verb = b();
      if (verb === 254) g.stopSentences();
      else g.enqueueSentence(verb, w(1), w(2));
      return;
    }
    case 0x1a: result(() => w()); return;
    case 0x1b: arithmetic((a, b) => a * b); return;
    case 0x1d: branch(g.hasClasses(w(), vm.arguments(s))); return;
    case 0x1e: case 0x3e: case 0x5e: case 0x7e: g.walk(g.actor(b()), w(1), w(2)); return;
    case 0x22: result(() => g.actor(b()).animationCounter); return;
    case 0x23: result(() => Math.trunc(g.target(w())?.y ?? 0)); return;
    case 0x24: case 0x64: {
      const id = w(), room = b(1), x = s.signed(), y = s.signed();
      const actor = g.actor(0);
      g.putInRoom(actor, room);
      const target = g.getScene(g.aliases.get(room) ?? room).objects.get(id);
      if (target) {
        actor.x = target.walkX || target.x;
        actor.y = target.walkY || target.y;
        g.face(actor, target.direction ^ 1);
      }
      g.loadRoom(room);
      g.followCamera(actor.id, true);
      if (x >= 0) g.walk(actor, x, y);
      return;
    }
    case 0x25: case 0x65: {
      const id = w(); b(1);
      const object = g.objects[id];
      if (object) { object.owner = vm.variables[VAR.ego]; object.state = 1; g.changeClass(id, [0xa0]); }
      vm.start(vm.variables[34], [1]);
      return;
    }
    case 0x26: {
      const addr = vm.address(s), count = s.byte();
      for (let i = 0; i < count; i++) vm.set(s, addr + i, opcode & 0x80 ? s.signed() : s.byte());
      return;
    }
    case 0x29: case 0x69: {
      const id = w(), owner = b(1);
      if (g.objects[id]) g.objects[id].owner = owner;
      vm.start(vm.variables[34], [0]);
      return;
    }
    case 0x2d: case 0x6d: g.putInRoom(g.actor(b()), b(1)); return;
    case 0x30: {
      const mode = s.byte(), operation = mode & 0x1f;
      if (operation < 1 || operation > 3) { unsupported('walk-box operation', mode); return; }
      const box = g.scene?.boxes[vm.operand(s, mode) - 1];
      const value = vm.operand(s, mode, 1);
      if (box) {
        if (operation === 1) box.flags = value;
        else box.scale = operation === 2 ? value : (value - 1) | 0x8000;
      }
      return;
    }
    case 0x31: result(() => g.inventory(b()).length); return;
    case 0x32: g.setCamera(w()); return;
    case 0x33: case 0x73: roomOps(vm, s); return;
    case 0x34: case 0x74: result(() => {
      const a = g.target(w()), b = g.target(w(1));
      return a && b ? Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) : 255;
    }); return;
    case 0x35: case 0x75: result(() => g.findObject(b(), b(1))); return;
    case 0x36: case 0x76: {
      const actor = g.actor(b()), id = w(1), target = g.target(id);
      if (target) g.walk(actor, target.x, target.y, g.object(id)?.direction);
      return;
    }
    case 0x37: case 0x77: g.runObject(w(), b(1), vm.arguments(s)); return;
    case 0x3a: arithmetic((a, b) => a - b); return;
    case 0x3b: result(() => g.actor(b()).scaleX); return;
    case 0x3c: g.stopSound(b()); return;
    case 0x3d: case 0x7d: result(() => g.inventory(b())[b(1) - 1] ?? 0); return;
    case 0x3f: case 0x7f: {
      const x = w(), y = w(1), mode = s.byte();
      g.fills.push({ x, y, right: vm.operand(s, mode, 0, true), bottom: vm.operand(s, mode, 1, true), color: vm.operand(s, mode, 2) });
      return;
    }
    case 0x42: s.done = true; vm.start(b(), vm.arguments(s), s.freezeResistant ? 0x20 : 0); return;
    case 0x43: result(() => Math.trunc(g.target(w())?.x ?? 0)); return;
    case 0x52: g.followCamera(b()); return;
    case 0x54: { const object = g.object(w()), name = decode(s.literalText()); if (object) object.name = name; return; }
    case 0x56: result(() => g.actor(b()).target ? 1 : 0); return;
    case 0x57: arithmetic((a, b) => a | b); return;
    case 0x5a: arithmetic((a, b) => a + b); return;
    case 0x5b: arithmetic(divide); return;
    case 0x5d: g.changeClass(w(), vm.arguments(s)); return;
    case 0x60: g.freezeScripts(s, b()); return;
    case 0x62: { const id = b(); if (!id) s.done = true; else vm.stop(id, id >= 200 ? g.physicalRoom : undefined); return; }
    case 0x63: result(() => g.actor(b()).direction); return;
    case 0x67: result(() => g.textWidth(g.charset, g.strings.get(b()) ?? [])); return;
    case 0x68: result(() => Number(vm.running(b()))); return;
    case 0x6b: b(); return;
    case 0x6c: result(() => g.actor(b()).width); return;
    case 0x6e: vm.stop(w(), g.physicalRoom); return;
    case 0x70: { const lights = b(); s.byte(); if (!s.byte()) vm.variables[VAR.lights] = lights; return; }
    case 0x71: result(() => g.actor(b()).costume); return;
    case 0x72: g.loadRoom(b()); return;
    case 0x7a: verbOps(vm, s, b()); return;
    case 0x7b: result(() => g.actor(b()).walkBox); return;
    case 0x7c: result(() => Number(g.soundRunning(b()))); return;
    default: unsupported('opcode', opcode);
  }
}

function divide(a: number, b: number) {
  if (!b) throw new Error('Division by zero');
  return Math.trunc(a / b);
}

function expression(vm: ScummVM, s: Script) {
  const addr = vm.address(s);
  const stack: number[] = [];
  for (let mode = s.byte(); mode !== 255; mode = s.byte()) {
    const operation = mode & 0x1f;
    if (operation === 1) stack.push(vm.operand(s, mode, 0, true));
    else if (operation === 6) {
      const offset = s.pc;
      executeOpcode(vm, s, s.byte(), offset);
      stack.push(vm.variables[VAR.result]);
    } else {
      const b = stack.pop() ?? 0, a = stack.pop() ?? 0;
      if (operation < 2 || operation > 5) unsupported('expression operation', mode);
      stack.push(operation === 2 ? a + b : operation === 3 ? a - b : operation === 4 ? a * b : divide(a, b));
    }
  }
  vm.set(s, addr, stack.pop() ?? 0);
}

function actorOps(vm: ScummVM, s: Script, actor: Actor) {
  const g = vm.game;
  for (let mode = s.byte(); mode !== 255; mode = s.byte()) {
    const b = (n = 0) => vm.operand(s, mode, n);
    switch (mode & 0x1f) {
      case 0: b(); break;
      case 1: g.setCostume(actor, b()); break;
      case 2: actor.speedX = b(); actor.speedY = b(1); break;
      case 3: actor.sound = b(); break;
      case 4: actor.walkChore = b(); break;
      case 5: actor.talkChore = b(); actor.quietChore = b(1); break;
      case 6: actor.standChore = b(); break;
      case 7: b(); b(1); b(2); break;
      case 8: g.resetActor(actor); break;
      case 9: actor.elevation = vm.operand(s, mode, 0, true); break;
      case 10: Object.assign(actor, { initChore: 1, walkChore: 2, standChore: 3, talkChore: 4, quietChore: 5 }); break;
      case 11: actor.palette.set(b(), b(1)); break;
      case 12: actor.color = b(); break;
      case 13: actor.name = decode(s.literalText()); break;
      case 14: actor.initChore = b(); break;
      case 16: actor.width = b(); break;
      case 17: actor.scaleX = b(); actor.scaleY = b(1); break;
      case 18: actor.clip = 0; break;
      case 19: actor.clip = b(); break;
      case 20: case 21: actor.ignoreBoxes = (mode & 0x1f) === 20; actor.clip = 0; break;
      case 22: actor.animationSpeed = b() || 1; break;
      case 23: actor.shadow = b(); break;
      default: unsupported('actor operation', mode);
    }
  }
}

function roomOps(vm: ScummVM, s: Script) {
  const g = vm.game;
  const mode = s.byte();
  const b = (n = 0, flags = mode) => vm.operand(s, flags, n);
  const w = (n = 0) => vm.operand(s, mode, n, true);
  switch (mode & 0x1f) {
    case 1: {
      const min = w(), max = w(1), edge = Math.max(160, (g.scene?.width ?? 320) - 160);
      vm.variables[VAR.cameraMin] = Math.max(160, Math.min(min, edge));
      vm.variables[VAR.cameraMax] = Math.max(160, Math.min(max, edge));
      return;
    }
    case 3: g.screenTop = w(); g.screenBottom = w(1); return;
    case 4: { const rgb = [w(), w(1), w(2)] as [number, number, number]; g.palette[b(0, s.byte())] = rgb; return; }
    case 8: { const intensity = b(), start = b(1), end = b(2); g.intensity([intensity, intensity, intensity], start, end); return; }
    case 10: g.transition = w(); return;
    case 11: { const rgb = [w(), w(1), w(2)]; const range = s.byte(); g.intensity(rgb, b(0, range), b(1, range)); return; }
    case 13: case 14: {
      const id = b(), name = decode(s.literalText());
      if ((mode & 0x1f) === 13) {
        const string = g.strings.get(id);
        if (string) g.savedStrings.set(name, string.slice());
      } else {
        const string = g.savedStrings.get(name);
        if (string) g.strings.set(id, string.slice());
      }
      return;
    }
    case 31:
      if (!g.scene?.platform) unsupported('room operation', mode);
      g.movePlatform(b());
      return;
    default: unsupported('room operation', mode);
  }
}

function resourceOps(vm: ScummVM, s: Script) {
  const mode = s.byte();
  const sub = mode & 0x1f;
  if (sub === 17) return;
  if (sub >= 1 && sub <= 19) {
    vm.operand(s, mode);
    // Archive bytes stay resident. The renderer decodes graphics as they are used.
    return;
  }
  unsupported('resource operation', mode);
}

function cursorOps(vm: ScummVM, s: Script) {
  const g = vm.game, vars = vm.variables;
  const mode = s.byte();
  const b = (n = 0) => vm.operand(s, mode, n);
  switch (mode & 0x1f) {
    case 1: vars[VAR.cursor] = 1; break;
    case 2: vars[VAR.cursor] = 0; break;
    case 3: vars[VAR.userInput] = 1; break;
    case 4: vars[VAR.userInput] = 0; break;
    case 5: vars[VAR.cursor]++; break;
    case 6: vars[VAR.cursor]--; break;
    case 7: vars[VAR.userInput]++; break;
    case 8: vars[VAR.userInput]--; break;
    case 10: { const index = b(); g.cursors.set(index, { ...g.cursors.get(index), letter: b(1) }); break; }
    case 11: { const index = b(); g.cursors.set(index, { ...g.cursors.get(index), x: b(1), y: b(2) }); break; }
    case 12: g.cursorIndex = b(); break;
    case 13: g.charset = b(); break;
    case 14: g.charsetColors.set(g.charset, vm.arguments(s)); break;
    default: unsupported('cursor operation', mode);
  }
}

function stringOps(vm: ScummVM, s: Script) {
  const strings = vm.game.strings;
  const mode = s.byte();
  const b = (n = 0) => vm.operand(s, mode, n);
  switch (mode & 0x1f) {
    case 1: strings.set(b(), s.literalText()); break;
    case 2: strings.set(b(), strings.get(b(1))?.slice() ?? new Uint8Array()); break;
    case 3: { const id = b(), index = b(1), char = b(2); const text = strings.get(id); if (text) text[index] = char; break; }
    case 4: { const addr = vm.address(s); vm.set(s, addr, strings.get(b())?.[b(1)] ?? 0); break; }
    case 5: strings.set(b(), new Uint8Array(b(1))); break;
    default: unsupported('string operation', mode);
  }
}

function verbOps(vm: ScummVM, s: Script, id: number) {
  const g = vm.game;
  let verb = g.verbs.get(id) ?? g.newVerb(id);
  for (let mode = s.byte(); mode !== 255; mode = s.byte()) {
    const b = (n = 0) => vm.operand(s, mode, n);
    const w = (n = 0) => vm.operand(s, mode, n, true);
    switch (mode & 0x1f) {
      case 1: verb.image = { object: w(), room: g.physicalRoom }; break;
      case 2: verb.text = parseText(vm, s, s.literalText()).text; verb.image = undefined; break;
      case 3: verb.color = b(); break;
      case 4: verb.highlight = b(); break;
      case 5: verb.x = w(); verb.y = w(1); break;
      case 6: verb.mode = 1; break;
      case 7: verb.mode = 0; break;
      case 8: g.verbs.delete(id); break;
      case 9: if (!g.verbs.has(id)) { verb = g.newVerb(id); g.verbs.set(id, verb); } break;
      case 16: verb.dim = b(); break;
      case 17: verb.mode = 2; break;
      case 18: verb.key = b(); break;
      case 19: verb.center = true; break;
      case 20: verb.text = parseText(vm, s, g.strings.get(w()) ?? new Uint8Array()).text; verb.image = undefined; break;
      case 22: verb.image = { object: w(), room: b(1) }; break;
      case 23: verb.background = b(); break;
      default: unsupported('verb operation', mode);
    }
  }
}

function saveVerbs(vm: ScummVM, s: Script) {
  const g = vm.game;
  const mode = s.byte();
  const start = vm.operand(s, mode), end = vm.operand(s, mode, 1), id = vm.operand(s, mode, 2);
  const group = g.savedVerbs.get(id) ?? [];
  switch (mode & 0x1f) {
    case 1:
      for (let i = start; i <= end; i++) {
        const verb = g.verbs.get(i);
        if (verb && !group.some(saved => saved.id === i)) { group.push(verb); g.verbs.delete(i); }
      }
      g.savedVerbs.set(id, group);
      return;
    case 2: for (const verb of group) if (verb.id >= start && verb.id <= end) g.verbs.set(verb.id, verb); break;
    case 3: break;
    default: unsupported('save-verb operation', mode);
  }
  g.savedVerbs.set(id, group.filter(verb => verb.id < start || verb.id > end));
}

function print(vm: ScummVM, s: Script, id: number) {
  const style = vm.game.style(id);
  for (let mode = s.byte(); mode !== 255; mode = s.byte()) {
    const w = (n = 0) => vm.operand(s, mode, n, true);
    switch (mode & 0x0f) {
      case 0: style.x = w(); style.y = w(1); style.overhead = false; break;
      case 1: style.color = vm.operand(s, mode); break;
      case 2: style.right = w(); break;
      case 3: w(); w(1); break;
      case 4: style.center = true; break;
      case 6: style.center = false; style.overhead = false; break;
      case 7: style.overhead = true; break;
      case 8: w(); w(1); break;
      case 15: {
        const { text, keep } = parseText(vm, s, s.literalText());
        vm.game.showText(id, text, style, keep);
        return;
      }
      default: unsupported('print operation', mode);
    }
  }
}

function parseText(vm: ScummVM, s: Script, raw: Uint8Array, depth = 0) {
  const text: number[] = [];
  let keep = false;
  if (depth > 8) return { text, keep };
  for (let i = 0; i < raw.length && raw[i]; i++) {
    const char = raw[i];
    if (char !== 255 && char !== 254) { if (char !== 64) text.push(char === 13 ? -1 : char); continue; }
    const control = raw[++i];
    if (control === 1) { text.push(-1); continue; }
    if (control === 2) { keep = true; continue; }
    if (control === 3) { text.push(-2); continue; }
    if (control === 8) continue;
    const arg = raw[++i] | raw[++i] << 8;
    if (control === 4) text.push(...encode(String(vm.get(s, arg))));
    if (control === 5) text.push(...(vm.game.verbs.get(vm.get(s, arg))?.text ?? []));
    if (control === 6) {
      const id = vm.get(s, arg);
      text.push(...encode(vm.game.actors.get(id)?.name ?? vm.game.object(id)?.name ?? ''));
    }
    if (control === 7) {
      const string = vm.game.strings.get(arg);
      if (string) text.push(...parseText(vm, s, string, depth + 1).text);
    }
  }
  return { text, keep };
}

const encode = (text: string) => [...text].map(char => char.charCodeAt(0) & 255);
const decode = (text: Uint8Array) => String.fromCharCode(...text);
