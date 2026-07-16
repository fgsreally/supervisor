<template>
  <div
    class="flex-1 flex flex-col min-w-0 overflow-hidden"
    style="background: var(--app-settings-bg)"
  >
    <div
      class="h-16 flex items-center px-6 border-b shrink-0"
      style="background: var(--app-settings-bg); border-color: var(--app-border)"
    >
      <h1 class="text-[17px] font-medium" style="color: var(--app-text-primary)">设置</h1>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar">
      <div
        class="mx-0 border-b"
        style="background: var(--app-settings-card); border-color: var(--app-border-subtle)"
      >
        <div class="flex items-center gap-4 px-6 py-5">
          <div
            class="w-16 h-16 rounded-lg bg-[#07c160] flex items-center justify-center text-white text-2xl font-semibold shadow-sm"
          >
            Pi
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-[17px] font-medium" style="color: var(--app-text-primary)">
              Supervisor UI
            </div>
            <div class="text-sm mt-0.5" style="color: var(--app-text-secondary)">
              Mock 示例 · 仅前端
            </div>
          </div>
          <ChevronRight class="w-5 h-5 shrink-0" style="color: var(--app-text-muted)" />
        </div>
      </div>

      <div
        class="mt-2 border-y"
        style="background: var(--app-settings-card); border-color: var(--app-border-subtle)"
      >
        <SettingsRow label="账号与安全" />
        <SettingsRow label="通知" :hint="notifications ? '已开启' : '已关闭'">
          <template #trailing>
            <button
              type="button"
              class="w-11 h-6 rounded-full transition-colors relative"
              :class="notifications ? 'bg-[#07c160]' : 'bg-gray-300'"
              @click="notifications = !notifications"
            >
              <span
                class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                :class="notifications ? 'translate-x-5' : 'translate-x-0.5'"
              />
            </button>
          </template>
        </SettingsRow>
        <SettingsRow label="深色模式">
          <template #trailing>
            <button
              type="button"
              class="w-11 h-6 rounded-full transition-colors relative"
              :class="isDark ? 'bg-[#07c160]' : 'bg-gray-300'"
              @click="toggleDark()"
            >
              <span
                class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                :class="isDark ? 'translate-x-5' : 'translate-x-0.5'"
              />
            </button>
          </template>
        </SettingsRow>
      </div>

      <div
        class="mt-2 border-y"
        style="background: var(--app-settings-card); border-color: var(--app-border-subtle)"
      >
        <SettingsRow label="聊天" />
        <SettingsRow label="通用" />
        <SettingsRow label="快捷键" hint="Ctrl+Enter 发送" />
      </div>

      <div
        class="mt-2 border-y"
        style="background: var(--app-settings-card); border-color: var(--app-border-subtle)"
      >
        <SettingsRow label="关于 Pi Supervisor" hint="v0.74.0 (example)" />
        <SettingsRow label="帮助与反馈" />
      </div>

      <p class="px-6 py-8 text-center text-xs" style="color: var(--app-text-muted)">
        数据均为 Mock。真实环境：聊天列表按 session，通讯录按项目（cwd）一条。
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ChevronRight } from "lucide-vue-next";
import { useAppTheme } from "../composables/use-app-theme";
import SettingsRow from "./SettingsRow.vue";

const notifications = ref(true);
const { isDark, toggleDark } = useAppTheme();
</script>
