import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { GameArchive } from '../../src/engine/archive.ts';
import { readObjectVerbs } from '../../src/engine/game/scene.ts';
import { monkeyCdResources, MONKEY1_CD } from '../game.ts';
import { encodeMonkeyPack, packCostume, type MonkeyPack, type PackedScene } from '../pack.ts';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: npm run assets:monkey -- <game-directory> [output]');
const names = await readdir(directory);
const pairs = names.filter(name => /^(MONKEY1|MONKEY)\.000$/i.test(name)).flatMap(index => {
  const disk = names.find(name => name.toLowerCase() === index.toLowerCase().replace(/\.000$/, '.001'));
  return disk ? [{ index, disk }] : [];
});
if (pairs.length !== 1) throw new Error('Expected one Monkey Island DOS CD archive pair');
const [{ index, disk }] = pairs;
const archive = new GameArchive(await readFile(join(directory, index)), await readFile(join(directory, disk)));
const resources = monkeyCdResources(archive);
if (!resources) throw new Error('Only the English Monkey Island DOS CD edition is supported');

const pack: MonkeyPack = {
  edition: MONKEY1_CD, variableCount: resources.variableCount, bitVariableCount: resources.bitVariableCount,
  objects: resources.objects, rooms: {}, scripts: {}, costumes: {}, fonts: {}, sounds: {},
};
for (const { id } of archive.rooms) {
  const { objects, ...scene } = resources.scene(id);
  const packed: PackedScene = { scene: { ...scene, objects: [] }, verbs: {}, images: {}, scripts: {}, code: {} };
  pack.rooms[id] = packed;
  for (const { code, image, ...object } of objects.values()) {
    packed.scene.objects.push(object);
    if (code) {
      const verbs = readObjectVerbs(archive, { ...object, code });
      if (verbs) packed.verbs[object.id] = verbs;
    }
    if (!image) continue;
    for (const frame of archive.disk.children(image)) {
      if (!/^IM[0-9A-F]{2}$/.test(frame.tag)) continue;
      const state = Number.parseInt(frame.tag.slice(2), 16);
      try {
        const decoded = resources.image(id, { ...object, image }, state, scene.transparent);
        if (decoded) packed.images[`${object.id}:${state}`] = decoded;
      } catch (error) {
        throw new Error(`Cannot export room ${id}, object ${object.id}, image state ${state}`, { cause: error });
      }
    }
  }
  for (const chunk of archive.room(id)) {
    if (chunk.tag === 'LSCR') {
      const scriptId = archive.disk.u8(chunk.data);
      packed.scripts[scriptId] = resources.script(scriptId, id);
    }
    if (chunk.tag === 'ENCD' || chunk.tag === 'EXCD') packed.code[chunk.tag] = resources.roomCode(chunk.tag, id);
  }
}
for (const { id } of archive.resources('DSCR')) pack.scripts[id] = resources.script(id, 0);
for (const { id } of archive.resources('DCOS')) pack.costumes[id] = packCostume(resources.costume(id));
for (const { id } of archive.resources('DCHR')) pack.fonts[id] = resources.font(id);
for (const { id } of archive.resources('DSOU')) {
  const cue = resources.sound(id);
  if (cue) pack.sounds[id] = cue;
}

const output = resolve(process.argv[3] ?? fileURLToPath(new URL('../assets/monkey1.wsc.gz', import.meta.url)));
const packed = gzipSync(encodeMonkeyPack(pack), { level: 9 });
await mkdir(dirname(output), { recursive: true });
await writeFile(output, packed);
console.log(`${archive.rooms.length} rooms and ${Object.keys(pack.costumes).length} costumes written to ${output} (${packed.length} bytes)`);
