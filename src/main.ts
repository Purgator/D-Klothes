import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { i18n, currentLocale } from './i18n'
import { useToast } from './composables/useToast'
import { installAppNavigation } from './lib/appNavigation'
import { applyUpdate, installAppUpdates, updateReady } from './lib/appUpdate'
import './style.css'

document.documentElement.lang = currentLocale()

const toast = useToast()
const t = (key: string) => i18n.global.t(key)

installAppNavigation(router, { onExitWarning: () => toast.show(t('app.exitHint'), { tone: 'info', durationMs: 2500 }) })

// App-shell service worker only (see vite.config.ts): it never caches private data.
installAppUpdates({ onUpdated: () => toast.show(t('app.updated'), { emoji: '✨', tone: 'info' }) })
// A tab change is a quiet moment to switch to a newly installed version.
router.afterEach((to, from) => {
  if (updateReady.value && to.meta.layout === 'tabs' && from.meta.layout === 'tabs') void applyUpdate()
})

createApp(App).use(router).use(i18n).mount('#app')
