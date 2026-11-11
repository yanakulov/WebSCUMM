<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch, watchEffect } from 'vue';
import type { GameArchive } from '../engine/archive.ts';
import { DIRECTIONS, EMPTY, readCostume, readCostumeFile } from '../engine/costume.ts';
import type { Cel, Costume } from '../engine/costume.ts';
import { writeCostume } from '../engine/costume-writer.ts';
import { ega } from '../engine/palette.ts';
import { blitCel, drawChore, frameSlots, paintIndexed } from '../render.ts';
import { blankCostume, celFromSurface, flood, parseProject, practiceCostume, stroke } from './project.ts';
import type { Point } from './project.ts';
import PixelText from './PixelText.vue';
import RetroDialog from './RetroDialog.vue';
import RetroPicker from './RetroPicker.vue';

const props = defineProps<{ game?: GameArchive; archiveName: string; active: boolean }>();
const emit = defineEmits<{ importGame: [] }>();
const width = 144;
const height = 128;
const anchor: Point = [73, 100];
const previewAnchor: Point = [68, 100];
const drawing = ref<HTMLCanvasElement>();
const preview = ref<HTMLCanvasElement>();
const projectInput = ref<HTMLInputElement>();
const project = shallowRef<Costume>(practiceCostume());
const gameCostume = ref<number>();
const dialog = ref<'help' | 'costume' | ''>('');
const helpPage = ref(0);
const chore = ref(0);
const direction = ref(2);
const limb = ref(0);
const cel = ref(0);
const frame = ref(0);
const limbStart = ref(0);
const celStart = ref(0);
const choreStart = ref(0);
const listStart = ref(0);
const speed = ref(6);
const playing = ref(false);
const tools = ['PLOT', 'LINE', 'FILL', 'ZOOM', 'COPY', 'DROP', 'FLIP', 'GRID', 'UNDO', 'CLEAR'] as const;
const tool = ref<'PLOT' | 'LINE' | 'FILL'>('PLOT');
const selectedColor = ref(1);
const palettePage = ref(0);
const grid = ref(false);
const zoom = ref(false);
const menu = ref('');
const message = ref('');
const copied = shallowRef<Cel>();
const draft = shallowRef<Uint8Array>();
const revision = ref(0);
const undoStack: Costume[] = [];
let lineStart: Point | undefined;
let previous: Point | undefined;
let startingPixels: Uint8Array | undefined;
let pointer: number | undefined;
let pointerColor = 1;

const displayPalette = computed(() => [ega[2], ...project.value.palette.slice(1)]);
const archiveCostumes = computed(() => props.game?.resources('DCOS').map(({ id, room }) => ({
  id, label: `COST ${number(id)}   ${props.game?.rooms.find(item => item.id === room)?.name ?? `ROOM ${room}`}`,
})) ?? []);
const currentCel = computed(() => project.value.limbs[limb.value][cel.value]);
const currentTracks = computed(() => project.value.chores[chore.value * 4 + direction.value]?.tracks ?? []);
const currentTrack = computed(() => currentTracks.value[limb.value]);
const currentFrames = computed(() => frameSlots(currentTrack.value));
const currentSlot = computed(() => {
  const track = currentTrack.value;
  const slots = currentFrames.value;
  return slots[track?.loop ? frame.value % slots.length : Math.min(frame.value, slots.length - 1)] ?? -1;
});
const frameCount = computed(() => Math.max(1, ...currentTracks.value.map(track => frameSlots(track).length)));
const hasLoops = computed(() => currentTracks.value.some(track => track?.loop && frameSlots(track).length > 1));
const maxCel = computed(() => Math.max(63, ...Object.keys(project.value.limbs[limb.value]).map(Number)));
const maxChore = computed(() => Math.max(31, ...Object.keys(project.value.chores).map(key => Math.floor(+key / 4))));
const maxList = computed(() => Math.max(31, (currentTrack.value?.cels.length ?? 0) - 1));
const swatches = computed(() => {
  const palette = project.value.palette;
  if (palette.length === 16 && palette[0].join() === ega[2].join()) {
    return [1, 2, 0, ...Array.from({ length: 13 }, (_, i) => i + 3)];
  }
  return Array.from({ length: 16 }, (_, i) => i + palettePage.value * 16);
});

const ids = (start: number) => Array.from({ length: 12 }, (_, index) => index + start);
const number = (value: number) => String(value).padStart(2, '0');
const shift = (start: number, delta: number, max: number) => Math.max(0, Math.min(max - 11, start + delta));

function reset(next: Costume, id?: number) {
  project.value = next;
  if (id !== undefined) gameCostume.value = id;
  undoStack.length = 0;
  copied.value = undefined;
  menu.value = '';
  dialog.value = '';
  message.value = '';
  playing.value = false;
  palettePage.value = 0;
  selectedColor.value = 1;
  tool.value = 'PLOT';
  const first = Number(Object.keys(next.chores).find(key => next.chores[+key].tracks.some(track =>
    track?.cels.some(code => code >= 0))) ?? 2);
  chore.value = Math.floor(first / 4);
  direction.value = first % 4;
  const tracks = next.chores[first]?.tracks ?? [];
  limb.value = Math.max(0, tracks.findIndex(track => track?.cels.some(code => code >= 0)));
  cel.value = tracks[limb.value]?.cels.find(code => code >= 0) ?? 0;
  limbStart.value = Math.max(0, limb.value - 11);
  celStart.value = Math.max(0, cel.value - 5);
  listStart.value = frame.value = 0;
  choreStart.value = Math.max(0, chore.value - 5);
  zoom.value = grid.value = false;
}

function loadCostume(id: number) {
  if (!props.game) return;
  try {
    reset(readCostume(props.game, id), id);
  } catch (error) { dialog.value = ''; message.value = String(error); }
}

watch(() => props.game, game => {
  gameCostume.value = undefined;
  if (game && props.active) dialog.value = 'costume';
});
watch(() => props.active, active => {
  if (!active) { playing.value = false; menu.value = ''; dialog.value = ''; }
});

function replace(next: Costume) {
  undoStack.push(project.value);
  if (undoStack.length > 40) undoStack.shift();
  project.value = next;
}

function updateCel(next: Cel) {
  const limbs = [...project.value.limbs];
  limbs[limb.value] = { ...limbs[limb.value], [cel.value]: next };
  replace({ ...project.value, limbs });
}

function updateTrack(slot: number, code: number, remove = false) {
  const animation = chore.value * 4 + direction.value;
  const tracks = Array.from({ length: 16 }, (_, index) => currentTracks.value[index] ?? null);
  const cels = [...(currentTrack.value?.cels ?? [])];
  if (remove) cels.splice(slot, 1);
  else {
    while (cels.length < slot) cels.push(EMPTY);
    cels[slot] = code;
  }
  tracks[limb.value] = cels.length ? { cels, loop: currentTrack.value?.loop ?? true } : null;
  replace({ ...project.value, chores: { ...project.value.chores, [animation]: { tracks } } });
  playing.value = false;
  frame.value = Math.max(0, Math.min(currentFrames.value.indexOf(slot), frameCount.value - 1));
}

function toggleLoop() {
  if (!currentTrack.value) return;
  const animation = chore.value * 4 + direction.value;
  const tracks = [...currentTracks.value];
  tracks[limb.value] = { ...currentTrack.value, loop: !currentTrack.value.loop };
  replace({ ...project.value, chores: { ...project.value.chores, [animation]: { tracks } } });
}

function selectChore(id: number) {
  chore.value = id;
  listStart.value = 0;
  playing.value = false;
  frame.value = 0;
}

function selectDirection(id: number) {
  direction.value = id;
  selectChore(chore.value);
}

function selectLimb(id: number) {
  limb.value = id;
  cel.value = celStart.value = listStart.value = 0;
}

function selectCel(id: number, append: boolean) {
  cel.value = id;
  if (append && currentCel.value && (currentTrack.value?.cels.length ?? 0) < 32) {
    updateTrack(currentTrack.value?.cels.length ?? 0, id);
  }
}

function selectSlot(slot: number, insert: boolean) {
  const code = currentTrack.value?.cels[slot];
  if ((insert || code === undefined) && currentCel.value && slot < 32) {
    updateTrack(slot, cel.value);
    return;
  }
  if (code === undefined) return;
  playing.value = false;
  frame.value = Math.max(0, currentFrames.value.indexOf(slot));
  if (code >= 0) {
    cel.value = code;
    if (code < celStart.value || code >= celStart.value + 12) celStart.value = shift(code, 0, maxCel.value);
  }
}

function playback() {
  if (playing.value) { playing.value = false; return; }
  if (frameCount.value > 1) {
    frame.value = 0;
    playing.value = true;
  }
}

function step() {
  playing.value = false;
  frame.value = (frame.value + 1) % frameCount.value;
}

watchEffect(onCleanup => {
  if (!playing.value) return;
  const timer = window.setInterval(() => {
    if (frame.value + 1 >= frameCount.value && !hasLoops.value) playing.value = false;
    else frame.value = (frame.value + 1) % (hasLoops.value ? 0x40000000 : frameCount.value);
  }, 1000 / speed.value);
  onCleanup(() => clearInterval(timer));
});

function paintSurface() {
  const pixels = new Uint8Array(width * height);
  const selected = currentCel.value;
  if (selected) blitCel(pixels, width, height, selected, anchor[0] + selected.x, anchor[1] + selected.y);
  return pixels;
}

watchEffect(() => {
  if (!drawing.value) return;
  void revision.value;
  const pixels = draft.value ?? paintSurface();
  if (!zoom.value) { paintIndexed(drawing.value, pixels, displayPalette.value, width, height); return; }
  const enlarged = Uint8Array.from(pixels, (_, i) => {
    const x = Math.floor((i % width) / 2) + 36;
    const y = Math.floor(Math.floor(i / width) / 2) + 48;
    return pixels[y * width + x];
  });
  paintIndexed(drawing.value, enlarged, displayPalette.value, width, height);
});

watchEffect(() => {
  if (!preview.value) return;
  const pixels = new Uint8Array(width * height);
  drawChore(pixels, width, height, project.value, chore.value, direction.value, frame.value, ...previewAnchor);
  paintIndexed(preview.value, pixels, displayPalette.value, width, height);
});

function point(event: PointerEvent): Point {
  const rect = drawing.value!.getBoundingClientRect();
  const x = Math.max(0, Math.min(width - 1, Math.floor((event.clientX - rect.left) * width / rect.width)));
  const y = Math.max(0, Math.min(height - 1, Math.floor((event.clientY - rect.top) * height / rect.height)));
  return zoom.value ? [Math.floor(x / 2) + 36, Math.floor(y / 2) + 48] : [x, y];
}

function drawStart(event: PointerEvent) {
  if (pointer !== undefined || (event.button !== 0 && event.button !== 2)) return;
  drawing.value!.setPointerCapture(event.pointerId);
  pointer = event.pointerId;
  pointerColor = event.button === 2 ? 0 : selectedColor.value;
  previous = lineStart = point(event);
  startingPixels = paintSurface();
  draft.value = startingPixels.slice();
  if (tool.value === 'FILL') flood(draft.value, width, height, lineStart, pointerColor);
  else drawMove(event);
  revision.value++;
}

function drawMove(event: PointerEvent) {
  if (event.pointerId !== pointer || !draft.value || !previous || tool.value === 'FILL') return;
  const end = point(event);
  if (tool.value === 'LINE') draft.value.set(startingPixels!);
  const pixels = draft.value;
  stroke(tool.value === 'LINE' ? lineStart! : previous, end, (x, y) => { pixels[y * width + x] = pointerColor; });
  previous = end;
  revision.value++;
}

function drawEnd(event: PointerEvent, commit: boolean) {
  if (event.pointerId !== pointer || !draft.value) return;
  if (commit) drawMove(event);
  if (commit && draft.value.some((color, i) => color !== startingPixels![i])) {
    try { updateCel(celFromSurface(draft.value, width, height, anchor, currentCel.value)); }
    catch (error) { message.value = String(error); }
  }
  draft.value = undefined;
  pointer = undefined;
}

function useTool(name: typeof tools[number]) {
  const selected = currentCel.value;
  switch (name) {
    case 'PLOT': case 'LINE': case 'FILL': tool.value = name; break;
    case 'ZOOM': zoom.value = !zoom.value; break;
    case 'GRID': grid.value = !grid.value; break;
    case 'COPY': if (selected) copied.value = selected; break;
    case 'DROP': if (copied.value) updateCel({ ...copied.value, pixels: [...copied.value.pixels] }); break;
    case 'FLIP': if (selected) updateCel({ ...selected, pixels: selected.pixels.map((_, i) =>
      selected.pixels[i - i % selected.width + selected.width - 1 - i % selected.width]) }); break;
    case 'UNDO': if (undoStack.length) project.value = undoStack.pop()!; break;
    case 'CLEAR': if (selected) updateCel({ ...selected, width: 0, height: 0, pixels: [] }); break;
  }
}

function offsetCel(axis: 'moveX' | 'moveY', delta: number) {
  const selected = currentCel.value;
  if (selected) updateCel({ ...selected, [axis]: Math.max(-32768, Math.min(32767, selected[axis] + delta)) });
}

function saveProject(binary: boolean) {
  menu.value = '';
  let content: BlobPart;
  try { content = binary ? writeCostume(project.value) : JSON.stringify(project.value); }
  catch (error) { message.value = String(error); return; }
  const url = URL.createObjectURL(new Blob([content], { type: binary ? 'application/octet-stream' : 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${project.value.name.replace(/[^\w-]+/g, '-').toLowerCase()}.${binary ? 'cost' : 'byle.json'}`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function openProject(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (/\.json$/i.test(file.name)) reset(parseProject(await file.text()));
    else reset(readCostumeFile(new Uint8Array(await file.arrayBuffer()), file.name.replace(/\.[^.]*$/, '')));
  } catch (error) { message.value = String(error); }
  finally { input.value = ''; }
}

function openHelp() {
  menu.value = '';
  helpPage.value = 0;
  dialog.value = 'help';
  playing.value = false;
}

function closeDialog() {
  if (dialog.value === 'help') localStorage.setItem('webscumm.byle.help.v2', 'seen');
  dialog.value = '';
}

function startPractice() {
  closeDialog();
  reset(practiceCostume());
  playback();
}

function keyboard(event: KeyboardEvent) {
  if (!props.active) return;
  if (event.key === 'F1') { event.preventDefault(); openHelp(); }
  if (event.key === 'Escape') { menu.value = ''; message.value = ''; playing.value = false; }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    useTool('UNDO');
  }
}

onMounted(() => {
  if (props.active && !localStorage.getItem('webscumm.byle.help.v2')) openHelp();
  window.addEventListener('keydown', keyboard);
});
onUnmounted(() => window.removeEventListener('keydown', keyboard));
</script>

<template>
  <section class="byle-editor" aria-label="BYLE costume editor">
      <div class="byle-menu" aria-label="BYLE menus">
        <button v-for="item in ['FILE', 'EDIT', 'BRUSH', 'ZOOM', 'CHORES', 'SPECIAL']" :key="item"
          type="button" :aria-expanded="menu === item" @click="menu = menu === item ? '' : item">
          <PixelText :text="item" />
        </button>
        <PixelText class="byle-project-name" :text="project.name.slice(0, 19)" />
        <button type="button" class="byle-help-key" aria-keyshortcuts="F1" @click="openHelp"><PixelText text="F1 HELP" /></button>
      </div>

      <canvas ref="drawing" class="byle-drawing" aria-label="Cel painting area"
        @pointerdown.prevent="drawStart" @pointermove="drawMove" @pointerup="drawEnd($event, true)"
        @pointercancel="drawEnd($event, false)" @lostpointercapture="drawEnd($event, false)" @contextmenu.prevent />
      <div v-if="grid" class="byle-grid" :class="{ zoom }" aria-hidden="true" />
      <div class="byle-divider" />
      <canvas ref="preview" class="byle-preview" aria-label="Chore animation preview" />

      <div class="byle-tools" aria-label="Drawing tools">
        <button v-for="item in tools" :key="item" type="button" class="byle-bevel"
          :class="{ inverted: tool === item || (item === 'ZOOM' && zoom) || (item === 'GRID' && grid) }"
          :disabled="(item === 'DROP' && !copied) || (['COPY', 'FLIP', 'CLEAR'].includes(item) && !currentCel)"
          @click="useTool(item)"><PixelText :text="item" /></button>
      </div>

      <div class="byle-table limb-row" aria-label="Limbs">
        <PixelText text="LIMB" />
        <button class="byle-arrow" type="button" aria-label="Previous limbs" @click="limbStart = shift(limbStart, -1, 15)"><PixelText text="<" /></button>
        <div class="byle-cells">
          <button v-for="id in ids(limbStart)" :key="id" type="button" :aria-label="`Limb ${number(id)}`"
            :aria-pressed="limb === id" :class="{ lit: Object.keys(project.limbs[id]).length, picked: limb === id }"
            @click="selectLimb(id)"><PixelText :text="number(id)" /></button>
        </div>
        <button class="byle-arrow" type="button" aria-label="Next limbs" @click="limbStart = shift(limbStart, 1, 15)"><PixelText text=">" /></button>
      </div>

      <div class="byle-table cel-row" aria-label="Cels">
        <PixelText text="CEL" />
        <button class="byle-arrow" type="button" aria-label="Previous cels" @click="celStart = shift(celStart, -1, maxCel)"><PixelText text="<" /></button>
        <div class="byle-cells">
          <button v-for="id in ids(celStart)" :key="id" type="button" :aria-label="`Cel ${number(id)}`" :aria-pressed="cel === id"
            :class="{ picked: cel === id, missing: !project.limbs[limb][id] }" :disabled="id > 63 && !project.limbs[limb][id]"
            @click="selectCel(id, $event.shiftKey)"><PixelText :text="number(id)" /></button>
        </div>
        <button class="byle-arrow" type="button" aria-label="Next cels" @click="celStart = shift(celStart, 1, maxCel)"><PixelText text=">" /></button>
      </div>

      <div class="byle-table chore-row" aria-label="Chores">
        <PixelText text="CHORE" />
        <button class="byle-arrow" type="button" aria-label="Previous chores" @click="choreStart = shift(choreStart, -1, maxChore)"><PixelText text="<" /></button>
        <div class="byle-cells">
          <button v-for="id in ids(choreStart)" :key="id" type="button" :aria-label="`Chore ${number(id)}`" :aria-pressed="chore === id"
            :class="{ picked: chore === id, missing: !project.chores[id * 4 + direction] }"
            @click="selectChore(id)"><PixelText :text="number(id)" /></button>
        </div>
        <button class="byle-arrow" type="button" aria-label="Next chores" @click="choreStart = shift(choreStart, 1, maxChore)"><PixelText text=">" /></button>
      </div>

      <div class="byle-table list-row" aria-label="Choreography cel list">
        <PixelText text="LIST" />
        <button class="byle-arrow" type="button" aria-label="Previous list slots" @click="listStart = shift(listStart, -1, maxList)"><PixelText text="<" /></button>
        <div class="byle-cells">
          <button v-for="id in ids(listStart)" :key="id" type="button" :aria-label="`List slot ${number(id)}`"
            :class="{ cursor: id === currentSlot }"
            @click="selectSlot(id, $event.shiftKey)" @contextmenu.prevent="updateTrack(id, EMPTY, true)"
            @keydown.delete.prevent="updateTrack(id, EMPTY, true)">
            <PixelText v-if="(currentTrack?.cels[id] ?? -1) >= 0" :text="number(currentTrack!.cels[id])" />
            <span v-else-if="id === (currentTrack?.cels.length ?? 0) || currentTrack?.cels[id] === EMPTY" class="list-mark" />
            <PixelText v-else-if="(currentTrack?.cels[id] ?? -1) < -1" text="*" />
          </button>
        </div>
        <button class="byle-arrow" type="button" aria-label="Next list slots" @click="listStart = shift(listStart, 1, maxList)"><PixelText text=">" /></button>
      </div>

      <div class="byle-speed" aria-label="Animation speed">
        <PixelText text="SPEED" />
        <div class="speed-track">
          <button type="button" aria-label="Slower" @click="speed = Math.max(1, speed - 1)"><PixelText text="<" /></button>
          <input v-model.number="speed" type="range" aria-label="Frames per second" min="1" max="24">
          <button type="button" aria-label="Faster" @click="speed = Math.min(24, speed + 1)"><PixelText text=">" /></button>
        </div>
      </div>

      <div class="byle-directions" aria-label="Direction">
        <button v-for="(name, id) in DIRECTIONS" :key="name" type="button" class="byle-bevel"
          :class="[name.toLowerCase(), { picked: direction === id }]" :aria-pressed="direction === id"
          @click="selectDirection(id)"><PixelText :text="name" /></button>
      </div>

      <div class="byle-info" aria-label="Cel information">
        <button type="button" title="Click to increase the X offset of following limbs. Shift or right-click to decrease."
          :aria-label="`XREL ${currentCel?.moveX ?? 0}`" @click="offsetCel('moveX', $event.shiftKey ? -1 : 1)"
          @contextmenu.prevent="offsetCel('moveX', -1)"><PixelText :text="`XREL = ${currentCel?.moveX ?? 0}`" /></button>
        <button type="button" title="Click to increase the Y offset of following limbs. Shift or right-click to decrease."
          :aria-label="`YREL ${currentCel?.moveY ?? 0}`" @click="offsetCel('moveY', $event.shiftKey ? -1 : 1)"
          @contextmenu.prevent="offsetCel('moveY', -1)"><PixelText :text="`YREL = ${currentCel?.moveY ?? 0}`" /></button>
        <PixelText :text="`SIZE = ${currentCel?.pixels.filter(Boolean).length ?? 0}`" />
      </div>

      <div class="byle-play" aria-label="Playback">
        <button type="button" class="byle-bevel" @click="playback"><PixelText :text="playing ? 'STOP' : 'START'" /></button>
        <button type="button" class="byle-bevel" @click="step"><PixelText text="STEP" /></button>
        <button type="button" class="byle-bevel add-cel" aria-label="CEL, append selected cel to list"
          :disabled="!currentCel || (currentTrack?.cels.length ?? 0) >= 32"
          @click="updateTrack(currentTrack?.cels.length ?? 0, cel)"><PixelText text="CEL" /></button>
      </div>

      <div class="byle-palette" aria-label="Palette">
        <div class="byle-color" :style="{ '--brush': `rgb(${displayPalette[selectedColor].join(' ')})` }" />
        <div class="byle-swatches">
          <button v-for="id in swatches" :key="id" type="button" :style="{ background: `rgb(${displayPalette[id].join(' ')})` }"
            :aria-label="id === 0 ? 'Transparent color' : `Color ${id}`" :aria-pressed="selectedColor === id" @click="selectedColor = id" />
        </div>
      </div>

      <div v-if="menu" class="byle-popover" :data-menu="menu">
        <template v-if="menu === 'FILE'">
          <button type="button" @click="reset(blankCostume())"><PixelText text="NEW COSTUME" /></button>
          <button type="button" @click="menu = ''; projectInput?.click()"><PixelText text="LOAD COSTUME..." /></button>
          <button type="button" @click="saveProject(false)"><PixelText text="SAVE COSTUME..." /></button>
          <button type="button" @click="saveProject(true)"><PixelText text="MAKE COSTUME..." /></button>
          <button type="button" class="menu-divider" @click="emit('importGame'); menu = ''"><PixelText text="OPEN SCUMM DATA..." /></button>
          <button v-if="game" type="button" @click="dialog = 'costume'; menu = ''"><PixelText text="COSTUMES FROM DATA..." /></button>
          <a href="#rooms" @click="menu = ''"><PixelText text="ROOM VIEWER" /></a>
          <button type="button" class="menu-divider" @click="startPractice"><PixelText text="PRACTICE COSTUME" /></button>
        </template>
        <template v-else-if="menu === 'EDIT'">
          <button type="button" @click="useTool('UNDO'); menu = ''"><PixelText text="UNDO" /></button>
          <button type="button" :disabled="!currentCel" @click="useTool('CLEAR'); menu = ''"><PixelText text="CLEAR CEL" /></button>
        </template>
        <template v-else-if="menu === 'BRUSH'">
          <button type="button" :disabled="!currentCel" @click="useTool('COPY'); menu = ''"><PixelText text="COPY CEL" /></button>
          <button type="button" :disabled="!copied" @click="useTool('DROP'); menu = ''"><PixelText text="DROP CEL" /></button>
          <button type="button" :disabled="!currentCel" @click="useTool('FLIP'); menu = ''"><PixelText text="FLIP X" /></button>
        </template>
        <template v-else-if="menu === 'ZOOM'">
          <button type="button" @click="useTool('ZOOM'); menu = ''"><PixelText :text="zoom ? 'ACTUAL SIZE' : 'ZOOM 2X'" /></button>
          <button type="button" @click="useTool('GRID'); menu = ''"><PixelText :text="grid ? 'HIDE GRID' : 'SHOW GRID'" /></button>
        </template>
        <template v-else-if="menu === 'CHORES'">
          <button type="button" :disabled="!currentTrack" @click="toggleLoop(); menu = ''">
            <PixelText :text="currentTrack?.loop ? 'PLAY LIMB ONCE' : 'LOOP LIMB'" />
          </button>
          <button type="button" :disabled="(currentTrack?.cels.length ?? 0) >= 32"
            @click="updateTrack(currentTrack?.cels.length ?? 0, EMPTY); menu = ''"><PixelText text="INSERT EMPTY CEL" /></button>
          <button type="button" @click="replace({ ...project, baseChore: chore }); menu = ''"><PixelText text="SET BASE POSE" /></button>
          <button type="button" :disabled="project.baseChore === undefined"
            @click="replace({ ...project, baseChore: undefined }); menu = ''"><PixelText text="CLEAR BASE POSE" /></button>
        </template>
        <template v-else>
          <button v-if="project.palette.length > 16" type="button" @click="palettePage = 1 - palettePage; menu = ''"><PixelText text="NEXT PALETTE BANK" /></button>
          <button type="button" @click="selectedColor = 0; menu = ''"><PixelText text="TRANSPARENT BRUSH" /></button>
          <button type="button" @click="openHelp"><PixelText text="HELP     F1" /></button>
        </template>
      </div>
      <RetroPicker v-if="dialog === 'costume'" :title="`COSTUMES / ${archiveName.slice(0, 24)}`" :items="archiveCostumes"
        :selected="gameCostume" @close="closeDialog" @load="loadCostume" />
      <RetroDialog v-else-if="dialog === 'help'" class="byle-help" title="BYLE / Справка" title-font="help" @close="closeDialog">
        <div v-if="helpPage === 0" class="retro-copy" lang="ru">
          <PixelText font="help" class="retro-heading" text="Редактор анимаций SCUMM" />
          <PixelText font="help" text="Слева рисуешь кадр (CEL)." />
          <PixelText font="help" text="Справа видишь анимацию." />
          <PixelText font="help" text="LIMB выбирает слой, CHORE выбирает действие." />
          <PixelText font="help" text="В LIST задан порядок кадров." />
          <PixelText font="help" text="START запускает показ, STEP листает кадры." />
        </div>
        <div v-else class="retro-copy" lang="ru">
          <PixelText font="help" class="retro-heading" text="Как собрать анимацию" />
          <PixelText font="help" text="1. FILE / NEW COSTUME. Рисуй слева." />
          <PixelText font="help" text="2. Нижняя кнопка CEL добавит кадр в LIST." />
          <PixelText font="help" text="3. Выбери CEL 01 и нарисуй следующий кадр." />
          <PixelText font="help" text="4. Добавь его в LIST и нажми START." />
          <PixelText font="help" text="Правая кнопка стирает или удаляет кадр." />
        </div>
        <div class="retro-actions" lang="ru">
          <button type="button" class="retro-action" data-initial @click="startPractice"><PixelText font="help" text="Открыть пример" /></button>
          <button type="button" class="retro-action" @click="helpPage = 1 - helpPage"><PixelText font="help" :text="helpPage ? '< Назад' : 'Как рисовать >'" /></button>
          <button type="button" class="retro-action" @click="closeDialog"><PixelText font="help" text="Закрыть" /></button>
        </div>
      </RetroDialog>
      <RetroDialog v-else-if="message" title="BYLE" @close="message = ''">
        <p class="retro-error" role="alert"><PixelText :text="message.slice(0, 62)" /></p>
        <div class="retro-actions"><button type="button" class="retro-action" @click="message = ''"><PixelText text="OK" /></button></div>
      </RetroDialog>
      <input ref="projectInput" type="file" accept=".json,.cost,.cos" hidden @change="openProject">
  </section>
</template>

<style src="./byle.css"></style>
