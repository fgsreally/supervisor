<template>
  <component :is="as" class="m-list-row" :type="as === 'button' ? 'button' : undefined">
    <span v-if="$slots.icon" class="m-list-row__icon"><slot name="icon" /></span>
    <span class="m-list-row__body">
      <strong class="m-list-row__title">{{ title }}</strong>
      <small v-if="description" class="m-list-row__description">{{ description }}</small>
    </span>
    <span v-if="value" class="m-list-row__value">{{ value }}</span>
    <ChevronRight v-if="chevron" class="m-list-row__chevron" />
  </component>
</template>

<script setup lang="ts">
import { ChevronRight } from "lucide-vue-next";

withDefaults(
  defineProps<{
    as?: "button" | "div";
    title: string;
    description?: string;
    value?: string;
    chevron?: boolean;
  }>(),
  { as: "button", chevron: true },
);
</script>
