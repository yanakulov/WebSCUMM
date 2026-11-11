// SPDX-License-Identifier: LGPL-2.1-or-later
#include "nukedopl.h"

static opl3_chip chip;
static int16_t output[2048];

void opl_reset(unsigned rate) { OPL3_Reset(&chip, rate); }
void opl_write(unsigned reg, unsigned value) { OPL3_WriteRegBuffered(&chip, reg, value); }
int16_t *opl_output(void) { return output; }
void opl_render(unsigned frames) { OPL3_GenerateStream(&chip, output, frames); }
