import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

declare module 'vue-router' {
  interface RouteMeta {
    /** Requires a signed-in user with a profile. */
    auth?: boolean
    /** Only for visitors; signed-in users are sent home. */
    guest?: boolean
  }
}

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { auth: true } },
    { path: '/signin', name: 'signin', component: () => import('@/views/SignInView.vue'), meta: { guest: true } },
    { path: '/auth/callback', name: 'auth-callback', component: () => import('@/views/AuthCallbackView.vue') },
    { path: '/onboarding', name: 'onboarding', component: () => import('@/views/OnboardingView.vue') },
    { path: '/invite/:token', name: 'invite', component: () => import('@/views/InviteView.vue') },
    { path: '/groups/:groupId', name: 'group', component: () => import('@/views/GroupView.vue'), meta: { auth: true } },
    {
      path: '/groups/:groupId/swipe',
      name: 'swipe',
      component: () => import('@/views/SwipeView.vue'),
      meta: { auth: true },
    },
    {
      path: '/groups/:groupId/upload',
      name: 'upload',
      component: () => import('@/views/UploadView.vue'),
      meta: { auth: true },
    },
    {
      path: '/groups/:groupId/settings',
      name: 'group-settings',
      component: () => import('@/views/GroupSettingsView.vue'),
      meta: { auth: true },
    },
    {
      path: '/groups/:groupId/items/:itemId',
      name: 'item',
      component: () => import('@/views/ItemView.vue'),
      meta: { auth: true },
    },
    { path: '/account', name: 'account', component: () => import('@/views/AccountView.vue'), meta: { auth: true } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') },
  ],
})

router.beforeEach(async (to: RouteLocationNormalized) => {
  const auth = useAuth()
  await auth.whenReady()

  if (to.meta.guest && auth.isSignedIn.value) return { name: 'home' }

  if (to.name === 'onboarding') {
    if (!auth.isSignedIn.value) return { name: 'signin', query: { redirect: to.fullPath } }
    if (auth.hasProfile.value) return { name: 'home' }
    return true
  }

  if (to.meta.auth) {
    if (!auth.isSignedIn.value) return { name: 'signin', query: { redirect: to.fullPath } }
    if (!auth.hasProfile.value) return { name: 'onboarding', query: { redirect: to.fullPath } }
  }
  return true
})
