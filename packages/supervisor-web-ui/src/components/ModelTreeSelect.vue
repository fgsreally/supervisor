<template>
  <div class="model-tree-select">
    <button
      ref="trigger"
      type="button"
      class="model-tree-select__trigger"
      :disabled="disabled"
      @click="toggle"
    >
      <template v-if="selected">
        <ProviderAvatar
          :provider-id="selected.group.id"
          :provider-name="selected.group.name"
          :icon="selected.group.icon"
          class="model-tree-select__avatar"
        />
        <span class="model-tree-select__selection">
          <strong>{{ selected.model.name }}</strong>
          <small>{{ selected.group.name }}</small>
        </span>
      </template>
      <span v-else class="model-tree-select__placeholder">{{ placeholder }}</span>
      <ChevronDown class="model-tree-select__chevron" :class="{ 'is-open': open }" />
    </button>
    <Teleport to="body">
      <template v-if="open">
        <button
          class="model-tree-select__backdrop"
          type="button"
          aria-label="关闭"
          @click="open = false"
        />
        <div class="model-tree-select__menu" :style="menuStyle">
          <div class="model-tree-select__caption">选择模型</div>
          <section v-for="group in groups" :key="group.id" class="model-tree-select__group">
            <div class="model-tree-select__provider">
              <ProviderAvatar
                :provider-id="group.id"
                :provider-name="group.name"
                :icon="group.icon"
                class="model-tree-select__avatar"
              />
              <span>{{ group.name }}</span>
            </div>
            <button
              v-for="model in group.models"
              :key="model.value"
              type="button"
              class="model-tree-select__model"
              :class="{ 'is-selected': model.value === modelValue }"
              @click="choose(model.value)"
            >
              <span>{{ model.name }}</span
              ><Check v-if="model.value === modelValue" />
            </button>
          </section>
          <div
            v-if="groups.every((group) => group.models.length === 0)"
            class="model-tree-select__none"
          >
            暂无可用模型
          </div>
        </div>
      </template>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { Check, ChevronDown } from "lucide-vue-next";
import ProviderAvatar from "./ProviderAvatar.vue";

export interface ModelTreeGroup {
  id: string;
  name: string;
  icon?: string | null;
  models: Array<{ value: string; name: string }>;
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    groups: ModelTreeGroup[];
    placeholder?: string;
    disabled?: boolean;
  }>(),
  { placeholder: "未配置", disabled: false },
);
const emit = defineEmits<{ "update:modelValue": [value: string]; change: [value: string] }>();
const open = ref(false);
const trigger = ref<HTMLElement | null>(null);
const menuStyle = ref<Record<string, string>>({});
const selected = computed(() => {
  for (const group of props.groups) {
    const model = group.models.find((item) => item.value === props.modelValue);
    if (model) return { group, model };
  }
  return null;
});

function choose(value: string) {
  emit("update:modelValue", value);
  emit("change", value);
  open.value = false;
}

async function toggle() {
  open.value = !open.value;
  if (!open.value) return;
  await nextTick();
  const rect = trigger.value?.getBoundingClientRect();
  if (!rect) return;
  const availableBelow = window.innerHeight - rect.bottom - 10;
  const availableAbove = rect.top - 10;
  const openAbove = availableBelow < 220 && availableAbove > availableBelow;
  const available = openAbove ? availableAbove : availableBelow;
  const menuHeight = Math.min(360, Math.max(160, available));
  menuStyle.value = {
    left: `${rect.left}px`,
    ...(openAbove
      ? { bottom: `${window.innerHeight - rect.top + 6}px` }
      : { top: `${rect.bottom + 6}px` }),
    width: `${rect.width}px`,
    maxHeight: `${menuHeight}px`,
  };
}
</script>

<style scoped>
.model-tree-select {
  position: relative;
  width: 100%;
}
.model-tree-select__trigger {
  display: flex;
  width: 100%;
  min-height: 42px;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border: 1px solid color-mix(in srgb, var(--app-border-subtle) 88%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, var(--app-hover) 68%, var(--app-settings-card));
  color: var(--app-text-primary);
  text-align: left;
  transition:
    border-color 0.15s,
    background-color 0.15s;
}
.model-tree-select__trigger:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--app-accent) 38%, var(--app-border-subtle));
  background: color-mix(in srgb, var(--app-hover) 88%, var(--app-settings-card));
}
.model-tree-select__trigger:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.model-tree-select__avatar {
  width: 28px;
  height: 28px;
  flex: none;
  font-size: 9px;
}
.model-tree-select__selection {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  line-height: 1.2;
}
.model-tree-select__selection small {
  color: var(--app-text-muted);
  font-size: 10px;
}
.model-tree-select__selection strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-tree-select__placeholder {
  flex: 1;
  color: var(--app-text-muted);
  font-size: 12px;
  font-weight: 400;
}
.model-tree-select__chevron {
  width: 15px;
  height: 15px;
  flex: none;
  transition: transform 0.2s ease;
}
.model-tree-select__chevron.is-open {
  transform: rotate(180deg);
}
.model-tree-select__backdrop {
  position: fixed;
  inset: 0;
  z-index: 79;
  cursor: default;
}
.model-tree-select__menu {
  position: fixed;
  z-index: 180;
  overflow-y: auto;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--app-border-subtle) 88%, transparent);
  border-radius: 12px;
  background: var(--app-popup-bg, var(--app-settings-card));
  box-shadow: 0 14px 42px rgb(0 0 0 / 24%);
}
.model-tree-select__caption {
  padding: 3px 6px 8px;
  color: var(--app-text-muted);
  font-size: 10px;
}
.model-tree-select__model {
  width: 100%;
  border-radius: 5px;
  padding: 7px 9px;
  color: var(--app-text-secondary);
  text-align: left;
}
.model-tree-select__model:hover {
  background: var(--app-hover);
  color: var(--app-text-primary);
}
.model-tree-select__group + .model-tree-select__group {
  margin-top: 7px;
}
.model-tree-select__group {
  overflow: hidden;
  padding: 4px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--app-hover) 50%, transparent);
}
.model-tree-select__provider {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 5px 6px;
  color: var(--app-text-secondary);
  font-size: 11px;
  font-weight: 600;
}
.model-tree-select__model {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  padding: 6px 8px 6px 40px;
  border-radius: 7px;
  font-size: 12px;
}
.model-tree-select__model svg {
  width: 14px;
  height: 14px;
  color: var(--app-accent);
}
.model-tree-select__model.is-selected {
  color: var(--app-accent);
  background: color-mix(in srgb, var(--app-accent) 13%, var(--app-settings-card));
}
.model-tree-select__none {
  padding: 18px;
  color: var(--app-text-muted);
  font-size: 12px;
  text-align: center;
}
</style>
