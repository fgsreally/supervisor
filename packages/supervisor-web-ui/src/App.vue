<template>
  <div
    class="app-root flex h-full w-full overflow-hidden font-sans"
    style="background: var(--app-shell-bg)"
  >
    <MobileInstanceListView
      v-if="showInstancePicker"
      :allow-dismiss="instancePickerDismissible"
      @connected="onInstanceConnected"
      @dismiss="closeInstancePicker"
    />
    <StartupGate v-else-if="!appReady" @ready="onStartupReady" />
    <template v-else>
      <AddToHomeScreenHint />
      <template v-if="!isMobile">
        <ShellNav :tab="mainTab" @update:tab="onTabChange" @tutorial="introTour?.start()" />

        <div class="flex flex-1 min-w-0 min-h-0 overflow-hidden">
          <TodoView
            v-if="mainTab === 'todo'"
            data-tour-page="todo"
            class="flex-1 min-w-0 h-full"
            @open-session="openSessionFromHome"
          />
          <HomeView
            v-else-if="mainTab === 'dashboard'"
            data-tour-page="dashboard"
            class="flex-1 min-w-0 h-full"
            @open-session="openSessionFromHome"
          />
          <SettingsPanel
            v-else-if="mainTab === 'settings'"
            data-tour-page="settings"
            class="flex-1 min-w-0 h-full"
          />
          <template v-else>
            <div
              class="relative shrink-0 h-full hidden md:block"
              :style="{ width: `${chatListWidth}px` }"
            >
              <KeepAlive>
                <ChatListPanel
                  v-if="mainTab === 'chat'"
                  data-tour-page="chat"
                  class="h-full w-full"
                  :active-id="activeSessionId ?? ''"
                  @select="selectSession"
                  @delete="onSessionDelete"
                  @settings="onTabChange('settings')"
                />
              </KeepAlive>
              <ContactsPanel
                v-if="mainTab === 'contacts'"
                data-tour-page="contacts"
                class="h-full w-full"
                :active-id="activeAgentId ?? ''"
                @select="selectAgent"
                @add="openAgentAdd"
              />
              <ProvidersPanel
                v-if="mainTab === 'providers'"
                data-tour-page="providers"
                class="h-full w-full"
                :active-id="activeProviderId ?? ''"
                @select-provider="selectProvider"
                @add-provider="openProviderAdd"
                @edit-provider="openProviderEditFor"
                @delete-provider="onDeleteProvider"
              />
              <ResourcesPanel
                v-if="mainTab === 'resources'"
                data-tour-page="resources"
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
                @deleted="onResourceDeleted"
              />
              <EmptyPlaceholder v-else :tab="mainTab" />
            </main>
          </template>
        </div>
      </template>

      <MobileAppShell
        v-else
        :tab="mainTab"
        :show-nav="mobileShowPrimaryNav"
        @navigate="onMobileRootNavigate"
      >
        <div class="flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden">
          <SearchView v-if="route.path === '/search'" />
          <MobilePrimaryTabPager
            ref="mobileTabPagerRef"
            v-else-if="mobileShowPrimaryNav"
            :active-tab="mobilePrimaryTabKey"
            @navigate="onMobilePrimaryTabNavigate"
          >
            <template #chat>
              <ChatListPanel
                data-tour-page="chat"
                :active-id="activeSessionId ?? ''"
                @select="selectSession"
                @delete="onSessionDelete"
                @settings="onMobileRootNavigate('/settings')"
              />
            </template>
            <template #work>
              <MobileWorkView
                :mode="mobileWorkMode"
                data-tour-page="work"
                @navigate="navigateMobilePath"
              >
                <TodoView
                  v-if="mobileWorkMode === 'todo'"
                  class="flex-1 min-w-0 h-full"
                  @open-session="openSessionFromHome"
                />
                <HomeView
                  v-else
                  class="flex-1 min-w-0 h-full"
                  @open-session="openSessionFromHome"
                />
              </MobileWorkView>
            </template>
            <template #agents>
              <ContactsPanel
                data-tour-page="contacts"
                :active-id="activeAgentId ?? ''"
                @select="selectAgent"
                @add="openAgentAdd"
              />
            </template>
            <template #me>
              <MobileMeView
                @navigate="navigateMobilePath"
                @tutorial="introTour?.start()"
                @manage-servers="openInstancePicker"
              />
            </template>
          </MobilePrimaryTabPager>
          <SettingsPanel
            v-else-if="mainTab === 'settings'"
            :key="settingsPanelMode"
            :show-back="true"
            :mode="settingsPanelMode === 'all' ? 'services' : settingsPanelMode"
            @back="navigateMobilePath('/settings')"
          />
          <template v-else-if="mobilePage === 'list'">
            <ProvidersPanel
              v-if="mainTab === 'providers'"
              data-tour-page="providers"
              :active-id="activeProviderId ?? ''"
              @select-provider="selectProvider"
              @add-provider="openProviderAdd"
              @edit-provider="openProviderEditFor"
              @delete-provider="onDeleteProvider"
            />
            <ResourcesPanel
              v-if="mainTab === 'resources'"
              data-tour-page="resources"
              :active-id="activeResourceId"
              @select="selectResource"
            />
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
              @deleted="onResourceDeleted"
            />
          </template>
        </div>
      </MobileAppShell>
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
    <ShareSessionPickerSheet />
    <UiMessageHost />
    <ImagePreviewHost />
    <UiConfirmHost />
    <UiBusyHost />
    <IntroTour ref="introTour" />
    <ProviderEditDialog
      :open="providerEditOpen"
      :provider-id="providerEditId ?? ''"
      @close="closeProviderEdit"
      @saved="onProviderEditSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import ShellNav, { type MainTab } from "./components/layout/ShellNav.vue";
import ChatListPanel from "./components/session/ChatListPanel.vue";
import ContactsPanel from "./components/agent/ContactsPanel.vue";
import ProvidersPanel from "./components/provider/ProvidersPanel.vue";
import ResourcesPanel from "./components/resource/ResourcesPanel.vue";
import ResizeHandle from "./components/base/ResizeHandle.vue";
import { useResizableWidth } from "./composables/use-resizable-width";
import SettingsPanel from "./components/settings/SettingsPanel.vue";
import EmptyPlaceholder from "./components/base/EmptyPlaceholder.vue";
import ContactDetailView from "./views/agent/ContactDetailView.vue";
import AgentFormView from "./views/agent/AgentFormView.vue";
import ResourceDetailView from "./views/resource/ResourceDetailView.vue";
import ProviderDetailView from "./views/provider/ProviderDetailView.vue";
import ProviderFormView from "./views/provider/ProviderFormView.vue";
import ProviderModelDetailView from "./views/provider/ProviderModelDetailView.vue";
import ProviderModelFormView from "./views/provider/ProviderModelFormView.vue";
import ProviderEditDialog from "./components/provider/ProviderEditDialog.vue";
import ProviderModelEditor from "./components/provider/ProviderModelEditor.vue";
import ChatView from "./views/ChatView.vue";
import HomeView from "./views/HomeView.vue";
import TodoView from "./views/TodoView.vue";
import SearchView from "./views/SearchView.vue";
import AddToHomeScreenHint from "./components/mobile/AddToHomeScreenHint.vue";
import GlobalSearchModal from "./components/search/GlobalSearchModal.vue";
import ShareSessionPickerSheet from "./components/session/ShareSessionPickerSheet.vue";
import UiMessageHost from "./components/base/UiMessageHost.vue";
import ImagePreviewHost from "./components/base/ImagePreviewHost.vue";
import UiConfirmHost from "./components/base/UiConfirmHost.vue";
import UiBusyHost from "./components/base/UiBusyHost.vue";
import StartupGate from "./components/layout/StartupGate.vue";
import IntroTour from "./components/onboarding/IntroTour.vue";
import MobileAppShell from "./components/mobile/MobileAppShell.vue";
import MobileInstanceListView from "./components/mobile/MobileInstanceListView.vue";
import MobileMeView from "./components/mobile/MobileMeView.vue";
import MobileWorkView from "./components/mobile/MobileWorkView.vue";
import { isNativeApp } from "./composables/use-native-app";
import { hasConfiguredSupervisorInstance } from "./utils/mobile-server-config";
import MobilePrimaryTabPager, {
  type MobilePrimaryTabKey,
} from "./components/mobile/MobilePrimaryTabPager.vue";
import { showUiMessage } from "./composables/use-ui-message";
import { useSessionStore, useAgentStore, useProviderStore, useResourceStore } from "./store";
import { providerToUI } from "./utils/provider-ui";
import { getDefaultWorkspaceCwd } from "./config/workspace";
import { idFromRoute, modelIdFromRoute, tabFromRoute } from "./router";
import { viewPreferences } from "./utils/view-preferences";
import "./styles/mobile/foundation.css";
import "./styles/mobile/components.css";
import "./styles/mobile/chat-density.css";
import "./styles/mobile/typography.css";
import "./styles/font-scale.css";
import "./styles/type-scale.css";

const { width: chatListWidth, startResize: startListResize } = useResizableWidth({
  // Session list needs room for avatar + title + preview; bump key to drop old narrow caches.
  defaultWidth: Math.min(360, Math.max(300, Math.round(window.innerWidth * 0.22))),
  minWidth: 260,
  maxWidth: Math.max(420, Math.round(window.innerWidth * 0.36)),
  storageKey: "pi-supervisor-chat-list-width-v4",
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
const mobileWorkMode = ref<"todo" | "dashboard">("todo");
const mobileTabPagerRef = ref<InstanceType<typeof MobilePrimaryTabPager> | null>(null);
const searchOpen = ref(false);
const modelEditorOpen = ref(false);
const modelEditorSaving = ref(false);
type ProviderPage = "detail" | "add" | "model-add" | "model-edit";
type AgentPage = "detail" | "add";

const providerPage = ref<ProviderPage>("detail");
const agentPage = ref<AgentPage>("detail");
const providerEditOpen = ref(false);
const providerEditId = ref<string | null>(null);
const appReady = ref(false);
const introTour = ref<InstanceType<typeof IntroTour> | null>(null);
const instancePickerMode = ref<"required" | "manage" | null>(
  isNativeApp() && !hasConfiguredSupervisorInstance() ? "required" : null,
);
const showInstancePicker = computed(() => instancePickerMode.value !== null);
const instancePickerDismissible = computed(() => instancePickerMode.value === "manage");
let appDataLoaded = false;

function openInstancePicker() {
  instancePickerMode.value = "manage";
}

function closeInstancePicker() {
  if (instancePickerMode.value === "manage") instancePickerMode.value = null;
}

function onInstanceConnected() {
  instancePickerMode.value = null;
}

function applyRoute() {
  const tab = tabFromRoute(route);
  const id = idFromRoute(route);
  mainTab.value = tab;
  if (tab === "todo") mobileWorkMode.value = "todo";
  else if (tab === "dashboard") mobileWorkMode.value = "dashboard";
  if (tab === "chat") activeSessionId.value = id ?? activeSessionId.value;
  else if (tab === "contacts") activeAgentId.value = id ?? activeAgentId.value;
  else if (tab === "providers") {
    activeProviderId.value = id ?? activeProviderId.value;
    activeModelId.value = modelIdFromRoute(route) ?? null;
    if (route.path.endsWith("/models/new")) providerPage.value = "model-add";
    else if (route.path.includes("/models/")) providerPage.value = "detail";
    else if (route.path === "/providers/new") providerPage.value = "add";
    else providerPage.value = "detail";
  } else if (tab === "resources") activeResourceId.value = id ?? activeResourceId.value;

  if (!isMobile.value) return;

  // Sync list/detail with the URL so Android shell history.back() actually leaves a session.
  if (tab === "todo" || tab === "dashboard") {
    mobilePage.value = "list";
    return;
  }
  if (tab === "settings") {
    mobilePage.value = route.path === "/settings" ? "list" : "detail";
    return;
  }
  if (route.path === "/contacts/new") {
    agentPage.value = "add";
    mobilePage.value = "detail";
    return;
  }
  if (route.path === "/providers/new" || route.path.includes("/models/")) {
    mobilePage.value = "detail";
    return;
  }
  if (route.path === "/search") {
    mobilePage.value = "detail";
    return;
  }
  mobilePage.value = id ? "detail" : "list";
}

function pushRoute() {
  const tab = mainTab.value;
  if (tab === "chat") {
    void router.push(activeSessionId.value ? `/chat/${activeSessionId.value}` : "/chat");
  } else if (tab === "todo") {
    void router.push("/todo");
  } else if (tab === "dashboard") {
    void router.push("/dashboard");
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
  document.addEventListener("visibilitychange", onVisibilityChange);
});

function onStartupReady() {
  appReady.value = true;
  void loadAppData();
}

async function loadAppData() {
  if (appDataLoaded) return;
  appDataLoaded = true;
  await Promise.all([
    sessionStore.fetchProjects(),
    sessionStore.fetchSessions(),
    agentStore.detectExternalAgents(),
    providerStore.fetchProviders().then(() => {
      for (const p of providerStore.providers) {
        void providerStore.fetchModels(p.id);
      }
    }),
    resourceStore.fetchGlobalResources(),
  ])
    .then(() => {
      if (route.path === "/" || route.path === "") {
        void router.replace("/chat");
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
    .catch((error) => {
      appDataLoaded = false;
      console.error(error);
    });
}

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateMobileFlag);
  document.removeEventListener("visibilitychange", onVisibilityChange);
});

function onVisibilityChange() {
  if (document.hidden) return;
  if (mainTab.value !== "chat" && mainTab.value !== "todo" && mainTab.value !== "dashboard") {
    return;
  }
  void sessionStore.fetchSessions({ silent: true });
}

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
    supportsVision: model.supportsVision,
  };
});

const chatSessionProps = computed(() => {
  const s = activeSession.value;
  if (!s) return null;
  return {
    id: s.id,
    status: s.status,
    parentId: s.parentId,
    title: s.title,
    isBuiltin: s.isBuiltin,
    avatar: s.avatar,
    shadowEnabled: s.shadowEnabled,
    stage: s.stage,
    meta: s.meta,
    agentId: s.agentId ?? undefined,
    cwd: s.cwd,
    workspaceId: s.cwd,
    pinned: viewPreferences.pinnedSessionIds.includes(s.id),
    muted: viewPreferences.mutedSessionIds.includes(s.id),
    currentTask: s.currentTask,
  };
});

function selectSession(id: string) {
  activeSessionId.value = id;
  if (
    isMobile.value &&
    mainTab.value !== "settings" &&
    mainTab.value !== "todo" &&
    mainTab.value !== "dashboard"
  ) {
    mobilePage.value = "detail";
  }
  pushRoute();
}

function openSessionFromHome(sessionId: string) {
  activeSessionId.value = sessionId;
  mainTab.value = "chat";
  if (isMobile.value) mobilePage.value = "detail";
  pushRoute();
}

watch([activeSessionId, mainTab, () => ({ ...viewPreferences.unreadBySession })], ([id, tab]) => {
  if (!id || tab !== "chat") return;
  void markActiveSessionRead(id);
});

async function markActiveSessionRead(id: string) {
  const unread = viewPreferences.unreadBySession[id];
  if (typeof unread !== "number" || unread <= 0) return;
  try {
    await sessionStore.markSessionRead(id);
  } catch (err) {
    console.error("Failed to mark session read:", err);
  }
}

function onSessionDelete(id: string) {
  if (activeSessionId.value === id) activeSessionId.value = null;
  if (isMobile.value) mobilePage.value = "list";
  mainTab.value = "chat";
  void router.push("/chat");
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
      supportsVision: model.supportsVision,
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

function onResourceDeleted() {
  activeResourceId.value = resourceStore.resourceItems[0]?.id ?? null;
  if (isMobile.value) mobilePage.value = "list";
  pushRoute();
}

function onTabChange(tab: MainTab) {
  mainTab.value = tab;
  mobilePage.value = "list";
  providerPage.value = "detail";
  agentPage.value = "detail";
  if (isMobile.value) {
    if (tab === "chat") {
      activeSessionId.value = null;
    } else if (tab === "contacts") {
      activeAgentId.value = null;
      agentPage.value = "detail";
    } else if (tab === "providers") {
      activeProviderId.value = null;
      activeModelId.value = null;
    } else if (tab === "resources") {
      activeResourceId.value = null;
    }
  } else {
    if (tab === "resources" && !activeResourceId.value) {
      const first = resourceStore.resourceItems[0];
      if (first) activeResourceId.value = first.id;
    }
    if (tab === "providers" && !activeProvider.value) {
      const first = providerStore.providers[0];
      if (first) activeProviderId.value = first.id;
    }
  }
  pushRoute();
}

const PRIMARY_MOBILE_PATHS = new Set(["/chat", "/todo", "/dashboard", "/contacts", "/settings"]);

const mobilePrimaryTabKey = computed<MobilePrimaryTabKey>(() => {
  if (mainTab.value === "todo" || mainTab.value === "dashboard") return "work";
  if (mainTab.value === "contacts") return "agents";
  if (mainTab.value === "settings" && route.path === "/settings") return "me";
  return "chat";
});

function mobilePrimaryTabKeyToPath(
  tab: MobilePrimaryTabKey,
): "/chat" | "/todo" | "/contacts" | "/settings" {
  if (tab === "chat") return "/chat";
  if (tab === "work") return "/todo";
  if (tab === "agents") return "/contacts";
  return "/settings";
}

function onMobilePrimaryTabNavigate(tab: MobilePrimaryTabKey, _direction: "forward" | "back") {
  navigateMobileRoot(mobilePrimaryTabKeyToPath(tab), "swipe");
}

function onMobileRootNavigate(path: "/chat" | "/todo" | "/contacts" | "/settings") {
  navigateMobileRoot(path, "tab-click");
}

const mobileShowPrimaryNav = computed(
  () =>
    mobilePage.value === "list" &&
    PRIMARY_MOBILE_PATHS.has(route.path.split("/").slice(0, 2).join("/") || route.path),
);

const settingsPanelMode = computed<"all" | "services" | "diagnostics">(() => {
  if (route.path.startsWith("/settings/diagnostics")) return "diagnostics";
  if (route.path.startsWith("/settings/services")) return "services";
  return "all";
});

function mobileRootPathToTabKey(
  path: "/chat" | "/todo" | "/contacts" | "/settings",
): MobilePrimaryTabKey {
  if (path === "/chat") return "chat";
  if (path === "/todo") return "work";
  if (path === "/contacts") return "agents";
  return "me";
}

function navigateMobileRoot(
  path: "/chat" | "/todo" | "/contacts" | "/settings",
  source: "tab-click" | "swipe" = "tab-click",
) {
  if (path === "/todo" && mainTab.value !== "todo" && mainTab.value !== "dashboard") {
    mobileWorkMode.value = "todo";
  }
  if (path === "/chat") onTabChange("chat");
  else if (path === "/todo") onTabChange("todo");
  else if (path === "/contacts") onTabChange("contacts");
  else onTabChange("settings");
  if (source === "tab-click") {
    const tabKey = mobileRootPathToTabKey(path);
    mobileTabPagerRef.value?.syncFromParent(tabKey);
    void nextTick(() => {
      mobileTabPagerRef.value?.syncFromParent(tabKey);
    });
  }
  void router.replace(path);
}

function navigateMobilePath(path: string) {
  if (path === "/todo") {
    mobileWorkMode.value = "todo";
    onTabChange("todo");
  } else if (path === "/dashboard") {
    mobileWorkMode.value = "dashboard";
    onTabChange("dashboard");
  } else if (path === "/providers") {
    onTabChange("providers");
  } else if (path === "/resources") {
    onTabChange("resources");
  } else if (path === "/settings" || path.startsWith("/settings/")) {
    mainTab.value = "settings";
    mobilePage.value = path === "/settings" ? "list" : "detail";
  }
  void router.push(path);
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
  pushRoute();
}

function backToMobileList() {
  mobilePage.value = "list";
  if (mainTab.value === "chat") void router.replace("/chat");
  else if (mainTab.value === "contacts") void router.replace("/contacts");
  else if (mainTab.value === "providers") void router.replace("/providers");
  else if (mainTab.value === "resources") void router.replace("/resources");
  else if (mainTab.value === "settings") void router.replace("/settings");
}

function updateMobileFlag() {
  isMobile.value = window.matchMedia("(max-width: 767px)").matches;
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
