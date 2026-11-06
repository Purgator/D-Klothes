/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
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

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isDev = mode === 'development'
  // BASE_PATH=/D-Klothes/ for GitHub Pages project sites; '/' for a custom domain or local dev.
  const base = env.BASE_PATH && env.BASE_PATH !== '/' ? `/${env.BASE_PATH.replace(/^\/|\/$/g, '')}/` : '/'
  return {
    base,
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    plugins: [
      vue(),
      tailwindcss(),
      cspPlugin(env.VITE_SUPABASE_URL ?? '', isDev),
      VitePWA({
        // Manual registration from main.ts keeps index.html free of inline scripts (CSP).
        injectRegister: null,
        // New versions are applied by src/lib/appUpdate.ts at a quiet moment, not mid-swipe.
        registerType: 'prompt',
        includeAssets: ['icons/icon.svg'],
        manifest: {
          name: 'D-Klothes',
          short_name: 'D-Klothes',
          description: 'Decide together what to keep, let go, or offer to friends.',
          lang: 'fr',
          start_url: base,
          scope: base,
          display: 'standalone',
          background_color: '#f5f5f4',
          theme_color: '#148a78',
          icons: [
            { src: `${base}icons/icon.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
            { src: `${base}icons/icon-maskable.svg`, sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
          ],
          // Other apps can share a photo into D-Klothes; public/share-target-sw.js receives it.
          share_target: {
            action: `${base}share-target`,
            method: 'POST',
            enctype: 'multipart/form-data',
            params: { files: [{ name: 'photo', accept: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] }] },
          },
        },
        workbox: {
          // App shell only: precache the build output, never cache API responses, votes or photos.
          globPatterns: ['**/*.{js,css,html,svg,webmanifest}'],
          globIgnores: ['share-target-sw.js'],
          importScripts: ['share-target-sw.js'],
          runtimeCaching: [],
          navigateFallback: `${base}index.html`,
          navigateFallbackDenylist: [/\/auth\/v1\//, /\/storage\/v1\//, /\/rest\/v1\//, /\/functions\/v1\//],
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
