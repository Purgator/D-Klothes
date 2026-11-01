import { createApp } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import App from './App.vue'
import { router } from './router'
import { i18n, currentLocale } from './i18n'
import './style.css'

document.documentElement.lang = currentLocale()

createApp(App).use(router).use(i18n).mount('#app')

// App-shell service worker only (see vite.config.ts): no private data is ever cached.
if (import.meta.env.PROD) {
  registerSW({ immediate: true })
}
