import { onBeforeUnmount, ref } from 'vue'

export function useResizableHeight(options: {
	defaultHeight: number
	minHeight: number
	maxHeight: number
	storageKey?: string
}) {
	const stored =
		options.storageKey && typeof localStorage !== 'undefined'
			? Number.parseInt(localStorage.getItem(options.storageKey) ?? '', 10)
			: Number.NaN

	const height = ref(
		Number.isFinite(stored)
			? Math.min(options.maxHeight, Math.max(options.minHeight, stored))
			: options.defaultHeight,
	)

	let startY = 0
	let startHeight = 0

	function persist() {
		if (options.storageKey) {
			localStorage.setItem(options.storageKey, String(Math.round(height.value)))
		}
	}

	function onPointerMove(e: PointerEvent) {
		const next = startHeight - (e.clientY - startY)
		height.value = Math.min(options.maxHeight, Math.max(options.minHeight, next))
	}

	function onPointerUp() {
		window.removeEventListener('pointermove', onPointerMove)
		window.removeEventListener('pointerup', onPointerUp)
		document.body.style.cursor = ''
		document.body.style.userSelect = ''
		persist()
	}

	function startResize(e: PointerEvent) {
		e.preventDefault()
		startY = e.clientY
		startHeight = height.value
		document.body.style.cursor = 'row-resize'
		document.body.style.userSelect = 'none'
		window.addEventListener('pointermove', onPointerMove)
		window.addEventListener('pointerup', onPointerUp)
	}

	onBeforeUnmount(() => {
		window.removeEventListener('pointermove', onPointerMove)
		window.removeEventListener('pointerup', onPointerUp)
	})

	return { height, startResize }
}
