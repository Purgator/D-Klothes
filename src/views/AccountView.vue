<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { FunctionError, invokeFunction } from '@/lib/supabase'
import { errorKey } from '@/lib/errors'
import { useAuth } from '@/composables/useAuth'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import PageTitle from '@/components/PageTitle.vue'

const { t } = useI18n()
const router = useRouter()
const auth = useAuth()

const displayName = ref(auth.profile.value?.display_name ?? '')
const saving = ref(false)
const saved = ref(false)
const profileError = ref<string | null>(null)

async function saveProfile() {
  saving.value = true
  saved.value = false
  profileError.value = null
  try {
    await auth.saveDisplayName(displayName.value)
    saved.value = true
  } catch (err) {
    profileError.value = errorKey(err)
  } finally {
    saving.value = false
  }
}

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

    <form class="card flex flex-col gap-3" novalidate @submit.prevent="saveProfile">
      <h2 class="text-lg font-medium">{{ t('account.profile') }}</h2>
      <p class="text-sm text-stone-600">{{ t('account.email') }} : {{ auth.user.value?.email }}</p>
      <div>
        <label for="account-name" class="label">{{ t('account.displayName') }}</label>
        <input id="account-name" v-model="displayName" type="text" maxlength="50" required class="input" autocomplete="nickname" />
      </div>
      <p v-if="profileError" class="alert-error" role="alert">{{ t(profileError) }}</p>
      <p v-else-if="saved" class="alert-info" role="status">{{ t('account.saved') }}</p>
      <button type="submit" class="btn-primary self-start" :disabled="saving || !displayName.trim()">{{ t('app.save') }}</button>
    </form>

    <section class="card flex items-center justify-between gap-3">
      <h2 class="text-lg font-medium">{{ t('account.language') }}</h2>
      <LanguageSwitcher />
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
  </section>
</template>
