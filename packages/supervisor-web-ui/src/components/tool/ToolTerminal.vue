<template><div ref="host" class="tool-terminal" /></template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

const props = defineProps<{ lines: string[]; prompt?: string }>();
const host = ref<HTMLElement>();
let terminal: Terminal | undefined;
let fit: FitAddon | undefined;
let observer: ResizeObserver | undefined;
let fitRetry = 0;

/** Normalize newlines so bare `\r` cannot yank the cursor mid-line. */
function toTerminalText(value: string): string {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n").replaceAll("\n", "\r\n");
}

function render() {
  if (!terminal) return;
  terminal.reset();
  for (const line of props.lines) terminal.writeln(toTerminalText(line));
  // writeln keeps the status on its own row; green SGR alone used to wrap as 1–2 cols
  // when FitAddon measured a near-zero width host before the panel finished layout.
  if (props.prompt) terminal.writeln(`\x1b[32m${props.prompt}\x1b[0m`);
}

function fitAndRender() {
  if (!terminal || !fit || !host.value) return;
  fit.fit();
  // Panel tab / flex host often mounts at ~0 width; defer until we have a real measure.
  if (terminal.cols < 20 && fitRetry < 12) {
    fitRetry += 1;
    requestAnimationFrame(fitAndRender);
    return;
  }
  fitRetry = 0;
  render();
}

onMounted(async () => {
  terminal = new Terminal({
    convertEol: true,
    cursorBlink: false,
    disableStdin: true,
    fontSize: 12,
    fontFamily: "Consolas, monospace",
    theme: { background: "#111315" },
  });
  fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.open(host.value!);
  await nextTick();
  fitAndRender();
  observer = new ResizeObserver(() => {
    if (!terminal || !fit) return;
    const prevCols = terminal.cols;
    fit.fit();
    // Soft-wrap from a tiny first fit does not always reflow the trailing prompt row;
    // rewrite when cols actually change.
    if (terminal.cols !== prevCols) render();
  });
  observer.observe(host.value!);
});
watch(() => [props.lines, props.prompt] as const, render, { deep: true });
onBeforeUnmount(() => {
  observer?.disconnect();
  terminal?.dispose();
});
</script>

<style scoped>
.tool-terminal {
  min-height: 260px;
  height: 100%;
  min-width: 0;
  padding: 10px;
  background: #111315;
  overflow: hidden;
}
</style>
