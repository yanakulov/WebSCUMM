<script setup lang="ts">
import { nextTick, ref, shallowRef } from 'vue';
import { flood, stroke, type Point } from './byle/project.ts';
import type { RGB } from './engine/palette.ts';
import { indexOpaquePixels, indexedPng } from './indexed-png.ts';
import { paintIndexed } from './render.ts';

const input = ref<HTMLInputElement>();
const canvas = ref<HTMLCanvasElement>();
const art = shallowRef<{ width: number; height: number; pixels: Uint8Array; palette: RGB[] }>();
const name = ref('room.png');
const tool = ref<'Pencil' | 'Fill' | 'Pick'>('Pencil');
const ink = ref(0);
const zoom = ref(2);
const newColor = ref('#000000');
const error = ref('');
const undo = ref<Uint8Array[]>([]);
let previous: Point | undefined;
let pointer: number | undefined;

const hex = (rgb: RGB) => '#' + rgb.map(value => value.toString(16).padStart(2, '0')).join('');
function paint() {
  const room = art.value;
  if (room && canvas.value) paintIndexed(canvas.value, room.pixels, room.palette, room.width, room.height);
}
async function open(event: Event) {
  const picker = event.target as HTMLInputElement;
  const file = picker.files?.[0];
  picker.value = '';
  if (!file) return;
  error.value = '';
  try {
    if (file.type !== 'image/png') throw new Error('Choose a PNG file.');
    const image = await createImageBitmap(file, { colorSpaceConversion: 'none' });
    try {
      const { width, height } = image;
      if (width * height > 1_048_576 || width > 2048 || height > 1024) throw new Error('PNG is too large.');
      const source = document.createElement('canvas');
      source.width = width;
      source.height = height;
      const ctx = source.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(image, 0, 0);
      art.value = { width, height, ...indexOpaquePixels(ctx.getImageData(0, 0, width, height).data) };
      name.value = file.name;
      ink.value = 0;
      undo.value = [];
      await nextTick();
      paint();
    } finally { image.close(); }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}
async function save() {
  const room = art.value;
  if (!room) return;
  error.value = '';
  try {
    const blob = await indexedPng(room.width, room.height, room.pixels, room.palette);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name.value.replace(/\.png$/i, '') + '-edited.png';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}
function addColor() {
  const room = art.value;
  if (!room) return;
  const color = [1, 3, 5].map(i => parseInt(newColor.value.slice(i, i + 2), 16)) as RGB;
  const known = room.palette.findIndex(rgb => hex(rgb) === newColor.value);
  if (known >= 0) { ink.value = known; return; }
  if (room.palette.length >= 256) return;
  ink.value = room.palette.length;
  art.value = { ...room, palette: [...room.palette, color] };
}
function point(event: PointerEvent): Point {
  const room = art.value!;
  const rect = canvas.value!.getBoundingClientRect();
  return [
    Math.max(0, Math.min(room.width - 1, Math.floor((event.clientX - rect.left) * room.width / rect.width))),
    Math.max(0, Math.min(room.height - 1, Math.floor((event.clientY - rect.top) * room.height / rect.height))),
  ];
}
function draw(from: Point, to: Point) {
  const room = art.value!;
  stroke(from, to, (x, y) => { room.pixels[y * room.width + x] = ink.value; });
  paint();
}
function down(event: PointerEvent) {
  if (event.button !== 0 || pointer !== undefined || !art.value) return;
  const room = art.value;
  const at = point(event);
  if (tool.value === 'Pick') {
    ink.value = room.pixels[at[1] * room.width + at[0]];
    tool.value = 'Pencil';
    return;
  }
  undo.value = [...undo.value.slice(-11), room.pixels.slice()];
  if (tool.value === 'Fill') {
    flood(room.pixels, room.width, room.height, at, ink.value);
    paint();
    return;
  }
  pointer = event.pointerId;
  canvas.value!.setPointerCapture(pointer);
  previous = at;
  draw(at, at);
}
function move(event: PointerEvent) {
  if (!previous || event.pointerId !== pointer) return;
  const to = point(event);
  draw(previous, to);
  previous = to;
}
function stop(event: PointerEvent) {
  if (event.pointerId !== pointer) return;
  pointer = undefined;
  previous = undefined;
}
function revert() {
  const last = undo.value.pop();
  if (art.value && last) {
    art.value.pixels = last;
    paint();
  }
}
</script>

<template>
  <main class="room-paint" aria-label="SCUMM room paint">
    <header>
      <a href="#rooms">Room viewer</a>
      <button type="button" @click="input?.click()">Open PNG</button>
      <button type="button" :disabled="!art" @click="save">Save indexed PNG</button>
      <span v-if="art">{{ name }} · {{ art.width }} × {{ art.height }}</span>
      <input ref="input" type="file" accept="image/png" aria-label="Open background PNG" hidden @change="open">
    </header>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="art">
      <div class="room-paint-tools">
        <button v-for="item in (['Pencil', 'Fill', 'Pick'] as const)" :key="item" type="button"
          :aria-pressed="tool === item" @click="tool = item">{{ item }}</button>
        <button type="button" :disabled="!undo.length" @click="revert">Undo</button>
        <label>Zoom <select v-model.number="zoom"><option v-for="scale in [1, 2, 3, 4]" :key="scale" :value="scale">{{ scale }}×</option></select></label>
      </div>
      <div class="room-paint-scroll">
        <canvas ref="canvas" aria-label="Room pixel canvas" :style="{ width: art.width * zoom + 'px', height: art.height * zoom + 'px' }"
          @pointerdown="down" @pointermove="move" @pointerup="stop" @pointercancel="stop" @lostpointercapture="stop" />
      </div>
      <div class="room-paint-palette" aria-label="Room palette">
        <button v-for="(rgb, i) in art.palette" :key="i" type="button" class="room-paint-swatch" :style="{ background: hex(rgb) }"
          :title="hex(rgb)" :aria-label="hex(rgb)" :aria-pressed="ink === i" @click="ink = i" />
        <input v-model="newColor" type="color" aria-label="New color">
        <button type="button" :disabled="art.palette.length === 256" @click="addColor">Add color</button>
      </div>
    </template>
  </main>
</template>

<style scoped>
.room-paint { display: grid; gap: 12px; align-content: start; min-height: 100dvh; padding: 16px; background: #0b0b13; color: #f3efff; font: 14px/1.4 monospace; }
.room-paint header, .room-paint-tools, .room-paint-palette { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.room-paint button, .room-paint select { font: inherit; background: #181524; color: inherit; border: 1px solid #858095; padding: 4px 7px; }
.room-paint a { color: #bfb7ff; }
.room-paint button[aria-pressed=true] { outline: 2px solid #ffc878; outline-offset: 1px; }
.room-paint button:disabled { opacity: .45; }
.room-paint-scroll { overflow: auto; max-height: calc(100dvh - 185px); background: #000; }
.room-paint canvas { display: block; max-width: none; image-rendering: pixelated; touch-action: none; cursor: crosshair; }
.room-paint button.room-paint-swatch { width: 18px; height: 18px; padding: 0; }
</style>
