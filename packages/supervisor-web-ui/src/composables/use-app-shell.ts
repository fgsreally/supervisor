import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { createGlobalState } from "@vueuse/core";
import type { MainTab } from "@/components/layout/ShellNav.vue";
import type IntroTour from "@/components/onboarding/IntroTour.vue";
import { useMobileViewport } from "@/composables/use-mobile-viewport";
import { isNativeApp } from "@/composables/use-native-app";
import { showUiMessage } from "@/composables/use-ui-message";
import { useI18n } from "@/i18n";
import { useAgentStore, useProviderStore, useResourceStore, useSessionStore } from "@/store";
import { getDefaultWorkspaceCwd } from "@/config/workspace";
import { idFromRoute, modelIdFromRoute, tabFromRoute } from "@/router";
import { hasConfiguredSupervisorInstance } from "@/utils/mobile-server-config";
import { providerToUI } from "@/utils/provider-ui";
import { viewPreferences } from "@/utils/view-preferences";

type ProviderPage = "detail" | "add" | "model-add" | "model-edit";
type AgentPage = "detail" | "add";

const PRIMARY_MOBILE_PATHS = new Set(["/chat", "/todo", "/dashboard", "/contacts", "/settings"]);

export const useAppShell = createGlobalState(() => {
  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const isMobile = useMobileViewport();
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
  const mobilePage = ref<"list" | "detail">("list");
  const mobileWorkMode = ref<"todo" | "dashboard">("todo");
  const searchOpen = ref(false);
  const modelEditorOpen = ref(false);
  const modelEditorSaving = ref(false);
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
  let lastLoadedTab: MainTab | null = null;

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

    if (tab !== lastLoadedTab) {
      lastLoadedTab = tab;
      void loadTabData(tab);
    }

    if (!isMobile.value) return;

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
      if (agentPage.value === "add") void router.push("/contacts/new");
      else void router.push(activeAgentId.value ? `/contacts/${activeAgentId.value}` : "/contacts");
    } else if (tab === "providers") {
      if (providerPage.value === "add") {
        void router.push("/providers/new");
        return;
      }
      const providerPath = activeProviderId.value ? `/providers/${activeProviderId.value}` : null;
      if (providerPage.value === "model-add" && providerPath) {
        void router.push(`${providerPath}/models/new`);
        return;
      }
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

  async function onStartupReady() {
    if (await loadAppData()) appReady.value = true;
  }

  async function loadAppData(): Promise<boolean> {
    if (appDataLoaded) return true;
    appDataLoaded = true;
    const initialTab = tabFromRoute(route);
    lastLoadedTab = initialTab;
    return await loadTabData(initialTab)
      .then(() => {
        if (route.path === "/" || route.path === "") void router.replace("/chat");
        else applyRoute();
        return true;
      })
      .catch((error) => {
        appDataLoaded = false;
        console.error(error);
        return false;
      });
  }

  async function loadTabData(tab: MainTab): Promise<boolean> {
    try {
      if (tab === "chat") {
        await Promise.all([sessionStore.fetchProjects(), sessionStore.fetchSessions()]);
      } else if (tab === "contacts") {
        await agentStore.fetchAgents();
        void agentStore.detectExternalAgents().catch(() => undefined);
      } else if (tab === "providers") {
        await providerStore.fetchProviders();
        if (!activeProviderId.value) activeProviderId.value = providerStore.providers[0]?.id ?? null;
        if (activeProviderId.value) await providerStore.fetchModels(activeProviderId.value);
      } else if (tab === "resources") {
        await resourceStore.fetchGlobalResources();
        if (!activeResourceId.value) {
          activeResourceId.value = resourceStore.resourceItems[0]?.id ?? null;
        }
      }
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  function onVisibilityChange() {
    if (document.hidden) return;
    if (mainTab.value !== "chat" && mainTab.value !== "todo" && mainTab.value !== "dashboard") {
      return;
    }
    void sessionStore.fetchSessions({ silent: true });
  }

  onMounted(() => {
    document.addEventListener("visibilitychange", onVisibilityChange);
  });
  onBeforeUnmount(() => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
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
    void router.push("/contacts/new");
  }

  function closeAgentForm() {
    const wasAdd = agentPage.value === "add";
    agentPage.value = "detail";
    if (isMobile.value && wasAdd && !activeAgentId.value) mobilePage.value = "list";
    void router.push(activeAgentId.value ? `/contacts/${activeAgentId.value}` : "/contacts");
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
    void router.push("/providers/new");
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
      showUiMessage(t("provider.modelSaved"), "success");
    } catch (error) {
      showUiMessage(error instanceof Error ? error.message : t("provider.modelSaveFailed"), "error");
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
    pushRoute();
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
    void router.push(activeProviderId.value ? `/providers/${activeProviderId.value}` : "/providers");
  }

  async function onProviderSaved(id: string) {
    activeProviderId.value = id;
    providerPage.value = "detail";
    await providerStore.fetchProviders();
    await providerStore.fetchModels(id);
    if (isMobile.value) mobilePage.value = "detail";
    pushRoute();
  }

  async function onDeleteProvider(id: string) {
    try {
      await providerStore.deleteProvider(id);
      if (activeProviderId.value === id) activeProviderId.value = null;
    } catch {
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
      if (tab === "chat") activeSessionId.value = null;
      else if (tab === "contacts") {
        activeAgentId.value = null;
        agentPage.value = "detail";
      } else if (tab === "providers") {
        activeProviderId.value = null;
        activeModelId.value = null;
      } else if (tab === "resources") activeResourceId.value = null;
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

  const mobileShowPrimaryNav = computed(
    () =>
      isMobile.value &&
      mobilePage.value === "list" &&
      PRIMARY_MOBILE_PATHS.has(route.path.split("/").slice(0, 2).join("/") || route.path),
  );

  const settingsPanelMode = computed<"all" | "services" | "diagnostics">(() => {
    if (route.path.startsWith("/settings/diagnostics")) return "diagnostics";
    if (route.path.startsWith("/settings/services")) return "services";
    return "all";
  });

  function onMobileRootNavigate(path: "/chat" | "/todo" | "/contacts" | "/settings") {
    if (path === "/todo" && mainTab.value !== "todo" && mainTab.value !== "dashboard") {
      mobileWorkMode.value = "todo";
    }
    if (path === "/chat") onTabChange("chat");
    else if (path === "/todo") onTabChange("todo");
    else if (path === "/contacts") onTabChange("contacts");
    else onTabChange("settings");
    void router.replace(path);
  }

  function navigateMobilePath(path: string) {
    if (path === "/todo") {
      mobileWorkMode.value = "todo";
      onTabChange("todo");
    } else if (path === "/dashboard") {
      mobileWorkMode.value = "dashboard";
      onTabChange("dashboard");
    } else if (path === "/providers") onTabChange("providers");
    else if (path === "/resources") onTabChange("resources");
    else if (path === "/settings" || path.startsWith("/settings/")) {
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

  return {
    t,
    isMobile,
    mainTab,
    activeSessionId,
    activeAgentId,
    activeProviderId,
    activeResourceId,
    mobilePage,
    mobileWorkMode,
    searchOpen,
    modelEditorOpen,
    modelEditorSaving,
    providerPage,
    agentPage,
    providerEditOpen,
    providerEditId,
    appReady,
    introTour,
    showInstancePicker,
    instancePickerDismissible,
    activeAgent,
    activeProvider,
    activeProviderUi,
    activeProviderModel,
    activeProviderModelUi,
    chatSessionProps,
    mobileShowPrimaryNav,
    settingsPanelMode,
    openInstancePicker,
    closeInstancePicker,
    onInstanceConnected,
    onStartupReady,
    selectSession,
    openSessionFromHome,
    onSessionDelete,
    selectAgent,
    openAgentAdd,
    closeAgentForm,
    onAgentSaved,
    selectProvider,
    selectModelById,
    openAddModel,
    openProviderAdd,
    openProviderEdit,
    openProviderEditFor,
    closeProviderEdit,
    onProviderEditSaved,
    openModelEdit,
    editModelById,
    saveModelFromDialog,
    deleteModelById,
    setProviderEnabled,
    closeModelForm,
    onModelSaved,
    deleteActiveModel,
    closeProviderForm,
    onProviderSaved,
    onDeleteProvider,
    selectResource,
    onResourceDeleted,
    onTabChange,
    onMobileRootNavigate,
    navigateMobilePath,
    viewAgent,
    viewProvider,
    openChatFromContact,
    backToMobileList,
  };
});
