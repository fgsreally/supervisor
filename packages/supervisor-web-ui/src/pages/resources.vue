<template>
  <ListDetailChrome :show-list="!isMobile || mobilePage === 'list'">
    <template #list>
      <ResourcesPanel
        data-tour-page="resources"
        class="h-full w-full"
        :active-id="activeResourceId"
        @select="selectResource"
      />
    </template>
    <RouterView />
    <ResourceDetailView
      v-if="!hasChild && activeResourceId && !isMobile"
      :resource-id="activeResourceId"
      @deleted="onResourceDeleted"
    />
    <EmptyPlaceholder v-else-if="!hasChild && !isMobile" tab="resources" />
  </ListDetailChrome>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useAppShell } from "@/composables/use-app-shell";
import ResourcesPanel from "@/components/resource/ResourcesPanel.vue";
import ListDetailChrome from "@/components/layout/ListDetailChrome.vue";
import EmptyPlaceholder from "@/components/base/EmptyPlaceholder.vue";
import ResourceDetailView from "@/views/resource/ResourceDetailView.vue";

defineOptions({ name: "ResourcesPage" });

const route = useRoute();
const hasChild = computed(() => route.path !== "/resources");
const { isMobile, mobilePage, activeResourceId, selectResource, onResourceDeleted } = useAppShell();
</script>
