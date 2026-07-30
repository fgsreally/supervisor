<template>
  <label class="m-field">
    <span v-if="label" class="m-field__label">
      {{ label }}<span v-if="required" class="m-field__required"> *</span>
    </span>
    <slot />
    <span v-if="error" class="m-field__error">{{ error }}</span>
    <span v-else-if="help" class="m-field__help">{{ help }}</span>
  </label>
</template>

<script setup lang="ts">
defineProps<{ label?: string; help?: string; error?: string; required?: boolean }>();
</script>
