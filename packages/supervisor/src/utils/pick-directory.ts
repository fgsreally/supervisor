import { spawnSync } from "node:child_process";
import { homedir, platform } from "node:os";

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}

function escapeAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Open a native folder picker on the machine running supervisor.
 * Returns the selected absolute path, or null if cancelled / unavailable.
 */
export function pickDirectory(defaultPath?: string): string | null {
  const initial = defaultPath?.trim() || homedir();
  const os = platform();

  if (os === "win32") {
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
      "$dialog.Description = '选择项目目录'",
      "$dialog.ShowNewFolderButton = $true",
      `$dialog.SelectedPath = '${escapePowerShellSingleQuoted(initial)}'`,
      "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
      "  [Console]::Out.Write($dialog.SelectedPath)",
      "}",
    ].join("; ");
    const result = spawnSync("powershell.exe", ["-NoProfile", "-STA", "-Command", script], {
      encoding: "utf8",
      windowsHide: false,
      timeout: 300_000,
    });
    const selected = (result.stdout ?? "").trim();
    return selected || null;
  }

  if (os === "darwin") {
    const script = `set theFolder to choose folder with prompt "选择项目目录" default location POSIX file "${escapeAppleScript(initial)}"
POSIX path of theFolder`;
    const result = spawnSync("osascript", ["-e", script], {
      encoding: "utf8",
      timeout: 300_000,
    });
    if (result.status !== 0) return null;
    const selected = (result.stdout ?? "").trim().replace(/\/$/, "");
    return selected || null;
  }

  // Linux: prefer zenity, then kdialog.
  const zenity = spawnSync(
    "zenity",
    ["--file-selection", "--directory", "--title=选择项目目录", `--filename=${initial}/`],
    { encoding: "utf8", timeout: 300_000 },
  );
  if (zenity.status === 0) {
    const selected = (zenity.stdout ?? "").trim();
    if (selected) return selected;
  }

  const kdialog = spawnSync(
    "kdialog",
    ["--getexistingdirectory", initial, "--title", "选择项目目录"],
    { encoding: "utf8", timeout: 300_000 },
  );
  if (kdialog.status === 0) {
    const selected = (kdialog.stdout ?? "").trim();
    if (selected) return selected;
  }

  return null;
}
