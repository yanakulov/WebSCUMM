# WebSCUMM

[Play](https://akulaflow.ru/webscummtest/) · [BYLE](https://akulaflow.ru/webscummtest/#byle) · [Room viewer](https://akulaflow.ru/webscummtest/#rooms) · [Русский README](README.ru.md)

WebSCUMM is a browser-based TypeScript runtime and toolkit for PC SCUMM v5, built with Vue and Vite in the same spirit as [WebKyra](https://github.com/yanakulov/WebKyra). It runs original game scripts and reads the rooms, costumes, and bitmap fonts from your local files.

## Playing

Open **OPEN SCUMM DATA** and select the matching `.000` and `.001` files from your game. The browser reads both files locally.

| Action | Control |
| --- | --- |
| Walk or interact | Click the scene or select a verb |
| Skip a cutscene | Esc |
| Advance dialogue | Period |

The DOS CD edition of **The Secret of Monkey Island** has been tested through the opening, the dock, the entrance to the SCUMM Bar, and the start of the jail conversation. The DOS demo of **Indiana Jones and the Fate of Atlantis** has been tested at startup. The runtime still has incomplete opcode coverage. Audio playback and saved games are pending.

## Tools

- **BYLE** is a reconstruction of the costume animation editor. Press **F1** and open **BOUNCE** to try an editable example. The editor imports and exports SCUMM v5 `COST` and editable `.byle.json` files.
- **Room viewer** displays room backgrounds, walk boxes, and depth masks.
- **CHAR 1 exporter** adds all 66 Russian letters to the original Monkey Island CD font. Run `npm run font:char1 -- <game-directory>` to write a standalone `CHAR_0001` for use when repacking a copy of the game. The new glyphs use CP866 slots.

## Local development

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
npm test
npm run build
```

Vite serves the app at [127.0.0.1:5174](http://127.0.0.1:5174/). Set `WEBSCUMM_GAME_DIR` to load a local archive pair automatically in development. Set `WEBSCUMM_GAME_STEM` if the directory contains several pairs. When the directory points to Monkey Island DOS CD, the test suite also exercises the original game data.

## Engine notes

SCUMM starts at global script 1. The runtime schedules scripts across frames, runs room entry and exit handlers, and follows routes defined by `BOXD` and `BOXM`. Rendering uses the game's indexed graphics, `COST` animation tracks, depth masks, and `CHAR` fonts. The game scripts handle pointer input and verb selection. [SCUMM tutorial](https://tandell.com/misc/SCUMM-Tutorial-0.1.pdf) · [SCUMM v5 opcode reference](https://www.scummvm.org/old/docs/specs/scrp-v5.php) · [VGHF footage of BYLE](https://gamehistory.org/monkeyisland/)

Original games and tools © Lucasfilm Games / LucasArts. WebSCUMM by [Yan Akulov and AkulaFlow](https://akulaflow.ru/). Supply your own game archives.
