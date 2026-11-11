<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue';
import PixelText from './byle/PixelText.vue';
import RetroPicker from './byle/RetroPicker.vue';
import type { GameArchive } from './engine/archive.ts';
import { readRoom } from './engine/room.ts';
import { paintIndexed } from './render.ts';

const props = defineProps<{ game?: GameArchive }>();
const emit = defineEmits<{ importGame: [] }>();
const roomId = ref<number>();
const boxes = ref(false);
const plane = ref('');
const camera = ref(0);
const canvas = ref<HTMLCanvasElement>();
const choosing = ref(false);
const rooms = computed(() => props.game?.rooms.map(({ id, name }) => ({ id, label: `${id}   ${name}` })) ?? []);
const roomName = computed(() => rooms.value.find(item => item.id === roomId.value)?.label);
const result = computed(() => {
  if (!props.game || roomId.value === undefined) return { room: undefined, error: '' };
  try { return { room: readRoom(props.game, roomId.value), error: '' }; }
  catch (cause) { return { room: undefined, error: String(cause) }; }
});

function selectRoom(id: number) {
  roomId.value = id;
  camera.value = 0;
  plane.value = '';
  choosing.value = false;
}

watch(() => props.game, game => {
  if (game) selectRoom(game.rooms[0].id);
}, { immediate: true });

function nextPlane() {
  const planes = ['', ...(result.value.room?.masks.map(mask => mask.tag) ?? [])];
  plane.value = planes[(planes.indexOf(plane.value) + 1) % planes.length];
}

watchEffect(() => {
  const room = result.value.room;
  if (!canvas.value || !room) return;
  const width = Math.min(320, room.width);
  const start = Math.min(Math.max(0, room.width - width), camera.value);
  const pixels = new Uint8Array(width * room.height);
  for (let y = 0; y < room.height; y++) {
    const offset = y * room.width + start;
    pixels.set(room.pixels.subarray(offset, offset + width), y * width);
  }
  paintIndexed(canvas.value, pixels, room.palette, width, room.height);
  const context = canvas.value.getContext('2d')!;
  const mask = room.masks.find(item => item.tag === plane.value);
  if (mask) {
    context.fillStyle = '#ff675d8c';
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < width; x++) if (mask.pixels[y * room.width + start + x]) context.fillRect(x, y, 1, 1);
    }
  }
  if (boxes.value) {
    context.fillStyle = '#55ff5536';
    context.strokeStyle = '#55ff55';
    context.lineWidth = 1;
    for (const box of room.boxes) {
      context.beginPath();
      for (const [i, [x, y]] of box.points.entries()) {
        if (i === 0) context.moveTo(x - start, y);
        else context.lineTo(x - start, y);
      }
      context.closePath();
      context.fill();
      context.stroke();
    }
  }
});
</script>

<template>
  <section class="room-viewer" aria-label="SCUMM room viewer">
    <div class="byle-menu">
      <a href="#byle"><PixelText text="BYLE" /></a>
      <button type="button" @click="emit('importGame')"><PixelText text="OPEN DATA..." /></button>
      <button type="button" :disabled="!game" @click="choosing = true"><PixelText text="SELECT ROOM..." /></button>
      <PixelText v-if="roomName" :text="roomName.slice(0, 22)" />
    </div>
    <div class="room-image">
      <p v-if="result.error" class="retro-error" role="alert"><PixelText :text="result.error.slice(0, 64)" /></p>
      <canvas v-else-if="result.room" ref="canvas" aria-label="Room background" />
      <PixelText v-else text="OPEN DATA TO VIEW SCUMM ROOMS" />
    </div>
    <div v-if="result.room" class="room-controls">
      <button type="button" class="retro-action" :aria-pressed="boxes" @click="boxes = !boxes"><PixelText text="WALK BOXES" /></button>
      <button type="button" class="retro-action" :aria-pressed="!!plane" :disabled="!result.room.masks.length" @click="nextPlane">
        <PixelText :text="plane || 'Z-PLANE'" />
      </button>
      <label v-if="result.room.width > 320" class="speed-track room-camera">
        <PixelText text="CAMERA" />
        <input v-model.number="camera" type="range" min="0" :max="result.room.width - 320" aria-label="Camera">
      </label>
      <PixelText :text="`${result.room.width} X ${result.room.height}   ${result.room.objects} OBJECTS   ${result.room.boxes.length} BOXES`" />
    </div>
    <RetroPicker v-if="choosing" title="SELECT ROOM" :items="rooms" :selected="roomId" @close="choosing = false" @load="selectRoom" />
  </section>
</template>
