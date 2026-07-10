import { computed, ref } from 'vue'

const STORAGE_KEY = 'pi-example-theme'

const isDark = ref(false)
let initialized = false

function readInitialDark(): boolean {
	if (typeof localStorage === 'undefined') return false
	const stored = localStorage.getItem(STORAGE_KEY)
	if (stored === 'dark') return true
	if (stored === 'light') return false
	if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
		return true
	}
	return false
}

function applyTheme() {
	if (typeof document === 'undefined') return
	document.documentElement.dataset.theme = isDark.value ? 'dark' : 'light'
}

export function initAppTheme() {
	if (initialized) return
	initialized = true
	isDark.value = readInitialDark()
	applyTheme()
}

export function useAppTheme() {
	if (!initialized) initAppTheme()

	const theme = computed(() => (isDark.value ? 'dark' : 'light'))

	function setDark(value: boolean) {
		isDark.value = value
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(STORAGE_KEY, value ? 'dark' : 'light')
		}
		applyTheme()
	}

	function toggleDark() {
		setDark(!isDark.value)
	}

	return { isDark, theme, setDark, toggleDark }
}
