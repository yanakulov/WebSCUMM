<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import PixelText from './byle/PixelText.vue';
import type { BrowserAudio } from './engine/audio/browser-audio.ts';
import { ScummGame } from './engine/game/game.ts';
import { HEIGHT, WIDTH, hitVerb, renderGame } from './engine/game/render.ts';
import type { GameResources } from './engine/game/resources.ts';
import { paintIndexed } from './render.ts';

const props = defineProps<{ title: string; source: GameResources; audio?: BrowserAudio }>();
const emit = defineEmits<{ menu: [] }>();
const canvas = ref<HTMLCanvasElement>();
const error = ref('');
const stopped = ref(false);
const pixels = new Uint8Array(WIDTH * HEIGHT);
let game: ScummGame | undefined;
let frame = 0;
let last = 0;
let cursor = { x: WIDTH / 2, y: HEIGHT / 2 };
let touch: { id: number; x: number; y: number; travel: number; cancelled: boolean } | undefined;
const tapTravel = 6;

function start(source = props.source) {
  error.value = '';
  stopped.value = false;
  touch = undefined;
  cursor = { x: WIDTH / 2, y: HEIGHT / 2 };
  props.audio?.stop(0);
  props.audio?.unlock();
  game = new ScummGame(source, Math.random, props.audio);
  game.boot();
  void nextTick(() => canvas.value?.focus());
}
watch(() => props.source, source => start(source), { immediate: true });

function loop(now: number) {
  const elapsed = last ? (now - last) / 1000 : 0;
  last = now;
  if (game && canvas.value && !error.value && !stopped.value) {
    try {
      game.advance(elapsed);
      renderGame(game, pixels);
      paintIndexed(canvas.value, pixels, game.palette, WIDTH, HEIGHT);
      error.value = game.error;
      stopped.value = game.stopped;
      if (error.value || stopped.value) props.audio?.stop(0);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      props.audio?.stop(0);
    }
  }
  frame = requestAnimationFrame(loop);
}
onMounted(() => { frame = requestAnimationFrame(loop); });
onUnmounted(() => cancelAnimationFrame(frame));

function acceptsInput() {
  return game && canvas.value && !error.value && !stopped.value;
}

function setCursor(x: number, y: number) {
  cursor = { x: Math.max(0, Math.min(WIDTH - 1, x)), y: Math.max(0, Math.min(HEIGHT - 1, y)) };
  x = Math.floor(cursor.x);
  y = Math.floor(cursor.y);
  if (!game) return { x, y, verb: undefined };
  game.point(x, y);
  game.pointerVisible = true;
  const verb = hitVerb(game, x, y)?.id;
  game.hoverVerb = verb ?? 0;
  return { x, y, verb };
}

function move(event: PointerEvent) {
  if (!acceptsInput()) return;
  const rect = canvas.value!.getBoundingClientRect();
  if (event.pointerType !== 'touch') {
    return setCursor((event.clientX - rect.left) * WIDTH / rect.width, (event.clientY - rect.top) * HEIGHT / rect.height);
  }
  if (!touch || touch.id !== event.pointerId || touch.cancelled) return;
  const dx = event.clientX - touch.x, dy = event.clientY - touch.y;
  touch.travel += Math.hypot(dx, dy);
  touch.x = event.clientX;
  touch.y = event.clientY;
  return setCursor(cursor.x + dx * WIDTH / rect.width, cursor.y + dy * HEIGHT / rect.height);
}

function down(event: PointerEvent) {
  if (!acceptsInput()) return;
  props.audio?.unlock();
  if (event.pointerType === 'touch') {
    if (touch) { touch.cancelled = true; return; }
    if (!event.isPrimary) return;
    touch = { id: event.pointerId, x: event.clientX, y: event.clientY, travel: 0, cancelled: false };
    canvas.value!.setPointerCapture(event.pointerId);
    setCursor(cursor.x, cursor.y);
    return;
  }
  if (event.button !== 0 && event.button !== 2) return;
  const hit = move(event);
  if (hit) game?.click(hit.x, hit.y, event.button === 2 ? 2 : 1, hit.verb);
}

function up(event: PointerEvent) {
  if (!touch || touch.id !== event.pointerId) return;
  const hit = move(event);
  const tapped = !touch.cancelled && touch.travel < tapTravel;
  touch = undefined;
  if (hit && tapped) game?.tap(hit.x, hit.y, hit.verb);
}

function cancel(event: PointerEvent) {
  if (touch?.id === event.pointerId) touch = undefined;
}

function leave(event: PointerEvent) {
  if (game && event.pointerType !== 'touch') { game.pointerVisible = false; game.hoverVerb = 0; }
}

const specialKeys: Record<string, number> = { Escape: 27, Enter: 13, Backspace: 8 };

function key(event: KeyboardEvent) {
  if (!game || error.value || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.key === 'F10') { event.preventDefault(); emit('menu'); return; }
  props.audio?.unlock();
  const code = specialKeys[event.key] ?? (event.key.length === 1 ? event.key.charCodeAt(0) : 0);
  if (!code) return;
  event.preventDefault();
  game.key(code);
}
</script>

<template>
  <section class="game-player" :aria-label="title">
    <canvas ref="canvas" :width="WIDTH" :height="HEIGHT" class="game-display" tabindex="0"
      aria-label="SCUMM game screen. Press Escape or tap to skip a cutscene. Swipe to move the cursor."
      @pointermove="move" @pointerdown="down" @pointerup="up" @pointercancel="cancel" @lostpointercapture="cancel"
      @pointerleave="leave" @keydown="key" @contextmenu.prevent />
    <button v-if="!error && !stopped" type="button" class="retro-action game-menu" @click="emit('menu')">
      <PixelText text="MENU" />
    </button>
    <div v-if="error || stopped" class="game-status" role="status">
      <p>{{ error || 'The game has ended.' }}</p>
      <div class="retro-actions">
        <button type="button" class="retro-action" @click="start()"><PixelText text="RESTART" /></button>
        <button type="button" class="retro-action" @click="emit('menu')"><PixelText text="MENU" /></button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.game-player { position: absolute; inset: 0; }
.game-display { width: 100%; height: 100%; display: block; image-rendering: pixelated; cursor: none; touch-action: none; }
.game-display:focus { outline: none; }
.byle-screen .game-menu { position: absolute; top: 3px; right: 3px; opacity: 0.55; }
.game-menu:focus-visible, .game-menu:hover { opacity: 1; }
@media (pointer: coarse) { .byle-screen .game-menu { opacity: 0.8; } }
.game-status { position: absolute; inset: auto 6px 6px; padding: 4px; background: #000; color: #fff; border: 1px solid; }
.game-status p { margin: 0; font: 6px/1.4 monospace; }
</style>
