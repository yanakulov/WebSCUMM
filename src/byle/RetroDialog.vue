<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import PixelText from './PixelText.vue';

defineProps<{ title: string; titleFont?: 'byle' | 'help' }>();
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement>();
let returnFocus: HTMLElement | null;

function buttons() { return [...panel.value!.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')]; }
function keyboard(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); }
  if (event.key !== 'Tab') return;
  const controls = buttons();
  const edge = event.shiftKey ? controls[0] : controls.at(-1);
  if (document.activeElement !== edge && document.activeElement !== panel.value) return;
  event.preventDefault();
  (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
}

onMounted(() => {
  returnFocus = document.activeElement as HTMLElement | null;
  (panel.value?.querySelector<HTMLElement>('[data-initial]') ?? buttons()[0] ?? panel.value)?.focus({ preventScroll: true });
});
onUnmounted(() => returnFocus?.focus({ preventScroll: true }));
</script>

<template>
  <div class="retro-scrim" @keydown.stop="keyboard">
    <section ref="panel" class="retro-dialog" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1">
      <h2><PixelText :text="title" :font="titleFont" /></h2>
      <div class="retro-dialog-body"><slot /></div>
    </section>
  </div>
</template>
