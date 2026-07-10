<template>
  <div
    role="separator"
    :aria-orientation="orientation"
    :aria-label="label"
    class="resize-handle"
    :class="orientation === 'horizontal' ? 'resize-handle--horizontal' : 'resize-handle--vertical'"
    @pointerdown="onStart"
  />
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    orientation: 'horizontal' | 'vertical'
    label?: string
  }>(),
  {
    label: '调整大小',
  },
)

const emit = defineEmits<{ start: [event: PointerEvent] }>()

function onStart(e: PointerEvent) {
  emit('start', e)
}
</script>

<style scoped>
.resize-handle--horizontal {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 6px;
  cursor: row-resize;
  z-index: 2;
}

.resize-handle--vertical {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: 8px;
  transform: translateX(50%);
  cursor: col-resize;
  z-index: 30;
}
</style>
