<template>
  <div class="h-full w-full flex flex-col" style="background: var(--app-list-bg)">
    <!-- Header -->
    <div
      class="h-16 flex items-center px-4 shrink-0 border-b gap-3"
      style="background: var(--app-list-header-bg); border-color: var(--app-border-subtle)"
    >
      <button
        type="button"
        class="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        @click="navigateBack"
      >
        <ArrowLeft class="w-5 h-5" style="color: var(--app-text-primary)" />
      </button>
      <div class="relative flex-1">
        <Search
          class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2"
          style="color: var(--app-text-muted)"
        />
        <input
          ref="inputRef"
          v-model="query"
          type="text"
          placeholder="搜索聊天和消息..."
          class="w-full rounded-md pl-9 pr-3 py-2 text-[14px] outline-none transition-colors"
          style="background: var(--app-list-search-bg); color: var(--app-text-primary)"
          @input="onSearchInput"
        />
        <button
          v-if="query"
          type="button"
          class="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          @click="clearSearch"
        >
          <X class="w-3.5 h-3.5" style="color: var(--app-text-muted)" />
        </button>
      </div>
    </div>

    <!-- Search tabs -->
    <div class="flex border-b shrink-0" style="border-color: var(--app-border-subtle)">
      <button
        v-for="tab in searchTabs"
        :key="tab.key"
        type="button"
        class="flex-1 py-2.5 text-[13px] font-medium transition-colors relative"
        :class="activeTab === tab.key ? 'text-[#07c160]' : ''"
        style="color: activeTab === tab.key ? '#07c160' : 'var(--app-text-secondary)'"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span
          v-if="activeTab === tab.key"
          class="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-[#07c160] rounded-full"
        />
      </button>
    </div>

    <!-- Results area -->
    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <template v-if="!query">
        <div class="py-16 text-center">
          <Search class="w-12 h-12 mx-auto mb-4" style="color: var(--app-text-muted)" />
          <p class="text-sm" style="color: var(--app-text-muted)">输入关键词搜索会话和消息</p>
        </div>
      </template>

      <template v-else-if="loading">
        <div class="py-12 text-center text-sm" style="color: var(--app-text-muted)">搜索中...</div>
      </template>

      <template v-else-if="activeTab === 'sessions'">
        <div
          v-if="sessionResults.length === 0"
          class="py-12 text-center text-sm"
          style="color: var(--app-text-muted)"
        >
          未找到匹配的会话
        </div>
        <div v-for="s in sessionResults" :key="s.id">
          <button
            type="button"
            class="w-full flex items-center gap-3 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
            @click="navigateToSession(s.id)"
          >
            <div
              class="w-9 h-9 rounded-md flex items-center justify-center text-white font-medium text-sm shrink-0"
              :class="
                avatarColors[
                  s.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % avatarColors.length
                ]
              "
            >
              {{ (typeof s.meta?.name === "string" ? s.meta.name : "S").charAt(0).toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-[13px] font-medium truncate" style="color: var(--app-text-primary)">
                <span
                  v-for="(part, i) in highlight(String(s.meta?.name || '会话'), query)"
                  :key="i"
                >
                  <span v-if="part.highlight" class="text-[#07c160] font-semibold">{{
                    part.text
                  }}</span>
                  <span v-else>{{ part.text }}</span>
                </span>
              </div>
              <div
                v-if="s.lastMessagePreview"
                class="text-[11px] truncate mt-0.5"
                style="color: var(--app-text-secondary)"
              >
                <span v-for="(part, i) in highlight(s.lastMessagePreview, query)" :key="'p' + i">
                  <span v-if="part.highlight" class="text-[#07c160] font-semibold">{{
                    part.text
                  }}</span>
                  <span v-else>{{ part.text }}</span>
                </span>
              </div>
              <div class="text-[10px] mt-0.5" style="color: var(--app-text-muted)">
                {{ s.meta?.projectName || "" }}
              </div>
            </div>
          </button>
        </div>
      </template>

      <template v-else-if="activeTab === 'messages'">
        <div
          v-if="messageResults.length === 0"
          class="py-12 text-center text-sm"
          style="color: var(--app-text-muted)"
        >
          未找到匹配的消息
        </div>
        <div v-for="m in messageResults" :key="m.id">
          <button
            type="button"
            class="w-full flex items-start gap-3 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
            @click="navigateToSession(m.sessionId)"
          >
            <div
              class="w-9 h-9 rounded-md flex items-center justify-center text-white font-medium text-sm shrink-0 mt-0.5"
              :class="
                avatarColors[
                  m.sessionId.split('').reduce((a, c) => a + c.charCodeAt(0), 0) %
                    avatarColors.length
                ]
              "
            >
              {{ m.role === "user" ? "U" : "A" }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2">
                <span class="text-[11px] font-medium" style="color: var(--app-text-muted)">{{
                  m.role === "user" ? "用户" : "助手"
                }}</span>
                <span class="text-[10px]" style="color: var(--app-text-muted)">{{
                  m.sessionName || ""
                }}</span>
              </div>
              <div class="text-[13px] mt-1 line-clamp-3" style="color: var(--app-text-primary)">
                <span v-for="(part, i) in highlight(m.snippet, query)" :key="'m' + i">
                  <span v-if="part.highlight" class="text-[#07c160] font-semibold">{{
                    part.text
                  }}</span>
                  <span v-else>{{ part.text }}</span>
                </span>
              </div>
            </div>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { useRouter } from "vue-router";
import { ArrowLeft, Search, X } from "lucide-vue-next";
import { useSessionStore } from "../store";
import type { Session } from "../api";

const router = useRouter();
const sessionStore = useSessionStore();

const inputRef = ref<HTMLInputElement | null>(null);
const query = ref("");
const loading = ref(false);
const activeTab = ref<"sessions" | "messages">("sessions");

const searchTabs = [
  { key: "sessions" as const, label: "会话" },
  { key: "messages" as const, label: "消息" },
];

const avatarColors = [
  "bg-blue-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-violet-500",
  "bg-amber-600",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-emerald-500",
];

let searchTimer: ReturnType<typeof setTimeout> | null = null;

// Search within local session store
const sessionResults = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return [];
  return sessionStore.sessions
    .filter((s: Session) => s.showInSessionList)
    .filter((s: Session) => {
      const name = (s.meta?.name as string) || "";
      const preview = s.lastMessagePreview || "";
      return name.toLowerCase().includes(q) || preview.toLowerCase().includes(q);
    })
    .slice(0, 20);
});

// For message search we use the local messages too
interface MessageHit {
  id: string;
  sessionId: string;
  sessionName: string;
  snippet: string;
  role: string;
}

const messageResults = ref<MessageHit[]>([]);

async function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    performSearch();
  }, 300);
}

async function performSearch() {
  const q = query.value.trim();
  // Message search uses local data for now
  if (activeTab.value === "messages" && q) {
    loading.value = true;
    try {
      const lower = q.toLowerCase();
      const hits: MessageHit[] = [];
      for (const session of sessionStore.sessions) {
        const msgs = sessionStore.messages[session.id];
        if (!msgs) continue;
        for (const entry of msgs) {
          if (entry.type !== "message") continue;
          const msg = (entry as any).message;
          if (!msg) continue;
          let text = "";
          if (typeof msg.content === "string") text = msg.content;
          else if (Array.isArray(msg.content)) {
            text = msg.content
              .filter((p: any) => p.type === "text")
              .map((p: any) => p.text)
              .join(" ");
          }
          if (text.toLowerCase().includes(lower)) {
            const idx = text.toLowerCase().indexOf(lower);
            const start = Math.max(0, idx - 40);
            const end = Math.min(text.length, idx + lower.length + 60);
            hits.push({
              id: entry.id,
              sessionId: session.id,
              sessionName: (session.meta?.name as string) || "",
              snippet:
                (start > 0 ? "..." : "") +
                text.slice(start, end) +
                (end < text.length ? "..." : ""),
              role: msg.role || "user",
            });
          }
        }
      }
      messageResults.value = hits.slice(0, 30);
    } finally {
      loading.value = false;
    }
  }
}

function highlight(text: string, keyword: string): Array<{ text: string; highlight: boolean }> {
  if (!keyword.trim()) return [{ text, highlight: false }];
  const parts: Array<{ text: string; highlight: boolean }> = [];
  let last = 0;
  const lower = text.toLowerCase();
  const kw = keyword.toLowerCase();
  let idx = lower.indexOf(kw);
  while (idx >= 0) {
    if (idx > last) parts.push({ text: text.slice(last, idx), highlight: false });
    parts.push({ text: text.slice(idx, idx + kw.length), highlight: true });
    last = idx + kw.length;
    idx = lower.indexOf(kw, last);
  }
  if (last < text.length) parts.push({ text: text.slice(last), highlight: false });
  return parts;
}

function clearSearch() {
  query.value = "";
  messageResults.value = [];
  inputRef.value?.focus();
}

function navigateBack() {
  router.push("/chat");
}

function navigateToSession(sessionId: string) {
  router.push(`/chat/${sessionId}`);
}

watch(activeTab, () => {
  if (query.value.trim()) performSearch();
});

onMounted(() => {
  nextTick(() => inputRef.value?.focus());
});

// Keyboard shortcut: Ctrl+F / Cmd+F focuses the search input
function onKeyDown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "f") {
    e.preventDefault();
    inputRef.value?.focus();
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeyDown);
  if (searchTimer) clearTimeout(searchTimer);
});
</script>

<style scoped>
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
