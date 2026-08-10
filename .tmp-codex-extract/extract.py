import json, re, sys
from pathlib import Path

path = Path(r"C:\Users\13250\.codex\sessions\2026\07\30\rollout-2026-07-30T09-10-58-019fb093-19b7-7300-8c47-62e349737f97.jsonl")
out = Path(r"d:\my-project\supervisor-standalone\.tmp-codex-extract")

targets = [
    "packages/supervisor-web-ui/src/components/mobile/MobileAppShell.vue",
    "packages/supervisor-web-ui/src/components/mobile/MobileWorkView.vue",
    "packages/supervisor-web-ui/src/components/mobile/MobileMeView.vue",
    "packages/supervisor-web-ui/src/composables/use-mobile-style.ts",
    "packages/supervisor-web-ui/src/composables/use-app-visual-style.ts",
]
# also catch mobile ui index
index_patterns = [
    "packages/supervisor-web-ui/src/components/mobile/ui/index.ts",
    "components/mobile/ui/index.ts",
]

# last successful content per file
last = {}  # path -> {line, kind, content, success}
index_hits = []
patch_end_by_call = {}  # call_id -> success
final_answers = []

# First pass: collect patch_apply_end success by call_id / exec id
# and extract patches

def extract_file_blocks(input_text: str):
    """Extract *** Add/Update File blocks from apply_patch input."""
    results = []
    # Codex apply_patch format uses *** Add File: path / *** Update File: path
    pattern = re.compile(r"\*\*\* (Add File|Update File|Delete File): ([^\n]+)\n", re.M)
    matches = list(pattern.finditer(input_text))
    for i, m in enumerate(matches):
        kind = m.group(1)
        fpath = m.group(2).strip()
        start = m.end()
        end = matches[i+1].start() if i+1 < len(matches) else len(input_text)
        body = input_text[start:end]
        # Also stop at *** End of File if present
        eof = body.find("*** End of File")
        if eof >= 0:
            body = body[:eof]
        results.append((kind, fpath, body))
    return results

def reconstruct_from_diff(body: str, kind: str):
    """For Add File, lines often start with +. For Update, mix of context/+/-."""
    lines = body.splitlines()
    out_lines = []
    if kind == "Add File":
        for line in lines:
            if line.startswith("+"):
                out_lines.append(line[1:])
            elif line.startswith("***"):
                break
            elif line.startswith("@@"):
                continue
            else:
                # sometimes raw content without prefix
                if line.startswith("-"):
                    continue
                out_lines.append(line)
        return "\n".join(out_lines)
    # Update File: reconstruct approximate final by applying hunks simply
    # Keep lines that are context (space) or added (+), drop removed (-)
    for line in lines:
        if line.startswith("@@"):
            continue
        if line.startswith("***"):
            break
        if line.startswith("+"):
            out_lines.append(line[1:])
        elif line.startswith("-"):
            continue
        elif line.startswith(" "):
            out_lines.append(line[1:])
        elif line == "":
            out_lines.append("")
        else:
            # bare context
            out_lines.append(line)
    return "\n".join(out_lines)

line_no = 0
# Track pending patches waiting for success
pending = {}  # call_id -> list of (kind,fpath,body,line_no)

with path.open("r", encoding="utf-8", errors="replace") as f:
    for raw in f:
        line_no += 1
        # quick filter
        if "MobileAppShell" not in raw and "MobileWorkView" not in raw and "MobileMeView" not in raw \
           and "use-mobile-style" not in raw and "use-app-visual-style" not in raw \
           and "mobile/ui" not in raw and "final_answer" not in raw and "agent_message" not in raw \
           and "patch_apply" not in raw and "apply_patch" not in raw and "Add File" not in raw:
            # still need App.vue / router in final answer around 578
            if line_no < 570 or line_no > 590:
                if "patch_apply_end" not in raw:
                    continue

        try:
            obj = json.loads(raw)
        except Exception:
            continue

        typ = obj.get("type")
        payload = obj.get("payload") or {}

        # patch apply end success
        if typ == "event_msg" and payload.get("type") == "patch_apply_end":
            call_id = payload.get("call_id")
            success = payload.get("success")
            if success is None:
                # try other fields
                success = payload.get("status") != "failed"
            # check stdout/stderr fields
            changes = payload.get("changes") or payload.get("stdout") or ""
            failed = payload.get("stderr") or ""
            # store
            patch_end_by_call[call_id] = {
                "success": bool(success) if success is not None else ("error" not in str(payload).lower() or "applied" in str(payload).lower()),
                "line": line_no,
                "payload_keys": list(payload.keys()),
                "preview": json.dumps(payload, ensure_ascii=False)[:500],
            }
            continue

        # agent final messages near 578
        if typ == "event_msg" and payload.get("type") in ("agent_message", "task_complete"):
            msg = payload.get("message") or payload.get("last_agent_message") or ""
            if line_no >= 570 and line_no <= 590:
                final_answers.append({"line": line_no, "type": payload.get("type"), "message": msg})
            elif "移动端优先" in msg or "MobileAppShell" in msg:
                if 560 <= line_no <= 600:
                    final_answers.append({"line": line_no, "type": payload.get("type"), "message": msg})

        # custom_tool_call with apply_patch
        if typ == "response_item" and payload.get("type") == "custom_tool_call":
            input_text = payload.get("input") or ""
            if isinstance(input_text, list):
                input_text = "\n".join(
                    (x.get("text") if isinstance(x, dict) else str(x)) for x in input_text
                )
            name = payload.get("name") or ""
            call_id = payload.get("call_id") or ""
            if "apply_patch" in name or "ApplyPatch" in name or "*** Add File" in input_text or "*** Update File" in input_text:
                blocks = extract_file_blocks(input_text)
                for kind, fpath, body in blocks:
                    norm = fpath.replace("\\", "/")
                    is_target = any(t in norm for t in targets) or any(p in norm for p in index_patterns) or "mobile/ui" in norm and norm.endswith("index.ts")
                    if not is_target:
                        # also catch App.vue and router for summary
                        if "App.vue" in norm or "router" in norm.lower():
                            pass
                        else:
                            continue
                    content = reconstruct_from_diff(body, kind)
                    key = norm
                    # normalize to known target if substring match
                    for t in targets + index_patterns:
                        if t in norm or norm.endswith(t.split("/")[-1]) and "mobile" in norm:
                            if t in norm:
                                key = t
                    last[key] = {
                        "line": line_no,
                        "kind": kind,
                        "call_id": call_id,
                        "content": content,
                        "raw_body_len": len(body),
                        "success_pending": True,
                    }
                    if "ui/index" in norm or norm.endswith("mobile/ui/index.ts"):
                        index_hits.append({"line": line_no, "path": norm, "kind": kind, "len": len(content)})

        # also check function_call style
        if typ == "response_item" and payload.get("type") == "function_call":
            args = payload.get("arguments") or ""
            if isinstance(args, dict):
                args = json.dumps(args)
            if "*** Add File" in args or "*** Update File" in args:
                blocks = extract_file_blocks(args)
                for kind, fpath, body in blocks:
                    norm = fpath.replace("\\", "/")
                    is_target = any(t in norm for t in targets) or ("mobile/ui" in norm and "index.ts" in norm)
                    if not is_target and "App.vue" not in norm and "router" not in norm:
                        continue
                    content = reconstruct_from_diff(body, kind)
                    last[norm] = {
                        "line": line_no,
                        "kind": kind,
                        "call_id": payload.get("call_id"),
                        "content": content,
                        "raw_body_len": len(body),
                    }

# Second pass: mark success from patch_apply_end that follow
# Re-scan associating: after a patch tool call, next patch_apply_end with matching patterns

# Write outputs
summary = []
for key, info in sorted(last.items(), key=lambda x: x[1]["line"]):
    safe = key.replace("/", "__").replace(":", "")
    out_file = out / f"L{info['line']}_{safe}.txt"
    out_file.write_text(info["content"], encoding="utf-8")
    summary.append({
        "path": key,
        "line": info["line"],
        "kind": info["kind"],
        "chars": len(info["content"]),
        "out": str(out_file),
        "call_id": info.get("call_id"),
    })

(out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
(out / "final_answers.json").write_text(json.dumps(final_answers, ensure_ascii=False, indent=2), encoding="utf-8")
(out / "index_hits.json").write_text(json.dumps(index_hits, ensure_ascii=False, indent=2), encoding="utf-8")
(out / "patch_ends_sample.json").write_text(json.dumps(list(patch_end_by_call.items())[:20], ensure_ascii=False, indent=2), encoding="utf-8")
print("FILES FOUND:", len(summary))
for s in summary:
    print(f"  L{s['line']} {s['kind']} {s['path']} ({s['chars']} chars)")
print("FINAL ANSWERS:", len(final_answers))
for fa in final_answers:
    print(f"  L{fa['line']} {fa['type']} msg_len={len(fa['message'])}")
print("INDEX HITS:", index_hits)
