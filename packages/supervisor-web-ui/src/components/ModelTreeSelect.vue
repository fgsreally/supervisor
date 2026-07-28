<template>
  <div class="model-tree-select">
    <button
      type="button"
      class="model-tree-select__trigger"
      :disabled="disabled"
      @click="open = !open"
    >
      <template v-if="selected">
        <ProviderAvatar
          :provider-id="selected.group.id"
          :provider-name="selected.group.name"
          :icon="selected.group.icon"
          class="model-tree-select__avatar"
        />
        <span class="model-tree-select__selection">
          <small>{{ selected.group.name }}</small>
          <strong>{{ selected.model.name }}</strong>
        </span>
      </template>
      <span v-else class="model-tree-select__placeholder">{{ placeholder }}</span>
      <ChevronDown class="model-tree-select__chevron" :class="{ 'is-open': open }" />
    </button>
    <template v-if="open">
      <button class="model-tree-select__backdrop" type="button" aria-label="关闭" @click="open = false" />
      <div class="model-tree-select__menu">
        <button v-if="allowEmpty" class="model-tree-select__empty" type="button" @click="choose('')">
          {{ placeholder }}
        </button>
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
            <span>{{ model.name }}</span><Check v-if="model.value === modelValue" />
          </button>
        </section>
        <div v-if="groups.every((group) => group.models.length === 0)" class="model-tree-select__none">
          暂无可用模型
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
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
    allowEmpty?: boolean;
  }>(),
  { placeholder: "未配置", disabled: false, allowEmpty: true },
);
const emit = defineEmits<{ "update:modelValue": [value: string]; change: [value: string] }>();
const open = ref(false);
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
</script>

<style scoped>
.model-tree-select { position: relative; width: 100%; }
.model-tree-select__trigger { display: flex; width: 100%; min-height: 42px; align-items: center; gap: 10px; padding: 6px 10px; border: 1px solid var(--app-border); border-radius: 7px; background: var(--app-input-bg, var(--app-settings-card)); color: var(--app-text-primary); text-align: left; }
.model-tree-select__trigger:disabled { cursor: not-allowed; opacity: .55; }
.model-tree-select__avatar { width: 28px; height: 28px; flex: none; font-size: 11px; }
.model-tree-select__selection { display: flex; min-width: 0; flex: 1; flex-direction: column; line-height: 1.2; }
.model-tree-select__selection small { color: var(--app-text-secondary); font-size: 10px; }
.model-tree-select__selection strong { overflow: hidden; font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.model-tree-select__placeholder { flex: 1; color: var(--app-text-muted); }
.model-tree-select__chevron { width: 16px; height: 16px; flex: none; transition: transform .2s ease; }
.model-tree-select__chevron.is-open { transform: rotate(180deg); }
.model-tree-select__backdrop { position: fixed; inset: 0; z-index: 79; cursor: default; }
.model-tree-select__menu { position: absolute; z-index: 80; top: calc(100% + 5px); left: 0; width: 100%; max-height: 320px; overflow-y: auto; padding: 5px; border: 1px solid var(--app-border); border-radius: 8px; background: var(--app-settings-card); box-shadow: 0 12px 35px rgb(0 0 0 / 20%); }
.model-tree-select__empty, .model-tree-select__model { width: 100%; border-radius: 5px; padding: 7px 9px; color: var(--app-text-secondary); text-align: left; }
.model-tree-select__empty:hover, .model-tree-select__model:hover { background: var(--app-hover); color: var(--app-text-primary); }
.model-tree-select__group + .model-tree-select__group { margin-top: 4px; border-top: 1px solid var(--app-border-subtle); }
.model-tree-select__provider { display: flex; align-items: center; gap: 8px; padding: 8px 7px 5px; color: var(--app-text-primary); font-size: 12px; font-weight: 600; }
.model-tree-select__model { display: flex; align-items: center; justify-content: space-between; padding-left: 43px; font-size: 12px; }
.model-tree-select__model svg { width: 14px; height: 14px; color: var(--app-accent); }
.model-tree-select__model.is-selected { color: var(--app-accent); background: color-mix(in srgb, var(--app-accent) 9%, transparent); }
.model-tree-select__none { padding: 18px; color: var(--app-text-muted); font-size: 12px; text-align: center; }
</style>
