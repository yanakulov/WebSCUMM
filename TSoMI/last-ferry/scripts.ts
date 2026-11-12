import { VAR } from '../../src/engine/game/vm.ts';
import { encodeChar1RussianText } from '../fonts/char1-russian.ts';
import { animated, palette } from './art-data.ts';

export const Room = { office: 1, clerk: 2, warehouse: 3, crossing: 4, melee: 5 } as const;
export const Item = {
  skipper: 40, notice: 41, office: 42, cup: 43, clerk: 44, back: 45, warehouse: 46, shutter: 47,
  six: 48, nine: 49, upper: 50, lower: 51, lift: 52, beam: 53, leak: 54, boarding: 55,
  trail: 56, receipt: 57, tag: 58, handle: 59, plug: 60, rope: 62,
} as const;
export const Verb = { walk: 1, give: 2, open: 3, close: 4, take: 5, look: 6, talk: 7, use: 8, push: 9, pull: 10 } as const;
const v = Verb, o = Item, r = Room;
const Selected = 100, First = 101, Target = 102, Paid = 103, Filed = 104, Fitted = 105, Floor = 106;
const Repaired = 107, Checked = 108, Menu = 109, Talked = 110, Hover = 111, TookPlug = 112, Unmoored = 113;
const Local = { zone: 0x4000, hit: 0x4001, button: 0x4002 } as const;

type Code = number[];
const word = (n: number): Code => [n & 255, (n >> 8) & 255];
const text = (s: string): Code => [...encodeChar1RussianText(s), 0];
const end = [0];
const waitSpeech = [0xae, 2];
const waitWalk = [0xae, 1, 1];
const pause = (ticks: number): Code => [0x2e, ...word(ticks), 0];
const set = (id: number, n: number): Code => [0x1a, ...word(id), ...word(n)];
const eq = (id: number, n: number, code: Code): Code => [0x48, ...word(id), ...word(n), ...word(code.length), ...code];
const ne = (id: number, n: number, code: Code): Code => [0x08, ...word(id), ...word(n), ...word(code.length), ...code];
const gt = (id: number, n: number, code: Code): Code => [0x44, ...word(id), ...word(n), ...word(code.length), ...code];
const bytecode = (code: Code) => Uint8Array.from([...code, ...end]);
const start = (script: number): Code => [0x0a, script, 255];
const state = (id: number, n: number): Code => [0x07, ...word(id), n];
const sound = (id: number): Code => [0x02, id];
const cursor = (active: boolean): Code => [0x2c, active ? 1 : 2, 0x2c, active ? 3 : 4];
const pose = (actor: number, chore: number): Code => [0x11, actor, chore];
const place = (actor: number, room: number, x: number, y: number, facing: number): Code =>
  [0x2d, actor, room, 0x01, actor, ...word(x), ...word(y), ...pose(actor, 244 + facing)];
const enter = (room: number, x: number, y: number, facing = 1): Code =>
  [...place(1, room, x, y, facing), 0x72, room];
const speak = (actor: number, line: string): Code => [0x14, actor, 7, 15, ...text(line), ...waitSpeech];
const says = (line: string): Code => speak(1, line);
const line = (caption: string): Code => [0x14, 255, 0, 160, 0, 20, 0, 4, 15, ...text(caption)];
const verb = (id: number, caption: string, x: number, y: number, color = 5, center = false): Code =>
  [0x7a, id, 9, 2, ...text(caption), 5, ...word(x), ...word(y), 3, color, 4, 13, ...(center ? [19] : []), 6, 255];
const mode = (id: number, visible: boolean): Code => [0x7a, id, visible ? 6 : 7, 255];
const found = (id: number): Code => [0xf5, ...word(id), ...word(VAR.virtualX), ...word(VAR.virtualY)];
const inspectObject = [0xcb, ...word(VAR.result), ...word(Target), ...word(Selected)];
const walkToTarget = [0x76, 1, ...word(Target), ...waitWalk];
const walkToPointer = [0x7e, 1, ...word(VAR.virtualX), ...word(VAR.virtualY)];
const run = [0xf7, ...word(Target), ...word(Selected), 0x80, ...word(First), 255];

const names: Record<number, string> = {
  [v.walk]: 'Идти к', [v.give]: 'Дать', [v.open]: 'Открыть', [v.close]: 'Закрыть', [v.take]: 'Взять',
  [v.look]: 'Осмотреть', [v.talk]: 'Говорить', [v.use]: 'Применить', [v.push]: 'Толкнуть', [v.pull]: 'Потянуть',
};
const inventory = [
  { object: o.receipt, slot: 201, name: 'Квитанция', x: 193, y: 161, look: 'Принять через окошко. Лично. Под расписку.' },
  { object: o.tag, slot: 202, name: 'Бирка', x: 264, y: 161, look: 'На обороте: черта под цифрой. На лицевой: НЕ КАНТОВАТЬ.' },
  { object: o.handle, slot: 203, name: 'Рукоятка', x: 193, y: 175, look: 'Квадратный конец. На складе был квадратный паз.' },
  { object: o.plug, slot: 204, name: 'Пробка', x: 264, y: 175, look: 'Пробка для временного ремонта. Как раз по моей специальности.' },
] as const;
const inventoryEntry = (id: number) => inventory.find(item => item.object === id)!;
const give = (id: number, own: boolean): Code => {
  const { slot, name, x, y } = inventoryEntry(id);
  return [0x29, ...word(id), own ? 1 : 15, ...(own ? verb(slot, name, x, y, 7) : mode(slot, false))];
};
const reset = [...set(Selected, v.walk), ...set(First, 0)];
const options = [
  [111, 'Как отличить шестёрку?'],
  [112, 'А меня можно отправить грузом?'],
  [113, 'Я ещё вернусь.'],
] as const;
const verbs = [
  [v.give, 8, 161], [v.open, 8, 175], [v.close, 8, 189],
  [v.take, 62, 161], [v.look, 62, 175], [v.talk, 62, 189],
  [v.use, 124, 161], [v.push, 124, 175], [v.pull, 124, 189],
] as const;
const bar = (show: boolean) => verbs.flatMap(([id]) => mode(id, show));
const closeMenu = [...options.flatMap(([id]) => mode(id, false)), ...bar(true), ...mode(100, true), ...set(Menu, 0)];
const openMenu = [...set(Menu, 1), ...bar(false), ...mode(100, false),
  ...options.flatMap(([id, option], i) => verb(id, option, 8, 148 + 16 * i, 7))];
const conversation = (...parts: Code[]): Code => [...cursor(false), ...parts.flat(), ...cursor(true)];
const fallback = says('Пожалуй, я оставлю это в покое.');
const carryAsCargo = [
  ...speak(1, 'А меня можно отправить грузом?'), ...speak(3, 'Хрупкий?'),
  ...speak(1, 'Смотря с какой высоты.'), ...speak(3, 'Запишем: не кантовать.'),
];

const input = bytecode([
  ...ne(Menu, 0, [
    ...eq(Local.zone, 1, options.flatMap(([id], i) => eq(Local.hit, id, [
      ...closeMenu,
      ...(i === 0 ? conversation(speak(3, 'На бирке черта всегда снизу. Переворачивай голову, а не ящик.')) :
        i === 1 ? conversation(carryAsCargo) : []), ...end,
    ]))),
    ...end,
  ]),
  ...eq(Local.zone, 4, [
    ...eq(Local.hit, 27, [...reset, ...end]),
    ...end,
  ]),
  ...eq(Local.zone, 1, [
    ...verbs.flatMap(([id]) => eq(Local.hit, id, [...set(Selected, id), ...set(First, 0), ...end])),
    ...inventory.flatMap(({ object, slot, look }) => eq(Local.hit, slot, [
      ...eq(Selected, v.look, [
        ...reset,
        ...(object === o.tag ? eq(VAR.room, r.melee, [...conversation(says('Зачёркнуто: не кантовать. Дописано: будущий пират.')), ...end]) : []),
        ...conversation(says(look)), ...end,
      ]),
      ...ne(Selected, v.give, set(Selected, v.use)),
      ...set(First, object), ...end,
    ])),
    ...end,
  ]),
  ...found(Target),
  ...eq(Local.button, 2, [
    ...set(Selected, v.look), ...set(First, 0),
    ...[o.skipper, o.clerk].flatMap(id => eq(Target, id, set(Selected, v.talk))),
  ]),
  ...eq(Target, 0, [...reset, ...walkToPointer, ...end]),
  ...inspectObject,
  ...eq(VAR.result, 0, [
    ...eq(Selected, v.walk, [...walkToPointer, ...end]),
    ...reset, ...conversation(fallback), ...end,
  ]),
  ...cursor(false),
  ...walkToTarget,
  ...cursor(true),
  0x74, ...word(VAR.result), ...word(1), ...word(Target),
  ...gt(VAR.result, 10, [...reset, ...conversation(says('С этой стороны не дотянуться.')), ...end]),
  ...run,
  ...reset,
]);

const dynamicText = (control: number, variable: number): Code => [255, control, ...word(variable)];
const ui = bytecode([
  ...found(Hover),
  // Stop the prompt at the room edge so the object name never follows the cursor into the verb panel.
  0x38, ...word(VAR.mouseY), ...word(144), ...word(set(Hover, 0).length), ...set(Hover, 0),
  ...eq(Menu, 0, [
    ...eq(First, 0, [0x7a, 100, 2, ...dynamicText(5, Selected), 32, ...dynamicText(6, Hover), 0, 255]),
    ...ne(First, 0, [0x7a, 100, 2, ...dynamicText(5, Selected), 32, ...dynamicText(6, First),
      ...text(' к ').slice(0, -1), ...dynamicText(6, Hover), 0, 255]),
  ]),
  0x80, 0x18, ...word(0), // Replaced with the backward jump below.
]);
ui.set(word(-ui.length + 1), ui.length - 3);

const setup = bytecode([
  ...set(VAR.ego, 1), ...set(VAR.input, 2), ...set(VAR.nextFrame, 4), ...set(VAR.talkY, -61),
  ...set(VAR.charIncrement, 2), ...set(VAR.cutsceneKey, 27), ...set(57, 46), ...reset,
  0x33, 3, 0, 0, 200, 0,
  0x13, 1, 1, 1, 2, 6, 3, 12, 15, 255,
  0x13, 2, 1, 201, 12, 14, 22, 3, 255,
  0x13, 3, 1, 202, 12, 14, 19, 1, 22, 3, 255,
  0x13, 4, 1, 203, 2, 3, 2, 20, 255,
  ...place(2, r.office, 266, 115, 0),
  ...place(3, r.clerk, 190, 104, 2),
  ...place(4, r.office, 241, 121, 1),
  ...verbs.flatMap(([id, x, y]) => verb(id, names[id], x, y)),
  ...verb(v.walk, names[v.walk], 0, 200), // Displayed through verb 100.
  ...verb(100, names[v.walk], 160, 146, 5, true),
  ...start(3), ...start(4), ...start(6), ...sound(103),
  ...cursor(true), ...enter(r.office, 53, 128),
]);

const animation = bytecode([
  ...pause(35),
  ...eq(VAR.room, r.office, [
    ...eq(VAR.message, 0, pose(2, 6)),
    0x1e, 4, ...word(285), ...word(122),
  ]),
  ...eq(VAR.room, r.warehouse, eq(Repaired, 0, eq(VAR.message, 0, pose(2, 6)))),
  ...pause(78),
  ...eq(VAR.room, r.office, [0x1e, 4, ...word(243), ...word(121)]),
  0x42, 4, 255,
]);

const waves = [animated.wave0, animated.wave1, animated.wave2, animated.wave3];
const changeColor = (slot: number, rgb: number[]): Code => [0x33, 4, ...rgb.flatMap(word), 0, slot];
const environment = bytecode([
  ...waves.flatMap((_, step) => [
    ...ne(VAR.room, r.melee, [
      ...ne(VAR.room, r.clerk, waves.flatMap((slot, i) => changeColor(slot, palette[waves[(i + step) % waves.length] - 32]))),
      ...changeColor(animated.flame0, palette[animated.flame0 - 32].map(value => value - step * 3)),
      ...changeColor(animated.flame1, palette[animated.flame1 - 32].map(value => value - step * 3)),
      ...eq(VAR.room, r.warehouse, eq(Repaired, 0, state(o.leak, step % 3 + 1))),
    ]),
    ...pause(8),
  ]),
  0x42, 6, 255,
]);

const hoist = (to: number): Code => [
  ...set(Floor, to), ...sound(9), 0x33, 31, to, 0xae, 5,
];
const moveLift = bytecode([
  ...eq(Fitted, 0, [...conversation(says('Остался квадратный паз. Нужна рукоятка.')), ...end]),
  0x7b, ...word(VAR.result), 1,
  ...ne(VAR.result, 3, [
    ...cursor(false), ...eq(Floor, 0, [...hoist(1), ...speak(2, 'Принял! Один подъёмник!'), ...cursor(true), ...end]),
    ...hoist(0), ...cursor(true), ...end,
  ]),
  ...cursor(false),
  ...eq(Floor, 0, [...hoist(1), ...cursor(true), ...end]),
  ...hoist(0), ...cursor(true),
]);
const passageCode: Code = [
  ...cursor(false), 0x40, 255, 0x58, 1, 0x18, 0, 0,
  ...pause(30), ...speak(2, 'Тут написано: этой стороной вверх.'), ...pose(1, 246), ...pause(15), ...pose(1, 245),
  ...says('Осторожно с грузом. Он завтракал.'),
  ...speak(2, 'Доставлен. Обратный рейс в четверг.'),
  ...says('А если я захочу сам выбирать, куда плыть?'),
  ...speak(2, 'Тогда тебе к пиратам. Спроси у старика наверху.'),
  ...says('И что, никакой квитанции?'),
  ...speak(2, 'Можешь показать. Посмотришь, что он с ней сделает.'),
];
passageCode.splice(9, 2, ...word(passageCode.length - 11));
const crossing = bytecode([...passageCode, 0xc0, ...cursor(true), ...enter(r.melee, 228, 132, 0)]);

export const scripts: Record<number, Uint8Array> = { 1: setup, 2: input, 3: ui, 4: animation, 5: moveLift, 6: environment };
export const roomScripts: Partial<Record<number, Uint8Array>> = { [r.crossing]: crossing,
  [r.warehouse]: bytecode([...set(Floor, 0), ...place(2, r.warehouse, 301, 126, 0)]),
};

const enterOffice = [...enter(r.clerk, 35, 120)];
const enterWarehouse = [
  ...eq(Filed, 0, [...conversation(speak(3, 'За склад отвечает тот, у кого квитанция.')), ...end]),
  ...enter(r.warehouse, 34, 96),
];
const toOffice = [...enter(r.office, 101, 122, 1)];
const backFromWarehouse = [...enter(r.clerk, 277, 119, 0)];
const talkSkipper = [
  ...eq(Paid, 0, [
    ...set(Paid, 1), ...conversation(
      says('Долго до Меле?'), speak(2, 'Две кружки в минуту.'), says('Это расстояние?'),
      speak(2, 'Это пока ещё скорость, с которой мы тонем.'),
      says('Что нужно для переправы?'),
      speak(2, 'Пробку из шестого ящика. Принеси её, и место твоё.'),
      says('А табличка?'),
      speak(2, 'Я обещал место. Кем ты на нём поедешь, решай сам.'),
      give(o.receipt, true)), ...end]),
  ...conversation(speak(2, 'С квитанцией к кладовщику. Он любит, когда ему дают бумажку.')),
];
const talkClerk = [
  ...eq(Talked, 0, [
    ...set(Talked, 1), ...conversation(says('Мне нужен шестой ящик.'), speak(3, 'Подай квитанцию.'),
      says('Вы же видите её у меня в руке.'), speak(3, 'Вижу. А через окошко смогу её принять.')),
  ]),
  ...openMenu,
];
const fileReceipt = [
  ...eq(First, o.receipt, [
    ...cursor(false), ...set(Filed, 1), ...give(o.receipt, false), ...pose(3, 6), ...pause(24),
    ...sound(9), ...state(o.shutter, 1), ...pause(20),
    ...state(o.shutter, 0), ...conversation(carryAsCargo,
      speak(3, 'Рукоятка от подъёмника. В складе её опять кто-то вынул.'),
      give(o.tag, true), give(o.handle, true)), ...end,
  ]),
  ...conversation(speak(3, 'Принимаю квитанции в одном экземпляре. И обязательно через окошко.')),
];
const repair = [
  ...eq(Repaired, 1, [...conversation(says('Держится. Для временного ремонта это почти вечность.')), ...end]),
  ...eq(First, o.plug, [
    ...set(Repaired, 1), ...give(o.plug, false), ...state(o.leak, 4), ...sound(9),
    ...conversation(speak(2, 'Кружка сухая. Даже странно.')), ...end]),
  ...conversation(says('Сюда нужна деревянная пробка.')),
];
const board = [
  ...eq(Repaired, 0, [...conversation(speak(2, 'Сначала пробка, потом плавание. В этом порядке.')), ...end]),
  ...eq(Checked, 0, [...conversation(speak(2, 'Покажи грузовую бирку. На себя, если других ящиков нет.')), ...end]),
  ...eq(Unmoored, 0, [...conversation(speak(2, 'А швартов? Склад в Меле не поедет.')), ...end]),
  ...place(2, r.crossing, 250, 115, 0), ...enter(r.crossing, 141, 126),
];
const presentTag = [
  ...eq(VAR.room, r.office, [...conversation(speak(2, 'Бумажки принимает кладовщик. Я принимаю пробки.')), ...end]),
  ...eq(First, o.tag, [
    ...set(Checked, 1), ...conversation(speak(2, 'Груз один, без упаковки. Надень бирку, чтоб не потеряться.')), ...end]),
  ...conversation(speak(2, 'Грузовая бирка у тебя есть?')),
];
const fit = [
  ...eq(Fitted, 1, [...start(5), ...end]),
  ...eq(First, o.handle, [
    ...set(Fitted, 1), ...give(o.handle, false), ...sound(9),
    ...conversation(says('Вот и всё. Теперь осталось встать с нужной стороны.')), ...end]),
  ...conversation(says('Здесь квадратный паз.')),
];

const verbsByObject: Partial<Record<number, Record<number, Code>>> = {
  [o.skipper]: { [v.talk]: [
    ...eq(VAR.room, r.office, [...talkSkipper, ...end]),
    ...conversation(speak(2, 'Затыкай течь, показывай бирку и прыгай на борт.')),
  ], [v.give]: presentTag, [v.use]: presentTag, [v.look]: conversation(says('Он вычерпывает воду так, будто давно привык.')) },
  [o.notice]: { [v.look]: conversation(says('ПАССАЖИРОВ НЕ ВОЗИМ. Неподъёмный груз оставьте на берегу.')) },
  [o.cup]: { [v.look]: conversation(says('В кружке плавает краб. Надеюсь, у него билет.')),
    [v.take]: conversation(speak(2, 'Оставь. Это мой аварийный флот.')) },
  [o.office]: { [v.walk]: enterOffice, [v.open]: enterOffice, [v.look]: conversation(says('Контора. Сегодня я здесь в последний раз.')) },
  [o.clerk]: { [v.talk]: talkClerk, [v.give]: fileReceipt, [v.use]: fileReceipt,
    [v.look]: conversation(says('Он умеет ставить печать, не отрываясь от книги.')) },
  [o.back]: { [v.walk]: [...eq(VAR.room, r.clerk, [...toOffice, ...end]), ...backFromWarehouse],
    [v.open]: [...eq(VAR.room, r.clerk, [...toOffice, ...end]), ...backFromWarehouse] },
  [o.warehouse]: { [v.walk]: enterWarehouse, [v.open]: enterWarehouse,
    [v.look]: conversation(says('На двери написано: склад. Первый случай честной вывески за смену.')) },
  [o.six]: { [v.look]: conversation(says('Черта внизу. Значит, это шестёрка.')),
    [v.open]: [...eq(TookPlug, 1, [...conversation(says('Пробку я уже забрал.')), ...end]), ...set(TookPlug, 1),
      ...state(o.six, 2), ...sound(9), ...conversation(says('Для временного ремонта. Как раз по моей специальности.'), give(o.plug, true))],
    [v.close]: state(o.six, 1) },
  [o.nine]: { [v.look]: conversation(says('Черта сверху. Кто-то повесил бирку вверх ногами.')),
    [v.open]: [...state(o.nine, 2), ...sound(9), ...conversation(says('Акт о вскрытии чужого ящика.'),
      says('Укажите причину вскрытия. Надеялся, что там будет ответ.'))],
    [v.close]: state(o.nine, 1) },
  [o.upper]: { [v.look]: conversation(says('Рукоятку вынули. По форме паз похож на квадрат.')), [v.use]: fit, [v.pull]: start(5) },
  [o.lower]: { [v.look]: conversation(says('Рычаг возвращает подъёмник на склад.')), [v.use]: fit, [v.pull]: start(5) },
  [o.lift]: { [v.look]: conversation(says('Подъёмник для грузов. Сегодня я почти груз.')), [v.use]: fit, [v.pull]: start(5) },
  [o.leak]: { [v.look]: conversation(says('Вода бьёт из отверстия величиной с пробку.')), [v.use]: repair },
  [o.rope]: { [v.look]: conversation(says('Крепкая верёвка. Если её не отвязать, остров поедет с нами.')),
    [v.pull]: [...eq(Unmoored, 1, [...conversation(says('Уже отвязал.')), ...end]),
      ...eq(Repaired, 0, [...conversation(speak(2, 'Отвязать нетонущий паром сумеет любой. Давай сначала сделаем его нетонущим.')), ...end]),
      ...eq(Checked, 0, [...conversation(speak(2, 'Сначала предъяви бирку. Я должен знать, кто за бортом, ещё до того, как он там окажется.')), ...end]),
      ...set(Unmoored, 1), ...state(o.rope, 0), ...sound(9), ...conversation(speak(2, 'Вот теперь на борт!'))] },
  [o.boarding]: { [v.walk]: board, [v.open]: board, [v.use]: board, [v.look]: conversation(says('Трап на последний паром.')) },
  [o.trail]: { [v.walk]: [...cursor(false), ...line('ГАЙБРАШ ТРИПВУД СХОДИТ НА БЕРЕГ'), ...pause(120),
    ...line('ПРОДОЛЖЕНИЕ НА МЕЛЕ'), ...pause(105), 0x98, 3],
    [v.look]: conversation(says('Там наверху старик. Кажется, я знаю, что спрошу.')) },
};

export function objectScript(object: number, action: number) {
  const code = verbsByObject[object]?.[action];
  return code && bytecode(code);
}
