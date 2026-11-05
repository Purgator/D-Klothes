<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { isValidTokenFormat } from '@/lib/invitations'
import { errorKey } from '@/lib/errors'
import { useAuth } from '@/composables/useAuth'
import AppIcon from '@/components/AppIcon.vue'
import GroupAvatar from '@/components/GroupAvatar.vue'

const { t } = useI18n()
const route = useRoute()
const auth = useAuth()

const token = computed(() => String(route.params.token ?? ''))
const checking = ref(true)
const valid = ref(false)
const groupName = ref<string | null>(null)
const message = ref('')
const sending = ref(false)
const sent = ref(false)
const error = ref<string | null>(null)

onMounted(async () => {
  if (!isValidTokenFormat(token.value)) {
    checking.value = false
    return
  }
  const { data, error: e } = await supabase.rpc('invitation_preview', { p_token: token.value })
  checking.value = false
  if (e || !data?.[0]) return
  valid.value = data[0].valid
  groupName.value = data[0].group_name
  await auth.whenReady()
  // Remember where to come back after sign-in and onboarding, even if the magic link
  // opens in another tab.
  if (valid.value && !auth.hasProfile.value) auth.rememberRedirect(route.fullPath)
})

async function send() {
  sending.value = true
  error.value = null
  try {
    const { error: e } = await supabase.rpc('redeem_invitation', { p_token: token.value, p_message: message.value.trim() })
    if (e) {
      if (e.message.includes('already a member')) throw Object.assign(new Error(), { code: 'ALREADY_MEMBER' })
      if (e.message.includes('already pending')) throw Object.assign(new Error(), { code: 'ALREADY_PENDING' })
      throw e
    }
    sent.value = true
  } catch (err) {
    const code = (err as { code?: string }).code
    error.value = code === 'ALREADY_MEMBER' ? 'invite.alreadyMember' : code === 'ALREADY_PENDING' ? 'invite.alreadyPending' : errorKey(err)
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="screen-scroll brand-gradient flex flex-col">
    <div class="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-end px-6 pb-8 pt-safe text-center text-white">
      <GroupAvatar v-if="valid && groupName" :name="groupName" size="lg" class="mt-10 ring-4 ring-white/30" />
      <span v-else class="mt-10 inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-white/15" aria-hidden="true"><AppIcon name="mail" size="32" /></span>
      <h1 class="mt-4 text-3xl font-black tracking-tight">{{ t('invite.title') }}</h1>
      <p v-if="valid" class="mt-2 max-w-sm text-sm text-white/85">{{ t('invite.validIntro', { group: groupName ?? '' }) }}</p>
    </div>

    <div class="mx-auto w-full max-w-lg rounded-t-4xl bg-white px-6 pb-safe pt-6 shadow-2xl">
      <div class="flex flex-col gap-4 pb-6">
        <p v-if="checking" role="status" class="text-center text-stone-500">{{ t('invite.loading') }}</p>
        <p v-else-if="!valid" class="alert-error" role="alert">{{ t('invite.invalid') }}</p>

        <div v-else-if="sent" class="flex flex-col gap-3" role="status">
          <p class="alert-info">{{ t('invite.sent') }}</p>
          <RouterLink :to="{ name: 'home' }" class="btn-primary">{{ t('welcome.openApp') }}</RouterLink>
        </div>

        <template v-else-if="!auth.isSignedIn.value">
          <p class="text-sm text-stone-600">{{ t('invite.signInToContinue') }}</p>
          <RouterLink :to="{ name: 'signin', query: { redirect: route.fullPath } }" class="btn-primary"><AppIcon name="log-in" size="20" /> {{ t('nav.signIn') }}</RouterLink>
        </template>

        <template v-else-if="!auth.hasProfile.value">
          <RouterLink :to="{ name: 'onboarding', query: { redirect: route.fullPath } }" class="btn-primary">{{ t('onboarding.continue') }}</RouterLink>
        </template>

        <form v-else class="flex flex-col gap-3" @submit.prevent="send">
          <div>
            <label for="message" class="label">{{ t('invite.message') }}</label>
            <textarea id="message" v-model="message" rows="3" maxlength="280" class="input" :placeholder="t('invite.messagePlaceholder')" aria-describedby="message-help"></textarea>
            <p id="message-help" class="help">{{ t('invite.messageHelp') }} ({{ message.length }}/280)</p>
          </div>
          <p v-if="error" class="alert-error" role="alert">{{ t(error) }}</p>
          <button type="submit" class="btn-primary" :disabled="sending"><AppIcon name="send" size="20" /> {{ sending ? t('invite.sending') : t('invite.send') }}</button>
        </form>
      </div>
    </div>
  </div>
</template>
