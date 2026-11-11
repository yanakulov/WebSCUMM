import { renderAdlib, type OplChip } from './adlib.ts';
import type { GameAudio, SoundCue, SoundPlayback } from './cues.ts';
import { readMidi } from './midi.ts';
import oplUrl from './vendor/opl.wasm?url';

export type TrackInput = string | File | { image: File; start: number; end: number };
export type MusicLibrary = ReadonlyMap<number, TrackInput>;
type Font = Awaited<ReturnType<typeof import('./soundfont.ts').loadSoundFont>>;

interface ActiveSound {
  playback: SoundPlayback;
  gain: GainNode;
  source?: AudioBufferSourceNode;
  fadeEnd?: number;
  startedAt?: number;
}

export class BrowserAudio implements GameAudio {
  private readonly active = new Map<number, ActiveSound>();
  private readonly effects = new Map<number, AudioBuffer>();
  private readonly master: GainNode;
  private opl?: OplChip;
  private musicId?: number;
  private musicCache?: { input: TrackInput; buffer: Promise<AudioBuffer> };
  private masterLevel = 127;

  constructor(
    private readonly context: AudioContext,
    private readonly tracks: MusicLibrary,
    private readonly bundledMusic: ReadonlyMap<number, string>,
    private readonly soundfont?: Font,
  ) {
    this.master = context.createGain();
    this.master.gain.value = 0.75;
    this.master.connect(context.destination);
  }

  async prepare(firstTrack: number) {
    const prefetch = this.primeTrack(firstTrack);
    const response = await fetch(oplUrl);
    if (!response.ok) throw new Error('COULD NOT LOAD ADLIB.');
    const { instance } = await WebAssembly.instantiate(await response.arrayBuffer());
    this.opl = instance.exports as unknown as OplChip;
    await prefetch;
  }

  private async primeTrack(track: number) {
    for (const input of [this.tracks.get(track), this.bundledMusic.get(track)]) {
      if (!input) continue;
      try {
        await this.trackBuffer(input);
        return;
      } catch (cause) { console.warn('Could not load CD track', track, cause); }
    }
  }

  private async trackBuffer(input: TrackInput) {
    if (this.musicCache?.input !== input) this.musicCache = { input, buffer: this.decode(input) };
    const cache = this.musicCache;
    try { return await cache.buffer; }
    catch (cause) {
      if (this.musicCache === cache) this.musicCache = undefined;
      throw cause;
    }
  }

  unlock() {
    if (this.context.state !== 'running' && this.context.state !== 'closed') {
      void this.context.resume().catch(() => {});
    }
  }

  start(id: number, cue: SoundCue) {
    if (cue.type === 'cd' && this.musicId !== undefined) this.stop(this.musicId);
    this.stop(id);
    if (cue.type === 'effect') {
      let buffer = this.effects.get(id);
      if (!buffer && cue.adlib && this.opl) {
        const { samples, sampleRate } = renderAdlib(this.opl, cue.adlib);
        buffer = this.context.createBuffer(1, samples.length, sampleRate);
        buffer.getChannelData(0).set(samples);
      } else if (!buffer && cue.pcm) {
        const { samples, rate } = cue.pcm;
        buffer = this.context.createBuffer(1, samples.length, rate);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) channel[i] = (samples[i] - 128) / 128;
      }
      if (!buffer) return;
      this.effects.set(id, buffer);
      const sound = this.open(id);
      this.play(id, sound, buffer, 0, buffer.duration, 1);
      return sound.playback;
    }

    const track = cue.track;
    if (track === undefined) return;
    const input = this.tracks.get(track);
    const fallback = this.bundledMusic.get(track);
    if (!input && !fallback) return;
    this.musicId = id;
    const sound = this.open(id);
    void this.startTrack(id, sound, cue, track, input, fallback);
    return sound.playback;
  }

  private async startTrack(
    id: number, sound: ActiveSound, cue: Extract<SoundCue, { type: 'cd' }>,
    track: number, input?: TrackInput, fallback?: string,
  ) {
    let buffer: AudioBuffer | undefined;
    let start = 0, duration = 0;
    for (const source of [input, fallback]) {
      if (!source) continue;
      try {
        buffer = await this.trackBuffer(source);
        start = (cue.start ?? 0) / 75;
        duration = Math.min(buffer.duration - start, cue.frames > 0 ? cue.frames / 75 : Infinity);
        if (duration > 0) break;
        buffer = undefined;
      } catch (cause) {
        console.warn('Could not play CD track', track, cause);
      }
      if (this.active.get(id) !== sound) return;
    }
    if (this.active.get(id) !== sound) return;
    if (buffer) this.play(id, sound, buffer, start, duration, cue.loops === 255 ? Infinity : Math.max(1, cue.loops));
    else this.stop(id);
  }

  private async decode(input: TrackInput) {
    if (typeof input === 'string') {
      const response = await fetch(input);
      if (!response.ok) throw new Error('Could not load the bundled CD track.');
      return this.context.decodeAudioData(await response.arrayBuffer());
    }
    if (!(input instanceof File)) {
      const { image, start, end } = input;
      const bytes = await image.slice(start * 2352, end * 2352).arrayBuffer();
      const frames = bytes.byteLength / 4;
      const buffer = this.context.createBuffer(2, frames, 44100);
      const pcm = new DataView(bytes);
      for (let channel = 0; channel < 2; channel++) {
        const samples = buffer.getChannelData(channel);
        for (let i = 0; i < frames; i++) samples[i] = pcm.getInt16(i * 4 + channel * 2, true) / 32768;
      }
      return buffer;
    }

    const bytes = await input.arrayBuffer();
    if (!/\.midi?$/i.test(input.name)) return this.context.decodeAudioData(bytes);
    if (!this.soundfont) throw new Error('MIDI tracks require a SoundFont.');
    const { renderSoundFont } = await import('./soundfont.ts');
    const sequence = readMidi(new Uint8Array(bytes));
    if (!Number.isFinite(sequence.seconds) || sequence.seconds <= 0 || sequence.seconds > 30 * 60) {
      throw new Error('Invalid MIDI track duration.');
    }
    return renderSoundFont(this.context, this.soundfont, sequence);
  }

  private open(id: number) {
    const gain = this.context.createGain();
    gain.connect(this.master);
    const sound: ActiveSound = { playback: {}, gain };
    this.active.set(id, sound);
    return sound;
  }

  private play(id: number, sound: ActiveSound, buffer: AudioBuffer, offset: number, duration: number, loops: number) {
    const source = this.context.createBufferSource();
    sound.source = source;
    sound.playback.seconds = duration * loops;
    source.buffer = buffer;
    source.loop = loops > 1;
    source.loopStart = offset;
    source.loopEnd = offset + duration;
    source.connect(sound.gain);
    source.onended = () => { if (this.active.get(id) === sound) this.stop(id); };
    const now = this.context.currentTime;
    sound.startedAt = now;
    source.start(now, offset);
    const end = Math.min(now + sound.playback.seconds, sound.fadeEnd ?? Infinity);
    if (Number.isFinite(end)) source.stop(end);
  }

  masterVolume(value?: number) {
    if (value === undefined) return this.masterLevel;
    if (value < 0 || value > 127) return -1;
    this.masterLevel = value;
    this.master.gain.value = 0.75 * value / 127;
    return 0;
  }

  volume(id: number, value: number, seconds: number) {
    const sound = this.active.get(id);
    if (!sound || value < 0 || value > 127 || !Number.isFinite(seconds) || seconds < 0) return -1;
    const now = this.context.currentTime;
    const gain = sound.gain.gain;
    if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
    else { gain.cancelScheduledValues(now); gain.setValueAtTime(gain.value, now); }
    if (seconds) gain.linearRampToValueAtTime(value / 127, now + seconds);
    else gain.setValueAtTime(value / 127, now);
    if (!value && seconds) {
      sound.fadeEnd = Math.min(sound.fadeEnd ?? Infinity, now + seconds);
      if (sound.playback.seconds !== undefined) {
        sound.playback.seconds = Math.min(sound.playback.seconds, sound.fadeEnd - (sound.startedAt ?? now));
      }
      if (sound.source && sound.startedAt !== undefined && sound.playback.seconds !== undefined) {
        sound.source.stop(sound.startedAt + sound.playback.seconds);
      }
    }
    return 0;
  }

  stop(id: number) {
    if (!id) {
      for (const sound of this.active.keys()) this.stop(sound);
      return;
    }
    const sound = this.active.get(id);
    if (!sound) return;
    this.active.delete(id);
    if (this.musicId === id) this.musicId = undefined;
    if (sound.source) {
      sound.source.onended = null;
      sound.source.stop();
      sound.source.disconnect();
    }
    sound.gain.disconnect();
  }

  dispose() {
    this.stop(0);
    this.effects.clear();
    this.musicCache = undefined;
    void this.context.close().catch(() => {});
  }
}
