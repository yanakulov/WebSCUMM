# Audio synthesizers

WebSCUMM uses Nuked OPL3 1.8 in OPL2 mode. The emulator is by Nuke.YKT
and licensed under LGPL-2.1-or-later. The corresponding sources, wrapper,
license and rebuild instructions are in `opl-source.tar.gz`. The emulator
source is from [AdPlug](https://github.com/adplug/adplug/tree/3d9457ac91121302a752577b2bf063b4aea202b8),
the same revision used in WebKyra. The separate `opl.wasm` can be replaced
with a compatible build.

TinySoundFont is by Bernhard Schelling under the MIT license. The LGPL-3.0-or-later
WASM bridge is by not-hanjo-mei. WebSCUMM uses the loader and WASM module
distributed by WebKyra from [mt32-web](https://github.com/not-hanjo-mei/mt32-web/tree/f33e5f3045d42737373ddebea2661b56661ebeb9).
The only loader change is the ESM export added by WebKyra. The corresponding
source archive `mt32-source.tar.gz` includes the licenses and `tools/build-tsf.ps1`.
The separate `tsf.wasm` can be replaced with a compatible build.
