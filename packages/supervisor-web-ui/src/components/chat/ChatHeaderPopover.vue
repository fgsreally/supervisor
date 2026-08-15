<template>
  <ResponsivePopover
    v-if="!hideWhenEmpty || visible"
    v-model:open="openProxy"
    :title="title"
    :panel-class="panelClass"
    :dismiss-on-outside="dismissOnOutside"
  >
    <template #trigger>
      <ChatHeaderAction
        :title="title"
        :active="openProxy"
        :count="count"
        @click="openProxy = !openProxy"
      >
        <slot name="icon" />
      </ChatHeaderAction>
    </template>

    <template #default="{ mobile }">
      <header v-if="!mobile" class="chat-header-popover__header">
        <slot name="header">{{ title }}</slot>
      </header>
      <div v-else class="chat-header-popover__mobile-header">
        <slot name="mobile-header">
          <span>{{ title }}</span>
        </slot>
      </div>
      <slot :mobile="mobile" />
    </template>
  </ResponsivePopover>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ResponsivePopover from "@/components/base/ResponsivePopover/index.vue";
import ChatHeaderAction from "./ChatHeaderAction.vue";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    count?: number;
    visible?: boolean;
    hideWhenEmpty?: boolean;
    panelClass?: string;
    dismissOnOutside?: boolean;
  }>(),
  { count: undefined, visible: true, hideWhenEmpty: false, panelClass: undefined, dismissOnOutside: true },
);

const emit = defineEmits<{ "update:open": [open: boolean] }>();
const openProxy = computed({
  get: () => props.open,
  set: (value: boolean) => emit("update:open", value),
});
</script>

<style scoped>
.chat-header-popover__header,
.chat-header-popover__mobile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
