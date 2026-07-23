/**
 * Proxy helpers for the public skills.sh registry (search / discovery).
 */

export interface SkillsShSearchHit {
  id: string;
  name: string;
  source: string;
  installs: number;
}

export interface SkillsShSearchResult {
  query: string;
  skills: SkillsShSearchHit[];
  count: number;
}

const DEFAULT_SKILLS_API = "https://skills.sh";

export async function searchSkillsSh(
  query: string,
  options?: { limit?: number; owner?: string; baseUrl?: string },
): Promise<SkillsShSearchResult> {
  const q = query.trim();
  if (!q) {
    return { query: "", skills: [], count: 0 };
  }

  const params = new URLSearchParams({
    q,
    limit: String(options?.limit ?? 20),
  });
  if (options?.owner?.trim()) params.set("owner", options.owner.trim());

  const base = (options?.baseUrl ?? process.env.SKILLS_API_URL ?? DEFAULT_SKILLS_API).replace(
    /\/$/,
    "",
  );
  const url = `${base}/api/search?${params.toString()}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    throw new Error(`skills.sh search failed (${res.status})`);
  }

  const data = (await res.json()) as {
    query?: string;
    skills?: Array<{ id?: string; name?: string; source?: string; installs?: number }>;
    count?: number;
  };

  const skills: SkillsShSearchHit[] = (data.skills ?? [])
    .map((skill) => ({
      id: String(skill.id ?? skill.name ?? "").trim(),
      name: String(skill.name ?? skill.id ?? "").trim(),
      source: String(skill.source ?? "").trim(),
      installs: typeof skill.installs === "number" ? skill.installs : 0,
    }))
    .filter((skill) => skill.name && skill.source)
    .sort((a, b) => b.installs - a.installs);

  return {
    query: data.query ?? q,
    skills,
    count: typeof data.count === "number" ? data.count : skills.length,
  };
}

/** Build an install source string for our skill installer from a search hit. */
export function skillInstallSourceFromSearchHit(hit: Pick<SkillsShSearchHit, "source" | "name">): string {
  return `${hit.source}@${hit.name}`;
}
