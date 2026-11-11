<script setup lang="ts">
import { computed } from 'vue';
import { glyph } from './glyphs.ts';
const props = defineProps<{ text: string; font?: 'byle' | 'help' }>();
const ink = computed(() => glyph(props.text, props.font));
</script>

<template>
  <span class="pixel-text" :style="{ '--ink': ink.bitmap, width: `${ink.width}px`, height: `${ink.height}px` }">
    <span class="visually-hidden">{{ text }}</span>
  </span>
</template>
