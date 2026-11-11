import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5174 },
  plugins: [vue(), {
    name: 'local-scumm-archive',
    async configureServer(server) {
      const directory = process.env.WEBSCUMM_GAME_DIR;
      if (!directory) return;
      const names = await readdir(directory).catch(() => [] as string[]);
      const pairs = names.flatMap(index => {
        const stem = /^(.*)\.000$/i.exec(index)?.[1];
        if (!stem) return [];
        const disk = names.find(name => name.toLowerCase() === `${stem.toLowerCase()}.001`);
        return disk ? [{ stem, index, disk }] : [];
      });
      const requested = process.env.WEBSCUMM_GAME_STEM?.toLowerCase();
      const pair = requested ? pairs.find(item => item.stem.toLowerCase() === requested) : pairs.length === 1 ? pairs[0] : undefined;
      if (!pair) return;
      server.middlewares.use('/__game', async (request, response) => {
        if (request.method !== 'GET') {
          response.writeHead(404).end();
          return;
        }
        if (request.url === '/manifest') {
          response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          response.end(JSON.stringify({ stem: pair.stem }));
          return;
        }
        const name = request.url === '/index' ? pair.index : request.url === '/disk' ? pair.disk : undefined;
        if (!name) { response.writeHead(404).end(); return; }
        const file = join(directory, name);
        const info = await stat(file).catch(() => null);
        if (!info?.isFile()) { response.writeHead(404).end(); return; }
        response.writeHead(200, {
          'Content-Type': 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store',
        });
        createReadStream(file).on('error', () => response.destroy()).pipe(response);
      });
    },
  }],
});
