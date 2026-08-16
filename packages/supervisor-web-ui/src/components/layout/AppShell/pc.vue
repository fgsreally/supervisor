<template>
  <ShellNav :tab="tab" @update:tab="$emit('update:tab', $event)" @tutorial="$emit('tutorial')" />
</template>

<script setup lang="ts">
import ShellNav, { type MainTab } from "../ShellNav.vue";

defineProps<{ tab: MainTab }>();
defineEmits<{
  "update:tab": [tab: MainTab];
  tutorial: [];
}>();
</script>
