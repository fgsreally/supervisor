<template>
  <div class="build-preview-compass">
    <Transition name="build-preview-menu">
      <div v-if="open" class="build-preview-compass__menu" role="menu">
        <button
          type="button"
          class="build-preview-compass__action"
          :disabled="updating"
          role="menuitem"
          @click="updatePreview"
        >
          <RefreshCw
            class="build-preview-compass__action-icon"
            :class="{ 'is-spinning': updating }"
          />
          <span>{{ updating ? t("buildPreview.updating") : t("buildPreview.update") }}</span>
        </button>
      </div>
    </Transition>
    <button
      type="button"
      class="build-preview-compass__orb"
      :class="{ 'is-open': open, 'is-updating': updating }"
      :aria-expanded="open"
      :aria-label="t('buildPreview.open')"
      @click="open = !open"
    >
      <Compass class="build-preview-compass__orb-icon" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Compass, RefreshCw } from "lucide-vue-next";
import { requestBuildPreviewUpdate } from "@/api";
import { showUiMessage } from "@/composables/use-ui-message";
import { useI18n } from "@/i18n";

const { t } = useI18n();
const open = ref(false);
const updating = ref(false);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForRestart(): Promise<void> {
  let stopped = false;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    await wait(500);
    try {
      const response = await fetch(`/healthz?preview=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) {
        stopped = true;
        continue;
      }
      if (stopped) {
        window.location.reload();
        return;
      }
    } catch {
      stopped = true;
    }
  }
  throw new Error(t("buildPreview.restartTimeout"));
}

async function updatePreview() {
  if (updating.value) return;
  updating.value = true;
  open.value = false;
  try {
    await requestBuildPreviewUpdate();
    showUiMessage(t("buildPreview.restarting"), "info");
    await waitForRestart();
  } catch (error: unknown) {
    updating.value = false;
    showUiMessage(error instanceof Error ? error.message : t("buildPreview.failed"), "error");
  }
}
</script>

<style scoped>
.build-preview-compass {
  position: fixed;
  right: 1.25rem;
  bottom: 1.25rem;
  z-index: 1200;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.625rem;
}

.build-preview-compass__orb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3.25rem;
  height: 3.25rem;
  border: 1px solid color-mix(in srgb, var(--app-accent) 75%, white);
  border-radius: 50%;
  color: #fff;
  background: color-mix(in srgb, var(--app-accent) 82%, #111 18%);
  box-shadow:
    0 0.5rem 1.5rem rgb(0 0 0 / 28%),
    0 0 0 0.25rem rgb(7 193 96 / 12%);
  cursor: pointer;
  transition:
    transform var(--app-motion-fast),
    filter var(--app-motion-fast);
}

.build-preview-compass__orb:hover,
.build-preview-compass__orb.is-open {
  filter: brightness(1.12);
  transform: scale(1.04);
}

.build-preview-compass__orb.is-updating {
  cursor: wait;
}

.build-preview-compass__orb-icon {
  width: 1.5rem;
  height: 1.5rem;
}

.build-preview-compass__menu {
  min-width: 9.5rem;
  padding: 0.375rem;
  border: 1px solid var(--app-border-subtle);
  border-radius: var(--app-radius-card);
  background: var(--app-surface-raised, #262626);
  box-shadow: 0 0.75rem 2rem rgb(0 0 0 / 30%);
}

.build-preview-compass__action {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  min-height: 2.25rem;
  padding: 0 0.625rem;
  border: 0;
  border-radius: var(--app-radius-control);
  color: var(--app-text-primary);
  background: transparent;
  font-size: var(--app-font-control);
  cursor: pointer;
  text-align: left;
}

.build-preview-compass__action:hover:not(:disabled) {
  color: var(--app-accent);
  background: var(--app-hover);
}

.build-preview-compass__action:disabled {
  cursor: wait;
  opacity: 0.65;
}

.build-preview-compass__action-icon {
  width: 1rem;
  height: 1rem;
}

.is-spinning {
  animation: build-preview-spin 0.8s linear infinite;
}

.build-preview-menu-enter-active,
.build-preview-menu-leave-active {
  transition:
    opacity var(--app-motion-fast),
    transform var(--app-motion-fast);
}

.build-preview-menu-enter-from,
.build-preview-menu-leave-to {
  opacity: 0;
  transform: translateY(0.375rem) scale(0.96);
}

@keyframes build-preview-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
