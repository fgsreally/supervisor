<template>
  <section class="m-section">
    <h2 v-if="title" class="m-section__title">{{ title }}</h2>
    <div class="m-list"><slot /></div>
  </section>
</template>

<script setup lang="ts">
defineProps<{ title?: string }>();
</script>
