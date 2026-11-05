<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { FunctionError, invokeFunction, supabase } from '@/lib/supabase'
import type { Entitlements, NotificationKind } from '@/types/database'
import { errorKey } from '@/lib/errors'
import { useAuth } from '@/composables/useAuth'
import { useHaptics, useToast } from '@/composables/useToast'
import { SUPPORTED_LOCALES, isSupportedLocale, setLocale } from '@/i18n'
import AppIcon from '@/components/AppIcon.vue'
import ShareButton from '@/components/ShareButton.vue'
import TopBar from '@/components/TopBar.vue'

const { t, locale } = useI18n()
const router = useRouter()
const auth = useAuth()

const appVersion = __APP_VERSION__
const toast = useToast()
const initial = computed(() => (auth.profile.value?.display_name?.trim()[0] ?? '?').toUpperCase())

function onLocale(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (isSupportedLocale(value)) setLocale(value)
}

// Notification kinds (server-side preference) and haptics (this device only).
const NOTIFICATION_KINDS: NotificationKind[] = ['membership_requested', 'request_approved', 'request_rejected', 'member_joined', 'item_added', 'item_wanted']
const mutedKinds = computed(() => new Set(auth.profile.value?.muted_kinds ?? []))
const savingKinds = ref(false)
const kindsError = ref<string | null>(null)
async function setKind(kind: NotificationKind, enabled: boolean) {
  const uid = auth.user.value?.id
  if (!uid) return
  const next = new Set(mutedKinds.value)
  if (enabled) next.delete(kind)
  else next.add(kind)
  savingKinds.value = true
  kindsError.value = null
  try {
    const { error } = await supabase.from('profiles').update({ muted_kinds: [...next] }).eq('id', uid)
    if (error) throw error
    await auth.refreshProfile()
    toast.show(t('toast.saved'), { emoji: '✅' })
  } catch (err) {
    kindsError.value = errorKey(err)
  } finally {
    savingKinds.value = false
  }
}
const haptics = useHaptics()

const entitlements = ref<Entitlements | null>(null)
onMounted(async () => {
  const { data } = await supabase.rpc('my_entitlements')
  entitlements.value = data?.[0] ?? null
})
const exporting = ref(false)
const exportError = ref<string | null>(null)
async function exportData() {
  exporting.value = true
  exportError.value = null
  try {
    const blob = await invokeFunction<Blob>('export-account', {})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'dklothes-export.zip'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  } catch (err) {
    exportError.value = errorKey(err)
  } finally {
    exporting.value = false
  }
}

const showDelete = ref(false)
const confirmWord = ref('')
const deleting = ref(false)
const deleteError = ref<string | null>(null)
const ownedGroups = ref<{ id: string; name: string }[]>([])
const deleteReady = computed(() => confirmWord.value.trim() === t('account.deleteConfirmWord'))

async function deleteAccount() {
  deleting.value = true
  deleteError.value = null
  ownedGroups.value = []
  try {
    await invokeFunction('delete-account', { confirm: 'DELETE' })
    await auth.signOut()
    await router.replace({ name: 'signin' })
    window.alert(t('account.deleted'))
  } catch (err) {
    if (err instanceof FunctionError && err.code === 'owns_groups') {
      ownedGroups.value = (err.payload.groups as { id: string; name: string }[]) ?? []
      deleteError.value = 'account.deleteOwnerWarning'
    } else if (err instanceof FunctionError && err.code === 'recent_login_required') {
      deleteError.value = 'account.recentLoginRequired'
    } else {
      deleteError.value = errorKey(err)
    }
  } finally {
    deleting.value = false
  }
}

async function signOut() {
  await auth.signOut()
  await router.replace({ name: 'signin' })
}
</script>

<template>
  <div class="screen-scroll">
    <TopBar :title="t('account.title')" />
    <div class="screen-body pb-10">
      <!-- Profile -->
      <section class="card flex items-center gap-4" aria-labelledby="profile-title">
        <span class="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-2xl font-bold text-white" aria-hidden="true">{{ initial }}</span>
        <div class="min-w-0">
          <h2 id="profile-title" class="truncate text-lg font-bold">{{ auth.profile.value?.display_name }}</h2>
          <p class="truncate text-sm text-stone-500">{{ auth.user.value?.email }}</p>
          <p class="mt-0.5 text-xs text-stone-400">{{ t('account.displayNameFixed') }}</p>
        </div>
      </section>

      <!-- Preferences -->
      <h2 id="prefs-title" class="section-title">{{ t('account.preferences') }}</h2>
      <section class="list-group" aria-labelledby="prefs-title">
        <label class="list-row cursor-pointer">
          <AppIcon name="globe" size="20" class="text-stone-500" />
          <span class="flex-1">{{ t('account.language') }}</span>
          <select class="input min-h-10 w-auto rounded-xl py-1 text-sm" :value="locale" @change="onLocale">
            <option v-for="code in SUPPORTED_LOCALES" :key="code" :value="code">{{ t(`language.${code}`) }}</option>
          </select>
        </label>
        <label class="list-row cursor-pointer">
          <AppIcon name="vibrate" size="20" class="text-stone-500" />
          <span class="min-w-0 flex-1">
            <span class="block">{{ t('account.haptics') }}</span>
            <span class="block text-xs text-stone-500">{{ haptics.supported ? t('account.hapticsHint') : t('account.hapticsUnsupported') }}</span>
          </span>
          <input type="checkbox" class="toggle" :checked="haptics.enabled.value" :disabled="!haptics.supported" @change="haptics.set(($event.target as HTMLInputElement).checked)" />
        </label>
      </section>

      <!-- Notifications -->
      <h2 id="notif-title" class="section-title">{{ t('account.notifications') }}</h2>
      <section class="list-group" aria-labelledby="notif-title">
        <p class="px-4 pt-3 text-xs text-stone-500">{{ t('account.notificationsBody') }}</p>
        <label v-for="kind in NOTIFICATION_KINDS" :key="kind" class="list-row cursor-pointer text-sm">
          <span class="flex-1">{{ t(`account.notificationKind.${kind}`) }}</span>
          <input type="checkbox" class="toggle" :checked="!mutedKinds.has(kind)" :disabled="savingKinds" @change="setKind(kind, ($event.target as HTMLInputElement).checked)" />
        </label>
        <p v-if="kindsError" class="alert-error m-3" role="alert">{{ t(kindsError) }}</p>
        <p class="px-4 py-3 text-xs text-stone-500">{{ t('account.notificationsGroupHint') }}</p>
      </section>

      <!-- Share & about -->
      <h2 id="about-title" class="section-title">{{ t('account.about') }}</h2>
      <section class="list-group" aria-labelledby="about-title">
        <p class="px-4 pt-3 text-sm text-stone-600">{{ t('account.aboutBody') }}</p>
        <div class="flex gap-2 px-4 py-3">
          <RouterLink :to="{ name: 'welcome' }" class="btn-secondary btn-sm flex-1"><AppIcon name="info" size="16" /> {{ t('account.openWelcome') }}</RouterLink>
          <ShareButton class="flex-1" compact />
        </div>
      </section>

      <!-- Plan -->
      <template v-if="entitlements">
        <h2 id="plan-title" class="section-title">{{ t('account.plan') }}</h2>
        <section class="list-group" aria-labelledby="plan-title">
          <div class="flex items-center justify-between gap-3 px-4 py-3">
            <p class="text-sm text-stone-600">
              {{
                entitlements.tier === 'premium'
                  ? t('account.planPremiumHint', { note: auth.profile.value?.tier_note ? ` (${auth.profile.value.tier_note})` : '' })
                  : t('account.planFreeHint')
              }}
            </p>
            <span class="pill shrink-0" :class="entitlements.tier === 'premium' ? 'bg-amber-100 text-amber-900' : 'bg-stone-100 text-stone-700'">
              {{ entitlements.tier === 'premium' ? t('account.planPremium') : t('account.planFree') }}
            </span>
          </div>
          <ul class="divide-y divide-stone-100 text-sm text-stone-700">
            <li class="px-4 py-2.5">{{ t('account.planGroups', { used: entitlements.owned_groups, limit: entitlements.owned_groups_limit }) }}</li>
            <li class="px-4 py-2.5">{{ t('account.planPhotos', { used: entitlements.photos, limit: entitlements.photos_limit }) }}</li>
            <li class="px-4 py-2.5">{{ t('account.planMembers', { limit: entitlements.group_members_limit }) }}</li>
            <li class="px-4 py-2.5">{{ t('account.planInvitations', { limit: entitlements.active_invitations_limit }) }}</li>
          </ul>
        </section>
      </template>

      <!-- Data -->
      <h2 id="data-title" class="section-title">{{ t('account.data') }}</h2>
      <section class="list-group" aria-labelledby="data-title">
        <p class="px-4 pt-3 text-xs text-stone-500">{{ t('account.retention') }}</p>
        <button type="button" class="list-row hover:bg-stone-50" :disabled="exporting" @click="exportData">
          <AppIcon name="download" size="20" class="text-stone-500" />
          <span class="min-w-0 flex-1">
            <span class="block">{{ exporting ? t('account.exporting') : t('account.exportTitle') }}</span>
            <span class="block text-xs text-stone-500">{{ t('account.exportBody') }}</span>
          </span>
          <AppIcon name="chevron-right" size="18" class="text-stone-400" />
        </button>
        <p v-if="exportError" class="alert-error m-3" role="alert">{{ t(exportError) }}</p>
        <button type="button" class="list-row text-red-700 hover:bg-red-50" @click="showDelete = !showDelete">
          <AppIcon name="trash" size="20" />
          <span class="flex-1">{{ t('account.deleteTitle') }}</span>
          <AppIcon :name="showDelete ? 'chevron-down' : 'chevron-right'" size="18" class="text-stone-400" />
        </button>
        <div v-if="showDelete" class="flex flex-col gap-3 bg-red-50/60 px-4 py-3">
          <p class="text-sm text-stone-600">{{ t('account.deleteBody') }}</p>
          <div v-if="deleteError" class="alert-error" role="alert">
            <p>{{ t(deleteError) }}</p>
            <ul v-if="ownedGroups.length" class="mt-1 list-inside list-disc">
              <li v-for="g in ownedGroups" :key="g.id">
                <RouterLink :to="{ name: 'group-settings', params: { groupId: g.id } }" class="underline">{{ g.name }}</RouterLink>
              </li>
            </ul>
          </div>
          <div>
            <label for="confirm-delete" class="label">{{ t('account.deleteConfirmLabel') }}</label>
            <input id="confirm-delete" v-model="confirmWord" type="text" class="input" autocomplete="off" />
          </div>
          <button type="button" class="btn-danger" :disabled="!deleteReady || deleting" @click="deleteAccount">
            {{ deleting ? t('account.deleting') : t('account.deleteButton') }}
          </button>
        </div>
      </section>

      <button type="button" class="btn-secondary mt-6 w-full text-red-700" @click="signOut"><AppIcon name="logout" size="20" /> {{ t('account.signOut') }}</button>
      <p class="mt-4 text-center text-xs text-stone-400">{{ t('app.version', { version: appVersion }) }}</p>
    </div>
  </div>
</template>
