import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SupervisorDb } from "../db/db.js";
import { listSvCommitsBetween, type SvCommitInfo } from "../utils/git.js";
import { getSupervisorHome } from "../utils/supervisor-home.js";
import {
  generateDailyWorkDigest,
  resolveFeatureModelAuth,
} from "../utils/utility-llm.js";

export interface DailyWorkProjectSection {
  projectId: number;
  projectName: string;
  cwd: string;
  commits: Array<{
    hash: string;
    shortHash: string;
    subject: string;
    author: string;
    timestamp: number;
  }>;
}

export interface DailyWorkRecord {
  dayKey: string;
  summary: string;
  sections: DailyWorkProjectSection[];
  generatedAt: string;
  usedModel: boolean;
}

interface DailyWorkIndex {
  lastCompletedDay?: string;
  days: string[];
}

function dailyWorkDir(): string {
  const dir = join(getSupervisorHome(), "daily-work");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function indexPath(): string {
  return join(dailyWorkDir(), "index.json");
}

function dayFilePath(dayKey: string): string {
  return join(dailyWorkDir(), `${dayKey}.json`);
}

function readIndex(): DailyWorkIndex {
  const path = indexPath();
  if (!existsSync(path)) return { days: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as DailyWorkIndex;
    return {
      lastCompletedDay: parsed.lastCompletedDay,
      days: Array.isArray(parsed.days) ? parsed.days.filter((d) => typeof d === "string") : [],
    };
  } catch {
    return { days: [] };
  }
}

function writeIndex(index: DailyWorkIndex): void {
  writeFileSync(indexPath(), `${JSON.stringify(index, null, 2)}\n`, "utf-8");
}

export function formatLocalDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localDayBounds(dayKey: string): { startMs: number; endMs: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) throw new Error(`invalid day key: ${dayKey}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day + 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function yesterdayDayKey(now = new Date()): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return formatLocalDayKey(date);
}

export function readDailyWorkRecord(dayKey: string): DailyWorkRecord | null {
  const path = dayFilePath(dayKey);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as DailyWorkRecord;
  } catch {
    return null;
  }
}

export function listDailyWorkRecords(options?: {
  from?: string;
  to?: string;
  limit?: number;
}): DailyWorkRecord[] {
  const index = readIndex();
  let days = [...index.days].sort((a, b) => b.localeCompare(a));
  if (!days.length && existsSync(dailyWorkDir())) {
    days = readdirSync(dailyWorkDir())
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .map((name) => name.replace(/\.json$/, ""))
      .sort((a, b) => b.localeCompare(a));
  }
  if (options?.from) days = days.filter((day) => day >= options.from!);
  if (options?.to) days = days.filter((day) => day <= options.to!);
  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 100);
  return days
    .slice(0, limit)
    .map((day) => readDailyWorkRecord(day))
    .filter((item): item is DailyWorkRecord => item !== null);
}

function commitsToSection(
  projectId: number,
  projectName: string,
  cwd: string,
  commits: SvCommitInfo[],
): DailyWorkProjectSection {
  return {
    projectId,
    projectName,
    cwd,
    commits: commits.map((commit) => ({
      hash: commit.hash,
      shortHash: commit.shortHash,
      subject: commit.subject,
      author: commit.author,
      timestamp: commit.timestamp,
    })),
  };
}

export async function runDailyWorkAnalysis(
  db: SupervisorDb,
  dayKey: string,
): Promise<DailyWorkRecord> {
  const { startMs, endMs } = localDayBounds(dayKey);
  const sections: DailyWorkProjectSection[] = [];
  for (const project of db.listProjects()) {
    const commits = await listSvCommitsBetween(project.cwd, startMs, endMs);
    if (!commits.length) continue;
    sections.push(commitsToSection(project.id, project.name, project.cwd, commits));
  }

  let summary = "";
  let usedModel = false;
  if (sections.length) {
    const auth = await resolveFeatureModelAuth(db, "daily-work");
    if (auth) {
      try {
        summary = await generateDailyWorkDigest(
          auth,
          dayKey,
          sections.map((section) => ({
            projectName: section.projectName,
            cwd: section.cwd,
            commits: section.commits.map((commit) => ({
              shortHash: commit.shortHash,
              subject: commit.subject,
            })),
          })),
        );
        usedModel = true;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        summary = `模型分析失败：${message}`;
      }
    }
    if (!summary) {
      const total = sections.reduce((sum, section) => sum + section.commits.length, 0);
      summary = `${dayKey} 共 ${total} 条 sv commit，分布在 ${sections.length} 个项目。`;
    }
  } else {
    summary = `${dayKey} 没有发现 supervisor (sv) commit。`;
  }

  const record: DailyWorkRecord = {
    dayKey,
    summary,
    sections,
    generatedAt: new Date().toISOString(),
    usedModel,
  };
  writeFileSync(dayFilePath(dayKey), `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  const index = readIndex();
  if (!index.days.includes(dayKey)) index.days.push(dayKey);
  index.days.sort();
  index.lastCompletedDay = dayKey;
  writeIndex(index);
  return record;
}

export async function maybeRunDailyWorkCatchUp(db: SupervisorDb): Promise<void> {
  const dayKey = yesterdayDayKey();
  const index = readIndex();
  if (index.lastCompletedDay === dayKey || readDailyWorkRecord(dayKey)) return;
  try {
    await runDailyWorkAnalysis(db, dayKey);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[daily-work] failed for ${dayKey}:`, message);
  }
}

export function startDailyWorkScheduler(db: SupervisorDb): () => void {
  void maybeRunDailyWorkCatchUp(db);
  const timer = setInterval(
    () => {
      void maybeRunDailyWorkCatchUp(db);
    },
    60 * 60 * 1000,
  );
  timer.unref?.();
  return () => clearInterval(timer);
}
