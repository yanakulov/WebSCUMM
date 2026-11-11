# The Secret of Monkey Island

[Play](https://akulaflow.ru/webscummtest/) · [Русский README](README.ru.md) · [WebSCUMM](../README.md)

This directory holds the English DOS CD profile, its prepared web assets, exporters, bitmap fonts, and game-specific tests.

## Web resource pack

The published `assets/monkey1.wsc.gz` pack contains decoded indexed graphics, palettes, depth masks, costume frames, bitmap fonts, and the game’s scripts. The `WSC1` format uses a JSON directory to index the binary payload. The original `.000` and `.001` archives, DOS executable, drivers, and audio tracks stay local.

Run `npm run assets:monkey -- <game-directory>` from the repository root to rebuild the pack from an English DOS CD installation.

## CHAR 1

Run `npm run font:char1 -- <game-directory>` to add all 66 Russian letters to the CD font. The exporter writes a standalone `.local/char1-ru/CHAR_0001` for use when repacking a copy of the game. The new glyphs use CP866 slots.

## Compatibility

The opening, the dock, the entrance to the SCUMM Bar, and the start of the jail conversation have been tested. The runtime still has incomplete opcode coverage. Audio playback and saved games are pending.
