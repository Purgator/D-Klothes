<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { isValidTokenFormat } from '@/lib/invitations'
import { errorKey } from '@/lib/errors'
import { useAuth } from '@/composables/useAuth'

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
  <section class="mx-auto mt-6 max-w-md">
    <h1 class="mb-4 text-2xl font-semibold">{{ t('invite.title') }}</h1>
    <p v-if="checking" role="status" class="text-stone-500">{{ t('invite.loading') }}</p>
    <p v-else-if="!valid" class="alert-error" role="alert">{{ t('invite.invalid') }}</p>
    <div v-else class="card flex flex-col gap-4">
      <p>{{ t('invite.validIntro', { group: groupName ?? '' }) }}</p>

      <div v-if="sent" class="alert-info" role="status">
        <p>{{ t('invite.sent') }}</p>
        <RouterLink :to="{ name: 'home' }" class="btn-primary mt-3">{{ t('nav.home') }}</RouterLink>
      </div>

      <template v-else-if="!auth.isSignedIn.value">
        <p class="text-sm text-stone-600">{{ t('invite.signInToContinue') }}</p>
        <RouterLink :to="{ name: 'signin', query: { redirect: route.fullPath } }" class="btn-primary">{{ t('nav.signIn') }}</RouterLink>
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
        <button type="submit" class="btn-primary self-start" :disabled="sending">{{ sending ? t('invite.sending') : t('invite.send') }}</button>
      </form>
    </div>
  </section>
</template>
