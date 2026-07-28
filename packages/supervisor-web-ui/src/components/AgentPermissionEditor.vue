<template>
  <section class="permission-editor">
    <div class="permission-editor__heading">
      <div>
        <div class="permission-editor__title">工具权限</div>
        <div class="permission-editor__hint">
          参数先转换为 project/** 或 external/**；未匹配的调用允许执行。
        </div>
      </div>
      <UiButton type="button" @click="addTool">添加工具</UiButton>
    </div>

    <div v-for="(group, groupIndex) in groups" :key="group.id" class="permission-group">
      <div class="permission-group__heading">
        <UiField v-model="group.tool" placeholder="工具名，例如 read、bash" class="font-mono" />
        <UiButton type="button" variant="secondary" @click="removeTool(groupIndex)">删除</UiButton>
      </div>
      <div v-for="(rule, ruleIndex) in group.rules" :key="rule.id" class="permission-rule">
        <UiField
          v-model="rule.pattern"
          placeholder="参数 Glob，例如 external/**"
          class="font-mono"
        />
        <UiField v-model="rule.effect" as="select" class="permission-rule__effect">
          <option value="ask">ask</option>
          <option value="deny">deny</option>
        </UiField>
        <UiButton type="button" variant="secondary" @click="removeRule(groupIndex, ruleIndex)">
          删除
        </UiButton>
      </div>
      <UiButton type="button" variant="secondary" @click="addRule(groupIndex)">添加规则</UiButton>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { AgentPermissionEffect, AgentPermissionRules } from "@/api";
import { UiButton, UiField } from "./ui";

type RuleDraft = { id: number; pattern: string; effect: AgentPermissionEffect };
type GroupDraft = { id: number; tool: string; rules: RuleDraft[] };

const props = defineProps<{ modelValue: AgentPermissionRules }>();
const emit = defineEmits<{ "update:modelValue": [value: AgentPermissionRules] }>();
let nextId = 1;
const groups = ref<GroupDraft[]>([]);

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

function addTool() {
  groups.value.push({
    id: nextId++,
    tool: "",
    rules: [{ id: nextId++, pattern: "", effect: "ask" }],
  });
}

function removeTool(index: number) {
  groups.value.splice(index, 1);
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
.permission-group__heading,
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
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
}
.permission-group__heading > :first-child,
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
