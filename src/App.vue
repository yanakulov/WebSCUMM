<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef } from 'vue';
import Byle from './byle/Byle.vue';
import PixelText from './byle/PixelText.vue';
import RetroDialog from './byle/RetroDialog.vue';
import RetroScreen from './byle/RetroScreen.vue';
import { GameArchive } from './engine/archive.ts';
import monkeyPackUrl from '../TSoMI/assets/monkey1.wsc.gz?url';
import { monkeyCdResources, MONKEY1_TITLE, MONKEY1_CD_PICKER, MONKEY1_CD_ERROR } from '../TSoMI/game.ts';
import { loadMonkeyPack } from '../TSoMI/pack.ts';
import type { GameResources } from './engine/game/resources.ts';
import GamePlayer from './GamePlayer.vue';
import RoomViewer from './RoomViewer.vue';

const currentScreen = () => location.hash === '#rooms' ? 'rooms' : location.hash === '#byle' ? 'byle' : 'play';
const screen = ref(currentScreen());
const game = shallowRef<GameArchive>();
const playSource = shallowRef<GameResources>();
const packError = ref('');
const packLoading = ref(false);
const input = ref<HTMLInputElement>();
const archiveOpen = ref(false);
const archiveName = ref('');
const localName = ref('');
const error = ref('');
const loading = ref(false);

function syncScreen() {
  screen.value = currentScreen();
  if (screen.value === 'play') void loadPreparedGame();
}
function openArchive() { error.value = ''; archiveOpen.value = true; }

async function loadPreparedGame() {
  if (playSource.value || packLoading.value || packError.value) return;
  packLoading.value = true;
  try {
    const prepared = await loadMonkeyPack(monkeyPackUrl);
    playSource.value ??= prepared;
  } catch (cause) {
    packError.value = cause instanceof Error ? cause.message : String(cause);
  } finally { packLoading.value = false; }
}

async function mountArchive(name: string, read: () => Promise<ArrayBuffer[]>) {
  const forPlayer = screen.value === 'play';
  loading.value = true;
  error.value = '';
  try {
    const [index, disk] = await read();
    const archive = new GameArchive(new Uint8Array(index), new Uint8Array(disk));
    if (forPlayer) {
      const resources = monkeyCdResources(archive);
      if (!resources) throw new Error(MONKEY1_CD_ERROR);
      playSource.value = resources;
    }
    game.value = archive;
    archiveName.value = name;
    archiveOpen.value = false;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally { loading.value = false; }
}

async function openGame(event: Event) {
  const picker = event.target as HTMLInputElement;
  const files = [...(picker.files ?? [])];
  picker.value = '';
  if (!files.length) return;
  const index = files.find(file => /\.000$/i.test(file.name));
  const stem = index?.name.slice(0, -4);
  const disk = files.find(file => file.name.toLowerCase() === `${stem?.toLowerCase()}.001`);
  if (!index || !disk || files.length !== 2) {
    error.value = 'SELECT A MATCHING .000 AND .001 PAIR.';
    return;
  }
  await mountArchive(stem!, () => Promise.all([index.arrayBuffer(), disk.arrayBuffer()]));
}

async function loadLocal() {
  await mountArchive(localName.value, () => Promise.all(['index', 'disk'].map(async kind => {
    const response = await fetch(`./__game/${kind}`);
    if (!response.ok || !response.headers.get('Content-Type')?.includes('application/octet-stream')) {
      throw new Error('THE LOCAL ARCHIVE COULD NOT BE READ.');
    }
    return response.arrayBuffer();
  })));
}

onMounted(async () => {
  window.addEventListener('hashchange', syncScreen);
  if (screen.value === 'play') void loadPreparedGame();
  if (!import.meta.env.DEV) return;
  try {
    const response = await fetch('./__game/manifest');
    if (response.ok && response.headers.get('Content-Type')?.includes('application/json')) {
      const manifest = await response.json();
      if (typeof manifest.stem === 'string') localName.value = manifest.stem;
    }
  } catch { /* The local development archive is optional. */ }
});
onUnmounted(() => window.removeEventListener('hashchange', syncScreen));
</script>

<template>
  <RetroScreen>
    <GamePlayer v-if="screen === 'play'" :title="MONKEY1_TITLE" :source="playSource" :paused="archiveOpen"
      :loading="packLoading || loading" :load-error="packError" @open="openArchive" />
    <Byle v-show="screen === 'byle'" :game="game" :archive-name="archiveName" :active="screen === 'byle'"
      @import-game="openArchive" />
    <RoomViewer v-if="screen === 'rooms'" :game="game" @import-game="openArchive" />
    <RetroDialog v-if="archiveOpen" title="OPEN SCUMM DATA" @close="archiveOpen = false">
      <div class="retro-copy">
        <PixelText :text="screen === 'play' ? MONKEY1_CD_PICKER : 'SELECT .000 AND .001 FROM THE SAME SCUMM V5 GAME.'" />
        <PixelText v-if="archiveName" :text="`MOUNTED: ${archiveName.slice(0, 28)}`" />
        <p v-if="error" class="retro-error" role="alert"><PixelText :text="error.slice(0, 63)" /></p>
        <PixelText v-if="loading" text="READING ARCHIVE..." />
      </div>
      <div class="retro-actions">
        <button type="button" class="retro-action" :disabled="loading" @click="input?.click()"><PixelText text="BROWSE..." /></button>
        <button v-if="localName" type="button" class="retro-action" :disabled="loading" @click="loadLocal">
          <PixelText :text="`LOAD ${localName.slice(0, 20)}`" />
        </button>
        <button type="button" class="retro-action" :disabled="loading" @click="archiveOpen = false"><PixelText text="CANCEL" /></button>
      </div>
    </RetroDialog>
    <input ref="input" type="file" accept=".000,.001" multiple hidden @change="openGame">
  </RetroScreen>
</template>
