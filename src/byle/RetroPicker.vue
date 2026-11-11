<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import PixelText from './PixelText.vue';
import RetroDialog from './RetroDialog.vue';

const props = defineProps<{ title: string; items: { id: number; label: string }[]; selected?: number }>();
const emit = defineEmits<{ close: []; load: [number] }>();
const picked = ref(props.items.findIndex(item => item.id === props.selected));
if (picked.value < 0) picked.value = 0;
const size = 8;
const start = ref(Math.floor(picked.value / size) * size);
const list = computed(() => props.items.slice(start.value, start.value + size));

watch(() => props.items, items => {
  picked.value = Math.min(picked.value, Math.max(0, items.length - 1));
  start.value = Math.floor(picked.value / size) * size;
});

function page(delta: number) {
  start.value = Math.max(0, Math.min(Math.floor((props.items.length - 1) / size) * size, start.value + size * delta));
  picked.value = start.value;
}

function choose() {
  const item = props.items[picked.value];
  if (item) emit('load', item.id);
}
</script>

<template>
  <RetroDialog :title="title" @close="emit('close')">
    <div class="retro-directory">
      <div class="retro-file-list" aria-label="Directory">
        <button v-for="(item, index) in list" :key="item.id" type="button" :aria-pressed="picked === start + index"
          @click="picked = start + index" @dblclick="choose"><PixelText :text="item.label" /></button>
        <PixelText v-if="!list.length" text="NO RESOURCES" />
      </div>
      <div class="retro-directory-arrows">
        <button type="button" class="retro-action" aria-label="Previous page" :disabled="start === 0" @click="page(-1)"><PixelText text="<" /></button>
        <button type="button" class="retro-action" aria-label="Next page" :disabled="start + size >= items.length" @click="page(1)"><PixelText text=">" /></button>
      </div>
    </div>
    <div class="retro-actions">
      <button type="button" class="retro-action" data-initial :disabled="!items.length" @click="choose"><PixelText text="LOAD" /></button>
      <button type="button" class="retro-action" @click="emit('close')"><PixelText text="CANCEL" /></button>
    </div>
  </RetroDialog>
</template>
