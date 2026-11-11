import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { readAudioCue } from '../../src/engine/audio/cd.ts';

const [cue, ffmpeg = 'ffmpeg'] = process.argv.slice(2);
if (!cue) throw new Error('Usage: node TSoMI/tools/export-cd-audio.ts <disc.cue> [ffmpeg]');
const folder = dirname(resolve(cue));
const cueText = await readFile(cue, 'utf8');
const sizes = new Map<string, number>();
for (const [, quoted, unquoted] of cueText.matchAll(/^\s*FILE\s+(?:"([^"]+)"|(\S+))\s+BINARY/gim)) {
  const file = quoted ?? unquoted;
  sizes.set(file, (await stat(resolve(folder, file))).size);
}
const tracks = readAudioCue(cueText, file => sizes.get(file));
if (tracks.length !== 24 || !tracks.every((track, i) => track.track === i + 2)) {
  throw new Error('Expected a Monkey Island mixed-mode CD with 24 audio tracks after the data track');
}

const destination = fileURLToPath(new URL('../assets/cd/', import.meta.url));
await mkdir(destination, { recursive: true });
for (const { file, track, start, end } of tracks) {
  const name = `track${String(track - 1).padStart(2, '0')}.mp3`;
  const encoder = spawn(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 's16le', '-ar', '44100', '-ac', '2', '-i', 'pipe:0',
    '-c:a', 'libmp3lame', '-b:a', '80k', join(destination, name),
  ], { stdio: ['pipe', 'ignore', 'inherit'] });
  const finished = new Promise<void>((resolve, reject) => {
    encoder.once('error', reject);
    encoder.once('exit', status => status === 0 ? resolve() : reject(new Error(`FFmpeg failed on ${name}`)));
  });
  await Promise.all([pipeline(createReadStream(resolve(folder, file), { start: start * 2352, end: end * 2352 - 1 }), encoder.stdin), finished]);
  console.log(name);
}
