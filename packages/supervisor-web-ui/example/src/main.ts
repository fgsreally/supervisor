import { createApp } from 'vue'
import App from './App.vue'
import { initAppTheme } from './composables/use-app-theme'
import './style.css'

initAppTheme()

const app = createApp(App)
app.mount('#app')
