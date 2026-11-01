/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Inject a Content Security Policy that matches the built app.
 * The Supabase origin comes from VITE_SUPABASE_URL so the policy only allows
 * the project the app talks to. Styles need 'unsafe-inline' only in dev,
 * where Vite injects CSS through <style> tags.
 */
function cspPlugin(supabaseUrl: string, isDev: boolean): Plugin {
  let origin = ''
  let wsOrigin = ''
  try {
    const u = new URL(supabaseUrl)
    origin = u.origin
    wsOrigin = origin.replace(/^http/, 'ws')
  } catch {
    // Without a URL the policy stays strict: only 'self' is allowed.
  }
  const directives = [
    `default-src 'self'`,
    `script-src 'self'`,
    `style-src 'self'${isDev ? " 'unsafe-inline'" : ''}`,
    `img-src 'self' blob: data:${origin ? ` ${origin}` : ''}`,
    `connect-src 'self'${origin ? ` ${origin} ${wsOrigin}` : ''}${isDev ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`,
    `font-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `manifest-src 'self'`,
    `worker-src 'self'`,
  ]
  return {
    name: 'dklothes-csp',
    transformIndexHtml(html) {
      return html.replace('%CSP%', directives.join('; '))
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isDev = mode === 'development'
  return {
    plugins: [
      vue(),
      tailwindcss(),
      cspPlugin(env.VITE_SUPABASE_URL ?? '', isDev),
      VitePWA({
        // Manual registration from main.ts keeps index.html free of inline scripts (CSP).
        injectRegister: null,
        registerType: 'autoUpdate',
        includeAssets: ['icons/icon.svg'],
        manifest: {
          name: 'D-Klothes',
          short_name: 'D-Klothes',
          description: 'Decide together what to keep, let go, or offer to friends.',
          lang: 'fr',
          start_url: '/',
          display: 'standalone',
          background_color: '#fafaf9',
          theme_color: '#0f766e',
          icons: [
            { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            { src: '/icons/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
          ],
        },
        workbox: {
          // App shell only: precache the build output, never cache API responses, votes or photos.
          globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
          runtimeCaching: [],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/auth\//, /^\/storage\//, /^\/rest\//, /^\/functions\//],
          cleanupOutdatedCaches: true,
        },
        devOptions: { enabled: false },
      }),
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['tests/**/*.test.ts'],
    },
  }
})
