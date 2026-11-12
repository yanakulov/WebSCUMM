# WebSCUMM

[Play](https://akulaflow.ru/webscummtest/) · [BYLE](https://akulaflow.ru/webscummtest/#byle) · [Room viewer](https://akulaflow.ru/webscummtest/#rooms) · [Русский README](README.ru.md)

WebSCUMM is a browser-based TypeScript runtime and toolkit for PC SCUMM v5, built with Vue and Vite in the same spirit as [WebKyra](https://github.com/yanakulov/WebKyra). The player currently launches the English DOS CD edition of **The Secret of Monkey Island**.

## Playing

Open [the game](https://akulaflow.ru/webscummtest/) and choose **PLAY**. The web pack, AdLib effects, and the DOS CD soundtrack are ready to play. Choose **OPEN LOCAL CD DATA** to use a matching `.000` and `.001` pair before starting. Use **MENU** or **F10** to return to setup.

Choose [**LAST FERRY DEMO**](https://akulaflow.ru/webscummtest/#ferry) for a short Russian-language fan prequel about Guybrush's trip to Mêlée. Its new rooms, costumes and puzzles run in the same SCUMM player as the original game.

**LOAD CD TRACKS** accepts audio files named `track01.mp3` (also WAV, Ogg, Opus, FLAC, and M4A where supported) or the `.cue` and `.bin` files of a mixed-mode CD image. To play a replacement such as `track17.mid`, also choose a General MIDI `.sf2` with **LOAD SOUNDFONT**. The browser reads local files directly.

| Action | Mouse and keyboard | Touchscreen |
| --- | --- | --- |
| Move the cursor | Move the mouse | Swipe in the game area |
| Walk or interact | Click the scene or a verb | Tap to act at the cursor |
| Skip the intro or a skippable cutscene | Esc | Tap during the sequence |
| Advance dialogue | Period | Tap while a line is visible |

On a touchscreen, the cursor keeps its position between swipes. Releasing after a swipe leaves it in place.

[Monkey Island resources and compatibility](TSoMI/README.md)

## Tools

- **BYLE** is a reconstruction of the costume animation editor. Press **F1** and open **BOUNCE** to try an editable example. The editor imports and exports SCUMM v5 `COST` and editable `.byle.json` files.
- **Room viewer** displays room backgrounds, walk boxes, and depth masks.

BYLE and the room viewer accept other compatible PC SCUMM v5 archive pairs.

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

The classic costume renderer uses the original row and column scaling thresholds and tracks each limb independently. The camera follows after the actor crosses a trigger and scrolls in eight-pixel strips.

Original games and tools © Lucasfilm Games / LucasArts. WebSCUMM by [Yan Akulov and AkulaFlow](https://akulaflow.ru/).
