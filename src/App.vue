<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef } from 'vue';
import Byle from './byle/Byle.vue';
import PixelText from './byle/PixelText.vue';
import RetroDialog from './byle/RetroDialog.vue';
import RetroScreen from './byle/RetroScreen.vue';
import { BrowserAudio, type MusicLibrary } from './engine/audio/browser-audio.ts';
import { loadTrackFiles } from './engine/audio/cd.ts';
import oplSource from './engine/audio/vendor/opl-source.tar.gz?url';
import soundFontSource from './engine/audio/vendor/mt32-source.tar.gz?url';
import { monkeyCdTracks } from '../TSoMI/music.ts';
import { GameArchive } from './engine/archive.ts';
import monkeyPackUrl from '../TSoMI/assets/monkey1.wsc.gz?url';
import { monkeyCdResources, MONKEY1_INTRO_TRACK, MONKEY1_TITLE, MONKEY1_CD_PICKER, MONKEY1_CD_ERROR } from '../TSoMI/game.ts';
import { loadMonkeyPack } from '../TSoMI/pack.ts';
import type { GameResources } from './engine/game/resources.ts';
import GamePlayer from './GamePlayer.vue';
import RoomViewer from './RoomViewer.vue';

const currentScreen = () => location.hash === '#rooms' ? 'rooms' : location.hash === '#byle' ? 'byle' : 'play';
const screen = ref(currentScreen());
const game = shallowRef<GameArchive>();
const playSource = shallowRef<GameResources>();
const localSource = shallowRef<GameResources>();
const localArchiveName = ref('');
const audio = shallowRef<BrowserAudio>();
const selected = ref<'prepared' | 'local'>('prepared');
const launching = ref(false);
const soundLoading = ref(false);
const launchError = ref('');
const tracks = shallowRef<MusicLibrary>(new Map());
const bank = shallowRef<Awaited<ReturnType<typeof import('./engine/audio/soundfont.ts').loadSoundFont>>>();
const bankName = ref('');
const trackInput = ref<HTMLInputElement>();
const bankInput = ref<HTMLInputElement>();
let prepared: GameResources | undefined;
const input = ref<HTMLInputElement>();
const archiveOpen = ref(false);
const archiveName = ref('');
const localName = ref('');
const error = ref('');
const loading = ref(false);

function syncScreen() {
  screen.value = currentScreen();
  if (screen.value !== 'play') showLauncher();
}
function openArchive() { error.value = ''; archiveOpen.value = true; }

async function launch() {
  launching.value = true;
  launchError.value = '';
  let device: BrowserAudio | undefined;
  try {
    device = new BrowserAudio(new AudioContext(), tracks.value, monkeyCdTracks, bank.value);
    audio.value = device;
    device.unlock();
    const [resources] = await Promise.all([
      selected.value === 'local' ? localSource.value : prepared ?? loadMonkeyPack(monkeyPackUrl),
      device.prepare(MONKEY1_INTRO_TRACK),
    ]);
    if (!resources) throw new Error('SELECT A GAME ARCHIVE FIRST.');
    if (selected.value === 'prepared') prepared = resources;
    if (audio.value === device) playSource.value = resources;
  } catch (cause) {
    if (audio.value === device) {
      showLauncher();
      launchError.value = cause instanceof Error ? cause.message : String(cause);
    }
  } finally { launching.value = false; }
}

function showLauncher() {
  playSource.value = undefined;
  audio.value?.dispose();
  audio.value = undefined;
}

async function openSoundFiles(event: Event, kind: 'tracks' | 'bank') {
  const picker = event.target as HTMLInputElement;
  const files = [...(picker.files ?? [])];
  picker.value = '';
  if (!files.length) return;
  launchError.value = '';
  soundLoading.value = true;
  try {
    if (kind === 'tracks') tracks.value = await loadTrackFiles(files);
    else {
      const { loadSoundFont } = await import('./engine/audio/soundfont.ts');
      bank.value = await loadSoundFont(files[0]);
      bankName.value = files[0].name;
    }
  } catch (cause) {
    launchError.value = cause instanceof Error ? cause.message : String(cause);
  } finally { soundLoading.value = false; }
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
      localSource.value = resources;
      localArchiveName.value = name;
      selected.value = 'local';
      launchError.value = '';
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
  if (!import.meta.env.DEV) return;
  try {
    const response = await fetch('./__game/manifest');
    if (response.ok && response.headers.get('Content-Type')?.includes('application/json')) {
      const manifest = await response.json();
      if (typeof manifest.stem === 'string') localName.value = manifest.stem;
    }
  } catch { /* The local development archive is optional. */ }
});
onUnmounted(() => {
  window.removeEventListener('hashchange', syncScreen);
  showLauncher();
});
</script>

<template>
  <RetroScreen>
    <GamePlayer v-if="screen === 'play' && playSource" :title="MONKEY1_TITLE" :source="playSource" :audio="audio" @menu="showLauncher" />
    <section v-else-if="screen === 'play'" class="game-start" aria-label="WebSCUMM start menu" :inert="archiveOpen">
      <h1><PixelText :text="MONKEY1_TITLE" /></h1>
      <div class="game-setup">
        <div class="setup-line">
          <PixelText text="GAME DATA" />
          <div class="setup-options">
            <button class="retro-action" type="button" :disabled="launching" :aria-pressed="selected === 'prepared'"
              @click="selected = 'prepared'; launchError = ''"><PixelText text="WEB PACK" /></button>
            <button v-if="localSource" class="retro-action" type="button" :disabled="launching" :aria-pressed="selected === 'local'"
              @click="selected = 'local'; launchError = ''"><PixelText :text="localArchiveName.toUpperCase().slice(0, 16)" /></button>
            <button class="retro-action" type="button" :disabled="launching" @click="openArchive"><PixelText text="OPEN LOCAL CD DATA" /></button>
          </div>
        </div>
        <div class="setup-line">
          <PixelText text="AUDIO" />
          <div class="setup-options">
            <PixelText text="ADLIB + CD MUSIC" />
            <button class="retro-action" type="button" :disabled="launching || soundLoading" @click="trackInput?.click()">
              <PixelText :text="tracks.size ? `CD TRACKS: ${tracks.size}` : 'LOAD CD TRACKS'" />
            </button>
            <button v-if="tracks.size" class="retro-action" type="button" :disabled="launching || soundLoading"
              @click="tracks = new Map()"><PixelText text="RESET TRACKS" /></button>
          </div>
        </div>
        <div class="setup-line">
          <PixelText text="MIDI" />
          <div class="setup-options">
            <button class="retro-action" type="button" :disabled="launching || soundLoading" @click="bankInput?.click()">
              <PixelText text="LOAD SOUNDFONT" />
            </button>
            <PixelText v-if="bankName" :text="bankName.toUpperCase().slice(0, 24)" role="status" />
            <PixelText v-else text="FOR MIDI TRACKS (.SF2)" />
          </div>
        </div>
      </div>
      <p v-if="launchError" class="launch-error" role="alert">{{ launchError }}</p>
      <button class="retro-action play-action" type="button" :disabled="launching || soundLoading" @click="launch">
        <PixelText :text="launching ? 'LOADING GAME...' : soundLoading ? 'READING AUDIO...' : 'PLAY'" />
      </button>
      <div class="audio-sources">
        <a :href="oplSource" download><PixelText text="OPL SOURCE" /></a>
        <a :href="soundFontSource" download><PixelText text="SOUNDFONT SOURCE" /></a>
      </div>
      <input ref="trackInput" aria-label="CD audio files" type="file" accept=".mp3,.ogg,.opus,.flac,.wav,.m4a,.mid,.midi,.cue,.bin" multiple hidden
        @change="openSoundFiles($event, 'tracks')">
      <input ref="bankInput" aria-label="SoundFont file" type="file" accept=".sf2" hidden @change="openSoundFiles($event, 'bank')">
    </section>
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
    <input ref="input" aria-label="SCUMM archive files" type="file" accept=".000,.001" multiple hidden @change="openGame">
  </RetroScreen>
</template>

<style scoped>
.game-start { position: absolute; inset: 0; display: grid; align-content: center; justify-items: center; gap: 10px; }
.game-start h1 { margin: 0 0 5px; color: #55ffff; line-height: 1; transform: scale(2); }
.game-setup { display: grid; gap: 5px; width: 260px; padding: 7px; border: 1px solid #aaa; }
.setup-line { display: grid; grid-template-columns: 43px 1fr; align-items: center; gap: 2px; }
.setup-options { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
.setup-options .retro-action { min-height: 13px; }
.play-action { min-height: 16px; min-width: 54px; }
.launch-error { margin: 0; max-width: 258px; color: #ff9a9a; font: 6px/1.4 monospace; }
.audio-sources { position: absolute; inset: auto 8px 7px; display: flex; gap: 8px; }
.audio-sources a { color: #aaa; display: flex; }
.audio-sources a:hover { color: white; }
</style>
