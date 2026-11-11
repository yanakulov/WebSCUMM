import type { TrackInput } from './browser-audio.ts';

const sectorBytes = 2352;

export interface CueTrack { file: string; track: number; start: number; end: number }

export function readAudioCue(cue: string, fileSize: (name: string) => number | undefined): CueTrack[] {
  const tracks: { file: string; track: number; audio: boolean; start?: number; pregap?: number }[] = [];
  let file = '';
  for (const line of cue.split(/\r?\n/)) {
    const entry = /^\s*FILE\s+(?:"([^"]+)"|(\S+))\s+(\S+)/i.exec(line);
    if (entry) {
      file = entry[3].toUpperCase() === 'BINARY' ? entry[1] ?? entry[2] : '';
      continue;
    }
    const track = /^\s*TRACK\s+(\d+)\s+(\S+)/i.exec(line);
    if (track) {
      tracks.push({ file, track: Number(track[1]), audio: track[2].toUpperCase() === 'AUDIO' });
      continue;
    }
    const index = /^\s*INDEX\s+(0[01])\s+(\d+):(\d+):(\d+)/i.exec(line);
    const current = tracks.at(-1);
    if (current && index) {
      const sector = (Number(index[2]) * 60 + Number(index[3])) * 75 + Number(index[4]);
      if (index[1] === '01') current.start = sector;
      else current.pregap = sector;
    }
  }

  const audio: CueTrack[] = [];
  for (const [i, track] of tracks.entries()) {
    if (!track.audio) continue;
    const size = fileSize(track.file);
    if (!size || size % sectorBytes || track.start === undefined) throw new Error('SELECT THE BIN FILES NAMED IN THE CUE SHEET.');
    const next = tracks[i + 1];
    const end = next?.file === track.file ? next.pregap ?? next.start : size / sectorBytes;
    if (end === undefined || end <= track.start || end * sectorBytes > size) throw new Error('INVALID CD TRACK BOUNDARY.');
    audio.push({ file: track.file, track: track.track, start: track.start, end });
  }
  if (!audio.length) throw new Error('THE CUE SHEET HAS NO BINARY AUDIO TRACKS.');
  return audio;
}

export async function loadTrackFiles(files: File[]) {
  const tracks = new Map<number, TrackInput>();
  const cue = files.find(file => /\.cue$/i.test(file.name));
  if (cue) {
    const images = new Map(files.map(file => [file.name.toLowerCase(), file]));
    const image = (name: string) => images.get(name.split(/[\\/]/).at(-1)!.toLowerCase());
    const layout = readAudioCue(await cue.text(), name => image(name)?.size);
    const dataTrack = !layout.some(entry => entry.track === 1);
    for (const { file, track, start, end } of layout) {
      tracks.set(track - Number(dataTrack), { image: image(file)!, start, end });
    }
  }
  for (const file of files) {
    const match = /^track[ _-]?(\d{1,2})\.(?:mp3|ogg|opus|flac|wav|m4a|midi?)$/i.exec(file.name);
    if (match && Number(match[1])) tracks.set(Number(match[1]), file);
  }
  if (!tracks.size) throw new Error('CHOOSE TRACK01 AUDIO FILES OR A CUE AND BIN PAIR.');
  return tracks;
}
