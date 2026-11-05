import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

declare module 'vue-router' {
  interface RouteMeta {
    /** Requires a signed-in user with a profile. */
    auth?: boolean
    /** Only for visitors; signed-in users are sent home. */
    guest?: boolean
    /**
     * How the screen sits in the app frame:
     * - `tabs`: a root screen with the bottom tab bar;
     * - `stack`: a detail screen pushed on top of a tab (back arrow, no tab bar);
     * - `bare`: outside the signed-in app (welcome, sign-in).
     */
    layout?: 'tabs' | 'stack' | 'bare'
  }
}

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue'), meta: { auth: true, layout: 'tabs' } },
    { path: '/groups', name: 'groups', component: () => import('@/views/GroupsView.vue'), meta: { auth: true, layout: 'tabs' } },
    { path: '/groups/new', name: 'group-new', component: () => import('@/views/NewGroupView.vue'), meta: { auth: true, layout: 'stack' } },
    { path: '/signin', name: 'signin', component: () => import('@/views/SignInView.vue'), meta: { guest: true, layout: 'bare' } },
    { path: '/welcome', name: 'welcome', component: () => import('@/views/WelcomeView.vue'), meta: { layout: 'bare' } },
    { path: '/auth/callback', name: 'auth-callback', component: () => import('@/views/AuthCallbackView.vue'), meta: { layout: 'bare' } },
    { path: '/onboarding', name: 'onboarding', component: () => import('@/views/OnboardingView.vue'), meta: { layout: 'bare' } },
    { path: '/invite/:token', name: 'invite', component: () => import('@/views/InviteView.vue'), meta: { layout: 'bare' } },
    {
      path: '/groups/:groupId',
      name: 'group',
      component: () => import('@/views/GroupView.vue'),
      meta: { auth: true, layout: 'stack' },
    },
    // Older links: the collection is the group page, the review deck is the home screen.
    { path: '/groups/:groupId/photos', redirect: (to) => ({ name: 'group', params: { groupId: to.params.groupId } }) },
    { path: '/groups/:groupId/swipe', redirect: (to) => ({ name: 'home', query: { group: String(to.params.groupId) } }) },
    {
      path: '/groups/:groupId/upload',
      name: 'upload',
      component: () => import('@/views/UploadView.vue'),
      meta: { auth: true, layout: 'stack' },
    },
    {
      path: '/groups/:groupId/settings',
      name: 'group-settings',
      component: () => import('@/views/GroupSettingsView.vue'),
      meta: { auth: true, layout: 'stack' },
    },
    {
      path: '/groups/:groupId/items/:itemId',
      name: 'item',
      component: () => import('@/views/ItemView.vue'),
      meta: { auth: true, layout: 'stack' },
    },
    { path: '/account', name: 'account', component: () => import('@/views/AccountView.vue'), meta: { auth: true, layout: 'tabs' } },
    {
      path: '/notifications',
      name: 'notifications',
      component: () => import('@/views/NotificationsView.vue'),
      meta: { auth: true, layout: 'tabs' },
    },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue'), meta: { layout: 'bare' } },
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
