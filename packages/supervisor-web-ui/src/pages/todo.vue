<template>
  <WorkShell mode="todo" data-tour-page="work" @navigate="navigateMobilePath">
    <TodoView
      data-tour-page="todo"
      class="flex-1 min-w-0 h-full"
      @open-session="openSessionFromHome"
    />
  </WorkShell>
</template>

<script setup lang="ts">
import { useAppShell } from "@/composables/use-app-shell";
import WorkShell from "@/components/home/WorkShell/index.vue";
import TodoView from "@/views/TodoView.vue";

defineOptions({ name: "TodoPage" });

const { openSessionFromHome, navigateMobilePath } = useAppShell();
</script>
