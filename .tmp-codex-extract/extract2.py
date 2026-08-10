# -*- coding: utf-8 -*-
"""Stream-extract final successful patches for mobile UI assets from Codex session."""
from __future__ import annotations

from pathlib import Path
import json
import re

SESSION = Path(
    r"C:\Users\13250\.codex\sessions\2026\07\30\rollout-2026-07-30T09-10-58-019fb093-19b7-7300-8c47-62e349737f97.jsonl"
)
OUT = Path(r"d:\my-project\supervisor-standalone\.tmp-codex-extract")
OUT.mkdir(exist_ok=True)

TRACK_PREFIXES = (
    "packages/supervisor-web-ui/src/components/mobile/ui/",
    "packages/supervisor-web-ui/src/styles/mobile/",
    "docs/web-ui/mobile-design-language.md",
)
TRACK_FILES = (
    "packages/supervisor-web-ui/src/components/ChatListPanel.vue",
    "packages/supervisor-web-ui/src/components/IntroTour.vue",
    "packages/supervisor-web-ui/src/components/AgentConfigPanel.vue",
    "packages/supervisor-web-ui/src/components/ContactDetailView.vue",
)
RELATED_SUFFIXES = (
    "ChatListPanel.vue",
    "IntroTour.vue",
    "AgentConfigPanel.vue",
    "ContactDetailView.vue",
    "index.html",
    "style.css",
    "App.vue",
    "main.ts",
)


def norm_path(p: str) -> str:
    p = p.replace("\t", "/t")  # repair accidental tab from bad \\t unescape
    p = p.replace("\\\\", "/").replace("\\", "/")
    for prefix in (
        "D:/my-project/supervisor-standalone/",
        "d:/my-project/supervisor-standalone/",
    ):
        if p.startswith(prefix):
            p = p[len(prefix) :]
    return p


def is_tracked(fp: str) -> bool:
    if fp in TRACK_FILES:
        return True
    return any(fp.startswith(pref) or pref.rstrip("/") in fp for pref in TRACK_PREFIXES)


def unescape_js_patch(chunk: str) -> str:
    """Unescape literal \\n/\\t in a JS string without corrupting Windows \\themes paths.

    Only treat \\X as an escape when the backslash itself is not already a path separator
    before a normal path char that isn't n/t/r. We detect escaped mode by absence of real newlines.
    """
    if "\n" in chunk[:100]:
        return chunk
    if "\\n" not in chunk[:120]:
        return chunk
    out: list[str] = []
    i = 0
    while i < len(chunk):
        ch = chunk[i]
        if ch == "\\" and i + 1 < len(chunk):
            n = chunk[i + 1]
            if n == "n":
                out.append("\n")
                i += 2
                continue
            if n == "t":
                out.append("\t")
                i += 2
                continue
            if n == "r":
                out.append("\r")
                i += 2
                continue
            if n == "\\":
                out.append("\\")
                i += 2
                continue
            if n == '"':
                out.append('"')
                i += 2
                continue
            if n == "'":
                out.append("'")
                i += 2
                continue
        out.append(ch)
        i += 1
    return "".join(out)


def extract_patch_text(inp: str) -> str | None:
    start = inp.find("*** Begin Patch")
    if start < 0:
        return None
    end = inp.find("*** End Patch", start)
    chunk = inp[start:] if end < 0 else inp[start : end + len("*** End Patch")]
    return unescape_js_patch(chunk)


def parse_blocks(patch_text: str):
    pattern = re.compile(r"\*\*\* (Add File|Update File|Delete File): ([^\n]+)\n")
    matches = list(pattern.finditer(patch_text))
    blocks = []
    for i, m in enumerate(matches):
        kind, fpath = m.group(1), norm_path(m.group(2).strip())
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(patch_text)
        body = patch_text[start:end]
        for stopper in ("*** End Patch", "*** End of File"):
            if stopper in body:
                body = body.split(stopper)[0]
        blocks.append((kind, fpath, body))
    return blocks


def content_from_add(body: str) -> str:
    out = []
    for line in body.splitlines():
        if line.startswith("***"):
            break
        if line.startswith("+"):
            out.append(line[1:])
        elif line.startswith("@@") or line.startswith("-"):
            continue
        else:
            out.append(line)
    return "\n".join(out) + ("\n" if out else "")


def apply_update(current: str | None, body: str) -> str:
    if current is None:
        return content_from_add(body)
    base = current.splitlines()
    hunks: list[list[str]] = []
    cur: list[str] | None = None
    for line in body.splitlines():
        if line.startswith("@@"):
            if cur is not None:
                hunks.append(cur)
            cur = []
            continue
        if line.startswith("***"):
            break
        if cur is None:
            cur = []
        cur.append(line)
    if cur is not None:
        hunks.append(cur)

    result = list(base)
    search_from = 0
    for hunk in hunks:
        old_lines: list[str] = []
        new_lines: list[str] = []
        for line in hunk:
            if line == "":
                old_lines.append("")
                new_lines.append("")
                continue
            tag = line[0]
            text = line[1:] if tag in " +-" else line
            if tag == " ":
                old_lines.append(text)
                new_lines.append(text)
            elif tag == "-":
                old_lines.append(text)
            elif tag == "+":
                new_lines.append(text)
            elif tag == "\\":
                continue
            else:
                old_lines.append(line)
                new_lines.append(line)
        if not old_lines:
            for j, nl in enumerate(new_lines):
                result.insert(search_from + j, nl)
            search_from += len(new_lines)
            continue
        found = -1
        for i in range(search_from, len(result) - len(old_lines) + 1):
            if result[i : i + len(old_lines)] == old_lines:
                found = i
                break
        if found < 0:
            for i in range(0, len(result) - len(old_lines) + 1):
                if result[i : i + len(old_lines)] == old_lines:
                    found = i
                    break
        if found < 0:
            nold = [x.rstrip() for x in old_lines]
            for i in range(0, len(result) - len(old_lines) + 1):
                if [x.rstrip() for x in result[i : i + len(old_lines)]] == nold:
                    found = i
                    break
        if found < 0:
            raise RuntimeError(f"hunk not found: {old_lines[:2]!r}")
        result[found : found + len(old_lines)] = new_lines
        search_from = found + len(new_lines)
    return "\n".join(result) + ("\n" if result else "")


def related_hit(fp: str, body: str) -> bool:
    keys = (
        "MessageSquareReply",
        "external-details",
        "toolsPreset",
        "tools-preset",
        "avatar",
        "font-size",
        "html {",
        "16px",
        "preview",
        "mobilePage",
        "IntroTour",
    )
    blob = fp + "\n" + body
    return any(k.lower() in blob.lower() for k in keys)


events: list[dict] = []
line_no = 0
with SESSION.open("r", encoding="utf-8", errors="replace") as f:
    for raw in f:
        line_no += 1
        if "Begin Patch" not in raw and "patch_apply_end" not in raw:
            continue
        try:
            obj = json.loads(raw)
        except Exception:
            continue
        typ = obj.get("type")
        p = obj.get("payload") or {}

        if typ == "event_msg" and p.get("type") == "patch_apply_end":
            events.append(
                {
                    "kind": "end",
                    "line": line_no,
                    "success": bool(p.get("success"))
                    or ("Success" in (p.get("stdout") or "")),
                    "stdout": (p.get("stdout") or "")[:500],
                    "stderr": (p.get("stderr") or "")[:300],
                }
            )
            continue

        if (
            typ == "response_item"
            and p.get("type") == "custom_tool_call"
            and p.get("name") == "exec"
        ):
            inp = p.get("input") or ""
            if "Begin Patch" not in inp:
                continue
            pt = extract_patch_text(inp)
            if not pt:
                continue
            blocks = parse_blocks(pt)
            interesting = [(k, fp, b) for k, fp, b in blocks if is_tracked(fp)]
            related = [
                (k, fp, b)
                for k, fp, b in blocks
                if not is_tracked(fp) and related_hit(fp, b)
            ]
            if interesting or related:
                events.append(
                    {
                        "kind": "patch",
                        "line": line_no,
                        "blocks": interesting,
                        "related": related,
                    }
                )

state: dict[str, str] = {}
history: dict[str, list] = {}
related_log: list[dict] = []
failed: list[dict] = []

pending = None
for ev in events:
    if ev["kind"] == "patch":
        pending = ev
        continue
    if ev["kind"] == "end" and pending is not None:
        success = ev["success"]
        if success:
            for kind, fp, body in pending["blocks"]:
                history.setdefault(fp, [])
                try:
                    if kind == "Add File":
                        state[fp] = content_from_add(body)
                        history[fp].append(
                            {
                                "line": pending["line"],
                                "kind": kind,
                                "ok": True,
                                "chars": len(state[fp]),
                            }
                        )
                    elif kind == "Delete File":
                        # Keep last content under side key before delete if chat-density rewrite
                        if fp in state:
                            state[fp + ".__before_delete__"] = state[fp]
                        state.pop(fp, None)
                        history[fp].append(
                            {"line": pending["line"], "kind": kind, "ok": True}
                        )
                    elif kind == "Update File":
                        prev = state.get(fp)
                        if prev is None:
                            upd_key = fp + ".__updates__"
                            state.setdefault(upd_key, "")
                            state[upd_key] += (
                                f"\n\n===== UPDATE @ L{pending['line']} =====\n{body}"
                            )
                            history[fp].append(
                                {
                                    "line": pending["line"],
                                    "kind": kind,
                                    "ok": True,
                                    "note": "update-only-no-base",
                                    "chars": len(body),
                                }
                            )
                        else:
                            state[fp] = apply_update(prev, body)
                            history[fp].append(
                                {
                                    "line": pending["line"],
                                    "kind": kind,
                                    "ok": True,
                                    "chars": len(state[fp]),
                                }
                            )
                except Exception as e:
                    history[fp].append(
                        {
                            "line": pending["line"],
                            "kind": kind,
                            "ok": False,
                            "error": str(e)[:300],
                        }
                    )
                    failed.append(
                        {"line": pending["line"], "path": fp, "error": str(e)[:300]}
                    )
            for kind, fp, body in pending.get("related") or []:
                related_log.append(
                    {
                        "line": pending["line"],
                        "kind": kind,
                        "path": fp,
                        "body": body,
                        "success": True,
                    }
                )
                if any(fp.endswith(x) for x in RELATED_SUFFIXES):
                    upd_key = fp + ".__updates__"
                    state.setdefault(upd_key, "")
                    state[upd_key] += (
                        f"\n\n===== UPDATE @ L{pending['line']} =====\n{body}"
                    )
                    history.setdefault(fp, []).append(
                        {
                            "line": pending["line"],
                            "kind": kind,
                            "ok": True,
                            "note": "related-update",
                            "chars": len(body),
                        }
                    )
        else:
            for kind, fp, _body in pending["blocks"]:
                history.setdefault(fp, []).append(
                    {
                        "line": pending["line"],
                        "kind": kind,
                        "ok": False,
                        "error": "apply failed",
                        "stderr": ev.get("stderr", "")[:200],
                    }
                )
                failed.append(
                    {"line": pending["line"], "path": fp, "error": "apply failed"}
                )
        pending = None

written = []
for fp, content in sorted(state.items()):
    safe = (
        fp.replace("/", "__")
        .replace(":", "")
        .replace("\t", "t")
        .replace("\n", "")
        .replace(" ", "_")
    )
    out_path = OUT / safe
    out_path.write_text(content, encoding="utf-8")
    written.append(
        {
            "path": fp,
            "out": str(out_path.name),
            "chars": len(content),
            "lines": content.count("\n"),
            "has_cn": any("\u4e00" <= c <= "\u9fff" for c in content),
            "is_updates_only": fp.endswith(".__updates__")
            or fp.endswith(".__before_delete__"),
            "history": history.get(
                fp.replace(".__updates__", "").replace(".__before_delete__", ""),
                history.get(fp, []),
            ),
        }
    )

inventory = {
    "written_count": len(written),
    "files": written,
    "history": history,
    "failed": failed,
    "related_patch_count": len(related_log),
}
(OUT / "inventory2.json").write_text(
    json.dumps(inventory, ensure_ascii=False, indent=2), encoding="utf-8"
)

rel_summary = []
for r in related_log:
    body = r["body"]
    rel_summary.append(
        {
            "line": r["line"],
            "kind": r["kind"],
            "path": r["path"],
            "body_preview": body[:1000],
            "body_chars": len(body),
            "topics": [
                t
                for t in (
                    "MessageSquareReply",
                    "external-details",
                    "toolsPreset",
                    "avatar",
                    "font-size",
                    "rem",
                    "preview",
                    "tab",
                    "IntroTour",
                )
                if t.lower() in body.lower() or t in r["path"]
            ],
        }
    )
(OUT / "related_patches2.json").write_text(
    json.dumps(rel_summary, ensure_ascii=False, indent=2), encoding="utf-8"
)

print("WRITTEN", len(written))
for w in written:
    print(f"  {w['path']} chars={w['chars']} updates={w['is_updates_only']} out={w['out']}")
print("FAILED", len(failed))
for item in failed[:30]:
    print(" ", item)
print("HISTORY KEYS:")
for k in sorted(history.keys()):
    ops = history[k]
    ok = sum(1 for o in ops if o.get("ok"))
    print(f"  {k}: {len(ops)} ops, {ok} ok, last={ops[-1] if ops else None}")
print("RELATED", len(related_log))
