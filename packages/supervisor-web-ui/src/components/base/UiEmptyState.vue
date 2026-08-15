<template>
  <section class="ui-empty-state" :class="`ui-empty-state--${tone}`">
    <div class="ui-empty-state__icon" aria-hidden="true">
      <slot name="icon" />
    </div>
    <div class="ui-empty-state__content">
      <h2>{{ title }}</h2>
      <p v-if="description">{{ description }}</p>
    </div>
    <button v-if="actionLabel" type="button" class="ui-empty-state__action" @click="emit('action')">
      <slot name="action-icon" />
      {{ actionLabel }}
    </button>
  </section>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    description?: string;
    actionLabel?: string;
    tone?: "neutral" | "error";
  }>(),
  { description: "", actionLabel: "", tone: "neutral" },
);

const emit = defineEmits<{ action: [] }>();
</script>

<style scoped>
.ui-empty-state {
  display: flex;
  width: min(360px, 100%);
  flex-direction: column;
  align-items: center;
  padding: 28px 24px;
  text-align: center;
}

.ui-empty-state__icon {
  display: grid;
  width: 72px;
  height: 72px;
  place-items: center;
  border-radius: 22px;
  color: var(--app-text-secondary);
  background: var(--app-hover);
}

.ui-empty-state--error .ui-empty-state__icon {
  color: #d94841;
  background: color-mix(in srgb, #d94841 10%, var(--app-settings-card));
}

.ui-empty-state__icon :deep(svg) {
  width: 34px;
  height: 34px;
  stroke-width: 1.7;
}

.ui-empty-state__content {
  margin-top: 18px;
}

.ui-empty-state h2 {
  font-size: 17px;
  font-weight: 650;
}

.ui-empty-state p {
  margin-top: 7px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.65;
}

.ui-empty-state__action {
  display: inline-flex;
  min-width: 112px;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 22px;
  padding: 0 18px;
  border-radius: 8px;
  color: #fff;
  background: #07c160;
  font-size: 13px;
  font-weight: 550;
  transition:
    filter 0.15s ease,
    transform 0.15s ease;
}

.ui-empty-state__action :deep(svg) {
  width: 15px;
  height: 15px;
}

.ui-empty-state__action:hover {
  filter: brightness(0.96);
}

.ui-empty-state__action:active {
  transform: scale(0.97);
}

.ui-empty-state__action:focus-visible {
  outline: 2px solid color-mix(in srgb, #07c160 45%, transparent);
  outline-offset: 3px;
}

@media (max-width: 767px) {
  .ui-empty-state {
    padding: 24px 16px max(32px, env(safe-area-inset-bottom));
  }

  .ui-empty-state__action {
    width: min(240px, 100%);
    min-height: 44px;
    font-size: 14px;
  }
}
</style>
