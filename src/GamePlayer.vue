<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import PixelText from './byle/PixelText.vue';
import { ScummGame } from './engine/game/game.ts';
import { HEIGHT, WIDTH, hitVerb, renderGame } from './engine/game/render.ts';
import type { GameResources } from './engine/game/resources.ts';
import { paintIndexed } from './render.ts';

const props = defineProps<{ source?: GameResources; paused: boolean; loading: boolean; loadError: string }>();
const emit = defineEmits<{ open: [] }>();
const canvas = ref<HTMLCanvasElement>();
const error = ref('');
const stopped = ref(false);
const pixels = new Uint8Array(WIDTH * HEIGHT);
let game: ScummGame | undefined;
let frame = 0;
let last = 0;

function start(source = props.source) {
  error.value = '';
  stopped.value = false;
  game = source ? new ScummGame(source) : undefined;
  game?.boot();
  void nextTick(() => canvas.value?.focus());
}
watch(() => props.source, source => start(source), { immediate: true });

function loop(now: number) {
  const elapsed = last ? (now - last) / 1000 : 0;
  last = now;
  if (game && canvas.value && !props.paused && !error.value && !stopped.value) {
    try {
      game.advance(elapsed);
      renderGame(game, pixels);
      paintIndexed(canvas.value, pixels, game.palette, WIDTH, HEIGHT);
      error.value = game.error;
      stopped.value = game.stopped;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    }
  }
  frame = requestAnimationFrame(loop);
}
onMounted(() => { frame = requestAnimationFrame(loop); });
onUnmounted(() => cancelAnimationFrame(frame));

function point(event: PointerEvent) {
  if (!game || !canvas.value || error.value) return;
  const rect = canvas.value.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) * WIDTH / rect.width);
  const y = Math.floor((event.clientY - rect.top) * HEIGHT / rect.height);
  game.point(x, y);
  game.pointerVisible = event.pointerType === 'mouse';
  const verb = hitVerb(game, x, y)?.id;
  game.hoverVerb = verb ?? 0;
  return { x, y, verb };
}

function leave() { if (game) { game.pointerVisible = false; game.hoverVerb = 0; } }

function click(event: PointerEvent) {
  if ((event.button !== 0 && event.button !== 2) || props.paused) return;
  const hit = point(event);
  if (hit) game?.click(hit.x, hit.y, event.button === 2 ? 2 : 1, hit.verb);
}

const specialKeys: Record<string, number> = { Escape: 27, Enter: 13, Backspace: 8 };

function key(event: KeyboardEvent) {
  if (!game || props.paused || error.value || event.ctrlKey || event.altKey || event.metaKey) return;
  const code = specialKeys[event.key] ?? (event.key.length === 1 ? event.key.charCodeAt(0) : 0);
  if (!code) return;
  event.preventDefault();
  game.key(code);
}
</script>

<template>
  <section v-if="source" class="game-player" aria-label="Monkey Island player">
    <canvas ref="canvas" :width="WIDTH" :height="HEIGHT" class="game-display" tabindex="0"
      aria-label="SCUMM game screen. Press Escape to skip a cutscene."
      @pointermove="point" @pointerdown="click" @pointerleave="leave" @keydown="key" @contextmenu.prevent />
    <div v-if="error || stopped" class="game-status" role="status">
      <p>{{ error || 'The game has ended.' }}</p>
      <div class="retro-actions">
        <button type="button" class="retro-action" @click="start()"><PixelText text="RESTART" /></button>
        <button type="button" class="retro-action" @click="emit('open')"><PixelText text="OPEN SCUMM DATA" /></button>
      </div>
    </div>
  </section>
  <section v-else class="game-start" aria-label="WebSCUMM">
    <h1><PixelText text="THE SECRET OF MONKEY ISLAND" /></h1>
    <PixelText v-if="loading" text="LOADING GAME DATA..." role="status" />
    <template v-else>
      <p v-if="loadError" class="pack-error" role="status">{{ loadError }}</p>
      <button class="retro-action" type="button" @click="emit('open')"><PixelText text="OPEN LOCAL CD DATA" /></button>
    </template>
  </section>
</template>

<style scoped>
.game-player, .game-start { position: absolute; inset: 0; }
.game-display { width: 100%; height: 100%; display: block; image-rendering: pixelated; cursor: none; touch-action: none; }
.game-display:focus { outline: none; }
.game-start { display: grid; place-content: center; justify-items: center; gap: 8px; }
.game-start h1 { margin: 0; color: #55ffff; line-height: 1; transform: scale(2); }
.pack-error { margin: 0; color: #ff9a9a; font: 6px/1.4 monospace; }
.game-status { position: absolute; inset: auto 6px 6px; padding: 4px; background: #000; color: #fff; border: 1px solid; }
.game-status p { margin: 0; font: 6px/1.4 monospace; }
</style>
