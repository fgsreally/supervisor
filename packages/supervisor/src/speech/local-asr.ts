import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getSupervisorHome } from "../utils/supervisor-home.js";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

export type LocalSpeechModelId = "zh-en-bilingual" | "zh-int8";

export interface LocalSpeechModelDef {
  id: LocalSpeechModelId;
  name: string;
  description: string;
  sizeLabel: string;
  /** Directory name after extract */
  dirName: string;
  archiveUrl: string;
  archiveName: string;
  files: {
    encoder: string;
    decoder: string;
    joiner: string;
    tokens: string;
  };
}

export interface LocalSpeechModelStatus {
  id: LocalSpeechModelId;
  name: string;
  description: string;
  sizeLabel: string;
  installed: boolean;
  installing: boolean;
  progress: number;
  error?: string;
}

interface SherpaOnlineRecognizer {
  createStream(): SherpaOnlineStream;
  isReady(stream: SherpaOnlineStream): boolean;
  decode(stream: SherpaOnlineStream): void;
  isEndpoint(stream: SherpaOnlineStream): boolean;
  reset(stream: SherpaOnlineStream): void;
  getResult(stream: SherpaOnlineStream): { text?: string };
}

interface SherpaOnlineStream {
  acceptWaveform(obj: { samples: Float32Array; sampleRate: number }): void;
  inputFinished(): void;
}

interface SherpaModule {
  OnlineRecognizer: new (config: Record<string, unknown>) => SherpaOnlineRecognizer;
}

export const LOCAL_SPEECH_MODELS: LocalSpeechModelDef[] = [
  {
    id: "zh-en-bilingual",
    name: "sherpa-onnx 中英双语",
    description: "流式 Zipformer，中英文实时识别",
    sizeLabel: "约 250MB",
    dirName: "sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20",
    archiveUrl:
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20.tar.bz2",
    archiveName: "sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20.tar.bz2",
    files: {
      encoder: "encoder-epoch-99-avg-1.onnx",
      decoder: "decoder-epoch-99-avg-1.onnx",
      joiner: "joiner-epoch-99-avg-1.onnx",
      tokens: "tokens.txt",
    },
  },
  {
    id: "zh-int8",
    name: "sherpa-onnx 中文 Int8",
    description: "量化中文流式模型，体积更小",
    sizeLabel: "约 160MB",
    dirName: "sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30",
    archiveUrl:
      "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30.tar.bz2",
    archiveName: "sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30.tar.bz2",
    files: {
      encoder: "encoder.int8.onnx",
      decoder: "decoder.onnx",
      joiner: "joiner.int8.onnx",
      tokens: "tokens.txt",
    },
  },
];

const MODEL_BY_ID = new Map(LOCAL_SPEECH_MODELS.map((model) => [model.id, model]));

type InstallState = { installing: boolean; progress: number; error?: string };
const installState = new Map<LocalSpeechModelId, InstallState>();

export function isLocalSpeechModelId(value: string): value is LocalSpeechModelId {
  return MODEL_BY_ID.has(value as LocalSpeechModelId);
}

export function getLocalSpeechModelsDir(): string {
  const dir = join(getSupervisorHome(), "models", "speech");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function resolveLocalSpeechModel(id?: string): LocalSpeechModelDef {
  if (id && isLocalSpeechModelId(id)) return MODEL_BY_ID.get(id)!;
  return MODEL_BY_ID.get("zh-en-bilingual")!;
}

function modelDir(def: LocalSpeechModelDef): string {
  return join(getLocalSpeechModelsDir(), def.dirName);
}

export function isLocalSpeechModelInstalled(id: LocalSpeechModelId): boolean {
  const def = MODEL_BY_ID.get(id);
  if (!def) return false;
  const root = modelDir(def);
  return (
    existsSync(join(root, def.files.encoder)) &&
    existsSync(join(root, def.files.decoder)) &&
    existsSync(join(root, def.files.joiner)) &&
    existsSync(join(root, def.files.tokens))
  );
}

export function listLocalSpeechModelStatuses(): LocalSpeechModelStatus[] {
  return LOCAL_SPEECH_MODELS.map((model) => {
    const state = installState.get(model.id);
    return {
      id: model.id,
      name: model.name,
      description: model.description,
      sizeLabel: model.sizeLabel,
      installed: isLocalSpeechModelInstalled(model.id),
      installing: state?.installing ?? false,
      progress: state?.progress ?? (isLocalSpeechModelInstalled(model.id) ? 100 : 0),
      error: state?.error,
    };
  });
}

export function isLocalSpeechReady(modelId?: string): boolean {
  const def = resolveLocalSpeechModel(modelId);
  return isLocalSpeechModelInstalled(def.id);
}

function setInstallState(id: LocalSpeechModelId, patch: Partial<InstallState>): void {
  const prev = installState.get(id) ?? { installing: false, progress: 0 };
  installState.set(id, { ...prev, ...patch });
}

async function downloadFile(
  url: string,
  dest: string,
  onProgress: (ratio: number) => void,
): Promise<void> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`下载失败 HTTP ${response.status}`);
  }
  const total = Number(response.headers.get("content-length") ?? "0");
  let received = 0;
  const nodeStream = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);
  const out = createWriteStream(dest);
  nodeStream.on("data", (chunk: Buffer) => {
    received += chunk.byteLength;
    if (total > 0) onProgress(Math.min(0.95, received / total));
  });
  await pipeline(nodeStream, out);
  onProgress(1);
}

async function extractArchive(archivePath: string, destDir: string): Promise<void> {
  mkdirSync(destDir, { recursive: true });
  // Windows 10+ / macOS / Linux 自带 tar，可解 bz2
  await execFileAsync("tar", ["-xjf", archivePath, "-C", destDir], {
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
}

export async function installLocalSpeechModel(
  id: LocalSpeechModelId,
): Promise<LocalSpeechModelStatus> {
  const def = MODEL_BY_ID.get(id);
  if (!def) throw new Error(`未知本地语音模型：${id}`);
  if (isLocalSpeechModelInstalled(id)) {
    setInstallState(id, { installing: false, progress: 100, error: undefined });
    return listLocalSpeechModelStatuses().find((item) => item.id === id)!;
  }
  const current = installState.get(id);
  if (current?.installing) {
    return listLocalSpeechModelStatuses().find((item) => item.id === id)!;
  }

  setInstallState(id, { installing: true, progress: 0, error: undefined });
  const root = getLocalSpeechModelsDir();
  const archivePath = join(root, def.archiveName);
  const extractRoot = root;

  try {
    await downloadFile(def.archiveUrl, archivePath, (ratio) => {
      setInstallState(id, { progress: Math.round(ratio * 90) });
    });
    setInstallState(id, { progress: 92 });
    // 清理旧目录后解压
    const target = modelDir(def);
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    await extractArchive(archivePath, extractRoot);
    setInstallState(id, { progress: 98 });
    if (!isLocalSpeechModelInstalled(id)) {
      throw new Error("解压完成但未找到模型文件，请重试安装");
    }
    try {
      if (existsSync(archivePath)) rmSync(archivePath, { force: true });
    } catch {
      // ignore cleanup errors
    }
    setInstallState(id, { installing: false, progress: 100, error: undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setInstallState(id, { installing: false, error: message });
    throw new Error(`安装本地语音模型失败：${message}`);
  }

  return listLocalSpeechModelStatuses().find((item) => item.id === id)!;
}

let sharedRecognizer: { modelId: LocalSpeechModelId; recognizer: SherpaOnlineRecognizer } | null =
  null;

function loadSherpa(): SherpaModule {
  try {
    return require("sherpa-onnx-node") as SherpaModule;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `无法加载本地语音引擎 sherpa-onnx-node：${message}。请确认已安装对应平台原生包`,
    );
  }
}

function getRecognizer(modelId: LocalSpeechModelId): SherpaOnlineRecognizer {
  if (sharedRecognizer?.modelId === modelId) return sharedRecognizer.recognizer;
  if (!isLocalSpeechModelInstalled(modelId)) {
    throw new Error("本地语音模型尚未安装，请先在设置中安装");
  }
  const def = MODEL_BY_ID.get(modelId)!;
  const root = modelDir(def);
  const sherpa = loadSherpa();
  const recognizer = new sherpa.OnlineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: {
        encoder: join(root, def.files.encoder),
        decoder: join(root, def.files.decoder),
        joiner: join(root, def.files.joiner),
      },
      tokens: join(root, def.files.tokens),
      numThreads: 2,
      provider: "cpu",
      debug: 0,
    },
    enableEndpoint: 1,
    rule1MinTrailingSilence: 2.4,
    rule2MinTrailingSilence: 1.2,
    rule3MinUtteranceLength: 20,
  });
  sharedRecognizer = { modelId, recognizer };
  return recognizer;
}

function pcm16ToFloat32(pcm: Buffer): Float32Array {
  const samples = new Float32Array(pcm.byteLength / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = pcm.readInt16LE(i * 2) / 0x8000;
  }
  return samples;
}

export class LocalAsrSession {
  private readonly recognizer: SherpaOnlineRecognizer;
  private readonly stream: SherpaOnlineStream;
  private committed = "";
  private lastPartial = "";
  private closed = false;

  constructor(
    modelId: LocalSpeechModelId,
    private readonly onPartial: (text: string) => void,
  ) {
    this.recognizer = getRecognizer(modelId);
    this.stream = this.recognizer.createStream();
  }

  append(pcm16: Buffer): void {
    if (this.closed || pcm16.byteLength < 2) return;
    const samples = pcm16ToFloat32(pcm16);
    this.stream.acceptWaveform({ samples, sampleRate: 16000 });
    while (this.recognizer.isReady(this.stream)) {
      this.recognizer.decode(this.stream);
    }
    const text = (this.recognizer.getResult(this.stream).text ?? "").trim();
    const combined = `${this.committed}${this.committed && text ? " " : ""}${text}`.trim();
    if (combined !== this.lastPartial) {
      this.lastPartial = combined;
      this.onPartial(combined);
    }
    if (this.recognizer.isEndpoint(this.stream)) {
      if (text) {
        this.committed = `${this.committed}${this.committed ? " " : ""}${text}`.trim();
      }
      this.recognizer.reset(this.stream);
    }
  }

  finish(): string {
    if (this.closed) return this.lastPartial;
    this.closed = true;
    const tail = new Float32Array(16000 * 0.4);
    this.stream.acceptWaveform({ samples: tail, sampleRate: 16000 });
    this.stream.inputFinished();
    while (this.recognizer.isReady(this.stream)) {
      this.recognizer.decode(this.stream);
    }
    const text = (this.recognizer.getResult(this.stream).text ?? "").trim();
    const finalText = `${this.committed}${this.committed && text ? " " : ""}${text}`.trim();
    this.lastPartial = finalText;
    this.onPartial(finalText);
    return finalText;
  }
}
