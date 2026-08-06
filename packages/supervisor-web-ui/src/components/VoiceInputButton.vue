<template>
  <button
    type="button"
    class="voice-button toolbar-icon-btn"
    :class="{ 'voice-button--active': recording }"
    :disabled="disabled"
    :aria-label="recording ? '结束语音输入' : '开始语音输入'"
    :title="recording ? '结束语音输入' : '开始语音输入'"
    @click="onToggleClick"
  >
    <Mic v-if="!recording" class="voice-icon" />
    <span v-else class="voice-bars" aria-hidden="true">
      <span
        v-for="(level, index) in waveformBars"
        :key="index"
        class="voice-bars__bar"
        :style="{ height: `${level}px` }"
      />
    </span>
  </button>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { Mic } from "lucide-vue-next";
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

const emit = defineEmits<{
  start: [];
  end: [];
  preview: [text: string];
  transcript: [text: string];
  error: [message: string];
}>();

const BAR_COUNT = 4;
/** 静音时的装饰高度（px），对齐参考图：首条略高 */
const REST_HEIGHTS = [13, 8, 10, 9];
const BAR_PHASES = [0, 1.45, 2.9, 4.35];
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 15;

const recording = ref(false);
const partialText = ref("");
const waveformBars = ref<number[]>([...REST_HEIGHTS]);
let socket: WebSocket | null = null;
let stream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let processor: ScriptProcessorNode | null = null;
let analyser: AnalyserNode | null = null;
let silentGain: GainNode | null = null;
let waveformRaf = 0;
let recognition: SpeechRecognitionLike | null = null;
let browserStopRequested = false;
let browserLanguage = "zh-CN";
let browserFinalTranscript = "";
let sendAudioToSocket = false;
let stopRequested = false;

watch(partialText, (value) => {
  if (recording.value) emit("preview", value);
});

function emitPreview(text: string) {
  partialText.value = text;
  if (recording.value) emit("preview", text);
}

function resetBars() {
  waveformBars.value = [...REST_HEIGHTS];
}

function deliverFinal(text: string) {
  const value = text.trim();
  if (value) emit("transcript", value);
}

function websocketUrl(): string {
  const base = new URL(import.meta.env.VITE_API_BASE || window.location.origin);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = `${base.pathname.replace(/\/$/, "")}/ws`;
  base.search = "";
  return base.toString();
}

async function start() {
  if (recording.value) return;
  stopRequested = false;
  browserStopRequested = false;
  browserFinalTranscript = "";
  partialText.value = "";
  recording.value = true;
  emit("start");
  try {
    await startAudioCapture(false);
    startWaveformMonitor();
    const settings = await getSupervisorSettings();
    if (settings.speechRecognitionMode === "browser") {
      startBrowserRecognition(settings.speechRecognitionLanguage ?? "zh-CN");
      return;
    }
    if (settings.speechRecognitionMode === "doubao" && !settings.doubaoSpeechConfigured) {
      throw new Error("请先在设置中配置豆包 App ID 与 Access Token");
    }
    if ((settings.speechRecognitionMode ?? "qwen") === "qwen" && !settings.speechApiKeyConfigured) {
      throw new Error("请先在设置中配置 DashScope API Key");
    }
    sendAudioToSocket = false;
    await connect(settings.speechRecognitionLanguage ?? "zh-CN");
  } catch (error) {
    cleanup();
    emit("error", error instanceof Error ? error.message : "无法启动语音识别");
  }
}

async function startBrowserRecognition(language: string) {
  browserLanguage = language;
  recognition?.abort();
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
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index++) {
      const result = event.results[index];
      const chunk = result?.[0]?.transcript ?? "";
      if (result?.isFinal) browserFinalTranscript += chunk;
      else interim += chunk;
    }
    emitPreview(`${browserFinalTranscript}${interim}`.trim());
  };
  recognition.onerror = (event) => {
    if (event.error === "aborted" || event.error === "no-speech") return;
    emit("error", `本地语音识别失败：${event.error ?? "未知错误"}`);
  };
  recognition.onend = () => {
    if (recording.value && !browserStopRequested) {
      try {
        recognition?.start();
      } catch {
        void restartBrowserRecognition();
      }
      return;
    }
    recognition = null;
    browserFinalTranscript = "";
    partialText.value = "";
    cleanup();
    emit("end");
  };
  recognition.start();
}

async function restartBrowserRecognition() {
  if (!recording.value || browserStopRequested) return;
  recognition?.abort();
  recognition = null;
  try {
    await startBrowserRecognition(browserLanguage);
  } catch (error) {
    emit("error", error instanceof Error ? error.message : "无法重启语音识别");
    cleanup();
    emit("end");
  }
}

function connect(language: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL(websocketUrl());
    const webPassword = localStorage.getItem("pi-supervisor-web-password");
    if (webPassword) url.searchParams.set("password", webPassword);
    const ws = new WebSocket(url);
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
        sendAudioToSocket = true;
        resolve();
        if (stopRequested) stop();
      } else if (message.type === "speech.partial") {
        partialText.value = message.payload?.text ?? "";
      } else if (message.type === "speech.final") {
        partialText.value = message.payload?.text ?? partialText.value;
        deliverFinal(message.payload?.text ?? "");
      } else if (message.type === "speech.stopped") {
        cleanup(false);
        emit("end");
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
      emit("end");
    };
  });
}

async function startAudioCapture(_streamToSocket: boolean) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("当前浏览器不支持录音");
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
  });
  audioContext = new AudioContext();
  source = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.35;
  processor = audioContext.createScriptProcessor(4096, 1, 1);
  silentGain = audioContext.createGain();
  silentGain.gain.value = 0;
  processor.onaudioprocess = (event) => {
    if (!recording.value) return;
    if (sendAudioToSocket && socket?.readyState === WebSocket.OPEN) {
      socket.send(toPcm16(event.inputBuffer.getChannelData(0), audioContext?.sampleRate ?? 16000));
    }
  };
  source.connect(analyser);
  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(audioContext.destination);
  await audioContext.resume();
}

function startWaveformMonitor() {
  const timeData = new Uint8Array(analyser?.fftSize ?? 512);
  const tick = () => {
    if (!recording.value) return;

    let volume = 0;
    if (analyser) {
      analyser.getByteTimeDomainData(timeData);
      let sum = 0;
      for (let index = 0; index < timeData.length; index++) {
        const sample = (timeData[index]! - 128) / 128;
        sum += sample * sample;
      }
      volume = Math.min(1, Math.sqrt(sum / timeData.length) * 12);
    }

    const now = performance.now();
    const amplitude = 0.16 + volume * 0.84;

    waveformBars.value = REST_HEIGHTS.map((rest, index) => {
      const wobble = Math.sin(now / 105 + BAR_PHASES[index]!);
      const level = rest + wobble * amplitude * (MAX_HEIGHT - rest);
      return Math.round(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, level)));
    });
    waveformRaf = requestAnimationFrame(tick);
  };
  cancelAnimationFrame(waveformRaf);
  waveformRaf = requestAnimationFrame(tick);
}

function stopWaveformMonitor() {
  cancelAnimationFrame(waveformRaf);
  waveformRaf = 0;
  resetBars();
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
  if (!recording.value) return;
  if (!sendAudioToSocket && socket && !recognition) {
    stopRequested = true;
    return;
  }
  if (recognition) {
    browserStopRequested = true;
    recognition.stop();
    return;
  }
  sendAudioToSocket = false;
  stopWaveformMonitor();
  stopAudioCapture();
  recording.value = false;
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ channel: "speech", type: "speech.stop" }));
  } else {
    cleanup();
    emit("end");
  }
}

function stopAudioCapture() {
  processor?.disconnect();
  analyser?.disconnect();
  source?.disconnect();
  silentGain?.disconnect();
  stream?.getTracks().forEach((track) => track.stop());
  void audioContext?.close();
  processor = null;
  analyser = null;
  source = null;
  silentGain = null;
  stream = null;
  audioContext = null;
}

function cleanup(closeSocket = true) {
  recording.value = false;
  sendAudioToSocket = false;
  browserFinalTranscript = "";
  stopWaveformMonitor();
  stopAudioCapture();
  recognition?.abort();
  recognition = null;
  partialText.value = "";
  if (closeSocket) socket?.close();
  socket = null;
}

function onToggleClick() {
  if (recording.value) stop();
  else void start();
}

onBeforeUnmount(() => {
  cleanup();
  emit("end");
});
</script>

<style scoped>
.voice-button {
  padding: 6px;
  border-radius: 8px;
  color: var(--app-toolbar-icon, var(--app-text-secondary));
}

.voice-button:hover:not(:disabled) {
  background: var(--app-hover);
  color: var(--app-text-primary);
}

.voice-button--active {
  color: #07c160;
}

.voice-button--active:hover:not(:disabled) {
  color: #06ae56;
}

.voice-icon {
  width: 19px;
  height: 19px;
  stroke-width: 1.5;
}

.voice-bars {
  display: flex;
  width: 19px;
  height: 19px;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.voice-bars__bar {
  width: 2px;
  min-height: 4px;
  border-radius: 999px;
  background: currentColor;
  will-change: height;
}
</style>
