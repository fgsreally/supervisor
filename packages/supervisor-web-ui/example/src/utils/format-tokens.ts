export function formatTokenCount(tokens: number): string {
	if (!Number.isFinite(tokens) || tokens <= 0) return '—'
	if (tokens >= 1_000_000) {
		const m = tokens / 1_000_000
		return Number.isInteger(m) ? `${m}M` : `${m.toFixed(1)}M`
	}
	if (tokens >= 1_000) {
		const k = tokens / 1_000
		return Number.isInteger(k) ? `${k}K` : `${k.toFixed(1)}K`
	}
	return String(tokens)
}
