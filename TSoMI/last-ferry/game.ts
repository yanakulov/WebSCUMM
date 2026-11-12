import type { Costume, Cel } from '../../src/engine/costume.ts';
import type { GameFont } from '../../src/engine/game/font.ts';
import type { GameResources } from '../../src/engine/game/resources.ts';
import type { ObjectImage, Scene, SceneObject } from '../../src/engine/game/scene.ts';
import type { RGB, WalkBox } from '../../src/engine/room.ts';
import { char1Russian, char1RussianSlots, encodeChar1RussianText } from '../fonts/char1-russian.ts';
import { atlas, palette } from './art-data.ts';
import { Item, Room, objectScript, roomScripts, scripts } from './scripts.ts';

export const FERRY_TITLE = 'GUYBRUSH AND THE LAST FERRY';
export const FERRY_MUSIC_TRACK = 4;

const w = 320, h = 144;
const o = Item, r = Room;
const roomPixels = w * h;
const sheetWidth = 160;
const sheetStart = 4 * roomPixels;
const artLength = sheetStart + sheetWidth * 112;

const box = (x: number, y: number, right: number, bottom: number, scale = 215, mask = 0): WalkBox =>
  ({ points: [[x, y], [right, y], [right, bottom], [x, bottom]], mask, flags: 0, scale });
const hotspot = (id: number, name: string, x: number, y: number, width: number, height: number,
  walkX: number, walkY: number, direction = 1): SceneObject =>
  ({ id, name, x, y, width, height, walkX, walkY, direction, parent: 0, parentState: 0 });

const items = [
  hotspot(o.receipt, 'Квитанция', 0, 0, 0, 0, 0, 0),
  hotspot(o.tag, 'Бирка', 0, 0, 0, 0, 0, 0),
  hotspot(o.handle, 'Рукоятка', 0, 0, 0, 0, 0, 0),
  hotspot(o.plug, 'Пробка', 0, 0, 0, 0, 0, 0),
];
function setObjects(scene: Scene, list: SceneObject[]): Scene {
  const roomObjects = [...list, ...items];
  return { ...scene, objects: new Map(roomObjects.map(object => [object.id,
    { ...object, name: String.fromCharCode(...encodeChar1RussianText(object.name)) }])),
  order: list.map(({ id }) => id) };
}

function fillMask(width: number, height: number, left: number, top: number, right: number, bottom: number) {
  const pixels = new Uint8Array(width * height);
  for (let y = top; y < bottom; y++) pixels.fill(1, y * width + left, y * width + right);
  return { tag: 'ZP01', pixels };
}

function cyrillic(font: GameFont): GameFont {
  const glyphs = font.glyphs.slice();
  for (const [letter, slot] of char1RussianSlots) {
    const { width, rows } = char1Russian[letter];
    glyphs[slot] = { width, height: rows.length, x: 0, y: 0,
      pixels: Uint8Array.from(rows.flatMap(row => Array.from({ length: width }, (_, x) => (row >> (width - 1 - x)) & 1))) };
  }
  return { ...font, glyphs };
}

export function lastFerryResources(original: GameResources, art: Uint8Array): GameResources {
  if (art.length !== artLength) throw new Error('INVALID LAST FERRY ART.');
  const guybrush = original.costume(1);
  const font = cyrillic(original.font(1));
  const colors: RGB[] = Array.from({ length: 256 }, () => [0, 0, 0]);
  guybrush.paletteIndices?.forEach((slot, index) => { colors[slot] = guybrush.palette[index]; });
  palette.forEach(([red, green, blue], index) => { colors[32 + index] = [red, green, blue]; });
  colors[5] = [165, 84, 164];
  colors[7] = [196, 172, 183];
  colors[13] = [250, 139, 209];
  colors[14] = [252, 210, 143];
  colors[15] = [255, 250, 227];

  const sprite = (id: keyof typeof atlas): ObjectImage => {
    const [x, y, width, height] = atlas[id];
    const pixels = new Uint8Array(width * height);
    for (let row = 0; row < height; row++) {
      const at = sheetStart + (y + row) * sheetWidth + x;
      pixels.set(art.subarray(at, at + width), row * width);
    }
    return { width, height, pixels, opacity: pixels.map(color => Number(color !== 0)), masks: [] };
  };
  const beam = sprite('beam');
  beam.masks = [{ tag: 'ZP01', pixels: beam.opacity }];
  const images: Partial<Record<number, ObjectImage[]>> = {
    [o.six]: [sprite('crate0'), sprite('open0')],
    [o.nine]: [sprite('crate1'), sprite('open1')],
    [o.shutter]: [sprite('shutter')],
    [o.lift]: [sprite('lift')],
    [o.beam]: [beam],
    [o.leak]: [sprite('leak0'), sprite('leak1'), sprite('patch')],
    [o.rope]: [sprite('rope')],
  };

  const costume = (name: 'skipper' | 'clerk' | 'crab'): Costume => {
    const frames = (name === 'crab' ? [0, 1, 2] : [0, 1, 2, 3]).map(i => sprite((name + i) as keyof typeof atlas));
    const cels: Record<number, Cel> = frames.map(({ width, height, pixels }) =>
      ({ width, height, x: -Math.floor(width / 2), y: -height + 1, moveX: 0, moveY: 0, pixels: [...pixels] }));
    const poses = [[0], [0, 1, 2, 1], [0], [0, 1, 0], [0], [2, 3, 2, 0]];
    const chores: Costume['chores'] = {};
    for (let i = 0; i < poses.length; i++) {
      for (let direction = 0; direction < 4; direction++) {
        const animation = poses[i].filter(cel => cel < frames.length);
        chores[(i + 1) * 4 + direction] = { tracks: [{ cels: animation, loop: i === 1 || i === 3 }] };
      }
    }
    return { version: 1, name, palette: colors, limbs: [cels], chores, sourceFacing: false };
  };
  const costumes: Record<number, Costume> = { 1: guybrush, 201: costume('skipper'), 202: costume('clerk'), 203: costume('crab') };
  const scene = (id: number, boxes: WalkBox[]): Scene => ({
    width: w, height: h, palette: colors, pixels: new Uint8Array(art.subarray((id - 1) * roomPixels, id * roomPixels)),
    boxes, masks: [], objects: new Map(), order: [], scales: [], matrix: undefined, transparent: 0,
  });

  const dock = original.scene(33);
  const crop = (pixels: Uint8Array) => {
    const view = new Uint8Array(w * dock.height);
    for (let y = 0; y < dock.height; y++) view.set(pixels.subarray(y * dock.width, y * dock.width + w), y * w);
    return view;
  };
  const arrival: Scene = { ...dock, width: w, pixels: crop(dock.pixels),
    masks: dock.masks.map(mask => ({ ...mask, pixels: crop(mask.pixels) })) };
  const storage = scene(r.warehouse, [
    box(6, 86, 197, 100), box(248, 123, 319, 137), box(197, 88, 248, 100, 215, 1),
  ]);
  storage.matrix = Uint8Array.from([255, 255, 2, 3, 3, 255, 1, 1, 3, 3, 3, 3, 255, 1, 1, 1, 2, 2, 2, 255]);
  storage.masks = [fillMask(w, h, 0, 0, 0, 0)];
  storage.platform = { object: o.lift, box: 3, stops: [{ x: 197, y: 88, connects: 1 }, { x: 197, y: 125, connects: 2 }] };

  const clerk = scene(r.clerk, [box(4, 108, 314, 137)]);
  clerk.masks = [fillMask(w, h, 131, 91, 225, 109)];
  const scenes: Record<number, Scene> = {
    [r.office]: setObjects(scene(r.office, [box(7, 113, 188, 133)]), [
      hotspot(o.office, 'Контора', 76, 58, 42, 54, 99, 116, 3),
      hotspot(o.notice, 'Табличка', 125, 72, 45, 26, 147, 116, 3),
      hotspot(o.cup, 'Кружка', 247, 93, 13, 14, 176, 118),
      hotspot(o.skipper, 'Паромщик', 251, 67, 49, 53, 178, 118),
    ]),
    [r.clerk]: setObjects(clerk, [
      hotspot(o.shutter, '', 146, 61, 55, 24, 179, 110, 3),
      hotspot(o.clerk, 'Кладовщик', 126, 31, 100, 75, 179, 110, 3),
      hotspot(o.back, 'Выход', 0, 68, 24, 69, 12, 121, 0),
      hotspot(o.warehouse, 'Склад', 284, 62, 35, 58, 300, 119, 3),
    ]),
    [r.warehouse]: setObjects(storage, [
      hotspot(o.back, 'Контора', 0, 49, 27, 52, 13, 96, 0),
      hotspot(o.six, 'Левый ящик', 68, 67, 26, 27, 80, 96, 3),
      hotspot(o.nine, 'Правый ящик', 125, 65, 26, 27, 136, 94, 3),
      hotspot(o.upper, 'Управление', 175, 67, 20, 22, 186, 94),
      hotspot(o.lower, 'Управление', 249, 102, 22, 19, 254, 132),
      hotspot(o.beam, '', 211, 105, 37, 12, 0, 0),
      hotspot(o.lift, 'Подъёмник', 197, 88, 52, 19, 222, 96),
      hotspot(o.leak, 'Течь', 278, 119, 12, 11, 276, 134),
      hotspot(o.rope, 'Швартов', 274, 113, 23, 11, 280, 133),
      hotspot(o.skipper, 'Паромщик', 293, 82, 27, 40, 298, 132),
      hotspot(o.boarding, 'Трап', 290, 122, 30, 18, 311, 132),
    ]),
    [r.crossing]: scene(r.crossing, [box(0, 120, 319, 139)]),
    [r.melee]: setObjects(arrival, [hotspot(o.trail, 'Тропа наверх', 0, 0, 48, 144, 10, 76, 0)]),
  };

  const visible = new Set<number>([o.six, o.nine, o.lift, o.beam, o.leak, o.rope]);
  const untouchable = new Set<number>([o.beam, o.shutter]);
  return {
    variableCount: 256, bitVariableCount: 64,
    objects: Array.from({ length: 64 }, (_, id) => ({ owner: 15,
      state: Number(visible.has(id)), classes: untouchable.has(id) ? 0x80000000 : 0 })),
    scene: id => {
      const source = scenes[id];
      return { ...source, boxes: source.boxes.map(({ points, ...box }) =>
        ({ ...box, points: points.map(([x, y]) => [x, y]) })) };
    },
    script: id => scripts[id],
    roomCode: (tag, id) => tag === 'ENCD' ? roomScripts[id] : undefined,
    costume: id => costumes[id],
    font: () => font,
    image: (_room, object, state) => images[object.id]?.[state - 1],
    objectVerb: (_room, object, verb) => objectScript(object.id, verb),
    sound: id => original.sound(id),
  };
}
