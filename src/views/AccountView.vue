<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { FunctionError, invokeFunction, supabase } from '@/lib/supabase'
import type { Entitlements } from '@/types/database'
import { errorKey } from '@/lib/errors'
import { useAuth } from '@/composables/useAuth'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import PageTitle from '@/components/PageTitle.vue'

const { t } = useI18n()
const router = useRouter()
const auth = useAuth()

const appVersion = __APP_VERSION__

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
  <section class="flex flex-col gap-6">
    <PageTitle :title="t('account.title')" :back-to="{ name: 'home' }" :back-label="t('nav.home')" />

    <section class="card flex flex-col gap-2" aria-labelledby="profile-title">
      <h2 id="profile-title" class="text-lg font-medium">{{ t('account.profile') }}</h2>
      <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt class="text-stone-500">{{ t('account.displayName') }}</dt>
        <dd class="font-medium">{{ auth.profile.value?.display_name }}</dd>
        <dt class="text-stone-500">{{ t('account.email') }}</dt>
        <dd>{{ auth.user.value?.email }}</dd>
      </dl>
      <p class="text-xs text-stone-500">{{ t('account.displayNameFixed') }}</p>
    </section>

    <section class="card flex items-center justify-between gap-3">
      <h2 class="text-lg font-medium">{{ t('account.language') }}</h2>
      <LanguageSwitcher />
    </section>

    <section v-if="entitlements" class="card flex flex-col gap-2" aria-labelledby="plan-title">
      <div class="flex items-center justify-between gap-3">
        <h2 id="plan-title" class="text-lg font-medium">{{ t('account.plan') }}</h2>
        <span
          class="rounded-full px-3 py-1 text-sm font-medium"
          :class="entitlements.tier === 'premium' ? 'bg-amber-100 text-amber-900' : 'bg-stone-100 text-stone-700'"
        >
          {{ entitlements.tier === 'premium' ? t('account.planPremium') : t('account.planFree') }}
        </span>
      </div>
      <p class="text-sm text-stone-600">
        {{
          entitlements.tier === 'premium'
            ? t('account.planPremiumHint', { note: auth.profile.value?.tier_note ? ` (${auth.profile.value.tier_note})` : '' })
            : t('account.planFreeHint')
        }}
      </p>
      <ul class="text-sm text-stone-700">
        <li>{{ t('account.planGroups', { used: entitlements.owned_groups, limit: entitlements.owned_groups_limit }) }}</li>
        <li>{{ t('account.planPhotos', { used: entitlements.photos, limit: entitlements.photos_limit }) }}</li>
        <li>{{ t('account.planMembers', { limit: entitlements.group_members_limit }) }}</li>
        <li>{{ t('account.planInvitations', { limit: entitlements.active_invitations_limit }) }}</li>
      </ul>
    </section>

    <section class="card flex flex-col gap-3" aria-labelledby="data-title">
      <h2 id="data-title" class="text-lg font-medium">{{ t('account.data') }}</h2>
      <p class="text-sm text-stone-600">{{ t('account.retention') }}</p>
      <h3 class="font-medium">{{ t('account.exportTitle') }}</h3>
      <p class="text-sm text-stone-600">{{ t('account.exportBody') }}</p>
      <p v-if="exportError" class="alert-error" role="alert">{{ t(exportError) }}</p>
      <button type="button" class="btn-secondary self-start" :disabled="exporting" @click="exportData">
        {{ exporting ? t('account.exporting') : t('account.export') }}
      </button>
    </section>

    <section class="card flex flex-col gap-3 border-red-200" aria-labelledby="delete-title">
      <h2 id="delete-title" class="text-lg font-medium text-red-800">{{ t('account.deleteTitle') }}</h2>
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
      <button type="button" class="btn-danger self-start" :disabled="!deleteReady || deleting" @click="deleteAccount">
        {{ deleting ? t('account.deleting') : t('account.deleteButton') }}
      </button>
    </section>

    <button type="button" class="btn-secondary self-start" @click="signOut">{{ t('account.signOut') }}</button>
    <p class="text-xs text-stone-400">{{ t('app.version', { version: appVersion }) }}</p>
  </section>
</template>
