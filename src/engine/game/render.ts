import type { ScummGame, Actor, Message, Verb } from './game.ts';
import { measureText, type GameFont } from './font.ts';
import { VAR } from './vm.ts';
import { scaleOffset, scalePhase, scalePixel } from './costume-scale.ts';

export const WIDTH = 320;
export const HEIGHT = 200;

interface Image { width: number; height: number; pixels: Uint8Array; opacity: Uint8Array }
interface Occluder { x: number; y: number; width: number; height: number; masks: { tag: string; pixels: Uint8Array }[] }

export function renderGame(game: ScummGame, pixels: Uint8Array) {
  pixels.fill(0);
  const scene = game.scene;
  if (scene) {
    const width = Math.min(WIDTH, scene.width - game.viewX);
    if (width > 0) {
      for (let y = 0; y < Math.min(scene.height, game.screenBottom - game.screenTop); y++) {
        const start = y * scene.width + game.viewX;
        pixels.set(scene.pixels.subarray(start, start + width), (y + game.screenTop) * WIDTH);
      }
    }
    const occluders: Occluder[] = [];
    for (const id of [...scene.order].reverse()) {
      const object = scene.objects.get(id)!;
      if (!game.objectVisible(object)) continue;
      const image = game.getObjectImage(game.physicalRoom, id, game.objects[id].state);
      const { x, y } = game.positions.get(id) ?? object;
      if (!image) continue;
      const screenX = x - game.viewX, screenY = y + game.screenTop;
      drawImage(pixels, image, screenX, screenY, game.screenTop, game.screenBottom);
      if (image.masks.length) occluders.push({ x: screenX, y: screenY, width: image.width, height: image.height, masks: image.masks });
    }
    const actors = [...game.actors.values()].filter(actor => actor.room === game.room && actor.costume);
    actors.sort((a, b) => a.y - b.y || b.id - a.id);
    for (const actor of actors) drawActor(game, pixels, actor, occluders);
  }

  for (const { x, y, right, bottom, color } of game.fills) {
    for (let row = Math.max(0, y); row <= Math.min(HEIGHT - 1, bottom); row++) {
      pixels.fill(color, row * WIDTH + Math.max(0, x), row * WIDTH + Math.max(0, Math.min(WIDTH, right + 1)));
    }
  }
  for (const verb of game.verbs.values()) {
    if (!verb.mode) continue;
    if (verb.image) {
      const image = game.getObjectImage(verb.image.room, verb.image.object, 1);
      if (image) drawImage(pixels, image, verb.x, verb.y);
      continue;
    }
    const font = game.getFont(verb.charset);
    const color = verb.mode === 2 ? verb.dim :
      verb.highlight && game.vm.variables[VAR.cursor] > 0 && verb.id === game.hoverVerb ? verb.highlight : verb.color;
    drawText(pixels, font, game.charsetColors.get(verb.charset), verb.text, verb.x, verb.y, color, verb.center);
  }
  if (game.caption) drawMessage(game, pixels, game.caption);
  if (game.message) drawMessage(game, pixels, game.message);
  if (game.vm.variables[VAR.cursor] > 0 && game.pointerVisible) drawCursor(pixels, game);
}

function drawActor(game: ScummGame, pixels: Uint8Array, actor: Actor, occluders: Occluder[]) {
  const scene = game.scene!;
  const costume = game.getCostume(actor.costume);
  const step = actor.direction === 0 && !costume.sourceFacing ? -1 : 1;
  const scaled = actor.scaleX !== 255 || actor.scaleY !== 255;
  const depth = actor.clip || (actor.ignoreBoxes ? 0 : scene.boxes[actor.walkBox - 1]?.mask ?? 0);
  const plane = depth > 0 ? scene.masks[Math.min(depth, scene.masks.length) - 1] : undefined;
  const masks = plane ? occluders.flatMap(image => {
    const layer = image.masks.find(mask => mask.tag === plane.tag);
    return layer ? [{ ...image, pixels: layer.pixels }] : [];
  }) : [];
  const x = Math.floor(actor.x) - game.viewX, y = Math.floor(actor.y) - actor.elevation + game.screenTop;
  let moveX = 0, moveY = 0;
  for (const [i, limb] of actor.limbs.entries()) {
    if (!limb?.track || limb.hidden) continue;
    const cel = costume.limbs[i][limb.track.cels[limb.frame]];
    if (!cel) continue;
    const offsetX = moveX + cel.x, offsetY = moveY + cel.y;
    moveX += cel.moveX;
    moveY -= cel.moveY;
    const dx = x + step * (scaled ? scaleOffset(offsetX, actor.scaleX, step) : offsetX);
    let dy = y + (scaled ? scaleOffset(offsetY, actor.scaleY, 1) : offsetY);
    const phaseX = scalePhase(offsetX, step), phaseY = scalePhase(offsetY, 1);
    for (let row = 0; row < cel.height && dy < game.screenBottom; row++) {
      if (!scalePixel(actor.scaleY, phaseY + row)) continue;
      if (dy >= game.screenTop) {
        let columnX = dx;
        for (let col = 0; col < cel.width; col++) {
          const ink = cel.pixels[row * cel.width + col];
          if (ink && columnX >= 0 && columnX < WIDTH &&
            !plane?.pixels[(dy - game.screenTop) * scene.width + columnX + game.viewX] &&
            !masks.some(mask => columnX >= mask.x && columnX < mask.x + mask.width && dy >= mask.y && dy < mask.y + mask.height &&
              mask.pixels[(dy - mask.y) * mask.width + columnX - mask.x])) {
            pixels[dy * WIDTH + columnX] = actor.palette.get(ink) ?? costume.paletteIndices?.[ink] ?? ink;
          }
          if (scalePixel(actor.scaleX, phaseX + col * step)) columnX += step;
        }
      }
      dy++;
    }
  }
}

function drawImage(pixels: Uint8Array, image: Image, x: number, y: number, top = 0, bottom = HEIGHT) {
  for (let row = Math.max(0, top - y); row < Math.min(image.height, bottom - y); row++) {
    for (let col = Math.max(0, -x); col < Math.min(image.width, WIDTH - x); col++) {
      const at = row * image.width + col;
      if (image.opacity[at]) pixels[(y + row) * WIDTH + x + col] = image.pixels[at];
    }
  }
}

function textLines(font: GameFont, text: number[], maxWidth: number) {
  const lines: number[][] = [[]];
  for (const char of text) {
    if (char === -1) { lines.push([]); continue; }
    const line = lines.at(-1)!;
    line.push(char);
    if (measureText(font, line) <= maxWidth) continue;
    const space = line.lastIndexOf(32);
    if (space > 0) lines.push(line.splice(space).slice(1));
  }
  return lines;
}

function drawText(pixels: Uint8Array, font: GameFont, colors: number[] | undefined, text: number[],
  x: number, y: number, foreground: number, center = false) {
  if (center) x -= Math.floor(measureText(font, text) / 2);
  for (const code of text) {
    const glyph = font.glyphs[code];
    if (!glyph) continue;
    x += glyph.x;
    for (let row = 0; row < glyph.height; row++) {
      const dy = y + glyph.y + row;
      if (dy < 0 || dy >= HEIGHT) continue;
      for (let col = 0; col < glyph.width; col++) {
        const dx = x + col, color = glyph.pixels[row * glyph.width + col];
        if (color && dx >= 0 && dx < WIDTH) pixels[dy * WIDTH + dx] = color === 1 ? foreground : colors?.[color] ?? font.colors[color] ?? color;
      }
    }
    x += glyph.width;
  }
}

function drawMessage(game: ScummGame, pixels: Uint8Array, message: Message) {
  const font = game.getFont(message.charset), style = message.style;
  let { x, y } = style;
  const actor = style.overhead ? game.actors.get(message.actor) : undefined;
  if (actor) {
    x = Math.round(actor.x) - game.viewX;
    y = Math.round(actor.y - actor.elevation + game.vm.variables[VAR.talkY] * actor.scaleY / 255) + game.screenTop;
  }
  const lines = textLines(font, message.pages[0], style.center ? (actor ? WIDTH - 24 : style.right) : style.right - x);
  if (actor) y = Math.max(game.screenTop + 1, y - (lines.length - 1) * font.height);
  for (const line of lines) {
    const half = Math.floor(measureText(font, line) / 2);
    const left = style.center ? Math.max(half + 1, Math.min(WIDTH - half - 1, x)) : x;
    drawText(pixels, font, game.charsetColors.get(message.charset), line, left, y, style.color, style.center);
    y += font.height;
  }
}

export function hitVerb(game: ScummGame, x: number, y: number): Verb | undefined {
  return [...game.verbs.values()].reverse().find(verb => {
    if (verb.mode !== 1) return false;
    const image = verb.image && game.getObjectImage(verb.image.room, verb.image.object, 1);
    const font = image ? undefined : game.getFont(verb.charset);
    const width = image?.width ?? measureText(font!, verb.text), height = image?.height ?? font!.height;
    const left = verb.center ? verb.x - Math.floor(width / 2) : verb.x;
    return x >= left && x < left + width && y >= verb.y && y < verb.y + height;
  });
}

function drawCursor(pixels: Uint8Array, game: ScummGame) {
  const x = game.vm.variables[VAR.mouseX], y = game.vm.variables[VAR.mouseY];
  const cursor = game.cursors.get(game.cursorIndex);
  if (cursor?.letter !== undefined) {
    drawText(pixels, game.getFont(game.charset), undefined, [cursor.letter], x - (cursor.x ?? 0), y - (cursor.y ?? 0), 15);
    return;
  }
  for (let i = -5; i <= 5; i++) {
    if (Math.abs(i) <= 1) continue;
    if (x >= 0 && x < WIDTH && y + i >= 0 && y + i < HEIGHT) pixels[(y + i) * WIDTH + x] = 15;
    if (x + i >= 0 && x + i < WIDTH && y >= 0 && y < HEIGHT) pixels[y * WIDTH + x + i] = 15;
  }
}
