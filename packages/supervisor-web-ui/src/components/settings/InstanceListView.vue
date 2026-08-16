<template>
  <div class="mobile-instances" data-tour-page="instances">
    <header class="mobile-instances__header m-mobile-header">
      <button
        v-if="allowDismiss"
        type="button"
        class="mobile-instances__header-btn"
        :aria-label="t('common.back')"
        @click="emit('dismiss')"
      >
        <ChevronLeft />
      </button>
      <span v-else aria-hidden="true" class="mobile-instances__header-spacer" />
      <h1 class="m-mobile-header__title">{{ t("mobile.server") }}</h1>
      <button
        type="button"
        class="mobile-instances__header-btn"
        :aria-label="t('mobile.scan')"
        :disabled="scanning"
        @click="onScan"
      >
        <ScanLine />
      </button>
    </header>

    <div class="mobile-instances__scroll">
      <div v-if="instances.length === 0" class="mobile-instances__empty">
        <h2 class="mobile-instances__empty-title">{{ t("mobile.addServerInstanceTitle") }}</h2>
        <p class="mobile-instances__empty-hint">
          {{ t("mobile.addServerInstanceDescription") }}
        </p>
        <UiActionButton
          variant="primary"
          class="mobile-instances__empty-cta"
          :loading="scanning"
          @click="onScan"
        >
          {{ t("mobile.scan") }}
        </UiActionButton>
        <button type="button" class="mobile-instances__manual-link" @click="openManualAdd()">
          {{ t("mobile.manualAddress") }}
        </button>
      </div>

      <template v-else>
        <div class="list-section-label">{{ t("mobile.addedInstances") }}</div>
        <div class="mobile-instances__group">
          <button
            v-for="item in instances"
            :key="item.id"
            type="button"
            class="mobile-instances__row"
            @click="connect(item.id)"
            @contextmenu.prevent="onDelete(item)"
            @touchstart.passive="startLongPress(item)"
            @touchend="clearLongPress"
            @touchcancel="clearLongPress"
            @touchmove.passive="clearLongPress"
          >
            <span class="mobile-instances__avatar">{{ avatarLetter(item) }}</span>
            <span class="mobile-instances__body">
              <span class="mobile-instances__name">{{
                item.name || displayNameForUrl(item.url)
              }}</span>
              <span class="mobile-instances__url">{{ item.url }}</span>
            </span>
            <span v-if="item.id === activeId" class="mobile-instances__badge">{{ t("mobile.current") }}</span>
            <ChevronRight class="mobile-instances__chevron" />
          </button>
        </div>
        <div class="mobile-instances__actions">
          <UiActionButton variant="primary" block :loading="scanning" @click="onScan">
            {{ t("mobile.scanToAdd") }}
          </UiActionButton>
          <button type="button" class="mobile-instances__manual-link" @click="openManualAdd()">
            {{ t("mobile.manualAddress") }}
          </button>
        </div>
        <p class="mobile-instances__tip">{{ t("mobile.longPressDelete") }}</p>
      </template>
    </div>

    <ServerConfigSheet
      v-model:open="sheetOpen"
      :initial-url="sheetUrl"
      :initial-pin="sheetPin"
      :editing-id="sheetEditingId"
      @saved="onSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { onUnmounted, ref } from "vue";
import { ChevronLeft, ChevronRight, ScanLine } from "lucide-vue-next";
import { useI18n } from "@/i18n";
import { showUiMessage } from "@/composables/use-ui-message";
import { requestUiDeleteConfirm } from "@/composables/use-ui-confirm";
import { scanSupervisorQrCode } from "@/composables/use-native-qr";
import {
  displayNameForUrl,
  getActiveInstanceId,
  listSupervisorInstances,
  parseSupervisorQrPayload,
  removeSupervisorInstance,
  setActiveSupervisorInstance,
  type SupervisorInstance,
} from "@/utils/mobile-server-config";
import UiActionButton from "@/components/base/UiActionButton.vue";
import ServerConfigSheet from "./ServerConfigSheet.vue";

const { t } = useI18n();

withDefaults(
  defineProps<{
    /** When true, show back and allow closing without selecting. */
    allowDismiss?: boolean;
  }>(),
  { allowDismiss: false },
);

const emit = defineEmits<{
  connected: [];
  dismiss: [];
}>();

const instances = ref<SupervisorInstance[]>(listSupervisorInstances());
const activeId = ref<string | null>(getActiveInstanceId());
const scanning = ref(false);
const sheetOpen = ref(false);
const sheetUrl = ref("");
const sheetPin = ref("");
const sheetEditingId = ref<string | undefined>(undefined);

let longPressTimer: ReturnType<typeof setTimeout> | undefined;
let longPressFired = false;

function refresh() {
  instances.value = listSupervisorInstances();
  activeId.value = getActiveInstanceId();
}

function avatarLetter(item: SupervisorInstance): string {
  const label = item.name || displayNameForUrl(item.url);
  return label.trim().charAt(0).toUpperCase() || "S";
}

function openManualAdd(url = "", pin = "", id?: string) {
  sheetUrl.value = url;
  sheetPin.value = pin;
  sheetEditingId.value = id;
  sheetOpen.value = true;
}

async function onScan() {
  scanning.value = true;
  try {
    const raw = await scanSupervisorQrCode();
    if (!raw) return;
    const url = parseSupervisorQrPayload(raw);
    if (!url) {
      showUiMessage(t("mobile.invalidQrUrl"), "error");
      return;
    }
    const existing = instances.value.find((item) => item.url === url);
    openManualAdd(url, existing?.pin ?? "", existing?.id);
  } catch (error) {
    showUiMessage(error instanceof Error ? error.message : t("mobile.scanFailed"), "error");
  } finally {
    scanning.value = false;
  }
}

async function connect(id: string) {
  if (longPressFired) {
    longPressFired = false;
    return;
  }
  const instance = setActiveSupervisorInstance(id);
  if (!instance) {
    showUiMessage(t("mobile.instanceNotFound"), "error");
    refresh();
    return;
  }
  if (!instance.pin) {
    openManualAdd(instance.url, "", instance.id);
    return;
  }
  emit("connected");
  window.location.reload();
}

async function onDelete(item: SupervisorInstance) {
  const label = item.name || displayNameForUrl(item.url);
  const ok = await requestUiDeleteConfirm({
    title: t("mobile.deleteInstance"),
    message: t("mobile.deleteInstanceConfirm", { label }),
  });
  if (!ok) return;
  removeSupervisorInstance(item.id);
  refresh();
  showUiMessage(t("common.deleted"), "success");
}

function onSaved() {
  refresh();
  emit("connected");
}

function startLongPress(item: SupervisorInstance) {
  clearLongPress();
  longPressFired = false;
  longPressTimer = setTimeout(() => {
    longPressFired = true;
    void onDelete(item);
  }, 550);
}

function clearLongPress() {
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = undefined;
}

onUnmounted(() => clearLongPress());
</script>

<style scoped>
.mobile-instances {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 100%;
  background: var(--app-list-section-bg, #ededed);
}

.mobile-instances__header {
  flex-shrink: 0;
}

.mobile-instances__header-spacer,
.mobile-instances__header-btn {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  color: var(--app-text-link, #576b95);
  background: transparent;
  border: 0;
  padding: 0;
}

.mobile-instances__header-btn:disabled {
  opacity: 0.45;
}

.mobile-instances__header-btn :deep(svg) {
  width: 22px;
  height: 22px;
}

.mobile-instances__scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.list-section-label {
  padding: 12px 16px 8px;
  color: var(--app-text-secondary);
  font-size: var(--app-font-caption);
  font-weight: var(--app-font-weight-regular);
}

.mobile-instances__group {
  background: var(--app-list-bg, #fff);
}

.mobile-instances__row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 12px 16px;
  text-align: left;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--app-border-subtle, rgba(0, 0, 0, 0.1));
}

.mobile-instances__row:last-child {
  border-bottom: 0;
}

.mobile-instances__row:active {
  background: var(--app-list-item-hover, #ececec);
}

.mobile-instances__avatar {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 6px;
  background: #07c160;
  color: #fff;
  font-size: var(--app-font-body-strong);
  font-weight: var(--app-font-weight-semibold);
}

.mobile-instances__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mobile-instances__name {
  color: var(--app-text-primary);
  font-size: var(--app-font-body-strong);
  font-weight: var(--app-font-weight-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-instances__url {
  color: var(--app-text-secondary);
  font-size: var(--app-font-caption);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-instances__badge {
  flex-shrink: 0;
  color: #07c160;
  font-size: var(--app-font-caption);
}

.mobile-instances__chevron {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--app-text-tertiary, rgba(0, 0, 0, 0.3));
}

.mobile-instances__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 72px 32px 32px;
  text-align: center;
}

.mobile-instances__empty-title {
  margin: 0;
  color: var(--app-text-primary);
  font-size: var(--app-font-title);
  font-weight: var(--app-font-weight-semibold);
}

.mobile-instances__empty-hint {
  margin: 12px 0 0;
  color: var(--app-text-secondary);
  font-size: var(--app-font-body);
  line-height: 1.5;
}

.mobile-instances__empty-cta {
  margin-top: 28px;
  min-width: 184px;
}

.mobile-instances__actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px 16px 0;
}

.mobile-instances__manual-link {
  margin-top: 16px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--app-text-link, #576b95);
  font-size: var(--app-font-body);
}

.mobile-instances__actions .mobile-instances__manual-link {
  margin-top: 0;
  align-self: center;
}

.mobile-instances__tip {
  margin: 16px 16px 24px;
  text-align: center;
  color: var(--app-text-tertiary, rgba(0, 0, 0, 0.3));
  font-size: var(--app-font-caption);
}
</style>
