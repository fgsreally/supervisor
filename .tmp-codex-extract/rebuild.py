# -*- coding: utf-8 -*-
from pathlib import Path
import json, re, codecs

path = Path(r"C:\Users\13250\.codex\sessions\2026\07\30\rollout-2026-07-30T09-10-58-019fb093-19b7-7300-8c47-62e349737f97.jsonl")
out = Path(r"d:\my-project\supervisor-standalone\.tmp-codex-extract")
out.mkdir(exist_ok=True)

TRACK = {
    "packages/supervisor-web-ui/src/components/mobile/MobileAppShell.vue",
    "packages/supervisor-web-ui/src/components/mobile/MobileWorkView.vue",
    "packages/supervisor-web-ui/src/components/mobile/MobileMeView.vue",
    "packages/supervisor-web-ui/src/composables/use-mobile-style.ts",
    "packages/supervisor-web-ui/src/composables/use-app-style.ts",
    "packages/supervisor-web-ui/src/components/mobile/ui/index.ts",
    "packages/supervisor-web-ui/src/router/index.ts",
    "packages/supervisor-web-ui/src/App.vue",
}

def norm_path(p: str) -> str:
    p = p.replace("\\\\", "/").replace("\\", "/")
    for prefix in (
        "D:/my-project/supervisor-standalone/",
        "d:/my-project/supervisor-standalone/",
    ):
        if p.startswith(prefix):
            p = p[len(prefix):]
    return p

def unescape_js_string(s: str) -> str:
    # JSON already decoded once; remaining may be literal \n sequences OR real newlines
    if "\\n" in s and s.count("\n") < 3:
        return codecs.decode(s, "unicode_escape")
    # handle \" already decoded by json - string has real newlines
    return s

def extract_patch_text(inp: str) -> str | None:
    # Prefer finding Begin/End Patch region from decoded input
    # Typical: const patch = "*** Begin Patch\n...*** End Patch";
    start = inp.find("*** Begin Patch")
    if start < 0:
        return None
    # If the string uses escaped form inside quotes still
    # Find end
    end = inp.find("*** End Patch", start)
    if end < 0:
        chunk = inp[start:]
    else:
        chunk = inp[start:end + len("*** End Patch")]
    # If we grabbed from inside a JS string with literal backslash-n
    if "\\n***" in chunk or chunk.startswith("*** Begin Patch\\n"):
        chunk = codecs.decode(chunk, "unicode_escape")
    return chunk

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
    out_lines = []
    for line in body.splitlines():
        if line.startswith("***"):
            break
        if line.startswith("+"):
            out_lines.append(line[1:])
        elif line.startswith("@@"):
            continue
        elif line.startswith("-"):
            continue
        else:
            out_lines.append(line)
    return "\n".join(out_lines) + ("\n" if out_lines else "")

def apply_update(current: str, body: str) -> str:
    """Apply unified-diff-like apply_patch hunks onto current content."""
    # Codex update format: series of @@ hunks with ' ','+','-' lines
    if current is None:
        # best-effort: only keep + and context lines
        return content_from_add(body)

    lines = current.splitlines(keepends=True)
    # Normalize to no keepends for matching
    base = current.splitlines()
    hunks = []
    cur = None
    for line in body.splitlines():
        if line.startswith("@@"):
            if cur:
                hunks.append(cur)
            cur = []
            continue
        if line.startswith("***"):
            break
        if cur is None:
            # sometimes no @@ header
            cur = []
        cur.append(line)
    if cur:
        hunks.append(cur)

    result = list(base)
    # Apply hunks sequentially using context matching
    search_from = 0
    for hunk in hunks:
        old_lines = []
        new_lines = []
        for line in hunk:
            if not line:
                # empty line in patch = empty context?
                old_lines.append("")
                new_lines.append("")
                continue
            tag = line[0]
            text = line[1:] if tag in " +-\\" else line
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
                # treat as context
                old_lines.append(line)
                new_lines.append(line)

        if not old_lines:
            # pure insert at search_from
            for j, nl in enumerate(new_lines):
                result.insert(search_from + j, nl)
            search_from += len(new_lines)
            continue

        # find old_lines in result starting search_from
        found = -1
        for i in range(search_from, len(result) - len(old_lines) + 1):
            if result[i:i + len(old_lines)] == old_lines:
                found = i
                break
        # fuzzy: strip trailing spaces
        if found < 0:
            for i in range(0, len(result) - len(old_lines) + 1):
                if result[i:i + len(old_lines)] == old_lines:
                    found = i
                    break
        if found < 0:
            # try without exact - maybe whitespace
            def norm(xs):
                return [x.rstrip() for x in xs]
            nold = norm(old_lines)
            for i in range(0, len(result) - len(old_lines) + 1):
                if norm(result[i:i + len(old_lines)]) == nold:
                    found = i
                    break
        if found < 0:
            raise RuntimeError(
                f"Hunk not found. old_lines preview: {old_lines[:3]!r} ... {old_lines[-2:]!r}"
            )
        result[found:found + len(old_lines)] = new_lines
        search_from = found + len(new_lines)
    return "\n".join(result) + ("\n" if result else "")

# Collect tool calls and following patch_apply_end by line order
events = []  # chronological
line_no = 0
with path.open("r", encoding="utf-8", errors="replace") as f:
    for raw in f:
        line_no += 1
        if "Begin Patch" not in raw and "patch_apply_end" not in raw and "agent_message" not in raw:
            continue
        try:
            obj = json.loads(raw)
        except Exception:
            continue
        typ = obj.get("type")
        p = obj.get("payload") or {}

        if typ == "event_msg" and p.get("type") == "patch_apply_end":
            events.append({
                "kind": "end",
                "line": line_no,
                "success": bool(p.get("success")),
                "stdout": p.get("stdout") or "",
                "stderr": p.get("stderr") or "",
                "call_id": p.get("call_id"),
            })
            continue

        if typ == "event_msg" and p.get("type") == "agent_message" and 570 <= line_no <= 590:
            events.append({"kind": "final", "line": line_no, "message": p.get("message") or ""})
            continue

        if typ == "response_item" and p.get("type") == "custom_tool_call" and p.get("name") == "exec":
            inp = p.get("input") or ""
            if "Begin Patch" not in inp and "apply_patch" not in inp:
                continue
            patch_text = extract_patch_text(inp)
            if not patch_text:
                continue
            blocks = parse_blocks(patch_text)
            interesting = [(k, fp, body) for k, fp, body in blocks if fp in TRACK or any(fp.endswith(t.split("/")[-1]) and "mobile" in fp for t in TRACK)]
            # stricter
            interesting = [(k, fp, body) for k, fp, body in blocks if fp in TRACK]
            if interesting:
                events.append({
                    "kind": "patch",
                    "line": line_no,
                    "call_id": p.get("call_id"),
                    "blocks": interesting,
                    "status": p.get("status"),
                })

# Associate each patch with the next patch_apply_end
file_state = {}  # path -> content
file_history = {fp: [] for fp in TRACK}
assoc = []

pending_patch = None
for ev in events:
    if ev["kind"] == "patch":
        pending_patch = ev
        continue
    if ev["kind"] == "end" and pending_patch is not None:
        success = ev["success"]
        # also verify stdout mentions Success
        if not success and "Success" in ev.get("stdout", ""):
            success = True
        entry = {
            "patch_line": pending_patch["line"],
            "end_line": ev["line"],
            "success": success,
            "stdout": ev.get("stdout", "")[:300],
            "blocks": [(k, fp, len(body)) for k, fp, body in pending_patch["blocks"]],
        }
        assoc.append(entry)
        if success:
            for kind, fp, body in pending_patch["blocks"]:
                try:
                    if kind == "Add File":
                        content = content_from_add(body)
                        file_state[fp] = content
                        file_history[fp].append({"line": pending_patch["line"], "kind": kind, "ok": True, "chars": len(content)})
                    elif kind == "Delete File":
                        file_state.pop(fp, None)
                        file_history[fp].append({"line": pending_patch["line"], "kind": kind, "ok": True, "chars": 0})
                    elif kind == "Update File":
                        prev = file_state.get(fp)
                        if prev is None and fp.endswith("App.vue") or fp.endswith("router/index.ts"):
                            # We don't have full base; store update body only
                            file_history[fp].append({
                                "line": pending_patch["line"],
                                "kind": kind,
                                "ok": True,
                                "chars": len(body),
                                "note": "update-only-no-base",
                            })
                            # accumulate raw updates for summary
                            file_state.setdefault(fp + ".__updates__", "")
                            file_state[fp + ".__updates__"] += f"\n\n===== UPDATE @ L{pending_patch['line']} =====\n" + body
                        else:
                            new_content = apply_update(prev, body) if prev is not None else content_from_add(body)
                            file_state[fp] = new_content
                            file_history[fp].append({"line": pending_patch["line"], "kind": kind, "ok": True, "chars": len(new_content)})
                except Exception as e:
                    file_history[fp].append({"line": pending_patch["line"], "kind": kind, "ok": False, "error": str(e)})
        else:
            for kind, fp, body in pending_patch["blocks"]:
                file_history[fp].append({"line": pending_patch["line"], "kind": kind, "ok": False, "error": "patch_apply_end failed", "stderr": ev.get("stderr","")[:200]})
        pending_patch = None

# Write outputs
meta = {"assoc": assoc, "history": file_history}
(out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

for fp, content in file_state.items():
    if fp.endswith(".__updates__"):
        safe = fp.replace("/", "__")
        (out / safe).write_text(content, encoding="utf-8")
        continue
    safe = fp.replace("/", "__")
    (out / safe).write_text(content, encoding="utf-8")
    print(f"WROTE {fp} ({len(content)} chars) last_ops={file_history.get(fp)}")

# final answer
for ev in events:
    if ev["kind"] == "final":
        (out / f"final_answer_L{ev['line']}.txt").write_text(ev["message"], encoding="utf-8")
        print(f"FINAL L{ev['line']} len={len(ev['message'])}")

print("DONE")
for fp, hist in file_history.items():
    print(fp, "->", hist)
