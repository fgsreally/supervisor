<template>
  <section class="permission-editor">
    <div class="permission-editor__heading">
      <div>
        <div class="permission-editor__title">{{ t("agent.toolPermissions") }}</div>
        <div class="permission-editor__hint">
          {{ t("agent.permissionHint") }}
        </div>
      </div>
    </div>

    <div v-for="(group, groupIndex) in groups" :key="group.id" class="permission-group">
      <button type="button" class="permission-group__toggle" @click="toggleGroup(group.id)">
        <span class="permission-group__tool">{{ group.tool }}</span>
        <span class="permission-group__summary">{{ t("agent.ruleCount", { count: group.rules.length }) }}</span>
        <ChevronDown
          class="permission-group__chevron"
          :class="{ 'permission-group__chevron--open': openGroups.has(group.id) }"
        />
      </button>
      <Transition name="permission-collapse">
        <div v-if="openGroups.has(group.id)" class="permission-group__body">
          <div v-for="(rule, ruleIndex) in group.rules" :key="rule.id" class="permission-rule">
            <UiField
              v-model="rule.pattern"
              :placeholder="t('agent.globPlaceholder')"
              class="permission-rule__pattern"
            />
            <UiField v-model="rule.effect" as="select" class="permission-rule__effect">
              <option value="ask">ask</option>
              <option value="deny">deny</option>
            </UiField>
            <UiActionButton type="button" variant="secondary" @click="removeRule(groupIndex, ruleIndex)"
              >{{ t("agent.removeRule") }}</UiActionButton
            >
          </div>
              <UiActionButton type="button" variant="secondary" @click="addRule(groupIndex)"
            >{{ t("agent.addRule") }}</UiActionButton
          >
        </div>
      </Transition>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { ChevronDown } from "lucide-vue-next";
import type { AgentPermissionEffect, AgentPermissionRules } from "@/api";
import { UiActionButton, UiField } from "@/components/base";
import { useI18n } from "@/i18n";

type RuleDraft = { id: number; pattern: string; effect: AgentPermissionEffect };
type GroupDraft = { id: number; tool: string; rules: RuleDraft[] };

const props = defineProps<{ modelValue: AgentPermissionRules }>();
const emit = defineEmits<{ "update:modelValue": [value: AgentPermissionRules] }>();
const { t } = useI18n();
let nextId = 1;
const groups = ref<GroupDraft[]>([]);
const openGroups = ref(new Set<number>());

function fromRules(value: AgentPermissionRules): GroupDraft[] {
  return Object.entries(value).map(([tool, entries]) => ({
    id: nextId++,
    tool,
    rules: Object.entries(entries).map(([pattern, effect]) => ({
      id: nextId++,
      pattern,
      effect,
    })),
  }));
}

function toRules(value: GroupDraft[]): AgentPermissionRules {
  const result: AgentPermissionRules = {};
  for (const group of value) {
    const tool = group.tool.trim().toLowerCase();
    if (!tool) continue;
    const entries: Record<string, AgentPermissionEffect> = {};
    for (const rule of group.rules) {
      if (rule.pattern.trim()) entries[rule.pattern.trim()] = rule.effect;
    }
    if (Object.keys(entries).length > 0) result[tool] = entries;
  }
  return result;
}

watch(
  () => props.modelValue,
  (value) => {
    if (JSON.stringify(toRules(groups.value)) === JSON.stringify(value ?? {})) return;
    groups.value = fromRules(value ?? {});
  },
  { immediate: true, deep: true },
);

watch(
  groups,
  (value) => {
    emit("update:modelValue", toRules(value));
  },
  { deep: true },
);

function toggleGroup(id: number) {
  const next = new Set(openGroups.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  openGroups.value = next;
}

function addRule(groupIndex: number) {
  groups.value[groupIndex]?.rules.push({ id: nextId++, pattern: "", effect: "ask" });
}

function removeRule(groupIndex: number, ruleIndex: number) {
  groups.value[groupIndex]?.rules.splice(ruleIndex, 1);
}
</script>

<style scoped>
.permission-editor {
  display: grid;
  gap: 12px;
}
.permission-editor__heading,
.permission-rule {
  display: flex;
  align-items: center;
  gap: 8px;
}
.permission-editor__heading {
  justify-content: space-between;
}
.permission-editor__title {
  font-size: 13px;
  color: var(--app-text-primary);
}
.permission-editor__hint {
  margin-top: 3px;
  font-size: 12px;
  color: var(--app-text-muted);
}
.permission-group {
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: 8px;
}
.permission-group__toggle {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 11px 12px;
  color: var(--app-text-primary);
  text-align: left;
}
.permission-group__summary {
  margin-left: auto;
  font-size: 12px;
  color: var(--app-text-muted);
}
.permission-group__tool,
.permission-rule__pattern {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
.permission-group__chevron {
  width: 1rem;
  height: 1rem;
}
.permission-group__toggle svg {
  transition: transform 180ms ease;
}
.permission-group__chevron--open {
  transform: rotate(180deg);
}
.permission-group__body {
  display: grid;
  gap: 8px;
  padding: 0 12px 12px;
}
.permission-collapse-enter-active,
.permission-collapse-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}
.permission-collapse-enter-from,
.permission-collapse-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
.permission-rule > :first-child {
  flex: 1;
  min-width: 0;
}
.permission-rule__effect {
  width: 92px;
}
@media (max-width: 640px) {
  .permission-rule {
    align-items: stretch;
    flex-wrap: wrap;
  }
}
</style>
