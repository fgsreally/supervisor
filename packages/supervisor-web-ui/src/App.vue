<template>
  <div
    class="flex h-screen w-screen overflow-hidden font-sans"
    style="background: var(--app-shell-bg)"
  >
    <template v-if="!isMobile">
      <ShellNav :tab="mainTab" @update:tab="onTabChange" />

      <div class="flex flex-1 min-w-0 min-h-0 overflow-hidden">
        <SettingsPanel v-if="mainTab === 'settings'" class="flex-1 min-w-0 h-full" />
        <template v-else>
          <div
            class="relative shrink-0 h-full hidden md:block"
            :style="{ width: `${chatListWidth}px` }"
          >
            <ChatListPanel
              v-if="mainTab === 'chat'"
              class="h-full w-full"
              :active-id="activeSessionId ?? ''"
              @select="selectSession"
              @delete="onSessionDelete"
              @settings="onTabChange('settings')"
            />
            <ContactsPanel
              v-else-if="mainTab === 'contacts'"
              class="h-full w-full"
              :active-id="activeAgentId ?? ''"
              @select="selectAgent"
              @add="openAgentAdd"
            />
            <ProvidersPanel
              v-else-if="mainTab === 'providers'"
              class="h-full w-full"
              :active-id="activeProviderId ?? ''"
              @select-provider="selectProvider"
              @add-provider="openProviderAdd"
              @edit-provider="openProviderEditFor"
              @delete-provider="onDeleteProvider"
            />
            <ResourcesPanel
              v-else-if="mainTab === 'resources'"
              class="h-full w-full"
              :active-id="activeResourceId"
              @select="selectResource"
            />
            <ResizeHandle orientation="vertical" label="调整面板宽度" @start="startListResize" />
          </div>

          <main
            class="flex flex-1 flex-col min-w-0 basis-0 h-full overflow-hidden"
            style="background: var(--app-chat-bg)"
          >
            <ChatView
              v-if="mainTab === 'chat' && chatSessionProps"
              :key="activeSessionId ?? undefined"
              :session="chatSessionProps"
              :agent-id="chatSessionProps.agentId"
              @navigate="selectSession"
              @view-agent="viewAgent"
            />
            <AgentFormView
              v-else-if="mainTab === 'contacts' && agentPage === 'add'"
              @cancel="closeAgentForm"
              @saved="onAgentSaved"
            />
            <ContactDetailView
              v-else-if="mainTab === 'contacts' && activeAgent"
              :agent-id="activeAgentId ?? ''"
              @open-chat="openChatFromContact"
              @view-provider="viewProvider"
            />
            <ProviderFormView
              v-else-if="mainTab === 'providers' && providerPage === 'add'"
              :provider-id="null"
              @cancel="closeProviderForm"
              @saved="onProviderSaved"
            />
            <ProviderModelFormView
              v-else-if="
                mainTab === 'providers' &&
                activeProvider &&
                activeProviderId &&
                (providerPage === 'model-add' || providerPage === 'model-edit')
              "
              :provider-id="activeProviderId"
              :provider-name="activeProvider.name"
              :mode="providerPage === 'model-add' ? 'create' : 'edit'"
              :model="activeProviderModelUi"
              @cancel="closeModelForm"
              @saved="onModelSaved"
            />
            <ProviderModelDetailView
              v-else-if="mainTab === 'providers' && activeProvider && activeProviderModel"
              :provider="activeProvider"
              :model="activeProviderModel"
              @edit="openModelEdit"
              @deleted="deleteActiveModel"
            />
            <ProviderDetailView
              v-else-if="mainTab === 'providers' && activeProviderUi"
              :provider="activeProviderUi"
              @view-agent="viewAgent"
              @edit="openProviderEdit"
              @add-model="openAddModel(activeProviderUi.id)"
              @select-model="selectModelById"
              @edit-model="editModelById"
              @delete-model="deleteModelById"
              @toggle-enabled="setProviderEnabled"
            />
            <ResourceDetailView
              v-else-if="mainTab === 'resources' && activeResourceId"
              :resource-id="activeResourceId"
            />
            <EmptyPlaceholder v-else :tab="mainTab" />
          </main>
        </template>
      </div>
    </template>

    <template v-else>
      <div class="flex-1 flex flex-col min-w-0">
        <SettingsPanel
          v-if="mainTab === 'settings'"
          :show-back="true"
          @back="onTabChange('chat')"
        />
        <template v-else-if="mobilePage === 'list'">
          <ChatListPanel
            v-if="mainTab === 'chat'"
            :active-id="activeSessionId ?? ''"
            @select="selectSession"
            @delete="onSessionDelete"
            @settings="openMobileSettings"
          />
          <ContactsPanel
            v-else-if="mainTab === 'contacts'"
            :active-id="activeAgentId ?? ''"
            @select="selectAgent"
            @add="openAgentAdd"
          />
          <ProvidersPanel
            v-else-if="mainTab === 'providers'"
            :active-id="activeProviderId ?? ''"
            @select-provider="selectProvider"
            @add-provider="openProviderAdd"
            @edit-provider="openProviderEditFor"
            @delete-provider="onDeleteProvider"
          />
          <ResourcesPanel v-else :active-id="activeResourceId" @select="selectResource" />
        </template>
        <template v-else>
          <ChatView
            v-if="mainTab === 'chat' && chatSessionProps"
            :key="activeSessionId ?? undefined"
            :session="chatSessionProps"
            :agent-id="chatSessionProps.agentId"
            :show-back="true"
            @back="backToMobileList"
            @navigate="selectSession"
            @view-agent="viewAgent"
          />
          <AgentFormView
            v-else-if="mainTab === 'contacts' && agentPage === 'add'"
            :show-back="true"
            @cancel="closeAgentForm"
            @saved="onAgentSaved"
          />
          <ContactDetailView
            v-else-if="mainTab === 'contacts' && activeAgent"
            :agent-id="activeAgentId ?? ''"
            :show-back="true"
            @back="backToMobileList"
            @open-chat="openChatFromContact"
            @view-provider="viewProvider"
          />
          <ProviderFormView
            v-else-if="mainTab === 'providers' && providerPage === 'add'"
            :provider-id="null"
            :show-back="true"
            @cancel="closeProviderForm"
            @saved="onProviderSaved"
          />
          <ProviderModelFormView
            v-else-if="
              mainTab === 'providers' &&
              activeProvider &&
              activeProviderId &&
              (providerPage === 'model-add' || providerPage === 'model-edit')
            "
            :provider-id="activeProviderId"
            :provider-name="activeProvider.name"
            :mode="providerPage === 'model-add' ? 'create' : 'edit'"
            :model="activeProviderModelUi"
            @cancel="closeModelForm"
            @saved="onModelSaved"
          />
          <ProviderModelDetailView
            v-else-if="mainTab === 'providers' && activeProvider && activeProviderModel"
            :provider="activeProvider"
            :model="activeProviderModel"
            @edit="openModelEdit"
            @deleted="deleteActiveModel"
          />
          <ProviderDetailView
            v-else-if="mainTab === 'providers' && activeProviderUi"
            :provider="activeProviderUi"
            :show-back="true"
            @back="backToMobileList"
            @view-agent="viewAgent"
            @edit="openProviderEdit"
            @add-model="openAddModel(activeProviderUi.id)"
            @select-model="selectModelById"
            @edit-model="editModelById"
            @delete-model="deleteModelById"
            @toggle-enabled="setProviderEnabled"
          />
          <ResourceDetailView
            v-else-if="mainTab === 'resources' && activeResourceId"
            :resource-id="activeResourceId"
            :show-back="true"
            @back="backToMobileList"
          />
        </template>
      </div>
      <nav
        v-if="mobilePage === 'list'"
        class="md:hidden fixed bottom-0 inset-x-0 h-14 border-t z-30 flex mobile-bottom-nav"
        style="background: var(--app-nav-bg); border-color: var(--app-border)"
      >
        <button
          type="button"
          class="flex-1 flex flex-col items-center justify-center text-[10px] transition-colors mobile-bottom-nav__btn"
          :class="mainTab === 'chat' ? 'mobile-bottom-nav__btn--active' : ''"
          @click="onTabChange('chat')"
        >
          <MessageSquare class="w-5 h-5 mb-0.5" />
          聊天
        </button>
        <button
          type="button"
          class="flex-1 flex flex-col items-center justify-center text-[10px] transition-colors mobile-bottom-nav__btn"
          :class="mainTab === 'contacts' ? 'mobile-bottom-nav__btn--active' : ''"
          @click="onTabChange('contacts')"
        >
          <Users class="w-5 h-5 mb-0.5" />
          智能代理
        </button>
        <button
          type="button"
          class="flex-1 flex flex-col items-center justify-center text-[10px] transition-colors mobile-bottom-nav__btn"
          :class="mainTab === 'providers' ? 'mobile-bottom-nav__btn--active' : ''"
          @click="onTabChange('providers')"
        >
          <Cloud class="w-5 h-5 mb-0.5" />
          模型
        </button>
        <button
          type="button"
          class="flex-1 flex flex-col items-center justify-center text-[10px] transition-colors mobile-bottom-nav__btn"
          :class="mainTab === 'resources' ? 'mobile-bottom-nav__btn--active' : ''"
          @click="onTabChange('resources')"
        >
          <FolderOpen class="w-5 h-5 mb-0.5" />
          资源
        </button>
      </nav>
      <div v-if="mobilePage === 'list'" class="md:hidden h-14 shrink-0"></div>
    </template>

    <GlobalSearchModal :open="searchOpen" @close="searchOpen = false" @navigate="selectSession" />
    <ProviderModelEditor
      :open="modelEditorOpen"
      mode="edit"
      :model="activeProviderModelUi"
      :saving="modelEditorSaving"
      @cancel="modelEditorOpen = false"
      @save="saveModelFromDialog"
    />
    <UiMessageHost />
    <ProviderEditDialog
      :open="providerEditOpen"
      :provider-id="providerEditId ?? ''"
      @close="closeProviderEdit"
      @saved="onProviderEditSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Cloud, FolderOpen, MessageSquare, Users } from "lucide-vue-next";
import ShellNav, { type MainTab } from "./components/ShellNav.vue";
import ChatListPanel from "./components/ChatListPanel.vue";
import ContactsPanel from "./components/ContactsPanel.vue";
import ProvidersPanel from "./components/ProvidersPanel.vue";
import ResourcesPanel from "./components/ResourcesPanel.vue";
import ResizeHandle from "./components/ResizeHandle.vue";
import { useResizableWidth } from "./composables/use-resizable-width";
import SettingsPanel from "./components/SettingsPanel.vue";
import EmptyPlaceholder from "./components/EmptyPlaceholder.vue";
import ContactDetailView from "./views/ContactDetailView.vue";
import AgentFormView from "./views/AgentFormView.vue";
import ResourceDetailView from "./views/ResourceDetailView.vue";
import ProviderDetailView from "./views/ProviderDetailView.vue";
import ProviderFormView from "./views/ProviderFormView.vue";
import ProviderModelDetailView from "./views/ProviderModelDetailView.vue";
import ProviderModelFormView from "./views/ProviderModelFormView.vue";
import ProviderEditDialog from "./components/ProviderEditDialog.vue";
import ProviderModelEditor from "./components/ProviderModelEditor.vue";
import ChatView from "./views/ChatView.vue";
import GlobalSearchModal from "./components/GlobalSearchModal.vue";
import UiMessageHost from "./components/UiMessageHost.vue";
import { showUiMessage } from "./composables/use-ui-message";
import { useSessionStore, useAgentStore, useProviderStore, useResourceStore } from "./store";
import { providerToUI } from "./utils/provider-ui";
import { getDefaultWorkspaceCwd } from "./config/workspace";
import { idFromRoute, modelIdFromRoute, tabFromRoute } from "./router";

const { width: chatListWidth, startResize: startListResize } = useResizableWidth({
  defaultWidth: 288,
  minWidth: 220,
  maxWidth: 480,
  storageKey: "pi-supervisor-chat-list-width",
});

const route = useRoute();
const router = useRouter();

const sessionStore = useSessionStore();
const agentStore = useAgentStore();
const providerStore = useProviderStore();
const resourceStore = useResourceStore();

const mainTab = ref<MainTab>("chat");
const activeSessionId = ref<string | null>(null);
const activeAgentId = ref<string | null>(null);
const activeProviderId = ref<string | null>(null);
const activeModelId = ref<string | null>(null);
const activeResourceId = ref<string | null>(null);
const isMobile = ref(false);
const mobilePage = ref<"list" | "detail">("list");
const searchOpen = ref(false);
const modelEditorOpen = ref(false);
const modelEditorSaving = ref(false);
type ProviderPage = "detail" | "add" | "model-add" | "model-edit";
type AgentPage = "detail" | "add";

const providerPage = ref<ProviderPage>("detail");
const agentPage = ref<AgentPage>("detail");
const providerEditOpen = ref(false);
const providerEditId = ref<string | null>(null);

function applyRoute() {
  const tab = tabFromRoute(route);
  const id = idFromRoute(route);
  mainTab.value = tab;
  if (tab === "chat") activeSessionId.value = id ?? activeSessionId.value;
  else if (tab === "contacts") activeAgentId.value = id ?? activeAgentId.value;
  else if (tab === "providers") {
    activeProviderId.value = id ?? activeProviderId.value;
    activeModelId.value = modelIdFromRoute(route) ?? null;
    providerPage.value = "detail";
  } else if (tab === "resources") activeResourceId.value = id ?? activeResourceId.value;
  if (id && tab !== "settings" && isMobile.value) mobilePage.value = "detail";
}

function pushRoute() {
  const tab = mainTab.value;
  if (tab === "chat") {
    void router.push(activeSessionId.value ? `/chat/${activeSessionId.value}` : "/chat");
  } else if (tab === "contacts") {
    void router.push(activeAgentId.value ? `/contacts/${activeAgentId.value}` : "/contacts");
  } else if (tab === "providers") {
    const providerPath = activeProviderId.value ? `/providers/${activeProviderId.value}` : null;
    void router.push(
      providerPath && activeModelId.value
        ? `${providerPath}/models/${encodeURIComponent(activeModelId.value)}`
        : (providerPath ?? "/providers"),
    );
  } else if (tab === "resources") {
    void router.push(
      activeResourceId.value ? `/resources/${activeResourceId.value}` : "/resources",
    );
  } else if (tab === "settings") {
    void router.push("/settings");
  }
}

watch(() => route.fullPath, applyRoute);

onMounted(() => {
  updateMobileFlag();
  window.addEventListener("resize", updateMobileFlag);

  Promise.all([
    sessionStore.fetchProjects(),
    sessionStore.fetchSessions(),
    agentStore.fetchAgents(),
    providerStore.fetchProviders().then(() => {
      for (const p of providerStore.providers) {
        void providerStore.fetchModels(p.id);
      }
    }),
    resourceStore.fetchGlobalResources(),
  ])
    .then(() => {
      if (route.path === "/" || route.path === "") {
        const firstSession = sessionStore.sessions.find((s) => s.showInSessionList);
        if (firstSession) activeSessionId.value = firstSession.id;
        void router.replace(firstSession ? `/chat/${firstSession.id}` : "/chat");
      } else {
        applyRoute();
        if (mainTab.value === "providers" && !activeProviderId.value) {
          const first = providerStore.providers[0];
          if (first) {
            activeProviderId.value = first.id;
            void providerStore.fetchModels(first.id);
          }
        }
        if (mainTab.value === "resources" && !activeResourceId.value) {
          activeResourceId.value = resourceStore.resourceItems[0]?.id ?? null;
        }
      }
    })
    .catch(console.error);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateMobileFlag);
});

const activeSession = computed(() => {
  if (!activeSessionId.value) return null;
  return sessionStore.sessions.find((s) => s.id === activeSessionId.value) ?? null;
});

const activeAgent = computed(() => {
  if (!activeAgentId.value) return null;
  return agentStore.agents.find((a) => a.id === activeAgentId.value) ?? null;
});

const activeProvider = computed(() => {
  if (!activeProviderId.value) return null;
  return providerStore.providers.find((p) => p.id === activeProviderId.value) ?? null;
});

const activeProviderUi = computed(() => {
  const p = activeProvider.value;
  if (!p) return null;
  return providerToUI(p, providerStore.models[p.id] ?? []);
});

const activeProviderModel = computed(() => {
  if (!activeProviderId.value || !activeModelId.value) return null;
  return (
    (providerStore.models[activeProviderId.value] ?? []).find(
      (model) => model.modelId === activeModelId.value,
    ) ?? null
  );
});

const activeProviderModelUi = computed(() => {
  const model = activeProviderModel.value;
  if (!model) return null;
  return {
    id: model.modelId,
    name: model.name ?? model.modelId,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    supportsMultimodal: model.supportsMultimodal,
    tags: model.tags,
  };
});

const chatSessionProps = computed(() => {
  const s = activeSession.value;
  if (!s) return null;
  return {
    id: s.id,
    status: s.status,
    meta: s.meta,
    agentId: s.agentId ?? undefined,
    workspaceId: s.cwd,
    pinned: !!s.meta?.pinned,
    muted: !!s.meta?.muted,
  };
});

function selectSession(id: string) {
  activeSessionId.value = id;
  if (isMobile.value && mainTab.value !== "settings") {
    mobilePage.value = "detail";
  }
  pushRoute();
}

function onSessionDelete(id: string) {
  if (activeSessionId.value !== id) return;
  const next = sessionStore.sessions.find((s) => s.showInSessionList);
  activeSessionId.value = next?.id ?? null;
  if (isMobile.value && !next) mobilePage.value = "list";
  pushRoute();
}

function selectAgent(id: string) {
  activeAgentId.value = id;
  agentPage.value = "detail";
  if (isMobile.value) mobilePage.value = "detail";
  pushRoute();
}

function openAgentAdd() {
  agentPage.value = "add";
  if (isMobile.value) mobilePage.value = "detail";
}

function closeAgentForm() {
  const wasAdd = agentPage.value === "add";
  agentPage.value = "detail";
  if (isMobile.value && wasAdd && !activeAgentId.value) mobilePage.value = "list";
}

async function onAgentSaved(id: string) {
  activeAgentId.value = id;
  agentPage.value = "detail";
  await agentStore.fetchAgents();
  if (isMobile.value) mobilePage.value = "detail";
  pushRoute();
}

function selectProvider(id: string) {
  activeProviderId.value = id;
  activeModelId.value = null;
  providerPage.value = "detail";
  void providerStore.fetchModels(id);
  if (isMobile.value) mobilePage.value = "detail";
  pushRoute();
}

function selectModel(model: { providerId: string | null; modelId: string }) {
  if (!model.providerId) return;
  activeProviderId.value = model.providerId;
  activeModelId.value = model.modelId;
  providerPage.value = "detail";
  void providerStore.fetchModels(model.providerId);
  if (isMobile.value) mobilePage.value = "detail";
  pushRoute();
}

function selectModelById(modelId: string) {
  if (!activeProviderId.value) return;
  selectModel({ providerId: activeProviderId.value, modelId });
}

function openAddModel(providerId: string) {
  activeProviderId.value = providerId;
  activeModelId.value = null;
  providerPage.value = "model-add";
  if (isMobile.value) mobilePage.value = "detail";
  pushRoute();
}

function openProviderAdd() {
  activeModelId.value = null;
  providerPage.value = "add";
  if (isMobile.value) mobilePage.value = "detail";
}

function openProviderEdit() {
  if (!activeProviderId.value) return;
  providerEditId.value = activeProviderId.value;
  providerEditOpen.value = true;
}

function openProviderEditFor(providerId: string) {
  activeProviderId.value = providerId;
  activeModelId.value = null;
  providerPage.value = "detail";
  providerEditId.value = providerId;
  providerEditOpen.value = true;
  void providerStore.fetchModels(providerId);
  if (isMobile.value) mobilePage.value = "detail";
}

function closeProviderEdit() {
  providerEditOpen.value = false;
}

async function onProviderEditSaved() {
  if (providerEditId.value) {
    await providerStore.fetchProviders();
    await providerStore.fetchModels(providerEditId.value);
  }
  providerEditOpen.value = false;
}

function openModelEdit() {
  if (!activeProviderModel.value) return;
  modelEditorOpen.value = true;
}

function editModelById(modelId: string) {
  activeModelId.value = modelId;
  openModelEdit();
}

async function saveModelFromDialog(model: NonNullable<typeof activeProviderModelUi.value>) {
  if (!activeProviderId.value || modelEditorSaving.value) return;
  modelEditorSaving.value = true;
  try {
    await providerStore.updateModel(activeProviderId.value, model.id, {
      name: model.name,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
      supportsMultimodal: model.supportsMultimodal,
      tags: model.tags,
    });
    modelEditorOpen.value = false;
    await providerStore.fetchModels(activeProviderId.value);
    showUiMessage("模型保存成功", "success");
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : "模型保存失败", "error");
  } finally {
    modelEditorSaving.value = false;
  }
}

async function deleteModelById(modelId: string) {
  if (!activeProviderId.value) return;
  await providerStore.deleteModel(activeProviderId.value, modelId);
  if (activeModelId.value === modelId) activeModelId.value = null;
}

async function setProviderEnabled(enabled: boolean) {
  if (!activeProviderId.value) return;
  await providerStore.updateProvider(activeProviderId.value, { isEnabled: enabled });
}

function closeModelForm() {
  providerPage.value = "detail";
}

async function onModelSaved(modelId: string) {
  if (!activeProviderId.value) return;
  activeModelId.value = modelId;
  providerPage.value = "detail";
  await providerStore.fetchModels(activeProviderId.value);
  pushRoute();
}

async function deleteActiveModel() {
  if (!activeProviderId.value || !activeModelId.value) return;
  await providerStore.deleteModel(activeProviderId.value, activeModelId.value);
  activeModelId.value = null;
  providerPage.value = "detail";
  pushRoute();
}

function closeProviderForm() {
  const wasAdd = providerPage.value === "add";
  providerPage.value = "detail";
  if (isMobile.value && wasAdd) mobilePage.value = "list";
}

async function onProviderSaved(id: string) {
  activeProviderId.value = id;
  providerPage.value = "detail";
  await providerStore.fetchProviders();
  await providerStore.fetchModels(id);
  if (isMobile.value) mobilePage.value = "detail";
}

async function onDeleteProvider(id: string) {
  try {
    await providerStore.deleteProvider(id);
    if (activeProviderId.value === id) activeProviderId.value = null;
  } catch (err) {
    // error handled by store
  }
}

function selectResource(id: string) {
  activeResourceId.value = id;
  if (isMobile.value) mobilePage.value = "detail";
  pushRoute();
}

function onTabChange(tab: MainTab) {
  mainTab.value = tab;
  mobilePage.value = "list";
  providerPage.value = "detail";
  agentPage.value = "detail";
  if (tab === "resources" && !activeResourceId.value) {
    const first = resourceStore.resourceItems[0];
    if (first) activeResourceId.value = first.id;
  }
  if (tab === "providers" && !activeProvider.value) {
    const first = providerStore.providers[0];
    if (first) activeProviderId.value = first.id;
  }
  pushRoute();
}

function openMobileSettings() {
  onTabChange("settings");
  mobilePage.value = "detail";
}

function viewAgent(agentId: string) {
  activeAgentId.value = agentId;
  agentPage.value = "detail";
  mainTab.value = "contacts";
  if (isMobile.value) mobilePage.value = "detail";
  pushRoute();
}

function viewProvider(providerId: string) {
  activeProviderId.value = providerId;
  mainTab.value = "providers";
  providerPage.value = "detail";
  void providerStore.fetchModels(providerId);
  if (isMobile.value) mobilePage.value = "detail";
  pushRoute();
}

async function openChatFromContact(id: string) {
  if (id.startsWith("new:")) {
    const agentId = id.slice(4);
    const sessions = sessionStore.sessions.filter(
      (s) => s.agentId === agentId && s.showInSessionList,
    );
    if (sessions.length > 0) {
      activeSessionId.value = sessions[0].id;
    } else {
      let project = sessionStore.projects.find((p) => p.cwd === getDefaultWorkspaceCwd());
      project ??= await sessionStore.createProject({ cwd: getDefaultWorkspaceCwd() });
      const session = await sessionStore.createSession({
        projectId: project.id,
        agentId,
        cwd: project.cwd,
        meta: { name: agentStore.getAgentById(agentId)?.name ?? "New chat" },
      });
      activeSessionId.value = session.id;
    }
  } else {
    activeSessionId.value = id;
  }
  mainTab.value = "chat";
  if (isMobile.value) mobilePage.value = "detail";
}

function backToMobileList() {
  mobilePage.value = "list";
}

function updateMobileFlag() {
  isMobile.value = window.matchMedia("(max-width: 768px)").matches;
  if (!isMobile.value) mobilePage.value = "list";
}
</script>

<style>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(128, 128, 128, 0.35);
  border-radius: 10px;
}

.mobile-bottom-nav__btn {
  color: var(--app-nav-icon);
}

.mobile-bottom-nav__btn--active {
  color: var(--app-nav-icon-active);
}
</style>
