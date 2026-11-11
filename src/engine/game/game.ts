import type { GameArchive } from '../archive.ts';
import { readCostume, type Costume, type Track } from '../costume.ts';
import type { RGB } from '../palette.ts';
import { readGameFont, measureText } from './font.ts';
import { objectVerb, readObjectImage, readScene, type SceneObject } from './scene.ts';
import { ScummVM, VAR, type Script } from './vm.ts';
import { locateBox, walkPath, type Point } from './walk.ts';

interface ActiveLimb { track: Track; tick: number; hidden: boolean }
export interface Actor {
  id: number; room: number; x: number; y: number; direction: number; costume: number;
  speedX: number; speedY: number; scaleX: number; scaleY: number; elevation: number;
  walkChore: number; standChore: number; initChore: number; talkChore: number; quietChore: number;
  clip: number; ignoreBoxes: boolean; name: string; color: number; animationSpeed: number;
  chore: number; limbs: (ActiveLimb | undefined)[]; palette: Map<number, number>; animationClock: number;
  width: number; sound: number; shadow: number;
  target?: Point; targetDirection?: number; path: Point[]; walkBox: number;
}

export interface Verb {
  id: number; x: number; y: number; color: number; highlight: number; dim: number; background: number;
  charset: number; text: number[]; mode: number; key: number; center: boolean;
  image?: { room: number; object: number };
}

export interface MessageStyle { x: number; y: number; color: number; right: number; center: boolean; overhead: boolean }
export interface Message { pages: number[][]; style: MessageStyle; charset: number; actor: number; ticks: number; keep: boolean }
type Scene = ReturnType<typeof readScene>;

function createActor(id: number): Actor {
  return {
    id, room: 0, x: 0, y: 0, direction: 2, costume: 0, speedX: 8, speedY: 2, scaleX: 255, scaleY: 255,
    elevation: 0, walkChore: 2, standChore: 3, initChore: 1, talkChore: 4, quietChore: 5, clip: 0,
    ignoreBoxes: false, name: '', color: 15, animationSpeed: 1, chore: 3, animationClock: 0,
    limbs: Array(16).fill(undefined), palette: new Map(), width: 24, sound: 0, shadow: 0, path: [], walkBox: 0,
  };
}

export class ScummGame {
  readonly archive: GameArchive;
  readonly vm: ScummVM;
  readonly actors = new Map<number, Actor>();
  readonly verbs = new Map<number, Verb>();
  readonly strings = new Map<number, Uint8Array>();
  readonly savedStrings = new Map<string, Uint8Array>();
  readonly aliases = new Map<number, number>();
  readonly objects: GameArchive['objects'];
  readonly positions = new Map<number, Point>();
  readonly savedVerbs = new Map<number, Verb[]>();
  readonly fills: { x: number; y: number; right: number; bottom: number; color: number }[] = [];
  readonly messageStyles = new Map<number, MessageStyle>();
  private readonly scenes = new Map<number, Scene>();
  private readonly costumes = new Map<number, Costume>();
  private readonly fonts = new Map<number, ReturnType<typeof readGameFont>>();
  private readonly objectImages = new Map<string, ReturnType<typeof readObjectImage>>();
  private readonly cutscenes: { script: Script; argument: number; override?: number }[] = [];
  private readonly clicks: { x: number; y: number; button: number; verb?: number }[] = [];
  private readonly sentences: { args: number[]; frozen: number }[] = [];
  cutsceneStarting?: Script;
  private music?: { id: number; elapsed: number; duration: number };
  private readonly soundEffects = new Map<number, number>();
  private time = 0;
  private readonly random: () => number;
  room = 0;
  physicalRoom = 0;
  scene?: Scene;
  palette: RGB[] = Array.from({ length: 256 }, () => [0, 0, 0]);
  camera = 160;
  cameraTarget = 160;
  followedActor?: number;
  screenTop = 0;
  screenBottom = 200;
  charset = 1;
  transition = 0;
  message?: Message;
  caption?: Message;
  cursorIndex = 0;
  hoverVerb = 0;
  pointerVisible = false;
  readonly cursors = new Map<number, { letter?: number; x?: number; y?: number }>();
  readonly charsetColors = new Map<number, number[]>();
  error = '';
  stopped = false;

  constructor(archive: GameArchive, random = Math.random) {
    this.archive = archive;
    this.random = random;
    this.objects = archive.objects.map(object => ({ ...object }));
    this.vm = new ScummVM(this);
  }

  boot() {
    const variables = this.vm.variables;
    variables[VAR.nextFrame] = 6;
    variables[VAR.videoMode] = 19;
    variables[VAR.lights] = 11;
    variables[VAR.soundCard] = 3;
    variables[VAR.inputMode] = 3;
    variables[VAR.talkY] = -80;
    // The DOS CD interpreter supplies the track-B sector count to the boot script.
    if (this.archive.rooms.some(room => room.id === 38 && room.name === 'lookout') &&
      this.archive.rooms.some(room => room.id === 33 && room.name === 'dock')) variables[74] = 1225;
    this.protect(() => this.vm.start(1, [0]));
  }

  private protect(action: () => void) {
    if (this.error || this.stopped) return;
    try { action(); }
    catch (error) { this.error = error instanceof Error ? error.message : String(error); }
  }

  advance(seconds: number) {
    this.protect(() => {
      this.time += Math.min(seconds, 0.25) * 60;
      for (let delta = this.frameInterval; this.time >= delta && !this.stopped; delta = this.frameInterval) {
        this.time -= delta;
        this.step(delta);
      }
    });
  }

  private get frameInterval() { return Math.max(1, this.vm.variables[VAR.nextFrame] || 1); }

  private step(delta: number) {
    const vars = this.vm.variables;
    const click = this.clicks.shift();
    if (click) this.point(click.x, click.y);
    for (const timer of [VAR.timer1, VAR.timer2, VAR.timer3, VAR.total]) vars[timer] += delta;
    vars[VAR.timer] = delta;
    if (this.music) {
      this.music.elapsed += delta;
      vars[VAR.music] = this.music.elapsed;
    }
    for (const [id, ticks] of this.soundEffects) {
      if (ticks <= delta) this.soundEffects.delete(id);
      else this.soundEffects.set(id, ticks - delta);
    }
    if (this.message) {
      this.message.ticks -= delta;
      if (this.message.ticks <= 0) this.nextMessage();
    }
    for (const actor of this.actors.values()) {
      if (this.room && actor.room === this.room) this.stepActor(actor);
    }
    if (this.followedActor !== undefined) this.cameraTarget = this.clampCamera(this.actor(this.followedActor).x);
    this.camera += Math.sign(this.cameraTarget - this.camera) * Math.min(8, Math.abs(this.cameraTarget - this.camera));
    vars[VAR.cameraX] = Math.trunc(this.camera);
    vars[VAR.virtualX] = vars[VAR.mouseX] + this.viewX;
    this.vm.frame(delta);
    if (click && vars[VAR.userInput] > 0) {
      const zone = click.verb ? 1 : click.y < this.screenBottom ? 2 : 0;
      if (zone) this.vm.start(vars[VAR.input], [zone, click.verb ?? 0, click.button]);
    }
    const sentence = this.sentences.at(-1);
    if (sentence && !sentence.frozen && !this.vm.running(vars[VAR.sentence], false)) {
      this.sentences.pop();
      this.vm.start(vars[VAR.sentence], sentence.args);
    }
  }

  get viewX() { return Math.max(0, Math.floor((this.camera - 160) / 8) * 8); }

  getScene(room: number) {
    let scene = this.scenes.get(room);
    if (!scene) { scene = readScene(this.archive, room); this.scenes.set(room, scene); }
    return scene;
  }

  getCostume(id: number) {
    let costume = this.costumes.get(id);
    if (!costume) { costume = readCostume(this.archive, id); this.costumes.set(id, costume); }
    return costume;
  }

  getFont(id: number) {
    let font = this.fonts.get(id);
    if (!font) { font = readGameFont(this.archive, id); this.fonts.set(id, font); }
    return font;
  }

  textWidth(charset: number, text: ArrayLike<number>) { return measureText(this.getFont(charset), text); }

  intensity(rgb: number[], start: number, end: number) {
    for (let i = start; i <= end && i < 256; i++) {
      const base = this.scene?.palette[i] ?? this.palette[i];
      this.palette[i] = base.map((channel, n) => Math.max(0, Math.min(255, Math.floor(channel * rgb[n] / 255)))) as RGB;
    }
  }

  getObjectImage(room: number, id: number, state: number) {
    const key = `${room}:${id}:${state}`;
    if (!this.objectImages.has(key)) {
      const scene = this.getScene(room);
      const object = scene.objects.get(id);
      this.objectImages.set(key, object && readObjectImage(this.archive, object, state, scene.transparent));
    }
    return this.objectImages.get(key);
  }

  loadRoom(id: number) {
    if (id === this.room) return;
    const vars = this.vm.variables;
    const physical = this.aliases.get(id) ?? id;
    const scene = physical ? this.getScene(physical) : undefined;
    if (this.room) {
      this.vm.start(vars[VAR.exit]);
      this.vm.runRoomCode('EXCD', this.physicalRoom);
      this.vm.start(vars[VAR.exit2]);
      this.vm.leaveRoom(this.physicalRoom);
    }
    this.room = vars[VAR.room] = id;
    this.physicalRoom = vars[VAR.roomResource] = physical;
    this.scene = scene;
    this.positions.clear();
    this.fills.length = 0;
    this.caption = undefined;
    this.clearMessage();
    this.followedActor = undefined;
    vars[VAR.cameraMin] = 160;
    vars[VAR.cameraMax] = Math.max(160, (scene?.width ?? 320) - 160);
    this.setCamera(160);
    if (!scene) return;
    this.palette = scene.palette.map(color => [...color]);
    for (const actor of this.actors.values()) if (actor.room === id) this.updateWalkBox(actor);
    this.vm.start(vars[VAR.entry]);
    this.vm.runRoomCode('ENCD', physical);
    this.vm.start(vars[VAR.entry2]);
  }

  clampCamera(x: number) { return Math.max(this.vm.variables[VAR.cameraMin], Math.min(this.vm.variables[VAR.cameraMax], x)); }

  setCamera(x: number) {
    this.followedActor = undefined;
    this.camera = this.cameraTarget = this.vm.variables[VAR.cameraX] = this.clampCamera(x);
  }

  followCamera(id: number) {
    const actor = this.actor(id);
    if (actor.room !== this.room) this.loadRoom(actor.room);
    this.setCamera(actor.x);
    this.followedActor = actor.id;
  }

  actor(id: number) {
    const actual = id || this.vm.variables[VAR.ego];
    let actor = this.actors.get(actual);
    if (!actor) { actor = createActor(actual); this.actors.set(actual, actor); }
    return actor;
  }

  resetActor(actor: Actor) {
    const { id, room, x, y, direction } = actor;
    Object.assign(actor, createActor(id), { room, x, y, direction, target: undefined, targetDirection: undefined });
  }

  putActor(actor: Actor, x: number, y: number) {
    actor.x = x;
    actor.y = y;
    this.updateWalkBox(actor, true);
    actor.target = undefined;
  }

  putInRoom(actor: Actor, room: number) {
    const previousRoom = actor.room;
    actor.room = room;
    actor.target = undefined;
    if (room && previousRoom !== room) this.chore(actor, actor.initChore);
  }

  updateWalkBox(actor: Actor, snap = false) {
    if (actor.ignoreBoxes || actor.room !== this.room || !this.scene) return;
    const { point, box } = locateBox(this.scene.boxes, actor);
    if (snap) { actor.x = point.x; actor.y = point.y; }
    actor.walkBox = box;
    const scale = this.scene.boxes[box - 1]?.scale;
    if (scale === undefined) return;
    const slot = scale & 0x8000 ? this.scene.scales[scale & 0x7fff] : undefined;
    const value = slot && slot.y1 !== slot.y2 ? slot.start + (actor.y - slot.y1) * (slot.end - slot.start) / (slot.y2 - slot.y1) :
      slot?.start || (scale & 255);
    actor.scaleX = actor.scaleY = Math.max(1, Math.min(255, Math.trunc(value)));
  }

  setCostume(actor: Actor, id: number) {
    actor.costume = id;
    actor.limbs.fill(undefined);
    this.chore(actor, actor.initChore);
  }

  chore(actor: Actor, id: number) {
    actor.chore = id;
    if (!actor.costume) return;
    const costume = this.getCostume(actor.costume);
    const animation = costume.chores[id * 4 + actor.direction];
    if (!animation) return;
    for (const [limb, track] of animation.tracks.entries()) {
      if (!track) continue;
      const existing = actor.limbs[limb];
      if (track.disabled) actor.limbs[limb] = undefined;
      else if (existing && track.cels[0] === -0x79) existing.hidden = true;
      else if (existing && track.cels[0] === -0x7a) existing.hidden = false;
      else actor.limbs[limb] = { track, tick: 0, hidden: false };
    }
  }

  animate(actor: Actor, code: number) {
    if (code >= 244 && code <= 251) this.face(actor, code & 3);
    else if (code >= 252) {
      actor.target = undefined;
      this.chore(actor, actor.standChore);
    } else this.chore(actor, code);
  }

  face(actor: Actor, direction: number) {
    if (actor.direction === direction) return;
    actor.direction = direction;
    this.chore(actor, actor.chore);
  }

  walk(actor: Actor, x: number, y: number, direction?: number) {
    const boxes = actor.ignoreBoxes ? [] : this.scene?.boxes ?? [];
    actor.path = walkPath(boxes, this.scene?.matrix, actor, { x, y });
    actor.targetDirection = direction;
    this.nextWalkPoint(actor);
    if (actor.target) this.chore(actor, actor.walkChore);
  }

  private nextWalkPoint(actor: Actor) {
    do { actor.target = actor.path.shift(); } while (actor.target && Math.abs(actor.target.x - actor.x) + Math.abs(actor.target.y - actor.y) < 1e-6);
    if (actor.target) this.face(actor, directionTo(actor, actor.target));
    else {
      if (actor.targetDirection !== undefined) this.face(actor, actor.targetDirection);
      this.chore(actor, actor.standChore);
    }
  }

  private stepActor(actor: Actor) {
    if (actor.target) {
      const dx = actor.target.x - actor.x, dy = actor.target.y - actor.y;
      const scale = actor.scaleX / 255;
      const steps = Math.max(1, Math.abs(dx) / Math.max(0.1, actor.speedX * scale), Math.abs(dy) / Math.max(0.1, actor.speedY * scale));
      actor.x += dx / steps;
      actor.y += dy / steps;
      this.updateWalkBox(actor);
      if (steps === 1) this.nextWalkPoint(actor);
    }
    if (++actor.animationClock >= actor.animationSpeed) {
      actor.animationClock = 0;
      for (const limb of actor.limbs) if (limb) limb.tick++;
    }
  }

  object(id: number) { return this.scene?.objects.get(id); }

  drawRoomObject(id: number, state: number, position?: Point) {
    const objects = this.scene?.objects;
    const object = objects?.get(id);
    if (!objects || !object || !this.objects[id]) return;
    if (position) this.positions.set(id, position);
    const { x, y } = this.positions.get(id) ?? object;
    for (const other of objects.values()) {
      if (other.width !== object.width || other.height !== object.height) continue;
      const origin = this.positions.get(other.id) ?? other;
      if (origin.x === x && origin.y === y && this.objects[other.id]) this.objects[other.id].state = 0;
    }
    this.objects[id].state = state;
  }

  inventory(actor: number) {
    return this.objects.flatMap((object, id) => id && object.owner === actor ? [id] : []);
  }

  target(id: number) {
    if (this.actors.has(id)) return this.actor(id);
    const object = this.object(id);
    if (!object) return;
    const origin = this.positions.get(id) ?? object;
    return { x: (object.walkX || object.x) + origin.x - object.x, y: (object.walkY || object.y) + origin.y - object.y };
  }

  runObject(id: number, verb: number, args: number[]) {
    const script = objectVerb(this.archive, this.object(id), verb);
    if (script) this.vm.runObject(id, script, this.physicalRoom, args);
  }

  findObject(x: number, y: number) {
    if (!this.scene) return 0;
    for (const id of this.scene.order) {
      const object = this.object(id)!;
      if (this.objects[id]?.classes & 0x80000000) continue;
      const origin = this.positions.get(id) ?? object;
      if (x >= origin.x && y >= origin.y && x < origin.x + object.width && y < origin.y + object.height) return id;
    }
    return 0;
  }

  objectVisible(object: SceneObject) {
    if (!this.objects[object.id]?.state) return false;
    const parent = object.parent && this.scene?.order[object.parent - 1];
    return !parent || this.objects[parent]?.state === object.parentState;
  }

  actorFromPoint(x: number, y: number) {
    return [...this.actors.values()].find(actor => actor.room === this.room && actor.costume &&
      Math.abs(actor.x - x) < 12 && y <= actor.y && y > actor.y - 45)?.id ?? 0;
  }

  newVerb(id: number): Verb {
    return { id, x: 0, y: 0, color: 2, highlight: 0, dim: 8, background: 0, charset: this.charset, text: [], mode: 0, key: 0, center: false };
  }

  enqueueSentence(verb: number, first: number, second: number) {
    if (first !== second) this.sentences.push({ args: [verb, first, second], frozen: 0 });
  }

  stopSentences() {
    this.sentences.length = 0;
    this.vm.stop(this.vm.variables[VAR.sentence]);
  }

  get sentencePending() { return this.sentences.some(sentence => !sentence.frozen) || this.vm.running(this.vm.variables[VAR.sentence], false); }

  freezeScripts(source: Script, value: number) {
    this.vm.freeze(source, value, this.cutsceneStarting);
    for (const sentence of this.sentences) sentence.frozen = value ? sentence.frozen + 1 : Math.max(0, sentence.frozen - 1);
  }

  changeClass(id: number, types: number[]) {
    const object = this.objects[id];
    if (!object) return;
    for (const type of types) {
      if (!type) { object.classes = 0; continue; }
      const bit = 1 << ((type & 0x7f) - 1);
      object.classes = type & 0x80 ? object.classes | bit : object.classes & ~bit;
    }
  }

  hasClasses(id: number, types: number[]) {
    const classes = this.objects[id]?.classes ?? 0;
    return types.every(type => !!(classes & (1 << ((type & 0x7f) - 1))) === !!(type & 0x80));
  }

  randomNumber(limit: number) { return Math.floor(this.random() * (limit + 1)); }

  startSound(id: number) {
    this.vm.variables[VAR.lastSound] = id;
    const entry = this.archive.resources('DSOU').find(sound => sound.id === id);
    if (!entry) return;
    const { chunk } = this.archive.resource('DSOU', id);
    const disk = this.archive.disk;
    if (chunk.end - chunk.data === 24 && disk.u8(chunk.data + 7) === 2) {
      const cdFrame = (at: number) => (disk.u8(at) * 60 + disk.u8(at + 1)) * 75 + disk.u8(at + 2);
      const loops = disk.u8(chunk.data + 17);
      const frames = cdFrame(chunk.data + 21) - cdFrame(chunk.data + 18);
      // Without audio files, the actual duration of a whole-track one-shot is unavailable.
      const duration = loops === 255 ? Infinity : frames > 0 ? frames * Math.max(1, loops) * 60 / 75 : 180;
      this.music = { id, elapsed: 0, duration };
      this.vm.variables[VAR.music] = 0;
    } else this.soundEffects.set(id, 12);
  }

  stopSound(id: number) {
    if (!id || this.music?.id === id) {
      this.music = undefined;
      this.vm.variables[VAR.music] = 0;
    }
    if (!id) this.soundEffects.clear();
    else this.soundEffects.delete(id);
  }

  soundRunning(id: number) {
    return (this.music?.id === id && this.music.elapsed < this.music.duration) || this.soundEffects.has(id);
  }

  beginCutscene(script: Script, args: number[]) {
    this.cutscenes.push({ script, argument: args[0] ?? 0 });
    this.vm.variables[VAR.override] = 0;
    this.cutsceneStarting = script;
    try { this.vm.start(this.vm.variables[VAR.cutsceneStart], args); }
    finally { this.cutsceneStarting = undefined; }
  }

  setOverride(script: Script, target: number | undefined) {
    const active = this.cutscenes.at(-1);
    if (active) { active.script = script; active.override = target; }
  }

  endCutscene() {
    const cutscene = this.cutscenes.pop();
    this.vm.variables[VAR.override] = 0;
    this.vm.start(this.vm.variables[VAR.cutsceneEnd], [cutscene?.argument ?? 0]);
  }

  skipCutscene() {
    const cutscene = this.cutscenes.at(-1);
    if (cutscene?.override === undefined || cutscene.script.done) return false;
    cutscene.script.pc = cutscene.override;
    cutscene.script.delay = 0;
    cutscene.script.frozen = 0;
    this.vm.variables[VAR.override] = 1;
    this.clearMessage();
    return true;
  }

  point(x: number, y: number) {
    const vars = this.vm.variables;
    vars[VAR.mouseX] = x;
    vars[VAR.mouseY] = y;
    vars[VAR.virtualX] = x + this.viewX;
    vars[VAR.virtualY] = y - this.screenTop;
  }

  click(x: number, y: number, button: number, verbId?: number) {
    if (!this.error && !this.stopped && this.vm.variables[VAR.userInput] > 0) this.clicks.push({ x, y, button, verb: verbId });
  }

  key(key: number) {
    this.protect(() => {
      if (key === this.vm.variables[VAR.cutsceneKey] && this.skipCutscene()) return;
      if (key === this.vm.variables[57] && this.message) { this.nextMessage(); return; }
      if (this.vm.variables[VAR.userInput] > 0) this.vm.start(this.vm.variables[VAR.input], [4, key, 1]);
    });
  }

  style(id: number): MessageStyle {
    let style = this.messageStyles.get(id);
    if (!style) {
      style = { x: 160, y: 8, color: 15, right: 319, center: id === 255 || id < 252, overhead: id < 252 };
      this.messageStyles.set(id, style);
    }
    return style;
  }

  showText(id: number, text: number[], style: MessageStyle, keep: boolean) {
    if (id === 253 || id === 254) return;
    const pages: number[][] = [[]];
    for (const value of text) {
      if (value === -2) pages.push([]);
      else pages.at(-1)!.push(value);
    }
    const message: Message = { pages, style: { ...style }, charset: this.charset, actor: id, ticks: this.messageTime(pages[0]), keep };
    if (id >= 252) { this.caption = message; return; }
    this.clearMessage();
    const actor = this.actor(id);
    message.style.color = actor.color;
    this.message = message;
    this.vm.variables[VAR.message] = 1;
    this.vm.variables[VAR.talkActor] = id;
    this.chore(actor, actor.talkChore);
  }

  private messageTime(page: number[]) { return 60 + page.length * Math.max(1, this.vm.variables[VAR.charIncrement]); }

  nextMessage() {
    if (!this.message) return;
    if (this.message.pages.length > 1) {
      this.message.pages.shift();
      this.message.ticks = this.messageTime(this.message.pages[0]);
    } else this.clearMessage();
  }

  private clearMessage() {
    if (this.message) {
      const actor = this.actor(this.message.actor);
      this.chore(actor, actor.quietChore);
    }
    this.message = undefined;
    this.vm.variables[VAR.message] = 0;
    this.vm.variables[VAR.talkActor] = 255;
  }
}

export function directionTo(source: Point, target: Point) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  return Math.abs(dx) > Math.abs(dy) * 2 ? (dx < 0 ? 0 : 1) : (dy < 0 ? 3 : 2);
}
