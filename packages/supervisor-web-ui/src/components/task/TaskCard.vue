<template>
  <article
    class="task-card-ui"
    :class="[`task-card-ui--${density}`, { 'task-card-ui--interactive': interactive }]"
    :tabindex="interactive ? 0 : undefined"
    :role="interactive ? 'button' : undefined"
    @click="interactive && emit('select')"
    @keydown.enter.prevent="interactive && emit('select')"
    @keydown.space.prevent="interactive && emit('select')"
  >
    <span v-if="accent" class="task-card-ui__accent" :data-accent="accent" />
    <div class="task-card-ui__body">
      <div class="task-card-ui__heading">
        <strong>{{ title }}</strong>
        <span v-if="statusLabel" class="task-card-ui__status" :data-status="status">
          {{ statusLabel }}
        </span>
      </div>
      <p v-if="description">{{ description }}</p>
      <div v-if="projectName || agentName || $slots.meta" class="task-card-ui__meta">
        <span v-if="projectName" class="task-card-ui__project">
          <FolderGit2 />{{ projectName }}
        </span>
        <span v-if="agentName" class="task-card-ui__agent">
          <AgentAvatar
            :agent-id="String(agentId ?? agentName)"
            :agent-name="agentName"
            :icon="agentAvatar"
          />
          {{ agentName }}
        </span>
        <slot name="meta" />
      </div>
      <slot />
    </div>
    <slot name="trailing" />
  </article>
</template>

<script setup lang="ts">
import { FolderGit2 } from "lucide-vue-next";
import AgentAvatar from "@/components/agent/AgentAvatar.vue";

withDefaults(
  defineProps<{
    title: string;
    description?: string;
    projectName?: string;
    agentId?: string | number | null;
    agentName?: string;
    agentAvatar?: string | null;
    status?: string;
    statusLabel?: string;
    accent?: string;
    density?: "default" | "compact";
    interactive?: boolean;
  }>(),
  {
    description: "",
    projectName: "",
    agentId: null,
    agentName: "",
    agentAvatar: null,
    status: "",
    statusLabel: "",
    accent: "",
    density: "default",
    interactive: false,
  },
);

const emit = defineEmits<{ select: [] }>();
</script>

<style scoped>
.task-card-ui {
  display: flex;
  min-width: 0;
  gap: 10px;
  padding: 11px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 9px;
  text-align: left;
  background: var(--app-settings-card);
}
.task-card-ui--interactive {
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;
}
.task-card-ui--interactive:hover,
.task-card-ui--interactive:focus-visible {
  border-color: color-mix(in srgb, #07c160 45%, var(--app-border));
  box-shadow: 0 3px 12px rgb(0 0 0 / 7%);
  outline: none;
}
.task-card-ui--interactive:active {
  transform: scale(0.995);
}
.task-card-ui__accent {
  width: 3px;
  flex: none;
  align-self: stretch;
  border-radius: 4px;
  background: #9ca3af;
}
.task-card-ui__accent[data-accent="running"] {
  background: #3b82f6;
}
.task-card-ui__accent[data-accent="blocked"],
.task-card-ui__accent[data-accent="error"] {
  background: #ef4444;
}
.task-card-ui__accent[data-accent="done"] {
  background: #07c160;
}
.task-card-ui__body {
  min-width: 0;
  flex: 1;
}
.task-card-ui__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.task-card-ui__heading strong {
  min-width: 0;
  flex: 1;
  color: var(--app-text-primary);
  font-size: 0.875rem;
  line-height: 1.4;
}
.task-card-ui p {
  display: -webkit-box;
  margin: 4px 0 8px;
  overflow: hidden;
  color: var(--app-text-body);
  font-size: 0.8125rem;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.task-card-ui__status {
  flex: none;
  padding: 3px 8px;
  border-radius: 999px;
  color: var(--app-text-muted);
  background: var(--app-hover);
  font-size: 0.6875rem;
  font-weight: 650;
}
.task-card-ui__status[data-status="running"],
.task-card-ui__status[data-status="in_progress"] {
  color: #1769aa;
  background: #e7f2ff;
}
.task-card-ui__status[data-status="blocked"],
.task-card-ui__status[data-status="error"] {
  color: #b42318;
  background: #feeceb;
}
.task-card-ui__status[data-status="done"] {
  color: #078548;
  background: #e5f7ed;
}
.task-card-ui__status[data-status="pending"],
.task-card-ui__status[data-status="todo"],
.task-card-ui__status[data-status="backlog"] {
  color: #765b14;
  background: #fff5d8;
}
.task-card-ui__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 9px;
}
.task-card-ui__meta > :deep(span),
.task-card-ui__project,
.task-card-ui__agent {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--app-text-secondary);
  font-size: 0.75rem;
}
.task-card-ui__project {
  padding: 3px 6px;
  border-radius: 5px;
  color: #2870bd;
  background: color-mix(in srgb, #3b82f6 10%, transparent);
}
.task-card-ui__project svg {
  width: 12px;
  height: 12px;
}
.task-card-ui__agent :deep(.agent-avatar) {
  width: 17px;
  height: 17px;
  border-radius: 50%;
  font-size: 8px;
}
.task-card-ui--compact {
  padding: 9px;
  border-radius: 8px;
}
.task-card-ui--compact .task-card-ui__heading strong {
  font-size: 0.8125rem;
}
.task-card-ui--compact p {
  margin-bottom: 6px;
  font-size: 0.75rem;
  -webkit-line-clamp: 2;
}
@media (max-width: 720px) {
  .task-card-ui {
    min-height: 86px;
    padding: 13px 12px;
    border-radius: 11px;
  }
  .task-card-ui__heading strong {
    font-size: var(--m-font-list-primary, 15px);
  }
  .task-card-ui p {
    margin-block: 5px 9px;
    font-size: var(--m-font-list-secondary, 13px);
  }
  .task-card-ui__meta > :deep(span),
  .task-card-ui__project,
  .task-card-ui__agent {
    font-size: var(--m-font-time, 11px);
  }
  .task-card-ui__status {
    font-size: var(--m-font-time, 11px);
  }
}
</style>
