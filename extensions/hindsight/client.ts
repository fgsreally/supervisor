/**
 * Minimal fetch-based client for the Hindsight HTTP API.
 */

import { isTimeoutError, withTimeoutSignal } from "./utils/fetch-timeout.js";
import type { HindsightConfig } from "./config.js";

const USER_AGENT = "supervisor-hindsight-extension";
const HINDSIGHT_REQUEST_TIMEOUT_MS = 30_000;

export type Budget = "low" | "mid" | "high" | string;
export type TagsMatch = "any" | "all" | "any_strict" | "all_strict";
export type UpdateMode = "replace" | "append";

export interface HindsightApiOptions {
  baseUrl: string;
  apiKey?: string;
  userAgent?: string;
}

export interface HindsightRequestOptions {
  signal?: AbortSignal;
}

export interface RecallResult {
  id?: string;
  text: string;
  type?: string | null;
  mentioned_at?: string | null;
  [key: string]: unknown;
}

export interface RecallResponse {
  results: RecallResult[];
  [key: string]: unknown;
}

export interface ReflectResponse {
  text?: string;
  [key: string]: unknown;
}

export interface RetainResponse {
  [key: string]: unknown;
}

export interface BankProfileResponse {
  [key: string]: unknown;
}

export interface MemoryItemInput {
  content: string;
  timestamp?: Date | string;
  context?: string;
  metadata?: Record<string, string>;
  documentId?: string;
  tags?: string[];
  updateMode?: UpdateMode;
}

export interface RetainOptions extends HindsightRequestOptions {
  timestamp?: Date | string;
  context?: string;
  metadata?: Record<string, string>;
  documentId?: string;
  async?: boolean;
  tags?: string[];
  updateMode?: UpdateMode;
}

export interface RetainBatchOptions extends HindsightRequestOptions {
  documentId?: string;
  documentTags?: string[];
  async?: boolean;
}

export interface RecallOptions extends HindsightRequestOptions {
  types?: string[];
  maxTokens?: number;
  budget?: Budget;
  tags?: string[];
  tagsMatch?: TagsMatch;
}

export interface ReflectOptions extends HindsightRequestOptions {
  context?: string;
  budget?: Budget;
  tags?: string[];
  tagsMatch?: TagsMatch;
}

export interface CreateBankOptions extends HindsightRequestOptions {
  reflectMission?: string;
  retainMission?: string;
}

export class HindsightError extends Error {
  statusCode?: number;
  details?: unknown;

  constructor(message: string, statusCode?: number, details?: unknown) {
    super(message);
    this.name = "HindsightError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

interface RequestOptions {
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  allow404?: boolean;
  signal?: AbortSignal;
}

export class HindsightApi {
  #baseUrl: string;
  #headers: Record<string, string>;

  constructor(options: HindsightApiOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.#headers = {
      "User-Agent": options.userAgent ?? USER_AGENT,
      "Content-Type": "application/json",
    };
    if (options.apiKey) {
      this.#headers.Authorization = `Bearer ${options.apiKey}`;
    }
  }

  async retain(bankId: string, content: string, options?: RetainOptions): Promise<RetainResponse> {
    const item = buildMemoryItem({
      content,
      timestamp: options?.timestamp,
      context: options?.context,
      metadata: options?.metadata,
      documentId: options?.documentId,
      tags: options?.tags,
      updateMode: options?.updateMode,
    });

    return this.#request<RetainResponse>(
      "POST",
      `/v1/default/banks/${encodeURIComponent(bankId)}/memories`,
      "retain",
      {
        body: { items: [item], async: options?.async },
        signal: options?.signal,
      },
    );
  }

  async retainBatch(
    bankId: string,
    items: MemoryItemInput[],
    options?: RetainBatchOptions,
  ): Promise<RetainResponse> {
    const processed = items.map((item) => {
      const built = buildMemoryItem(item);
      if (built.document_id === undefined && options?.documentId !== undefined) {
        built.document_id = options.documentId;
      }
      return built;
    });

    return this.#request<RetainResponse>(
      "POST",
      `/v1/default/banks/${encodeURIComponent(bankId)}/memories`,
      "retainBatch",
      {
        body: {
          items: processed,
          document_tags: options?.documentTags,
          async: options?.async,
        },
        signal: options?.signal,
      },
    );
  }

  async recall(bankId: string, query: string, options?: RecallOptions): Promise<RecallResponse> {
    return this.#request<RecallResponse>(
      "POST",
      `/v1/default/banks/${encodeURIComponent(bankId)}/memories/recall`,
      "recall",
      {
        body: {
          query,
          types: options?.types,
          max_tokens: options?.maxTokens,
          budget: options?.budget ?? "mid",
          tags: options?.tags,
          tags_match: options?.tagsMatch,
        },
        signal: options?.signal,
      },
    );
  }

  async reflect(bankId: string, query: string, options?: ReflectOptions): Promise<ReflectResponse> {
    return this.#request<ReflectResponse>(
      "POST",
      `/v1/default/banks/${encodeURIComponent(bankId)}/reflect`,
      "reflect",
      {
        body: {
          query,
          context: options?.context,
          budget: options?.budget ?? "low",
          tags: options?.tags,
          tags_match: options?.tagsMatch,
        },
        signal: options?.signal,
      },
    );
  }

  async createBank(bankId: string, options: CreateBankOptions = {}): Promise<BankProfileResponse> {
    return this.#request<BankProfileResponse>(
      "PUT",
      `/v1/default/banks/${encodeURIComponent(bankId)}`,
      "createBank",
      {
        body: {
          reflect_mission: options.reflectMission,
          retain_mission: options.retainMission,
        },
        signal: options.signal,
      },
    );
  }

  async #request<T>(method: string, path: string, operation: string, opts?: RequestOptions): Promise<T> {
    let url = `${this.#baseUrl}${path}`;
    if (opts?.query) {
      const qs = buildQueryString(opts.query);
      if (qs) url += `?${qs}`;
    }

    const init: RequestInit = {
      method,
      headers: this.#headers,
      signal: withTimeoutSignal(HINDSIGHT_REQUEST_TIMEOUT_MS, opts?.signal),
    };
    if (opts?.body !== undefined) {
      init.body = JSON.stringify(pruneUndefined(opts.body));
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      const message = isTimeoutError(err)
        ? `${operation} request timed out after 30s`
        : `${operation} request failed: ${err instanceof Error ? err.message : String(err)}`;
      throw new HindsightError(message, undefined, err);
    }

    if (opts?.allow404 && response.status === 404) {
      return null as T;
    }

    const text = await response.text();
    const parsed = text ? safeJsonParse(text) : null;

    if (!response.ok) {
      const details =
        (parsed && typeof parsed === "object"
          ? ((parsed as { detail?: unknown; message?: unknown }).detail ??
            (parsed as { message?: unknown }).message)
          : undefined) ??
        parsed ??
        text;
      throw new HindsightError(
        `${operation} failed: ${typeof details === "string" ? details : JSON.stringify(details)}`,
        response.status,
        details,
      );
    }

    return (parsed ?? {}) as T;
  }
}

interface BuiltMemoryItem {
  content: string;
  timestamp?: string;
  context?: string;
  metadata?: Record<string, string>;
  document_id?: string;
  tags?: string[];
  update_mode?: UpdateMode;
}

function buildMemoryItem(item: MemoryItemInput): BuiltMemoryItem {
  const out: BuiltMemoryItem = { content: item.content };
  if (item.timestamp !== undefined) {
    out.timestamp =
      item.timestamp instanceof Date ? formatDateWithLocalOffset(item.timestamp) : item.timestamp;
  }
  if (item.context !== undefined) out.context = item.context;
  if (item.metadata !== undefined) out.metadata = item.metadata;
  if (item.documentId !== undefined) out.document_id = item.documentId;
  if (item.tags !== undefined) out.tags = item.tags;
  if (item.updateMode !== undefined) out.update_mode = item.updateMode;
  return out;
}

function formatDateWithLocalOffset(date: Date): string {
  const offsetMinutes = date.getTimezoneOffset();
  const offsetSign = offsetMinutes <= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteOffset / 60);
  const offsetRemainderMinutes = absoluteOffset % 60;
  const milliseconds = date.getMilliseconds();
  const millisecondsPart = milliseconds === 0 ? "" : `.${pad3(milliseconds)}`;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(
    date.getHours(),
  )}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}${millisecondsPart}${offsetSign}${pad2(
    offsetHours,
  )}:${pad2(offsetRemainderMinutes)}`;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function pad3(value: number): string {
  if (value < 10) return `00${value}`;
  if (value < 100) return `0${value}`;
  return String(value);
}

function buildQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue;
        params.append(key, String(item));
      }
    } else {
      params.set(key, String(value));
    }
  }
  return params.toString();
}

function pruneUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function createHindsightClient(
  config: HindsightConfig & { hindsightApiUrl: string },
): HindsightApi {
  return new HindsightApi({
    baseUrl: config.hindsightApiUrl,
    apiKey: config.hindsightApiToken ?? undefined,
    userAgent: USER_AGENT,
  });
}
