# WebSCUMM

[Play](https://akulaflow.ru/webscummtest/) · [BYLE](https://akulaflow.ru/webscummtest/#byle) · [Room viewer](https://akulaflow.ru/webscummtest/#rooms) · [Русский README](README.ru.md)

WebSCUMM is a browser-based TypeScript runtime and toolkit for PC SCUMM v5, built with Vue and Vite in the same spirit as [WebKyra](https://github.com/yanakulov/WebKyra). The player currently launches the English DOS CD edition of **The Secret of Monkey Island**.

## Playing

Open [the game](https://akulaflow.ru/webscummtest/). The intro starts once the browser loads the prepared resource pack. If the pack cannot be loaded, **OPEN LOCAL CD DATA** accepts the matching `.000` and `.001` files from the supported edition.

| Action | Control |
| --- | --- |
| Walk or interact | Click the scene or select a verb |
| Skip a cutscene | Esc |
| Advance dialogue | Period |

The opening, the dock, the entrance to the SCUMM Bar, and the start of the jail conversation have been tested. The runtime still has incomplete opcode coverage. Audio playback and saved games are pending.

## Tools

- **BYLE** is a reconstruction of the costume animation editor. Press **F1** and open **BOUNCE** to try an editable example. The editor imports and exports SCUMM v5 `COST` and editable `.byle.json` files.
- **Room viewer** displays room backgrounds, walk boxes, and depth masks.
- **CHAR 1 exporter** adds all 66 Russian letters to the original Monkey Island CD font. Run `npm run font:char1 -- <game-directory>` to write a standalone `CHAR_0001` for use when repacking a copy of the game. The new glyphs use CP866 slots.

BYLE and the room viewer accept other compatible PC SCUMM v5 archive pairs.

## Web resource pack

The published `WSC1` pack contains decoded indexed graphics, palettes, depth masks, costume frames, bitmap fonts, and the game’s scripts. A JSON directory indexes the binary payload, and gzip compresses the resulting file. The original `.000` and `.001` archives, DOS executable, drivers, and audio tracks stay outside Git and the site.

Rebuild the pack from a local English DOS CD installation with `npm run assets:monkey -- <game-directory>`. The command writes `public/assets/monkey1.wsc.gz`.

## Local development

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
npm test
npm run build
```

Vite serves the app at [127.0.0.1:5174](http://127.0.0.1:5174/). Set `WEBSCUMM_GAME_DIR` to offer a local archive pair in the development file picker. Set `WEBSCUMM_GAME_STEM` if the directory contains several pairs. The tests run the web pack by default. With a local Monkey Island DOS CD directory, they also check the original archive and compare a title frame from both sources.

## Engine notes

SCUMM starts at global script 1. The runtime schedules scripts across frames, runs room entry and exit handlers, and follows routes defined by `BOXD` and `BOXM`. Rendering uses the game's indexed graphics, `COST` animation tracks, depth masks, and `CHAR` fonts. The game scripts handle pointer input and verb selection. [SCUMM tutorial](https://tandell.com/misc/SCUMM-Tutorial-0.1.pdf) · [SCUMM v5 opcode reference](https://www.scummvm.org/old/docs/specs/scrp-v5.php) · [VGHF footage of BYLE](https://gamehistory.org/monkeyisland/)

Original games and tools © Lucasfilm Games / LucasArts. WebSCUMM by [Yan Akulov and AkulaFlow](https://akulaflow.ru/).
