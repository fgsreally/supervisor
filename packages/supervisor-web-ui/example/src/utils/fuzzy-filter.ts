/** Minimal fuzzy match for chat autocomplete (subset of pi-tui). */

export interface FuzzyMatch {
	matches: boolean
	score: number
}

export function fuzzyMatch(query: string, text: string): FuzzyMatch {
	const queryLower = query.toLowerCase()
	const textLower = text.toLowerCase()

	if (queryLower.length === 0) return { matches: true, score: 0 }
	if (queryLower.length > textLower.length) return { matches: false, score: 0 }

	let queryIndex = 0
	let score = 0
	let lastMatchIndex = -1

	for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
		if (textLower[i] === queryLower[queryIndex]) {
			if (lastMatchIndex >= 0) score += i - lastMatchIndex - 1
			lastMatchIndex = i
			queryIndex++
		}
	}

	if (queryIndex < queryLower.length) return { matches: false, score: 0 }
	if (queryLower === textLower) score -= 100
	return { matches: true, score }
}

export function fuzzyFilter<T>(items: T[], query: string, getText: (item: T) => string): T[] {
	if (!query.trim()) return items

	const tokens = query.trim().split(/\s+/).filter(Boolean)
	const results: { item: T; totalScore: number }[] = []

	for (const item of items) {
		const text = getText(item)
		let totalScore = 0
		let allMatch = true
		for (const token of tokens) {
			const match = fuzzyMatch(token, text)
			if (match.matches) totalScore += match.score
			else {
				allMatch = false
				break
			}
		}
		if (allMatch) results.push({ item, totalScore })
	}

	return results.sort((a, b) => a.totalScore - b.totalScore).map((r) => r.item)
}
