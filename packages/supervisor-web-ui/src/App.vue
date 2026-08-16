<template>
  <div
    class="app-root flex h-full w-full overflow-hidden font-sans"
    style="background: var(--app-shell-bg)"
  >
    <InstanceListView
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
          <RouterView v-slot="{ Component }">
            <KeepAlive :include="TAB_PAGE_NAMES">
              <component :is="Component" />
            </KeepAlive>
          </RouterView>
        </div>
      </template>
      <AppShell v-else :tab="mainTab" :show-nav="mobileShowPrimaryNav" @navigate="onMobileRootNavigate">
        <RouterView v-slot="{ Component }">
          <KeepAlive :include="TAB_PAGE_NAMES">
            <component :is="Component" />
          </KeepAlive>
        </RouterView>
      </AppShell>
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
import ShellNav from "./components/layout/ShellNav.vue";
import ProviderEditDialog from "./components/provider/ProviderEditDialog.vue";
import ProviderModelEditor from "./components/provider/ProviderModelEditor.vue";
import AddToHomeScreenHint from "./components/layout/AddToHomeScreenHint.vue";
import GlobalSearchModal from "./components/search/GlobalSearchModal.vue";
import ShareSessionPickerSheet from "./components/session/ShareSessionPickerSheet.vue";
import UiMessageHost from "./components/base/UiMessageHost.vue";
import ImagePreviewHost from "./components/base/ImagePreviewHost.vue";
import UiConfirmHost from "./components/base/UiConfirmHost.vue";
import UiBusyHost from "./components/base/UiBusyHost.vue";
import StartupGate from "./components/layout/StartupGate.vue";
import IntroTour from "./components/onboarding/IntroTour.vue";
import AppShell from "./components/layout/AppShell/index.vue";
import InstanceListView from "./components/settings/InstanceListView.vue";
import { useAppShell } from "./composables/use-app-shell";
import "./styles/mobile/foundation.css";
import "./styles/mobile/components.css";
import "./styles/mobile/chat-density.css";
import "./styles/mobile/typography.css";
import "./styles/font-scale.css";
import "./styles/type-scale.css";

const TAB_PAGE_NAMES = "ChatPage,TodoPage,DashboardPage,ContactsPage,SettingsPage";

const {
  isMobile,
  mainTab,
  searchOpen,
  modelEditorOpen,
  modelEditorSaving,
  providerEditOpen,
  providerEditId,
  appReady,
  introTour,
  showInstancePicker,
  instancePickerDismissible,
  activeProviderModelUi,
  mobileShowPrimaryNav,
  closeInstancePicker,
  onInstanceConnected,
  onStartupReady,
  selectSession,
  saveModelFromDialog,
  closeProviderEdit,
  onProviderEditSaved,
  onTabChange,
  onMobileRootNavigate,
} = useAppShell();
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
