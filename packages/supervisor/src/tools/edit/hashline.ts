/**
 * Hashline: content-hash based file editing support.
 *
 * 来自 oh-my-pi (omp) 的 hashline 设计，参考:
 * - omp packages/hashline/src/format.ts     -- hash 计算（xxHash32 → 4-hex tag）
 * - omp packages/hashline/src/snapshots.ts  -- SnapshotStore（按路径缓存多版本）
 * - omp packages/hashline/src/normalize.ts  -- 文件归一化（LF, no BOM, trim trailing）
 *
 * 核心思想: read 时记录文件内容的 4-hex 指纹（hash tag），edit 时验证 hash，
 * 用 line numbers + hash 替代 full-text oldText，省 token 且自动检测内容变化。
 *
 * 相比 omp 的完整实现，这里做了简化:
 * - 用 xxhash-wasm 替代 omp 的 Bun.hash.xxHash32
 * - 不做 3-way merge recovery（hash mismatch 直接拒绝 + 提示重新 read）
 * - 不做 BLK 块级解析（tree-sitter 已有 ast_grep 工具覆盖）
 * - 不做 Lark 文法/streaming/preview（supervisor 是 HTTP server 架构）
 */

import xxhashWasm from "xxhash-wasm";

// Lazy xxhash wasm instance (avoids top-level await in CJS)
let _xxhash: ReturnType<typeof xxhashWasm> | null = null;
async function getXxhash() {
	if (!_xxhash) _xxhash = xxhashWasm();
	return _xxhash;
}

/** Number of hex characters in the content hash tag. 4 hex = 16-bit. */
export const HL_FILE_HASH_LENGTH = 4;

/**
 * Normalize text before hashing: trim trailing whitespace from every line,
 * convert to LF, strip BOM so CRLF vs LF and trailing spaces don't
 * invalidate tags (来自 omp format.ts normalizeFileHashText).
 */
export function normalizeHashText(text: string): string {
	const noBom = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
	return noBom.replace(/\r\n/g, "\n").replace(/[ \t]+(?=\n|$)/g, "");
}

/**
 * Compute the 4-hex content hash tag for file text.
 * 来自 omp format.ts computeFileHash() — xxHash32, 16-bit, uppercase hex.
 */
export async function computeFileHash(text: string): Promise<string> {
	const normalized = normalizeHashText(text);
	const xxh = await getXxhash();
	const h64 = xxh.h64ToString(normalized);
	// Use the first 4 hex chars (16 bits) to match omp's HL_FILE_HASH_LENGTH
	return h64.slice(0, HL_FILE_HASH_LENGTH).toUpperCase();
}

// ---------------------------------------------------------------------------
// SnapshotStore  --  来自 omp snapshots.ts
// 缓存文件内容和对应的 hash tag，用于 stale-anchor 检测
// ---------------------------------------------------------------------------

const snapshotStore = new Map<string, Array<{ hash: string; text: string }>>();
const MAX_VERSIONS_PER_PATH = 3;

/**
 * Record a file's content and return its hash tag.
 * 来自 omp snapshots.ts SnapshotStore.record()
 */
export async function recordSnapshot(path: string, text: string): Promise<string> {
	const hash = await computeFileHash(text);
	const normalized = normalizeHashText(text);
	const existing = snapshotStore.get(path);
	if (existing) {
		// 如果内容相同，只刷新位置
		const idx = existing.findIndex((v) => v.hash === hash && v.text === normalized);
		if (idx >= 0) {
			const entry = existing[idx]!;
			existing.splice(idx, 1);
			existing.unshift(entry);
			return hash;
		}
		existing.unshift({ hash, text: normalized });
		if (existing.length > MAX_VERSIONS_PER_PATH) existing.pop();
	} else {
		snapshotStore.set(path, [{ hash, text: normalized }]);
	}
	return hash;
}

/**
 * Find a cached snapshot by path and hash tag.
 * 来自 omp snapshots.ts SnapshotStore.byHashExact()
 */
export function getSnapshotByHash(path: string, hash: string): string | null {
	const versions = snapshotStore.get(path);
	if (!versions) return null;
	const exact = versions.filter((v) => v.hash === hash);
	if (exact.length !== 1) return null; // ambiguous or not found
	return exact[0]!.text;
}

/**
 * Check if a file's content matches a cached hash tag for the path.
 * 来自 omp snapshots.ts SnapshotStore.byContent()
 */
export function checkSnapshotMatch(path: string, hash: string, text: string): boolean {
	const versions = snapshotStore.get(path);
	if (!versions) return false;
	const normalized = normalizeHashText(text);
	return versions.some((v) => v.hash === hash && v.text === normalized);
}

/**
 * Clear all cached snapshots.
 */
export function clearSnapshots(): void {
	snapshotStore.clear();
}

// ---------------------------------------------------------------------------
// Hashline Operation Types
// ---------------------------------------------------------------------------

export type HashlineOp =
	| { op: "swap"; startLine: number; endLine: number; newText: string }
	| { op: "del"; line?: number; startLine?: number; endLine?: number }
	| { op: "ins"; position: "before" | "after" | "head" | "tail"; line?: number; newText: string };

export interface HashlineParams {
	/** 4-hex content hash tag (from read output) */
	hash: string;
	/** Hashline operations */
	ops: HashlineOp[];
}

/**
 * Apply hashline operations to file content.
 * Returns the modified text.
 *
 * 来自 omp apply.ts — 简化为按行号逆序应用操作
 */
export function applyHashlineOps(content: string, ops: HashlineOp[]): { text: string; warnings: string[] } {
	const lines = content.split("\n");
	const warnings: string[] = [];

	// Sort operations by line in reverse order so edits don't shift offsets
	const sorted = [...ops].sort((a, b) => {
		const aLine = "line" in a && a.line ? a.line : "startLine" in a && a.startLine ? a.startLine : 0;
		const bLine = "line" in b && b.line ? b.line : "startLine" in b && b.startLine ? b.startLine : 0;
		return bLine - aLine;
	});

	for (const op of sorted) {
		switch (op.op) {
			case "swap": {
				const start = op.startLine - 1;
				const end = op.endLine - 1;
				if (start < 0 || end >= lines.length) {
					warnings.push(`swap ${op.startLine}.=${op.endLine}: range out of bounds (file has ${lines.length} lines)`);
					continue;
				}
				const newLines = op.newText.split("\n");
				lines.splice(start, end - start + 1, ...newLines);
				break;
			}
			case "del": {
				const delStart = (op.line ?? op.startLine ?? 1) - 1;
				const delEnd = (op.endLine ?? op.line ?? op.startLine ?? 1) - 1;
				if (delStart < 0 || delEnd >= lines.length) {
					warnings.push(`del ${delStart + 1}.=${delEnd + 1}: range out of bounds (file has ${lines.length} lines)`);
					continue;
				}
				lines.splice(delStart, delEnd - delStart + 1);
				break;
			}
			case "ins": {
				switch (op.position) {
					case "head": {
						const newLines = op.newText.split("\n");
						lines.unshift(...newLines);
						break;
					}
					case "tail": {
						const newLines = op.newText.split("\n");
						lines.push(...newLines);
						break;
					}
					case "before": {
						const insLine = (op.line ?? 1) - 1;
						if (insLine < 0 || insLine > lines.length) {
							warnings.push(`ins.pre ${op.line}: position out of bounds`);
							continue;
						}
						const newLines = op.newText.split("\n");
						lines.splice(insLine, 0, ...newLines);
						break;
					}
					case "after": {
						const insLine = (op.line ?? 1); // 1-based
						if (insLine < 1 || insLine > lines.length) {
							warnings.push(`ins.post ${insLine}: position out of bounds`);
							continue;
						}
						const newLines = op.newText.split("\n");
						lines.splice(insLine, 0, ...newLines);
						break;
					}
				}
				break;
			}
		}
	}

	return { text: lines.join("\n"), warnings };
}

/**
 * Format a hashline section header for display.
 * 来自 omp format.ts formatHashlineHeader()
 */
export function formatHashlineHeader(filePath: string, fileHash: string): string {
	return `[${filePath}#${fileHash}]`;
}
