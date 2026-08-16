<template>
  <div class="inline-file-diff">
    <div v-if="truncated" class="inline-file-diff__notice">
      {{ t("session.file.diffTruncated", { count: lines.length }) }}
    </div>
    <table class="inline-file-diff__table">
      <tbody>
        <tr
          v-for="(line, index) in lines"
          :key="index"
          class="inline-file-diff__row"
          :class="`inline-file-diff__row--${line.type}`"
        >
          <td class="inline-file-diff__gutter inline-file-diff__gutter--old">
            {{ line.oldLineNo ?? "" }}
          </td>
          <td class="inline-file-diff__gutter inline-file-diff__gutter--new">
            {{ line.newLineNo ?? "" }}
          </td>
          <td class="inline-file-diff__sign">{{ signFor(line.type) }}</td>
          <td class="inline-file-diff__content">{{ line.content }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "@/i18n";

const { t } = useI18n();
import type { SessionFileDiffLine } from "@/api";

defineProps<{
  lines: SessionFileDiffLine[];
  truncated?: boolean;
}>();

function signFor(type: SessionFileDiffLine["type"]): string {
  if (type === "add") return "+";
  if (type === "del") return "-";
  return " ";
}
</script>

<style scoped>
.inline-file-diff {
  min-width: max-content;
  font:
    12px/1.5 ui-monospace,
    SFMono-Regular,
    Menlo,
    Consolas,
    monospace;
}

.inline-file-diff__notice {
  padding: 8px 12px;
  border-bottom: 1px solid var(--app-border-subtle);
  color: var(--app-text-muted);
  font:
    12px/1.4 system-ui,
    sans-serif;
}

.inline-file-diff__table {
  width: 100%;
  border-collapse: collapse;
}

.inline-file-diff__row--context {
  background: transparent;
}

.inline-file-diff__row--add {
  background: color-mix(in srgb, #07a65a 18%, transparent);
}

.inline-file-diff__row--del {
  background: color-mix(in srgb, #e05a67 18%, transparent);
}

.inline-file-diff__gutter {
  width: 1%;
  padding: 0 8px;
  border-right: 1px solid var(--app-border-subtle);
  color: var(--app-text-muted);
  text-align: right;
  user-select: none;
  white-space: nowrap;
}

.inline-file-diff__sign {
  width: 1%;
  padding: 0 6px;
  color: var(--app-text-muted);
  text-align: center;
  user-select: none;
}

.inline-file-diff__row--add .inline-file-diff__sign {
  color: #07a65a;
}

.inline-file-diff__row--del .inline-file-diff__sign {
  color: #e05a67;
}

.inline-file-diff__content {
  padding: 0 12px 0 4px;
  color: var(--app-text-primary);
  white-space: pre;
}

.inline-file-diff__row--del .inline-file-diff__content {
  text-decoration: line-through;
  color: color-mix(in srgb, #e05a67 85%, var(--app-text-primary));
}

.inline-file-diff__row--add .inline-file-diff__content {
  color: color-mix(in srgb, #07a65a 85%, var(--app-text-primary));
}
</style>
