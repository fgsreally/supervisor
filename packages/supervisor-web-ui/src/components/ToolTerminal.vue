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

function render() {
  if (!terminal) return;
  terminal.reset();
  for (const line of props.lines) terminal.writeln(line.replaceAll("\n", "\r\n"));
  if (props.prompt) terminal.write(`\x1b[32m${props.prompt}\x1b[0m`);
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
  fit.fit();
  render();
  observer = new ResizeObserver(() => fit?.fit());
  observer.observe(host.value!);
});
watch(() => props.lines, render, { deep: true });
onBeforeUnmount(() => {
  observer?.disconnect();
  terminal?.dispose();
});
</script>

<style scoped>
.tool-terminal {
  min-height: 260px;
  height: 100%;
  padding: 10px;
  background: #111315;
  overflow: hidden;
}
</style>
