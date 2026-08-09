import { onBeforeUnmount, ref, type Ref } from "vue";
import { getSupervisorSettings, type SupervisorSettings } from "@/api";

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

export interface VoiceRecognitionHandlers {
  onStart?: () => void;
  onEnd?: () => void;
  onPreview?: (text: string) => void;
  onTranscript?: (text: string) => void;
  onError?: (message: string) => void;
}

export interface VoiceRecognitionOptions {
  barCount?: number;
  minHeight?: number;
  maxHeight?: number;
  idleHeight?: number;
}

const DEFAULT_BAR_COUNT = 4;
const DEFAULT_IDLE_HEIGHT = 4;
const DEFAULT_MIN_HEIGHT = 4;
const DEFAULT_MAX_HEIGHT = 15;
const BAR_PHASES = [0, 1.45, 2.9, 4.35];
const SILENCE_THRESHOLD = 0.025;
/** 官方建议双向流式单包约 200ms（16kHz PCM16 mono = 6400 bytes） */
const TARGET_PCM_BYTES = 6400;
const SETTINGS_CACHE_MS = 30_000;

let cachedSettings: { at: number; value: SupervisorSettings } | null = null;

async function loadSpeechSettings(): Promise<SupervisorSettings> {
  const now = Date.now();
  if (cachedSettings && now - cachedSettings.at < SETTINGS_CACHE_MS) {
    return cachedSettings.value;
  }
  const value = await getSupervisorSettings();
  cachedSettings = { at: now, value };
  return value;
}

export function useVoiceRecognition(
  handlers: VoiceRecognitionHandlers = {},
  options: VoiceRecognitionOptions = {},
) {
  const barCount = options.barCount ?? DEFAULT_BAR_COUNT;
  const idleHeight = options.idleHeight ?? DEFAULT_IDLE_HEIGHT;
  const minHeight = options.minHeight ?? DEFAULT_MIN_HEIGHT;
  const maxHeight = options.maxHeight ?? DEFAULT_MAX_HEIGHT;

  const recording = ref(false);
  const partialText = ref("");
  const waveformBars = ref<number[]>(Array.from({ length: barCount }, () => idleHeight));

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
  let aborting = false;
  let stopResolve: ((text: string) => void) | null = null;
  let pcmQueue: ArrayBuffer[] = [];
  let pcmPending: Uint8Array[] = [];
  let pcmPendingBytes = 0;

  function resetBars() {
    waveformBars.value = Array.from({ length: barCount }, () => idleHeight);
  }

  function emitPreview(text: string) {
    partialText.value = text;
    if (recording.value && !aborting) handlers.onPreview?.(text);
  }

  function deliverFinal(text: string) {
    if (aborting) return;
    const value = text.trim();
    if (value) handlers.onTranscript?.(value);
  }

  function resolveStop(text = "") {
    const resolve = stopResolve;
    stopResolve = null;
    resolve?.(text.trim());
  }

  function websocketUrl(): string {
    const base = new URL(import.meta.env.VITE_API_BASE || window.location.origin);
    base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
    base.pathname = `${base.pathname.replace(/\/$/, "")}/ws`;
    base.search = "";
    return base.toString();
  }

  function enqueuePcm(buffer: ArrayBuffer) {
    const chunk = new Uint8Array(buffer);
    pcmPending.push(chunk);
    pcmPendingBytes += chunk.byteLength;
    while (pcmPendingBytes >= TARGET_PCM_BYTES) {
      const frame = new Uint8Array(TARGET_PCM_BYTES);
      let offset = 0;
      while (offset < TARGET_PCM_BYTES && pcmPending.length > 0) {
        const next = pcmPending[0]!;
        const take = Math.min(next.byteLength, TARGET_PCM_BYTES - offset);
        frame.set(next.subarray(0, take), offset);
        offset += take;
        if (take >= next.byteLength) pcmPending.shift();
        else pcmPending[0] = next.subarray(take);
      }
      pcmPendingBytes -= TARGET_PCM_BYTES;
      dispatchPcm(frame.buffer);
    }
  }

  function flushPcmPending() {
    if (pcmPendingBytes <= 0) {
      pcmPending = [];
      pcmPendingBytes = 0;
      return;
    }
    const frame = new Uint8Array(pcmPendingBytes);
    let offset = 0;
    for (const part of pcmPending) {
      frame.set(part, offset);
      offset += part.byteLength;
    }
    pcmPending = [];
    pcmPendingBytes = 0;
    dispatchPcm(frame.buffer);
  }

  function dispatchPcm(buffer: ArrayBuffer) {
    if (sendAudioToSocket && socket?.readyState === WebSocket.OPEN) {
      socket.send(buffer);
      return;
    }
    pcmQueue.push(buffer);
    // 就绪前只保留约 2s，避免积压过大
    const maxQueued = Math.ceil((16_000 * 2 * 2) / TARGET_PCM_BYTES);
    if (pcmQueue.length > maxQueued) {
      pcmQueue.splice(0, pcmQueue.length - maxQueued);
    }
  }

  function flushPcmQueue() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    for (const buffer of pcmQueue) socket.send(buffer);
    pcmQueue = [];
  }

  async function start() {
    if (recording.value) return;
    aborting = false;
    stopRequested = false;
    browserStopRequested = false;
    browserFinalTranscript = "";
    partialText.value = "";
    pcmQueue = [];
    pcmPending = [];
    pcmPendingBytes = 0;
    recording.value = true;
    handlers.onStart?.();
    try {
      const settingsPromise = loadSpeechSettings();
      await startAudioCapture();
      startWaveformMonitor();
      const settings = await settingsPromise;
      const mode =
        settings.speechRecognitionMode === "browser"
          ? "local"
          : (settings.speechRecognitionMode ?? "local");
      if (mode === "local" && !settings.localSpeechConfigured) {
        throw new Error("请先在设置中安装本地语音模型");
      }
      if (mode === "doubao" && !settings.doubaoSpeechConfigured) {
        throw new Error("请先在设置中配置豆包语音识别凭证");
      }
      if (mode === "qwen" && !settings.speechApiKeyConfigured) {
        throw new Error("请先在设置中配置 DashScope API Key");
      }
      sendAudioToSocket = false;
      await connect(settings.speechRecognitionLanguage ?? "zh-CN");
    } catch (error) {
      cleanup();
      handlers.onError?.(error instanceof Error ? error.message : "无法启动语音识别");
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
      handlers.onError?.(`本地语音识别失败：${event.error ?? "未知错误"}`);
    };
    recognition.onend = () => {
      if (recording.value && !browserStopRequested && !aborting) {
        try {
          recognition?.start();
        } catch {
          void restartBrowserRecognition();
        }
        return;
      }
      const resolved = partialText.value.trim();
      recognition = null;
      browserFinalTranscript = "";
      partialText.value = "";
      cleanup(false);
      if (!aborting) {
        resolveStop(resolved);
        handlers.onEnd?.();
      }
    };
    recognition.start();
  }

  async function restartBrowserRecognition() {
    if (!recording.value || browserStopRequested || aborting) return;
    recognition?.abort();
    recognition = null;
    try {
      await startBrowserRecognition(browserLanguage);
    } catch (error) {
      handlers.onError?.(error instanceof Error ? error.message : "无法重启语音识别");
      cleanup();
      handlers.onEnd?.();
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
          flushPcmQueue();
          resolve();
          if (stopRequested) void stop();
        } else if (message.type === "speech.partial") {
          partialText.value = message.payload?.text ?? "";
          if (recording.value && !aborting) handlers.onPreview?.(partialText.value);
        } else if (message.type === "speech.final") {
          partialText.value = message.payload?.text ?? partialText.value;
          deliverFinal(message.payload?.text ?? "");
        } else if (message.type === "speech.stopped") {
          const text = partialText.value.trim();
          cleanup(false);
          if (!aborting) {
            resolveStop(text);
            handlers.onEnd?.();
          }
        } else if (message.type === "speech.error") {
          window.clearTimeout(timeout);
          const error = new Error(message.payload?.message ?? "语音识别失败");
          reject(error);
          handlers.onError?.(error.message);
          cleanup();
        }
      };
      ws.onerror = () => reject(new Error("无法连接 Supervisor WebSocket"));
      ws.onclose = () => {
        window.clearTimeout(timeout);
        if (recording.value && !aborting) handlers.onError?.("语音连接已断开");
        cleanup(false);
        if (!aborting) {
          resolveStop(partialText.value.trim());
          handlers.onEnd?.();
        }
      };
    });
  }

  async function startAudioCapture() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("当前浏览器不支持录音");
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
        // 尽量贴近 16k，减少重采样延迟
        sampleRate: 16000,
      },
    });
    audioContext = new AudioContext({ sampleRate: 16000 });
    source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.35;
    // 约 128ms @16kHz，再在上层聚合成 ~200ms 再发
    processor = audioContext.createScriptProcessor(2048, 1, 1);
    silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    processor.onaudioprocess = (event) => {
      if (!recording.value) return;
      enqueuePcm(toPcm16(event.inputBuffer.getChannelData(0), audioContext?.sampleRate ?? 16000));
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

      if (volume < SILENCE_THRESHOLD) {
        waveformBars.value = Array.from({ length: barCount }, () => idleHeight);
        waveformRaf = requestAnimationFrame(tick);
        return;
      }

      const now = performance.now();
      const amplitude = volume * 0.92;

      waveformBars.value = Array.from({ length: barCount }, (_, index) => {
        const wobble = Math.sin(now / 105 + (BAR_PHASES[index % BAR_PHASES.length] ?? 0));
        const level = idleHeight + (0.5 + wobble * 0.5) * amplitude * (maxHeight - idleHeight);
        return Math.round(Math.max(minHeight, Math.min(maxHeight, level)));
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

  function stop(): Promise<string> {
    if (!recording.value) return Promise.resolve(partialText.value.trim());

    return new Promise((resolve) => {
      stopResolve = resolve;

      if (!sendAudioToSocket && socket && !recognition) {
        stopRequested = true;
        return;
      }
      if (recognition) {
        browserStopRequested = true;
        recognition.stop();
        return;
      }
      flushPcmPending();
      sendAudioToSocket = false;
      stopWaveformMonitor();
      stopAudioCapture();
      recording.value = false;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ channel: "speech", type: "speech.stop" }));
      } else {
        const text = partialText.value.trim();
        cleanup();
        resolveStop(text);
        handlers.onEnd?.();
      }
    });
  }

  function abort() {
    if (!recording.value) return;
    aborting = true;
    stopResolve = null;
    browserStopRequested = true;
    stopRequested = false;
    if (recognition) {
      recognition.abort();
      recognition = null;
    }
    cleanup();
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
    pcmQueue = [];
    pcmPending = [];
    pcmPendingBytes = 0;
    stopWaveformMonitor();
    stopAudioCapture();
    if (recognition) {
      recognition.abort();
      recognition = null;
    }
    partialText.value = "";
    if (closeSocket) socket?.close();
    socket = null;
  }

  onBeforeUnmount(() => {
    abort();
    handlers.onEnd?.();
  });

  return {
    recording: recording as Readonly<Ref<boolean>>,
    partialText: partialText as Readonly<Ref<string>>,
    waveformBars: waveformBars as Readonly<Ref<number[]>>,
    start,
    stop,
    abort,
  };
}

export type VoiceRecognitionController = ReturnType<typeof useVoiceRecognition>;
