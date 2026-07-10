<template>
  <div class="flex h-screen w-screen overflow-hidden font-sans" style="background: var(--app-shell-bg)">
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
              :active-id="activeSessionId"
              @select="selectSession"
              @delete="onSessionDelete"
            />
            <ContactsPanel
              v-else-if="mainTab === 'contacts'"
              class="h-full w-full"
              :active-id="activeAgentId"
              @select="selectAgent"
            />
            <ProvidersPanel
              v-else-if="mainTab === 'providers'"
              class="h-full w-full"
              :active-id="activeProviderId"
              @select="selectProvider"
              @add="openProviderAdd"
            />
            <ResourcesPanel
              v-else-if="mainTab === 'resources'"
              class="h-full w-full"
              :active-id="activeResourceId"
              @select="selectResource"
            />
            <ResizeHandle
              orientation="vertical"
              label="调整面板宽度"
              @start="startListResize"
            />
          </div>

          <main class="flex flex-1 flex-col min-w-0 basis-0 h-full overflow-hidden" style="background: var(--app-chat-bg)">
            <ChatView
              v-if="mainTab === 'chat' && chatSessionProps"
              :key="activeSessionId"
              :session="chatSessionProps"
              :agent-id="chatSessionProps.agentId"
              @navigate="selectSession"
              @view-agent="viewAgent"
            />
            <ContactDetailView
              v-else-if="mainTab === 'contacts' && activeAgent"
              :agent-id="activeAgentId"
              @open-chat="openChatFromContact"
              @view-provider="viewProvider"
            />
            <ProviderFormView
              v-else-if="mainTab === 'providers' && providerPage !== 'detail'"
              :provider-id="providerPage === 'add' ? null : activeProviderId"
              :models-only="providerPage === 'models'"
              @cancel="closeProviderForm"
              @saved="onProviderSaved"
            />
            <ProviderDetailView
              v-else-if="mainTab === 'providers' && activeProvider"
              :provider="activeProvider"
              @view-agent="viewAgent"
              @edit="openProviderEdit"
              @manage-models="openProviderModels"
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
        <template v-if="mainTab === 'settings'">
          <SettingsPanel />
        </template>

        <template v-else-if="mobilePage === 'list'">
          <ChatListPanel
            v-if="mainTab === 'chat'"
            :active-id="activeSessionId"
            @select="selectSession"
            @delete="onSessionDelete"
          />
          <ContactsPanel
            v-else-if="mainTab === 'contacts'"
            :active-id="activeAgentId"
            @select="selectAgent"
          />
          <ProvidersPanel
            v-else-if="mainTab === 'providers'"
            :active-id="activeProviderId"
            @select="selectProvider"
            @add="openProviderAdd"
          />
          <ResourcesPanel
            v-else
            :active-id="activeResourceId"
            @select="selectResource"
          />
        </template>

        <template v-else>
          <ChatView
            v-if="mainTab === 'chat' && chatSessionProps"
            :key="activeSessionId"
            :session="chatSessionProps"
            :agent-id="chatSessionProps.agentId"
            :show-back="true"
            @back="backToMobileList"
            @navigate="selectSession"
            @view-agent="viewAgent"
          />
          <ContactDetailView
            v-else-if="mainTab === 'contacts' && activeAgent"
            :agent-id="activeAgentId"
            :show-back="true"
            @back="backToMobileList"
            @open-chat="openChatFromContact"
            @view-provider="viewProvider"
          />
          <ProviderFormView
            v-else-if="mainTab === 'providers' && providerPage !== 'detail'"
            :provider-id="providerPage === 'add' ? null : activeProviderId"
            :models-only="providerPage === 'models'"
            :show-back="true"
            @cancel="closeProviderForm"
            @saved="onProviderSaved"
          />
          <ProviderDetailView
            v-else-if="mainTab === 'providers' && activeProvider"
            :provider="activeProvider"
            :show-back="true"
            @back="backToMobileList"
            @view-agent="viewAgent"
            @edit="openProviderEdit"
            @manage-models="openProviderModels"
          />
          <ResourceDetailView
            v-else-if="mainTab === 'resources' && activeResourceId"
            :resource-id="activeResourceId"
            :show-back="true"
            @back="backToMobileList"
          />
        </template>
      </div>

      <nav class="md:hidden fixed bottom-0 inset-x-0 h-14 bg-[#f7f7f7] border-t border-[#dedede] z-30 flex">
        <button
          type="button"
          class="flex-1 flex flex-col items-center justify-center text-[10px] transition-colors"
          :class="mainTab === 'chat' ? 'text-[#07c160]' : 'text-[#707070]'"
          @click="onTabChange('chat')"
        >
          <MessageSquare class="w-5 h-5 mb-0.5" />
          聊天
        </button>
        <button
          type="button"
          class="flex-1 flex flex-col items-center justify-center text-[10px] transition-colors"
          :class="mainTab === 'contacts' ? 'text-[#07c160]' : 'text-[#707070]'"
          @click="onTabChange('contacts')"
        >
          <Users class="w-5 h-5 mb-0.5" />
          通讯录
        </button>
        <button
          type="button"
          class="flex-1 flex flex-col items-center justify-center text-[10px] transition-colors"
          :class="mainTab === 'providers' ? 'text-[#07c160]' : 'text-[#707070]'"
          @click="onTabChange('providers')"
        >
          <Cloud class="w-5 h-5 mb-0.5" />
          Provider
        </button>
        <button
          type="button"
          class="flex-1 flex flex-col items-center justify-center text-[10px] transition-colors"
          :class="mainTab === 'resources' ? 'text-[#07c160]' : 'text-[#707070]'"
          @click="onTabChange('resources')"
        >
          <FolderOpen class="w-5 h-5 mb-0.5" />
          资源
        </button>
        <button
          type="button"
          class="flex-1 flex flex-col items-center justify-center text-[10px] transition-colors"
          :class="mainTab === 'settings' ? 'text-[#07c160]' : 'text-[#707070]'"
          @click="onTabChange('settings')"
        >
          <Settings class="w-5 h-5 mb-0.5" />
          设置
        </button>
      </nav>
      <div class="md:hidden h-14 shrink-0"></div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Cloud, FolderOpen, MessageSquare, Users, Settings } from 'lucide-vue-next'
import ShellNav, { type MainTab } from './components/ShellNav.vue'
import ChatListPanel from './components/ChatListPanel.vue'
import ContactsPanel from './components/ContactsPanel.vue'
import ProvidersPanel from './components/ProvidersPanel.vue'
import ResourcesPanel from './components/ResourcesPanel.vue'
import ResizeHandle from './components/ResizeHandle.vue'
import { useResizableWidth } from './composables/use-resizable-width'
import SettingsPanel from './components/SettingsPanel.vue'
import EmptyPlaceholder from './components/EmptyPlaceholder.vue'
import ContactDetailView from './views/ContactDetailView.vue'
import ResourceDetailView from './views/ResourceDetailView.vue'
import ProviderDetailView from './views/ProviderDetailView.vue'
import ProviderFormView from './views/ProviderFormView.vue'
import ChatView from './views/ChatView.vue'
import { getSessionById, getSessionsByAgentId, addSession, mockStore } from './mock/store'
import { getAgentById } from './mock/agents'
import { getProviderById } from './mock/providers'
import { getGlobalResources } from './mock/resources'

const { width: chatListWidth, startResize: startListResize } = useResizableWidth({
  defaultWidth: 288,
  minWidth: 220,
  maxWidth: 480,
  storageKey: 'pi-supervisor-example-chat-list-width',
})

const mainTab = ref<MainTab>('chat')
const activeSessionId = ref('session-1')
const activeAgentId = ref('frontend-dev')
const activeProviderId = ref('anthropic')
const activeResourceId = ref<string | null>(null)
const isMobile = ref(false)
const mobilePage = ref<'list' | 'detail'>('list')
type ProviderPage = 'detail' | 'add' | 'edit' | 'models'

const providerPage = ref<ProviderPage>('detail')

const activeSession = computed(() => getSessionById(activeSessionId.value) ?? null)
const activeAgent = computed(() => getAgentById(activeAgentId.value) ?? null)
const activeProvider = computed(() => getProviderById(activeProviderId.value) ?? null)

const chatSessionProps = computed(() => {
  const s = activeSession.value
  if (!s) return null
  return {
    id: s.id,
    status: s.status,
    meta: s.meta,
    agentId: s.agentId,
    workspaceId: s.workspaceId,
    pinned: !!s.pinned,
    muted: !!s.muted,
  }
})

function selectSession(id: string) {
  activeSessionId.value = id
  if (isMobile.value && mainTab.value !== 'settings') {
    mobilePage.value = 'detail'
  }
}

function onSessionDelete(id: string) {
  if (activeSessionId.value !== id) return
  const next = mockStore.sessions.find((s) => !s.parentId)
  activeSessionId.value = next?.id ?? ''
  if (isMobile.value && !next) mobilePage.value = 'list'
}

function selectAgent(id: string) {
  activeAgentId.value = id
  if (isMobile.value) mobilePage.value = 'detail'
}

function selectProvider(id: string) {
  activeProviderId.value = id
  providerPage.value = 'detail'
  if (isMobile.value) mobilePage.value = 'detail'
}

function openProviderAdd() {
  providerPage.value = 'add'
  if (isMobile.value) mobilePage.value = 'detail'
}

function openProviderEdit() {
  providerPage.value = 'edit'
  if (isMobile.value) mobilePage.value = 'detail'
}

function openProviderModels() {
  providerPage.value = 'models'
  if (isMobile.value) mobilePage.value = 'detail'
}

function closeProviderForm() {
  const wasAdd = providerPage.value === 'add'
  providerPage.value = 'detail'
  if (isMobile.value && wasAdd) mobilePage.value = 'list'
}

function onProviderSaved(id: string) {
  activeProviderId.value = id
  providerPage.value = 'detail'
  if (isMobile.value) mobilePage.value = 'detail'
}

function selectResource(id: string) {
  activeResourceId.value = id
  if (isMobile.value) mobilePage.value = 'detail'
}

function onTabChange(tab: MainTab) {
  mainTab.value = tab
  mobilePage.value = 'list'
  providerPage.value = 'detail'
  if (tab === 'resources' && !activeResourceId.value) {
    const first = getGlobalResources()[0]
    if (first) activeResourceId.value = first.id
  }
  if (tab === 'providers' && !getProviderById(activeProviderId.value)) {
    activeProviderId.value = 'anthropic'
  }
}

function viewAgent(agentId: string) {
  activeAgentId.value = agentId
  mainTab.value = 'contacts'
  if (isMobile.value) mobilePage.value = 'detail'
}

function viewProvider(providerId: string) {
  activeProviderId.value = providerId
  mainTab.value = 'providers'
  providerPage.value = 'detail'
  if (isMobile.value) mobilePage.value = 'detail'
}

function openChatFromContact(id: string) {
  if (id.startsWith('new:')) {
    const agentId = id.slice(4)
    const sessions = getSessionsByAgentId(agentId)
    if (sessions.length > 0) {
      activeSessionId.value = sessions[0].id
    } else {
      const newId = `session-new-${agentId}-${Date.now()}`
      addSession({
        id: newId,
        workspaceId: 'ws-pi',
        agentId,
        status: 'idle',
        lastActiveAt: new Date().toISOString(),
        meta: {
          name: getAgentById(agentId)?.name ?? 'New chat',
        },
        lastMessagePreview: '',
      })
      activeSessionId.value = newId
    }
  } else {
    activeSessionId.value = id
  }
  mainTab.value = 'chat'
  if (isMobile.value) mobilePage.value = 'detail'
}

function backToMobileList() {
  mobilePage.value = 'list'
}

function updateMobileFlag() {
  isMobile.value = window.matchMedia('(max-width: 768px)').matches
  if (!isMobile.value) mobilePage.value = 'list'
}

onMounted(() => {
  updateMobileFlag()
  window.addEventListener('resize', updateMobileFlag)
  const first = getGlobalResources()[0]
  if (first) activeResourceId.value = first.id
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateMobileFlag)
})
</script>

<style>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
}
</style>
