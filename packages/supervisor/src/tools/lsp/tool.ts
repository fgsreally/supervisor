import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import ts from "typescript";

type LspAction = "symbols" | "definition" | "references" | "rename" | "diagnostics";

interface LspParams {
	action: LspAction;
	path: string;
	line?: number;
	character?: number;
	symbol?: string;
	newName?: string;
}

function isTsJsFile(path: string): boolean {
	const ext = extname(path).toLowerCase();
	return ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx" || ext === ".mts" || ext === ".cts";
}

function isPythonFile(path: string): boolean {
	return extname(path).toLowerCase() === ".py";
}

function isGoFile(path: string): boolean {
	return extname(path).toLowerCase() === ".go";
}

function isSupportedFile(path: string): boolean {
	return isTsJsFile(path) || isPythonFile(path) || isGoFile(path);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── TypeScript LanguageService ─────────────────────────────────────────────

function createLanguageService(filePath: string, cwd: string): ts.LanguageService {
	const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, "tsconfig.json");
	let rootNames: string[] = [filePath];
	let options: ts.CompilerOptions = {
		allowJs: true,
		checkJs: false,
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.Node16,
		moduleResolution: ts.ModuleResolutionKind.Node16,
	};
	let currentDirectory = cwd;

	if (configPath) {
		const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
		if (!configFile.error) {
			const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(configPath));
			rootNames = [...parsed.fileNames];
			if (!rootNames.includes(filePath)) {
				rootNames.push(filePath);
			}
			options = parsed.options;
			currentDirectory =
				typeof parsed.options.configFilePath === "string"
					? dirname(parsed.options.configFilePath)
					: currentDirectory;
		}
	}

	const host: ts.LanguageServiceHost = {
		getScriptFileNames: () => rootNames,
		getScriptVersion: () => "0",
		getScriptSnapshot: (name) => {
			if (!ts.sys.fileExists(name)) return undefined;
			const content = ts.sys.readFile(name);
			return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
		},
		getCurrentDirectory: () => currentDirectory,
		getCompilationSettings: () => options,
		getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
		fileExists: ts.sys.fileExists,
		readFile: ts.sys.readFile,
		readDirectory: ts.sys.readDirectory,
	};

	return ts.createLanguageService(host, ts.createDocumentRegistry());
}

function resolvePosition(sourceFile: ts.SourceFile, params: LspParams): number {
	if (
		typeof params.line === "number" &&
		typeof params.character === "number" &&
		params.line >= 1 &&
		params.character >= 1
	) {
		return sourceFile.getPositionOfLineAndCharacter(params.line - 1, params.character - 1);
	}

	if (typeof params.symbol === "string" && params.symbol.trim().length > 0) {
		const pattern = new RegExp(`\\b${escapeRegExp(params.symbol.trim())}\\b`);
		const match = pattern.exec(sourceFile.text);
		if (match?.index !== undefined) return match.index;
	}

	throw new Error("lsp requires line+character or symbol for this action");
}

function previewLine(fileName: string, line: number): string {
	try {
		const content = readFileSync(fileName, "utf-8");
		return content.split(/\r?\n/)[line - 1] ?? "";
	} catch {
		return "";
	}
}

interface FileTextChange {
	fileName: string;
	start: number;
	length: number;
	newText: string;
}

function applyFileTextChanges(changes: FileTextChange[]): string[] {
	const byFile = new Map<string, FileTextChange[]>();
	for (const change of changes) {
		const list = byFile.get(change.fileName) ?? [];
		list.push(change);
		byFile.set(change.fileName, list);
	}

	const modified: string[] = [];
	for (const [fileName, fileChanges] of byFile) {
		const sorted = [...fileChanges].sort((a, b) => b.start - a.start);
		let content = readFileSync(fileName, "utf-8");
		for (const change of sorted) {
			content = content.slice(0, change.start) + change.newText + content.slice(change.start + change.length);
		}
		writeFileSync(fileName, content, "utf-8");
		modified.push(fileName);
	}
	return modified;
}

function formatDiagnostic(
	fileName: string,
	diagnostic: ts.Diagnostic,
	cwd: string,
): {
	path: string;
	line: number;
	character: number;
	message: string;
	category: string;
} {
	let line = 1;
	let character = 1;
	if (diagnostic.file && typeof diagnostic.start === "number") {
		const pos = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
		line = pos.line + 1;
		character = pos.character + 1;
	}
	const relPath = fileName.startsWith(cwd) ? relative(cwd, fileName) : fileName;
	return {
		path: relPath.replace(/\\/g, "/"),
		line,
		character,
		message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
		category: ts.DiagnosticCategory[diagnostic.category] ?? "Unknown",
	};
}

// ── Python handlers ────────────────────────────────────────────────────────

/**
 * Parse Python file symbols using regex.
 * Matches: `def name(`, `class Name(`, top-level `NAME = value`, `async def name(`
 */
function parsePythonSymbols(filePath: string): Array<{ name: string; kind: string; line: number; character: number }> {
	const content = readFileSync(filePath, "utf-8");
	const lines = content.split(/\r?\n/);
	const results: Array<{ name: string; kind: string; line: number; character: number }> = [];

	// Track indentation to detect top-level assignments
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();

		// Skip comments and empty lines
		if (!trimmed || trimmed.startsWith("#")) continue;

		// def name(...)
		const funcMatch = trimmed.match(/^(async\s+)?def\s+([a-zA-Z_]\w*)\s*\(/);
		if (funcMatch) {
			const nameIndex = line.indexOf(funcMatch[2]);
			results.push({ name: funcMatch[2], kind: "function", line: i + 1, character: nameIndex + 1 });
			continue;
		}

		// class Name(...):
		const classMatch = trimmed.match(/^class\s+([a-zA-Z_]\w*)\s*(\(|:)/);
		if (classMatch) {
			const nameIndex = line.indexOf(classMatch[1]);
			results.push({ name: classMatch[1], kind: "class", line: i + 1, character: nameIndex + 1 });
			continue;
		}

		// Top-level global variable assignments: NAME = value (no leading whitespace)
		const varMatch = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=/);
		if (varMatch && line[0] !== " " && line[0] !== "\t") {
			const nameIndex = line.indexOf(varMatch[1]);
			results.push({ name: varMatch[1], kind: "variable", line: i + 1, character: nameIndex + 1 });
			continue;
		}
	}

	return results;
}

function handlePythonSymbols(filePath: string, cwd: string, params: LspParams) {
	const symbols = parsePythonSymbols(filePath);
	const relPath = filePath.startsWith(cwd) ? relative(cwd, filePath) : filePath;
	const filtered =
		typeof params.symbol === "string" && params.symbol.trim().length > 0
			? symbols.filter((s) => s.name.toLowerCase().includes(params.symbol!.trim().toLowerCase()))
			: symbols;
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify(
					{
						action: "symbols",
						path: relPath.replace(/\\/g, "/"),
						count: filtered.length,
						symbols: filtered.slice(0, 200),
					},
					null,
					2,
				),
			},
		],
		details: { action: "symbols", count: filtered.length },
	};
}

function handlePythonDefinition(filePath: string, cwd: string, params: LspParams) {
	const relPath = filePath.startsWith(cwd) ? relative(cwd, filePath) : filePath;
	const symbolName = params.symbol?.trim();
	if (!symbolName) {
		return {
			content: [{ type: "text", text: JSON.stringify({ action: "definition", path: relPath, count: 0, locations: [] }, null, 2) }],
			details: { action: "definition", count: 0 },
		};
	}

	const locations = grepDefinition(symbolName, cwd, filePath);
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify(
					{
						action: "definition",
						path: relPath.replace(/\\/g, "/"),
						count: locations.length,
						locations: locations.slice(0, 50),
					},
					null,
					2,
				),
			},
		],
		details: { action: "definition", count: locations.length },
	};
}

function handlePythonReferences(filePath: string, cwd: string, params: LspParams) {
	const relPath = filePath.startsWith(cwd) ? relative(cwd, filePath) : filePath;
	const symbolName = params.symbol?.trim();
	if (!symbolName) {
		return {
			content: [{ type: "text", text: JSON.stringify({ action: "references", path: relPath, count: 0, locations: [] }, null, 2) }],
			details: { action: "references", count: 0 },
		};
	}

	const locations = grepReferences(symbolName, cwd, filePath);
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify(
					{
						action: "references",
						path: relPath.replace(/\\/g, "/"),
						count: locations.length,
						locations: locations.slice(0, 500),
					},
					null,
					2,
				),
			},
		],
		details: { action: "references", count: locations.length },
	};
}

function handlePythonDiagnostics(filePath: string, cwd: string) {
	const relPath = filePath.startsWith(cwd) ? relative(cwd, filePath) : filePath;
	const diagnostics: Array<{ path: string; line: number; character: number; message: string; category: string }> = [];

	try {
		const stdout = execSync(`python3 -m py_compile "${filePath}" 2>&1 || python -m py_compile "${filePath}" 2>&1`, {
			timeout: 10000,
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		// No output means success — but we still check exit code
	} catch (error: any) {
		// Parse python error output for line numbers
		const stderr = error.stderr ?? error.stdout ?? error.message ?? "";
		if (stderr) {
			// Python error format: File "path", line N
			for (const line of stderr.split("\n")) {
				const fileMatch = line.match(/File "[^"]+", line (\d+)/);
				if (fileMatch) {
					const errLine = parseInt(fileMatch[1], 10);
					// The next line(s) contain the error message
					continue;
				}
				const errMatch = line.match(/^(SyntaxError|IndentationError|NameError|TypeError|ValueError|ImportError|ModuleNotFoundError|AttributeError|TabError):\s*(.+)/);
				if (errMatch) {
					diagnostics.push({
						path: relPath.replace(/\\/g, "/"),
						line: diagnostics.length > 0 ? diagnostics[diagnostics.length - 1].line : 1,
						character: 1,
						message: `${errMatch[1]}: ${errMatch[2]}`,
						category: "Error",
					});
				}
			}
		}

		// If no structured diagnostics were found, try basic syntax check as fallback
		if (diagnostics.length === 0) {
			try {
				// Simple syntax check using python3 -c with ast.parse
				execSync(`python3 -c "import ast; ast.parse(open('${filePath}').read())" 2>&1`, {
					timeout: 10000,
					encoding: "utf-8",
				});
			} catch (innerError: any) {
				const innerStderr = innerError.stderr ?? innerError.message ?? "";
				for (const line of innerStderr.split("\n")) {
					const match = line.match(/line (\d+)/);
					if (match) {
						const errLine = parseInt(match[1], 10);
						const msgEnd = line.includes("SyntaxError") ? line.split("SyntaxError")[1]?.trim() ?? line : line;
						diagnostics.push({
							path: relPath.replace(/\\/g, "/"),
							line: errLine,
							character: 1,
							message: msgEnd,
							category: "Error",
						});
					}
				}
				if (diagnostics.length === 0 && innerStderr.trim()) {
					diagnostics.push({
						path: relPath.replace(/\\/g, "/"),
						line: 1,
						character: 1,
						message: innerStderr.trim().split("\n").slice(0, 3).join("; "),
						category: "Error",
					});
				}
			}
		}
	}

	return {
		content: [
			{
				type: "text",
				text: JSON.stringify(
					{
						action: "diagnostics",
						path: relPath.replace(/\\/g, "/"),
						count: diagnostics.length,
						diagnostics: diagnostics.slice(0, 200),
					},
					null,
					2,
				),
			},
		],
		details: { action: "diagnostics", count: diagnostics.length },
	};
}

function handlePythonRename() {
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify(
					{
						action: "rename",
						error: "Rename is not supported for Python files. Use search & replace instead.",
					},
					null,
					2,
				),
			},
		],
		details: { action: "rename", error: "Rename not supported for Python" },
	};
}

// ── Go handlers ────────────────────────────────────────────────────────────

/**
 * Parse Go file symbols using regex.
 * Matches: `func Name`, `type Name struct`, `type Name interface`, `type Name type`,
 * `func (r *Receiver) Name(`, `const Name =`, `var Name =`
 */
function parseGoSymbols(filePath: string): Array<{ name: string; kind: string; line: number; character: number }> {
	const content = readFileSync(filePath, "utf-8");
	const lines = content.split(/\r?\n/);
	const results: Array<{ name: string; kind: string; line: number; character: number }> = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();

		if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*")) continue;

		// func Name(...) or func (r Receiver) Name(...)
		let funcMatch = trimmed.match(/^func\s+([A-Za-z_]\w*)\s*\(/);
		if (!funcMatch) {
			// method: func (r *Receiver) MethodName(...
			funcMatch = trimmed.match(/^func\s*\([^)]+\)\s+([A-Za-z_]\w*)\s*\(/);
		}
		if (funcMatch) {
			const nameIndex = line.indexOf(funcMatch[1]);
			results.push({ name: funcMatch[1], kind: "function", line: i + 1, character: nameIndex + 1 });
			continue;
		}

		// type Name struct { ... } or type Name interface { ... }
		const typeMatch = trimmed.match(/^type\s+([A-Za-z_]\w*)\s+(struct|interface|=)/);
		if (typeMatch) {
			const nameIndex = line.indexOf(typeMatch[1]);
			results.push({ name: typeMatch[1], kind: typeMatch[2] === "struct" ? "struct" : typeMatch[2] === "interface" ? "interface" : "type", line: i + 1, character: nameIndex + 1 });
			continue;
		}

		// type Name TypeName (type alias)
		const typeAliasMatch = trimmed.match(/^type\s+([A-Za-z_]\w*)\s+/);
		if (typeAliasMatch) {
			const nameIndex = line.indexOf(typeAliasMatch[1]);
			results.push({ name: typeAliasMatch[1], kind: "type", line: i + 1, character: nameIndex + 1 });
			continue;
		}

		// const Name = ...
		const constMatch = trimmed.match(/^const\s+([A-Za-z_]\w*)\s*(=|\s)/);
		if (constMatch && trimmed.startsWith("const")) {
			const nameIndex = line.indexOf(constMatch[1]);
			results.push({ name: constMatch[1], kind: "constant", line: i + 1, character: nameIndex + 1 });
			continue;
		}

		// var Name = ...
		const varMatch = trimmed.match(/^var\s+([A-Za-z_]\w*)\s*(=|\s)/);
		if (varMatch && trimmed.startsWith("var")) {
			const nameIndex = line.indexOf(varMatch[1]);
			results.push({ name: varMatch[1], kind: "variable", line: i + 1, character: nameIndex + 1 });
			continue;
		}
	}

	return results;
}

function handleGoSymbols(filePath: string, cwd: string, params: LspParams) {
	const symbols = parseGoSymbols(filePath);
	const relPath = filePath.startsWith(cwd) ? relative(cwd, filePath) : filePath;
	const filtered =
		typeof params.symbol === "string" && params.symbol.trim().length > 0
			? symbols.filter((s) => s.name.toLowerCase().includes(params.symbol!.trim().toLowerCase()))
			: symbols;
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify(
					{
						action: "symbols",
						path: relPath.replace(/\\/g, "/"),
						count: filtered.length,
						symbols: filtered.slice(0, 200),
					},
					null,
					2,
				),
			},
		],
		details: { action: "symbols", count: filtered.length },
	};
}

function handleGoDefinition(filePath: string, cwd: string, params: LspParams) {
	const relPath = filePath.startsWith(cwd) ? relative(cwd, filePath) : filePath;
	const symbolName = params.symbol?.trim();
	if (!symbolName) {
		return {
			content: [{ type: "text", text: JSON.stringify({ action: "definition", path: relPath, count: 0, locations: [] }, null, 2) }],
			details: { action: "definition", count: 0 },
		};
	}

	const locations = grepDefinition(symbolName, cwd, filePath);
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify(
					{
						action: "definition",
						path: relPath.replace(/\\/g, "/"),
						count: locations.length,
						locations: locations.slice(0, 50),
					},
					null,
					2,
				),
			},
		],
		details: { action: "definition", count: locations.length },
	};
}

function handleGoReferences(filePath: string, cwd: string, params: LspParams) {
	const relPath = filePath.startsWith(cwd) ? relative(cwd, filePath) : filePath;
	const symbolName = params.symbol?.trim();
	if (!symbolName) {
		return {
			content: [{ type: "text", text: JSON.stringify({ action: "references", path: relPath, count: 0, locations: [] }, null, 2) }],
			details: { action: "references", count: 0 },
		};
	}

	const locations = grepReferences(symbolName, cwd, filePath);
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify(
					{
						action: "references",
						path: relPath.replace(/\\/g, "/"),
						count: locations.length,
						locations: locations.slice(0, 500),
					},
					null,
					2,
				),
			},
		],
		details: { action: "references", count: locations.length },
	};
}

function handleGoDiagnostics(filePath: string, cwd: string) {
	const relPath = filePath.startsWith(cwd) ? relative(cwd, filePath) : filePath;
	const diagnostics: Array<{ path: string; line: number; character: number; message: string; category: string }> = [];

	// Try go vet on the file's package
	const fileDir = dirname(filePath);
	try {
		const stdout = execSync(`cd "${fileDir}" && go vet 2>&1 || go build -o /dev/null 2>&1`, {
			timeout: 30000,
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		// Parse output if any
		if (stdout.trim()) {
			for (const line of stdout.split("\n")) {
				if (!line.trim()) continue;
				// Go format: file.go:line:col: message  or  file.go:line: message
				const match = line.match(/^([^:]+):(\d+)(?::(\d+))?:\s*(.+)/);
				if (match) {
					const goFile = match[1];
					const goLine = parseInt(match[2], 10);
					const goCol = match[3] ? parseInt(match[3], 10) : 1;
					const message = match[4].trim();
					// Only report diagnostics for the file we're checking
					if (resolve(fileDir, goFile) === filePath || goFile === relPath) {
						diagnostics.push({
							path: relPath.replace(/\\/g, "/"),
							line: goLine,
							character: goCol,
							message,
							category: message.startsWith("\t") ? "Suggestion" : "Error",
						});
					}
				}
			}
		}
	} catch (error: any) {
		// `go vet` exits non-zero when there are issues; parse its stderr/stdout
		const output = error.stderr ?? error.stdout ?? error.message ?? "";
		if (output) {
			for (const line of output.split("\n")) {
				if (!line.trim()) continue;
				const match = line.match(/^([^:]+):(\d+)(?::(\d+))?:\s*(.+)/);
				if (match) {
					const goFile = match[1];
					const goLine = parseInt(match[2], 10);
					const goCol = match[3] ? parseInt(match[3], 10) : 1;
					const message = match[4].trim();
					if (resolve(fileDir, goFile) === filePath || goFile === relPath) {
						diagnostics.push({
							path: relPath.replace(/\\/g, "/"),
							line: goLine,
							character: goCol,
							message,
							category: "Error",
						});
					}
				}
			}
		}

		// If go vet is not available or returns no structured output, try basic grep-based checks
		if (diagnostics.length === 0) {
			try {
				const content = readFileSync(filePath, "utf-8");
				// Check for some basic Go issues via regex
				const goLines = content.split(/\r?\n/);
				for (let i = 0; i < goLines.length; i++) {
					const line = goLines[i];
					const trimmed = line.trim();
					if (trimmed.includes("fmt.") && !content.includes('"fmt"')) {
						// Could detect missing imports, but import analysis is complex
					}
				}
			} catch {
				// ignore file read errors
			}
		}
	}

	return {
		content: [
			{
				type: "text",
				text: JSON.stringify(
					{
						action: "diagnostics",
						path: relPath.replace(/\\/g, "/"),
						count: diagnostics.length,
						diagnostics: diagnostics.slice(0, 200),
					},
					null,
					2,
				),
			},
		],
		details: { action: "diagnostics", count: diagnostics.length },
	};
}

function handleGoRename() {
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify(
					{
						action: "rename",
						error: "Rename is not supported for Go files. Use search & replace instead.",
					},
					null,
					2,
				),
			},
		],
		details: { action: "rename", error: "Rename not supported for Go" },
	};
}

// ── Shared grep helpers ────────────────────────────────────────────────────

interface GrepLocation {
	path: string;
	line: number;
	character: number;
	preview: string;
}

/**
 * Grep for symbol definitions in .py and .go files within the project.
 * Uses word-boundary grep with context for definition patterns.
 */
function grepDefinition(symbol: string, cwd: string, currentFilePath: string): GrepLocation[] {
	const results: GrepLocation[] = [];

	// Patterns that look like definitions for the given symbol
	// We search across .py and .go files
	try {
		const escaped = escapeRegExp(symbol);
		// Definition patterns: preceded by def/class/func/type/var/const/etc.
		const pattern = `\\b(def|class|func|type|var|const)\\s+${escaped}\\b`;
		const stdout = execSync(
			`grep -rn --include="*.py" --include="*.go" -E "${pattern}" "${cwd}" 2>/dev/null | head -100`,
			{
				timeout: 10000,
				encoding: "utf-8",
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		for (const line of stdout.split("\n")) {
			if (!line.trim()) continue;
			const parts = line.split(":", 3);
			if (parts.length >= 3) {
				const grepFile = parts[0];
				const grepLine = parseInt(parts[1], 10);
				const grepContent = parts.slice(2).join(":");
				if (grepContent) {
					results.push({
						path: grepFile.startsWith(cwd) ? relative(cwd, grepFile).replace(/\\/g, "/") : grepFile,
						line: grepLine,
						character: grepContent.indexOf(symbol) + 1,
						preview: grepContent.trim(),
					});
				}
			}
		}
	} catch {
		// grep returns exit code 1 when no matches found
	}

	// If no definition found via keyword patterns, fall back to any line containing the symbol
	// with word boundaries (for e.g. Python `X = value` top-level assignments)
	if (results.length === 0) {
		try {
			const escaped = escapeRegExp(symbol);
			const stdout = execSync(
				`grep -rn --include="*.py" --include="*.go" -E "\\b${escaped}\\b" "${cwd}" 2>/dev/null | head -100`,
				{
					timeout: 10000,
					encoding: "utf-8",
					stdio: ["ignore", "pipe", "pipe"],
				},
			);
			for (const line of stdout.split("\n")) {
				if (!line.trim()) continue;
				const parts = line.split(":", 3);
				if (parts.length >= 3) {
					const grepFile = parts[0];
					const grepLine = parseInt(parts[1], 10);
					const grepContent = parts.slice(2).join(":");
					results.push({
						path: grepFile.startsWith(cwd) ? relative(cwd, grepFile).replace(/\\/g, "/") : grepFile,
						line: grepLine,
						character: grepContent.indexOf(symbol) + 1,
						preview: grepContent.trim(),
					});
				}
			}
		} catch {
			// no matches
		}
	}

	return results;
}

/**
 * Grep for all usages of a symbol in .py and .go files within the project.
 */
function grepReferences(symbol: string, cwd: string, currentFilePath: string): GrepLocation[] {
	const results: GrepLocation[] = [];
	try {
		const escaped = escapeRegExp(symbol);
		const stdout = execSync(
			`grep -rn --include="*.py" --include="*.go" -E "\\b${escaped}\\b" "${cwd}" 2>/dev/null | head -500`,
			{
				timeout: 10000,
				encoding: "utf-8",
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		for (const line of stdout.split("\n")) {
			if (!line.trim()) continue;
			const parts = line.split(":", 3);
			if (parts.length >= 3) {
				const grepFile = parts[0];
				const grepLine = parseInt(parts[1], 10);
				const grepContent = parts.slice(2).join(":");
				if (grepContent) {
					results.push({
						path: grepFile.startsWith(cwd) ? relative(cwd, grepFile).replace(/\\/g, "/") : grepFile,
						line: grepLine,
						character: grepContent.indexOf(symbol) + 1,
						preview: grepContent.trim(),
					});
				}
			}
		}
	} catch {
		// grep exit code 1 = no matches
	}

	return results;
}

// ── Dispatch ───────────────────────────────────────────────────────────────

/**
 * Determine which language handler to use based on the file extension.
 * Returns a handler object or null if unsupported.
 */
function getLanguageHandler(
	filePath: string,
	absolutePath: string,
	cwd: string,
	params: LspParams,
): { execute: () => Promise<any> } | null {
	if (isTsJsFile(absolutePath)) {
		return null; // handled by the main execute function below
	}

	if (isPythonFile(absolutePath)) {
		switch (params.action) {
			case "symbols":
				return { execute: async () => handlePythonSymbols(absolutePath, cwd, params) };
			case "definition":
				return { execute: async () => handlePythonDefinition(absolutePath, cwd, params) };
			case "references":
				return { execute: async () => handlePythonReferences(absolutePath, cwd, params) };
			case "diagnostics":
				return { execute: async () => handlePythonDiagnostics(absolutePath, cwd) };
			case "rename":
				return { execute: async () => handlePythonRename() };
		}
	}

	if (isGoFile(absolutePath)) {
		switch (params.action) {
			case "symbols":
				return { execute: async () => handleGoSymbols(absolutePath, cwd, params) };
			case "definition":
				return { execute: async () => handleGoDefinition(absolutePath, cwd, params) };
			case "references":
				return { execute: async () => handleGoReferences(absolutePath, cwd, params) };
			case "diagnostics":
				return { execute: async () => handleGoDiagnostics(absolutePath, cwd) };
			case "rename":
				return { execute: async () => handleGoRename() };
		}
	}

	return null;
}

export function createOverrideLspTool(cwd: string): AgentTool {
	return {
		name: "lsp",
		label: "lsp",
		description:
			"Language intelligence for TypeScript, JavaScript, Python, and Go. Actions: symbols (list symbols in file), definition (find symbol definition), references (find symbol usages), diagnostics (run static analysis), rename (TS/JS only). Use grep/read for text search; use lsp for symbol structure.",
		parameters: {
			type: "object",
			properties: {
				action: {
					type: "string",
					enum: ["symbols", "definition", "references", "rename", "diagnostics"],
				},
				path: { type: "string", description: "File path (relative to session cwd or absolute)." },
				line: { type: "number", description: "1-based line number." },
				character: { type: "number", description: "1-based character number." },
				symbol: { type: "string", description: "Optional symbol name fallback for position lookup." },
				newName: { type: "string", description: "Required for rename action." },
			},
			required: ["action", "path"],
		},
		async execute(_toolCallId, rawParams) {
			const params = rawParams as LspParams;
			if (!params || typeof params !== "object") {
				throw new Error("lsp requires params");
			}
			const validActions: LspAction[] = ["symbols", "definition", "references", "rename", "diagnostics"];
			if (!validActions.includes(params.action)) {
				throw new Error("lsp action must be one of symbols|definition|references|rename|diagnostics");
			}
			if (!params.path || typeof params.path !== "string") {
				throw new Error("lsp path is required");
			}

			const absolutePath = resolve(cwd, params.path);
			if (!isSupportedFile(absolutePath)) {
				throw new Error(`lsp currently supports TS/JS, Python, and Go files only (got: ${extname(absolutePath)})`);
			}

			if (!existsSync(absolutePath)) {
				throw new Error(`File not found: ${params.path}`);
			}

			// Check if a non-TS/JS handler should handle this
			const handler = getLanguageHandler(params.path, absolutePath, cwd, params);
			if (handler) {
				return handler.execute();
			}

			// ── TS/JS handler (unchanged) ──────────────────────────────────
			const service = createLanguageService(absolutePath, cwd);
			const program = service.getProgram();
			const sourceFile = program?.getSourceFile(absolutePath);
			if (!sourceFile) {
				throw new Error(`Could not load source file: ${params.path}`);
			}

			if (params.action === "diagnostics") {
				const syntactic = service.getSyntacticDiagnostics(absolutePath);
				const semantic = service.getSemanticDiagnostics(absolutePath);
				const items = [...syntactic, ...semantic].map((diag) => formatDiagnostic(absolutePath, diag, cwd));
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									action: "diagnostics",
									path: params.path,
									count: items.length,
									diagnostics: items.slice(0, 200),
								},
								null,
								2,
							),
						},
					],
					details: { action: "diagnostics", count: items.length },
				};
			}

			if (params.action === "symbols") {
				const tree = service.getNavigationTree(absolutePath);
				const rows: Array<{
					name: string;
					kind: string;
					line: number;
					character: number;
				}> = [];
				const stack = [...(tree.childItems ?? [])];
				while (stack.length > 0) {
					const item = stack.shift();
					if (!item) continue;
					const span = item.spans[0];
					if (span) {
						const pos = sourceFile.getLineAndCharacterOfPosition(span.start);
						rows.push({
							name: item.text,
							kind: item.kind,
							line: pos.line + 1,
							character: pos.character + 1,
						});
					}
					if (item.childItems?.length) {
						stack.push(...item.childItems);
					}
				}
				const filtered =
					typeof params.symbol === "string" && params.symbol.trim().length > 0
						? rows.filter((row) => row.name.toLowerCase().includes(params.symbol!.trim().toLowerCase()))
						: rows;
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									action: "symbols",
									path: params.path,
									count: filtered.length,
									symbols: filtered.slice(0, 200),
								},
								null,
								2,
							),
						},
					],
					details: { action: "symbols", count: filtered.length },
				};
			}

			if (params.action === "rename") {
				if (!params.newName || typeof params.newName !== "string" || !params.newName.trim()) {
					throw new Error("lsp rename requires newName");
				}
				const newName = params.newName.trim();
				const position = resolvePosition(sourceFile, params);
				const renameInfo = service.getRenameInfo(absolutePath, position, {
					allowRenameOfImportPath: false,
				});
				if (!renameInfo.canRename) {
					throw new Error(renameInfo.localizedErrorMessage ?? "Rename not available at this position");
				}
				const locations =
					service.findRenameLocations(absolutePath, position, false, false, {
						providePrefixAndSuffixTextForRename: false,
					}) ?? [];
				if (locations.length === 0) {
					throw new Error("No rename locations found");
				}

				const changes: FileTextChange[] = locations.map((loc) => ({
					fileName: loc.fileName,
					start: loc.textSpan.start,
					length: loc.textSpan.length,
					newText: newName,
				}));
				const modifiedFiles = applyFileTextChanges(changes);
				const relFiles = modifiedFiles.map((file) =>
					file.startsWith(cwd) ? relative(cwd, file).replace(/\\/g, "/") : file,
				);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									action: "rename",
									path: params.path,
									newName,
									locationsUpdated: locations.length,
									filesModified: relFiles,
								},
								null,
								2,
							),
						},
					],
					details: {
						action: "rename",
						newName,
						locationsUpdated: locations.length,
						filesModified: relFiles,
					},
				};
			}

			const position = resolvePosition(sourceFile, params);
			if (params.action === "definition") {
				const defs = service.getDefinitionAtPosition(absolutePath, position) ?? [];
				const results = defs.map((item) => {
					const file = program?.getSourceFile(item.fileName);
					const lc = file ? file.getLineAndCharacterOfPosition(item.textSpan.start) : { line: 0, character: 0 };
					const line = lc.line + 1;
					return {
						path: item.fileName,
						line,
						character: lc.character + 1,
						preview: previewLine(item.fileName, line).trim(),
					};
				});
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									action: "definition",
									path: params.path,
									count: results.length,
									locations: results,
								},
								null,
								2,
							),
						},
					],
					details: { action: "definition", count: results.length },
				};
			}

			const refs = service.getReferencesAtPosition(absolutePath, position) ?? [];
			const locations = refs.map((item) => {
				const file = program?.getSourceFile(item.fileName);
				const lc = file ? file.getLineAndCharacterOfPosition(item.textSpan.start) : { line: 0, character: 0 };
				const line = lc.line + 1;
				return {
					path: item.fileName,
					line,
					character: lc.character + 1,
					isDefinition: false,
					preview: previewLine(item.fileName, line).trim(),
				};
			});
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								action: "references",
								path: params.path,
								count: locations.length,
								locations: locations.slice(0, 500),
							},
							null,
							2,
						),
					},
				],
				details: { action: "references", count: locations.length },
			};
		},
	};
}
