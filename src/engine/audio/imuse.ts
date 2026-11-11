import type { GameAudio, SoundPlayback } from './cues.ts';

interface SoundHost {
  startSound(id: number): void;
  stopSound(id: number): void;
  soundRunning(id: number): boolean;
}

export function imuseCommand(host: SoundHost, audio: GameAudio | undefined, args: number[]) {
  const [command, id, value, time] = args;
  switch (command) {
    case 6: return audio?.masterVolume?.(id) ?? 0;
    case 7: return audio?.masterVolume?.() ?? 127;
    case 8: host.startSound(id); return 0;
    case 9: host.stopSound(id); return 0;
    case 10:
    case 11: host.stopSound(0); return 0;
    case 13: return Number(host.soundRunning(id));
    case 0x102: return audio?.volume?.(id, value, 0) ?? -1;
    case 0x10d: return audio?.volume?.(id, value, time / 60) ?? -1;
    default: return -1;
  }
}

export interface PlayingSound {
  playback?: SoundPlayback;
  elapsed: number;
  fallback: number;
}

export function soundDuration(sound: PlayingSound) {
  return sound.playback?.seconds === undefined ? sound.fallback : sound.playback.seconds * 60;
}
