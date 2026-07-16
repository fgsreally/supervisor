/** Default workspace directory for supervisor sessions and resource discovery. */
export function getDefaultWorkspaceCwd(): string {
  const fromEnv = import.meta.env.VITE_WORKSPACE_CWD as string | undefined;
  if (fromEnv?.trim()) return fromEnv.trim();
  const saved = localStorage.getItem("pi-supervisor-last-cwd");
  if (saved) return saved;
  return "";
}

/** Remember the last used cwd. */
export function rememberCwd(cwd: string) {
  if (cwd) localStorage.setItem("pi-supervisor-last-cwd", cwd);
}
