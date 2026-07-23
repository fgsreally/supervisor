<template>
  <AgentAvatar
    v-if="avatar.icon"
    class="session-avatar"
    :class="sizeClass"
    :style="sizeStyle"
    :agent-id="agentId || sessionId"
    :agent-name="name"
    :icon="avatar.icon"
  />
  <div
    v-else
    class="session-avatar session-avatar--letter rounded-md flex items-center justify-center text-white font-medium shadow-sm shrink-0"
    :class="sizeClass"
    :style="{ ...sizeStyle, backgroundColor: avatar.color }"
  >
    {{ avatar.text }}
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AgentAvatar from "./AgentAvatar.vue";
import { sessionAvatar, type SessionAvatarValue } from "@/utils/session-avatar";

const props = withDefaults(
  defineProps<{
    sessionId: string;
    name: string;
    agentId?: string | null;
    avatar?: Partial<SessionAvatarValue> | null;
    agentIcon?: string | null;
    size?: number;
  }>(),
  {
    agentId: null,
    avatar: null,
    agentIcon: null,
    size: 40,
  },
);

const avatar = computed(() =>
  sessionAvatar(props.sessionId, props.name, props.avatar ?? undefined, props.agentIcon),
);

const sizeClass = computed(() => (props.size === 48 ? "session-avatar--lg" : ""));
const sizeStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontSize: props.size >= 44 ? "18px" : "16px",
}));
</script>

<style scoped>
.session-avatar {
  width: 40px;
  height: 40px;
}

.session-avatar--lg {
  width: 48px;
  height: 48px;
}

.session-avatar--letter {
  font-size: 16px;
}
</style>
