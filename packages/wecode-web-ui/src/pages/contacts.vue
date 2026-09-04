<template>
  <ListDetailChrome :show-list="!isMobile || mobilePage === 'list'">
    <template #list>
      <ContactsPanel
        data-tour-page="contacts"
        class="h-full w-full"
        :active-id="activeAgentId ?? ''"
        @select="selectAgent"
        @add="openAgentAdd"
      />
    </template>
    <RouterView />
    <ContactDetailView
      v-if="!hasChild && activeAgent && !isMobile"
      :agent-id="activeAgentId ?? ''"
      @open-chat="openChatFromContact"
      @view-provider="viewProvider"
    />
    <EmptyPlaceholder v-else-if="!hasChild && !isMobile" tab="contacts" />
  </ListDetailChrome>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useAppShell } from "@/composables/use-app-shell";
import ContactsPanel from "@/components/agent/ContactsPanel.vue";
import ListDetailChrome from "@/components/layout/ListDetailChrome.vue";
import EmptyPlaceholder from "@/components/base/EmptyPlaceholder.vue";
import ContactDetailView from "@/views/agent/ContactDetailView.vue";

defineOptions({ name: "ContactsPage" });

const route = useRoute();
const hasChild = computed(() => route.path !== "/contacts");
const {
  isMobile,
  mobilePage,
  activeAgentId,
  activeAgent,
  selectAgent,
  openAgentAdd,
  openChatFromContact,
  viewProvider,
} = useAppShell();
</script>
