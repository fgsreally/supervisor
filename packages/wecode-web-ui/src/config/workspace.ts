/** Default workspace directory for wecode sessions and resource discovery. */
export function getDefaultWorkspaceCwd(): string {
  const fromEnv = import.meta.env.VITE_WORKSPACE_CWD as string | undefined;
  if (fromEnv?.trim()) return fromEnv.trim();
  const saved = localStorage.getItem("wecode-last-cwd");
  if (saved) return saved;
  return "";
}

/** Remember the last used cwd. */
export function rememberCwd(cwd: string) {
  if (cwd) localStorage.setItem("wecode-last-cwd", cwd);
}
