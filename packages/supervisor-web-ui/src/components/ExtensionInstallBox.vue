<template>
  <div class="extension-install-box mt-2 pt-2 border-t border-[var(--app-border-subtle)]">
    <div class="text-[10px] font-medium mb-1.5 extension-install-box__label">安装/卸载扩展</div>
    <input
      v-model="source"
      type="text"
      class="extension-install-box__input w-full px-2 py-1 text-[12px] rounded border bg-transparent"
      placeholder="npm:pkg | git+url | /local/path"
      :disabled="installing"
      @keyup.enter="install"
    />
    <button
      type="button"
      class="extension-install-box__btn mt-1.5 w-full px-2 py-1 rounded text-[12px] border"
      :disabled="installing || !source.trim()"
      @click="install"
    >
      {{ installing ? '安装中...' : '安装到全局库' }}
    </button>

    <div v-if="installError" class="extension-install-box__error mt-1.5 text-[11px]">
      {{ installError }}
    </div>

    <ul v-if="installed.length" class="mt-2 flex flex-col gap-1 max-h-32 overflow-y-auto custom-scrollbar">
      <li
        v-for="item in installed"
        :key="item.id"
        class="flex items-center gap-1 px-2 py-1 rounded text-[11px] extension-install-box__item"
      >
        <span class="flex-1 truncate" :title="item.id">{{ item.name ?? item.id }}</span>
        <button
          type="button"
          class="text-[10px] px-1.5 py-0.5 rounded border"
          :disabled="uninstallingId === item.id"
          @click="uninstall(item.id)"
        >
          {{ uninstallingId === item.id ? '...' : '卸载' }}
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  installExtension,
  listExtensions,
  uninstallExtension,
  type ExtensionInstallResult,
  type ExtensionResourceInfo,
} from '@/api'

const emit = defineEmits<{
  installed: [id: string]
  uninstalled: [id: string]
}>()

const source = ref('')
const installing = ref(false)
const installError = ref<string | null>(null)
const uninstallingId = ref<string | null>(null)
const installed = ref<ExtensionResourceInfo[]>([])

onMounted(refresh)

async function refresh() {
  try {
    installed.value = await listExtensions()
 } catch (err) {
    installError.value = err instanceof Error ? err.message : String(err)
  }
}

async function install() {
  const s = source.value.trim()
  if (!s) return
  installing.value = true
  installError.value = null
  try {
    const result: ExtensionInstallResult = await installExtension(s)
    source.value = ''
    await refresh()
    emit('installed', result.id)
  } catch (err) {
    installError.value = err instanceof Error ? err.message : String(err)
  } finally {
    installing.value = false
  }
}

async function uninstall(id: string) {
  uninstallingId.value = id
  try {
    await uninstallExtension(id)
    await refresh()
    emit('uninstalled', id)
  } catch (err) {
    installError.value = err instanceof Error ? err.message : String(err)
  } finally {
    uninstallingId.value = null
  }
}
</script>

<style scoped>
.extension-install-box__label {
  color: var(--app-text-muted);
}

.extension-install-box__input,
.extension-install-box__btn {
  background: var(--app-input-bg, var(--app-bg));
  border-color: var(--app-border);
  color: var(--app-text-primary);
}

.extension-install-box__btn {
  background: var(--app-accent);
  color: var(--app-button-text, #fff);
  border-color: var(--app-accent);
}

.extension-install-box__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.extension-install-box__error {
  color: var(--app-error, #d33);
}

.extension-install-box__item {
  background: color-mix(in srgb, var(--app-accent) 5%, transparent);
  border: 1px solid var(--app-border-subtle);
}
</style>
