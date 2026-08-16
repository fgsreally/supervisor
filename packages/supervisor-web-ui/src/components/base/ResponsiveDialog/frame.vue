<template>
  <SheetDrawer
    :open="open"
    :ariaLabel="title || ariaLabel || 'Dialog'"
    :title="title"
    :description="description"
    :variant="variant"
    :size="size"
    :width="width"
    :show-close="showClose"
    :dismiss-on-backdrop="dismissOnBackdrop"
    :panel-class="panelClass"
    :body-class="bodyClass"
    :modal-breakpoint="modalBreakpoint"
    @close="emit('close')"
  >
    <template v-if="$slots.header" #header>
      <slot name="header" />
    </template>
    <template v-if="$slots['header-actions']" #header-actions>
      <slot name="header-actions" />
    </template>
    <slot />
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </SheetDrawer>
</template>

<script setup lang="ts">
import SheetDrawer, {
  type SheetDrawerSize,
  type SheetDrawerVariant,
  type SheetDrawerWidth,
} from "@/components/base/SheetDrawer.vue";

export interface ResponsiveDialogProps {
  open: boolean;
  title?: string;
  description?: string;
  ariaLabel?: string;
  showClose?: boolean;
  dismissOnBackdrop?: boolean;
  panelClass?: string;
  bodyClass?: string;
  size?: SheetDrawerSize;
  variant?: SheetDrawerVariant;
  width?: SheetDrawerWidth;
  modalBreakpoint?: number;
}

/**
 * 统一重内容弹层：
 * - PC：居中弹窗
 * - 移动端：底部抽屉
 *
 * 短确认 / 删除请用 UiDialog + requestUiConfirm / requestUiDeleteConfirm。
 * 会话侧栏（log / files / tools）请用 ResponsiveSplitSurface。
 */
withDefaults(defineProps<ResponsiveDialogProps>(), {
  showClose: true,
  dismissOnBackdrop: true,
  panelClass: undefined,
  bodyClass: undefined,
  size: "auto",
  variant: "adaptive",
  width: "md",
  modalBreakpoint: 767,
});
const emit = defineEmits<{ close: [] }>();
</script>
