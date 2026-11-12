# The Secret of Monkey Island

**Last Ferry** is a Russian-language fan prequel. Its room resources and bytecode are in [`last-ferry/`](last-ferry/). The demo uses the original Guybrush costume, Mêlée dock, audio cues and CHAR 1 with the project's Cyrillic glyphs. The new cargo lift joins walk boxes at its stops and moves actors and object artwork together.

Regenerate the demo art with `python TSoMI/last-ferry/draw.py <pixel-art-html-skill>/SKILLS/pixel-art-html TSoMI/last-ferry .local/ferry-art` using the [reviewed Pixel Art HTML revision](https://github.com/gvastethecreator/pixel-art-html-skill/tree/5373810d5cacbbd50c14039ace9d70ebef84e794). The source grids and previews go in `.local/ferry-art`.

[Play](https://akulaflow.ru/webscummtest/) · [Русский README](README.ru.md) · [WebSCUMM](../README.md)

This directory holds the English DOS CD profile, its prepared web assets, exporters, bitmap fonts, and game-specific tests.

## Web resource pack

The published `assets/monkey1.wsc.gz` pack contains decoded indexed graphics, palettes, depth masks, costume frames, bitmap fonts, the game’s scripts, AdLib sequences, and decoded sound effects. The `WSC1` format uses a JSON directory to index the binary payload. The original `.000` and `.001` archives, DOS executable, drivers, and original disc image stay local.

Run `npm run assets:monkey -- <game-directory>` from the repository root to rebuild the pack from an English DOS CD installation.

## CD soundtrack

The web build includes all 24 audio tracks converted from the matching `MNKY_TWN` mixed-mode CD. It downloads each compressed track as needed. The game numbers audio tracks from 1, starting at physical track 2. The title and lookout share track 17 with different start offsets. The sound driver uses the CD cue's frame offset and repeat count.

To regenerate the web audio with FFmpeg, run `node TSoMI/tools/export-cd-audio.ts path/to/MNKY_TWN.cue`. The output is stereo MP3 in `TSoMI/assets/cd/`.

## CHAR 1

Run `npm run font:char1 -- <game-directory>` to add all 66 Russian letters to the CD font. The exporter writes a standalone `.local/char1-ru/CHAR_0001` for use when repacking a copy of the game. The new glyphs use CP866 slots.

## Compatibility

The opening, the dock, the entrance to the SCUMM Bar, and the start of the jail conversation have been tested. The runtime still has incomplete opcode coverage. The audio backend supports the SCUMM v5 iMUSE command queue, playback status, volume, and fades. iMUSE hooks and adaptive transitions remain to be implemented, along with saved games.
