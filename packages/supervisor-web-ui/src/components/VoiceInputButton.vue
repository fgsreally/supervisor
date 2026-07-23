<template>
  <div class="voice-control">
    <div v-if="partialText" class="voice-preview" role="status">{{ partialText }}</div>
    <button
      type="button"
      class="voice-button toolbar-icon-btn"
      :class="{ 'voice-button--active': recording, 'voice-button--busy': busy }"
      :disabled="disabled || busy"
      :aria-pressed="recording"
      :aria-label="label"
      :title="label"
      @click="onClick"
      @pointerdown="onPointerDown"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @contextmenu.prevent
    >
      <Loader2 v-if="busy" class="voice-icon voice-icon--spin" />
      <Square v-else-if="recording" class="voice-icon voice-stop" />
      <Mic v-else class="voice-icon" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { Loader2, Mic, Square } from "lucide-vue-next";
import { getSupervisorSettings } from "@/api";

interface WsEvent {
  channel?: string;
  type?: string;
  payload?: { text?: string; message?: string };
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ transcript: [text: string]; error: [message: string] }>();

const recording = ref(false);
const busy = ref(false);
const partialText = ref("");
let socket: WebSocket | null = null;
let stream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let processor: ScriptProcessorNode | null = null;
let silentGain: GainNode | null = null;
let coarsePress = false;
let stopRequested = false;
let recognition: SpeechRecognitionLike | null = null;

const isCoarsePointer = () => window.matchMedia?.("(pointer: coarse)").matches ?? false;
const label = computed(() =>
  busy.value
    ? "正在连接语音识别"
    : recording.value
      ? isCoarsePointer()
        ? "松开结束识别"
        : "结束语音输入"
      : isCoarsePointer()
        ? "按住说话"
        : "开始语音输入",
);

function websocketUrl(): string {
  const base = new URL(import.meta.env.VITE_API_BASE || window.location.origin);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = `${base.pathname.replace(/\/$/, "")}/ws`;
  base.search = "";
  return base.toString();
}

async function start() {
  if (recording.value || busy.value) return;
  busy.value = true;
  stopRequested = false;
  partialText.value = "";
  try {
    const settings = await getSupervisorSettings();
    if (settings.speechRecognitionMode === "browser") {
      startBrowserRecognition(settings.speechRecognitionLanguage ?? "zh-CN");
      return;
    }
    if (settings.speechRecognitionMode === "doubao" && !settings.doubaoSpeechApiKeyConfigured) {
      throw new Error("请先在设置中配置豆包语音 API Key");
    }
    if ((settings.speechRecognitionMode ?? "qwen") === "qwen" && !settings.speechApiKeyConfigured) {
      throw new Error("请先在设置中配置 DashScope API Key");
    }
    await connect(settings.speechRecognitionLanguage ?? "zh-CN");
  } catch (error) {
    cleanup();
    emit("error", error instanceof Error ? error.message : "无法启动语音识别");
  } finally {
    busy.value = false;
  }
}

function startBrowserRecognition(language: string) {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Constructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  if (!Constructor) throw new Error("当前浏览器不支持本地语音识别");
  recognition = new Constructor();
  recognition.continuous = true;
  recognition.interimResults = true;
  if (language) recognition.lang = language;
  recognition.onresult = (event) => {
    let preview = "";
    for (let index = 0; index < event.results.length; index++) {
      preview += event.results[index]?.[0]?.transcript ?? "";
    }
    partialText.value = preview;
    const latest = event.results[event.resultIndex];
    if (latest?.isFinal && latest[0]?.transcript.trim()) {
      emit("transcript", latest[0].transcript.trim());
      partialText.value = "";
    }
  };
  recognition.onerror = (event) => {
    if (event.error !== "aborted" && event.error !== "no-speech") {
      emit("error", `本地语音识别失败：${event.error ?? "未知错误"}`);
    }
  };
  recognition.onend = () => {
    recognition = null;
    recording.value = false;
  };
  recognition.start();
  recording.value = true;
}

function connect(language: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(websocketUrl());
    ws.binaryType = "arraybuffer";
    socket = ws;
    const timeout = window.setTimeout(() => reject(new Error("语音服务连接超时")), 20_000);
    ws.onopen = () => {
      ws.send(JSON.stringify({ channel: "speech", type: "speech.start", payload: { language } }));
    };
    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      const message = JSON.parse(event.data) as WsEvent;
      if (message.channel !== "speech") return;
      if (message.type === "speech.ready") {
        window.clearTimeout(timeout);
        void startAudio().then(() => {
          recording.value = true;
          resolve();
          if (stopRequested) stop();
        }, reject);
      } else if (message.type === "speech.partial") {
        partialText.value = message.payload?.text ?? "";
      } else if (message.type === "speech.final") {
        const text = message.payload?.text?.trim();
        if (text) emit("transcript", text);
        partialText.value = "";
      } else if (message.type === "speech.stopped") {
        busy.value = false;
        cleanup();
      } else if (message.type === "speech.error") {
        window.clearTimeout(timeout);
        const error = new Error(message.payload?.message ?? "语音识别失败");
        reject(error);
        emit("error", error.message);
        cleanup();
      }
    };
    ws.onerror = () => reject(new Error("无法连接 Supervisor WebSocket"));
    ws.onclose = () => {
      window.clearTimeout(timeout);
      if (recording.value) emit("error", "语音连接已断开");
      cleanup(false);
    };
  });
}

async function startAudio() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("当前浏览器不支持录音");
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
  });
  audioContext = new AudioContext();
  source = audioContext.createMediaStreamSource(stream);
  processor = audioContext.createScriptProcessor(4096, 1, 1);
  silentGain = audioContext.createGain();
  silentGain.gain.value = 0;
  processor.onaudioprocess = (event) => {
    if (socket?.readyState !== WebSocket.OPEN || !recording.value) return;
    socket.send(toPcm16(event.inputBuffer.getChannelData(0), audioContext?.sampleRate ?? 16000));
  };
  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(audioContext.destination);
  await audioContext.resume();
}

function toPcm16(input: Float32Array, sourceRate: number): ArrayBuffer {
  const ratio = sourceRate / 16000;
  const length = Math.max(1, Math.floor(input.length / ratio));
  const pcm = new Int16Array(length);
  for (let index = 0; index < length; index++) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let sample = start; sample < end; sample++) sum += input[sample] ?? 0;
    const value = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    pcm[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  return pcm.buffer;
}

function stop() {
  if (busy.value && !recording.value) {
    stopRequested = true;
    return;
  }
  if (!recording.value) return;
  if (recognition) {
    recognition.stop();
    recording.value = false;
    return;
  }
  recording.value = false;
  stopAudio();
  if (socket?.readyState === WebSocket.OPEN) {
    busy.value = true;
    socket.send(JSON.stringify({ channel: "speech", type: "speech.stop" }));
  } else {
    cleanup();
  }
}

function stopAudio() {
  processor?.disconnect();
  source?.disconnect();
  silentGain?.disconnect();
  stream?.getTracks().forEach((track) => track.stop());
  void audioContext?.close();
  processor = null;
  source = null;
  silentGain = null;
  stream = null;
  audioContext = null;
}

function cleanup(closeSocket = true) {
  recording.value = false;
  busy.value = false;
  stopAudio();
  recognition?.abort();
  recognition = null;
  if (closeSocket) socket?.close();
  socket = null;
}

function onClick() {
  if (coarsePress || isCoarsePointer()) {
    coarsePress = false;
    return;
  }
  if (recording.value || busy.value) stop();
  else void start();
}
function onPointerDown(event: PointerEvent) {
  if (!isCoarsePointer()) return;
  coarsePress = true;
  if (event.currentTarget instanceof Element)
    event.currentTarget.setPointerCapture(event.pointerId);
  void start();
}
function onPointerUp() {
  if (isCoarsePointer()) stop();
}
function onPointerCancel() {
  if (isCoarsePointer()) stop();
}

onBeforeUnmount(() => cleanup());
</script>

<style scoped>
.voice-control {
  position: relative;
  display: inline-flex;
}
.voice-preview {
  position: absolute;
  right: -8px;
  bottom: calc(100% + 10px);
  width: min(320px, calc(100vw - 32px));
  padding: 8px 10px;
  border: 1px solid var(--app-border-subtle);
  border-radius: 7px;
  color: var(--app-text-primary);
  background: var(--app-popup-bg);
  box-shadow: 0 6px 20px rgb(0 0 0 / 14%);
  font-size: 13px;
  line-height: 1.45;
}
.voice-button {
  padding: 6px;
  border-radius: 8px;
  touch-action: none;
  user-select: none;
  transition:
    background-color 0.15s,
    color 0.15s;
}
.voice-button:hover:not(:disabled) {
  background: var(--app-hover);
  color: var(--app-text-primary);
}
.voice-icon {
  width: 19px;
  height: 19px;
  stroke-width: 1.5;
}
.voice-button--active {
  color: white;
  background: var(--app-danger, #dc2626);
}
.voice-button--busy {
  color: var(--app-accent);
}
.voice-stop {
  width: 14px;
  height: 14px;
  fill: currentColor;
}
.voice-icon--spin {
  animation: voice-spin 0.8s linear infinite;
}
@keyframes voice-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (pointer: coarse) {
  .voice-button {
    width: 42px;
    height: 36px;
    display: inline-grid;
    place-items: center;
  }
  .voice-button--active {
    transform: scale(1.06);
  }
  .voice-preview {
    position: fixed;
    right: 16px;
    bottom: calc(82px + env(safe-area-inset-bottom));
  }
}
</style>
