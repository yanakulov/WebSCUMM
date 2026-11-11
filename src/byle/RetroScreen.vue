<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

const frame = ref<HTMLElement>();
const screenWidth = ref(0);
let resize: ResizeObserver;
onMounted(() => {
  resize = new ResizeObserver(([entry]) => { screenWidth.value = entry.contentRect.width; });
  resize.observe(frame.value!);
});
onUnmounted(() => resize.disconnect());
</script>

<template>
  <main ref="frame" class="byle-frame" aria-label="WebSCUMM" tabindex="-1">
    <div class="byle-screen" :style="{ transform: `scale(${screenWidth / 320}, ${screenWidth * 0.75 / 200})` }">
      <slot />
    </div>
  </main>
</template>
