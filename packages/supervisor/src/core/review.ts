/**
 * 旁路审批系统：
 * 每轮对话结束时（agent_end），收集本轮所有工具调用结果，打包发给 session 的 reviewer 角色 agent 审批。
 *
 * 来自参考 omp 的 tool-level approval hook — omp 每个 tool 都有 approval 回调
 * 区别: supervisor 在 agent_end 做批量审批，omp 在每个 tool 调用时做单次审批
 */

/**
 * 从 agent_end event 中构建审批 prompt。
 * 包含本轮所有工具调用的详情。
 */
export function buildReviewPrompt(messages: unknown[]): string {
	const lines: string[] = [
		"You are a review agent. Review the following actions from this conversation turn.",
		"Decide whether this turn's changes are safe and correct.",
		"",
		"Respond with ONLY a JSON object:",
		'{',
		'  "approved": true/false,',
		'  "reason": "brief explanation",',
		'  "issues": [{"action": "tool_name", "problem": "description", "suggestion": "optional fix"}]',
		'}',
		"",
		"=== Actions this turn ===",
	];

	for (const msg of (messages ?? [])) {
		const m = msg as any;
		if (m.role === "assistant" && Array.isArray(m.content)) {
			for (const block of m.content) {
				if (block.type === "tool_use") {
					lines.push("");
					lines.push(`  Tool: ${block.name}`);
					if (block.input) {
						const paramsStr = JSON.stringify(block.input, null, 2);
						if (paramsStr.length < 500) {
							lines.push(`  Params: ${paramsStr}`);
						} else {
							lines.push(`  Params: ${paramsStr.slice(0, 497)}...`);
						}
					}
				}
			}
		}
	}

	return lines.join("\n");
}
