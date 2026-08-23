<template>
  <ResponsiveDialog
    :open="open"
    :title="t('projectGroups.title')"
    :description="t('projectGroups.description')"
    width="sm"
    size="auto"
    panel-class="form-dialog project-group-manager-dialog"
    @close="emit('close')"
  >
    <div class="project-group-manager form-dialog__body">
      <div v-if="groups.length" class="project-group-manager__list">
        <div
          v-for="group in groups"
          :key="group.name"
          class="project-group-manager__item"
          :class="{ 'project-group-manager__item--example': group.example }"
        >
          <div class="project-group-manager__item-main">
            <span class="project-group-manager__dot" aria-hidden="true" />
            <input
              v-model="draftNames[group.name]"
              class="project-group-manager__input form-dialog__input"
              :disabled="busy || group.example"
              :aria-label="group.name"
              @keydown.enter.prevent="saveRename(group)"
            />
            <span class="project-group-manager__count">{{ group.count }}</span>
          </div>
          <span v-if="group.example" class="project-group-manager__badge">
            {{ t("projectGroups.example") }}
          </span>
          <template v-else>
            <UiActionButton
              variant="secondary"
              :disabled="busy || !isRenameDirty(group)"
              @click="saveRename(group)"
            >
              {{ t("common.save") }}
            </UiActionButton>
            <button
              type="button"
              class="project-group-manager__delete"
              :disabled="busy"
              :aria-label="t('projectGroups.delete')"
              :title="t('projectGroups.delete')"
              @click="emit('delete', group.name)"
            >
              <Trash2 aria-hidden="true" />
            </button>
          </template>
        </div>
      </div>
      <p v-else class="project-group-manager__empty">{{ t("projectGroups.empty") }}</p>

      <section class="project-group-manager__create">
        <h3>{{ t("projectGroups.createTitle") }}</h3>
        <div class="project-group-manager__create-row">
          <input
            v-model="newGroupName"
            class="project-group-manager__input form-dialog__input"
            :placeholder="t('projectGroups.namePlaceholder')"
            :disabled="busy"
            @keydown.enter.prevent="createGroup"
          />
          <select
            v-model="newProjectId"
            class="project-group-manager__select form-dialog__input"
            :disabled="busy"
          >
            <option value="">{{ t("projectGroups.projectPlaceholder") }}</option>
            <option v-for="project in ungroupedProjects" :key="project.id" :value="project.id">
              {{ project.name }}
            </option>
          </select>
          <UiActionButton :disabled="busy || !canCreate" @click="createGroup">
            {{ t("common.create") }}
          </UiActionButton>
        </div>
        <p v-if="!ungroupedProjects.length" class="project-group-manager__hint">
          {{ t("projectGroups.noUngroupedProjects") }}
        </p>
      </section>
    </div>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Trash2 } from "lucide-vue-next";
import ResponsiveDialog from "@/components/base/ResponsiveDialog/index.vue";
import UiActionButton from "@/components/base/UiActionButton.vue";
import { useI18n } from "@/i18n";

export interface ProjectGroupOption {
  name: string;
  count: number;
  example?: boolean;
}

const props = defineProps<{
  open: boolean;
  groups: ProjectGroupOption[];
  ungroupedProjects: Array<{ id: string; name: string }>;
  busy?: boolean;
}>();
const emit = defineEmits<{
  close: [];
  rename: [oldName: string, newName: string];
  delete: [name: string];
  create: [name: string, projectId: string];
}>();
const { t } = useI18n();

const draftNames = ref<Record<string, string>>({});
const newGroupName = ref("");
const newProjectId = ref("");

watch(
  () => [props.open, props.groups] as const,
  ([open, groups]) => {
    if (!open) return;
    draftNames.value = Object.fromEntries(groups.map((group) => [group.name, group.name]));
    newGroupName.value = "";
    newProjectId.value = props.ungroupedProjects[0]?.id ?? "";
  },
  { deep: true },
);

const canCreate = computed(() => newGroupName.value.trim() && newProjectId.value);

function isRenameDirty(group: ProjectGroupOption) {
  return (
    Boolean(draftNames.value[group.name]?.trim()) &&
    draftNames.value[group.name].trim() !== group.name
  );
}

function saveRename(group: ProjectGroupOption) {
  const name = draftNames.value[group.name]?.trim();
  if (!name || name === group.name || group.example) return;
  emit("rename", group.name, name);
}

function createGroup() {
  const name = newGroupName.value.trim();
  if (!name || !newProjectId.value) return;
  emit("create", name, newProjectId.value);
}
</script>

<style scoped>
.project-group-manager {
  color: var(--app-text-primary);
}

.project-group-manager__list {
  display: grid;
  gap: 0.5rem;
  max-height: min(50vh, 24rem);
  overflow-y: auto;
}

.project-group-manager__item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.5rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--app-border-subtle);
  border-radius: var(--app-radius-control);
}

.project-group-manager__item--example {
  border-color: color-mix(in srgb, var(--app-accent) 35%, var(--app-border-subtle));
  background: color-mix(in srgb, var(--app-accent) 10%, transparent);
}

.project-group-manager__item-main,
.project-group-manager__create-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.project-group-manager__item-main {
  min-width: 0;
  flex: 1;
}

.project-group-manager__dot {
  width: 0.5rem;
  height: 0.5rem;
  flex: none;
  border-radius: 999px;
  background: var(--app-accent);
}

.project-group-manager__input {
  width: 100%;
}

.project-group-manager__select {
  max-width: 12rem;
}

.project-group-manager__count,
.project-group-manager__hint,
.project-group-manager__empty {
  color: var(--app-text-muted);
  font-size: var(--app-font-caption);
}

.project-group-manager__count {
  flex: none;
  min-width: 1.25rem;
  text-align: right;
}

.project-group-manager__badge {
  flex: none;
  color: var(--app-accent);
  font-size: var(--app-font-micro);
}

.project-group-manager__delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--app-control-height);
  height: var(--app-control-height);
  border-radius: var(--app-radius-control);
  color: var(--app-text-muted);
}

.project-group-manager__delete:hover:not(:disabled) {
  color: var(--app-danger);
  background: var(--app-hover);
}

.project-group-manager__delete:disabled {
  opacity: 0.5;
}

.project-group-manager__delete svg {
  width: 1rem;
  height: 1rem;
}

.project-group-manager__create {
  display: grid;
  gap: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--app-border-subtle);
}

.project-group-manager__create h3 {
  margin: 0;
  font-size: var(--app-font-body-strong);
  font-weight: var(--app-font-weight-medium);
}

.project-group-manager__create-row > .project-group-manager__input {
  flex: 1;
}

.project-group-manager__hint {
  margin: 0;
}
</style>
