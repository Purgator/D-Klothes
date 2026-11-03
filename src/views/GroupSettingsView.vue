<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { invokeFunction, supabase } from '@/lib/supabase'
import { errorKey } from '@/lib/errors'
import { buildInviteUrl, invitationState } from '@/lib/invitations'
import { useAuth } from '@/composables/useAuth'
import { useGroupFeed } from '@/composables/useGroupFeed'
import { useNotifications } from '@/composables/useNotifications'
import PageTitle from '@/components/PageTitle.vue'
import type { Invitation, MembershipRequest } from '@/types/database'

const { t, d } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuth()

const groupId = computed(() => String(route.params.groupId))
const userId = computed(() => auth.user.value?.id ?? null)
const feed = useGroupFeed(groupId, userId)

const error = ref<string | null>(null)
const busy = ref(false)

async function run(action: () => Promise<void>) {
  busy.value = true
  error.value = null
  try {
    await action()
  } catch (err) {
    error.value = errorKey(err)
  } finally {
    busy.value = false
  }
}

// --- Rename ----------------------------------------------------------------
const name = ref('')
watch(
  () => feed.group.value?.name,
  (v) => (name.value = v ?? ''),
  { immediate: true },
)
const rename = () =>
  run(async () => {
    const { error: e } = await supabase.from('groups').update({ name: name.value.trim() }).eq('id', groupId.value)
    if (e) throw e
    await feed.load()
  })

// --- Upload policy (owner) -----------------------------------------------------
const membersCanUpload = ref(true)
watch(
  () => feed.group.value?.members_can_upload,
  (v) => (membersCanUpload.value = v ?? true),
  { immediate: true },
)
const saveUploadPolicy = (value: boolean) =>
  run(async () => {
    membersCanUpload.value = value
    const { error: e } = await supabase.from('groups').update({ members_can_upload: value }).eq('id', groupId.value)
    if (e) throw e
    await feed.load()
  })

// --- Invitations -------------------------------------------------------------
const invitations = ref<Invitation[]>([])
const newInvite = ref<{ url: string; expires_at: string } | null>(null)
const copied = ref(false)
async function loadInvitations() {
  if (!feed.isOwner.value) return
  const { data } = await supabase.from('invitations').select('*').eq('group_id', groupId.value).order('created_at', { ascending: false })
  invitations.value = data ?? []
}
const createInvitation = () =>
  run(async () => {
    const { data, error: e } = await supabase.rpc('create_invitation', { p_group_id: groupId.value })
    if (e) throw e
    const row = data?.[0]
    if (!row) throw new Error('unknown')
    newInvite.value = { url: buildInviteUrl(row.token), expires_at: row.expires_at }
    copied.value = false
    await loadInvitations()
  })
async function copyInvite() {
  if (!newInvite.value) return
  try {
    await navigator.clipboard.writeText(newInvite.value.url)
    copied.value = true
  } catch {
    copied.value = false
  }
}
const revoke = (id: string) =>
  run(async () => {
    const { error: e } = await supabase.rpc('revoke_invitation', { p_invitation_id: id })
    if (e) throw e
    await loadInvitations()
  })

// --- Requests --------------------------------------------------------------
type RequestRow = MembershipRequest & { profile: { display_name: string } | null }
const allRequests = ref<RequestRow[]>([])
const requests = computed(() => allRequests.value.filter((r) => r.status === 'pending'))
const reviewedRequests = computed(() => allRequests.value.filter((r) => r.status !== 'pending'))
async function loadRequests() {
  if (!feed.isOwner.value) return
  const { data } = await supabase
    .from('membership_requests')
    // Two foreign keys point at profiles (applicant, reviewer): name the applicant one.
    .select('*, profile:profiles!membership_requests_user_id_fkey(display_name)')
    .eq('group_id', groupId.value)
    .order('created_at', { ascending: false })
  allRequests.value = (data ?? []) as unknown as RequestRow[]
}
// Refresh when a notification arrives (someone applied while the page is open).
const notifications = useNotifications()
watch(() => notifications.items.value, () => void loadRequests())
const review = (id: string, approve: boolean) =>
  run(async () => {
    const { error: e } = await supabase.rpc('review_membership_request', { p_request_id: id, p_approve: approve })
    if (e) throw e
    await Promise.all([loadRequests(), feed.load()])
  })

watch(() => feed.isOwner.value, () => void Promise.all([loadInvitations(), loadRequests()]), { immediate: true })

// --- Capacity (depends on the owner's plan) --------------------------------------
const memberLimit = ref<number | null>(null)
watch(
  () => feed.group.value?.id,
  async (id) => {
    if (!id) return
    const { data } = await supabase.rpc('group_member_limit', { p_group_id: id })
    memberLimit.value = typeof data === 'number' ? data : null
  },
  { immediate: true },
)

// --- Members -----------------------------------------------------------------
const removeMember = (memberId: string, memberName: string) =>
  run(async () => {
    if (!window.confirm(t('settings.removeConfirm', { name: memberName }))) return
    const { error: e } = await supabase.from('group_members').delete().eq('group_id', groupId.value).eq('user_id', memberId)
    if (e) throw e
    await feed.load()
  })
const leave = () =>
  run(async () => {
    if (!userId.value || !window.confirm(t('settings.leaveConfirm'))) return
    const { error: e } = await supabase.from('group_members').delete().eq('group_id', groupId.value).eq('user_id', userId.value)
    if (e) throw e
    await router.replace({ name: 'home' })
  })

// --- Ownership transfer --------------------------------------------------------
const transferTarget = ref('')
const otherMembers = computed(() => feed.members.value.filter((m) => m.user_id !== userId.value))
const transfer = () =>
  run(async () => {
    const target = otherMembers.value.find((m) => m.user_id === transferTarget.value)
    if (!target) return
    if (!window.confirm(t('settings.transferConfirm', { name: target.profile?.display_name ?? '?' }))) return
    const { error: e } = await supabase.rpc('transfer_group_ownership', { p_group_id: groupId.value, p_new_owner: target.user_id })
    if (e) throw e
    transferTarget.value = ''
    await feed.load()
  })

// --- Delete group --------------------------------------------------------------
const confirmName = ref('')
const deleteGroup = () =>
  run(async () => {
    await invokeFunction('delete-group', { group_id: groupId.value, confirm_name: confirmName.value })
    await router.replace({ name: 'home' })
  })
</script>

<template>
  <section>
    <PageTitle :title="t('settings.title')" :back-to="{ name: 'group', params: { groupId } }" :back-label="t('group.feed')" />
    <p v-if="feed.loading.value" role="status" class="text-stone-500">{{ t('app.loading') }}</p>
    <p v-else-if="feed.notMember.value" class="alert-error" role="alert">{{ t('group.notMember') }}</p>
    <div v-else-if="feed.group.value" class="flex flex-col gap-6">
      <p v-if="error" class="alert-error" role="alert">{{ t(error) }}</p>

      <!-- Rename (owner) -->
      <form v-if="feed.isOwner.value" class="card flex flex-col gap-2" @submit.prevent="rename">
        <label for="rename" class="label">{{ t('settings.rename') }}</label>
        <div class="flex gap-2">
          <input id="rename" v-model="name" type="text" maxlength="80" required class="input" />
          <button type="submit" class="btn-primary" :disabled="busy || !name.trim() || name.trim() === feed.group.value.name">{{ t('app.save') }}</button>
        </div>
      </form>

      <!-- Upload policy (owner) -->
      <fieldset v-if="feed.isOwner.value" class="card flex flex-col gap-2" :disabled="busy">
        <legend class="label">{{ t('group.uploadPolicy') }}</legend>
        <label class="flex items-center gap-2 text-sm">
          <input type="radio" name="settings-upload-policy" :checked="membersCanUpload" @change="saveUploadPolicy(true)" />
          {{ t('group.uploadPolicyEveryone') }}
        </label>
        <label class="flex items-center gap-2 text-sm">
          <input type="radio" name="settings-upload-policy" :checked="!membersCanUpload" @change="saveUploadPolicy(false)" />
          {{ t('group.uploadPolicyOwner') }}
        </label>
      </fieldset>
      <p v-else-if="!feed.canUpload.value" class="text-sm text-stone-500">{{ t('group.uploadOwnerOnly') }}</p>

      <!-- Members -->
      <section class="card" aria-labelledby="members-title">
        <div class="mb-2 flex items-baseline justify-between gap-2">
          <h2 id="members-title" class="text-lg font-medium">{{ t('settings.members') }}</h2>
          <span v-if="memberLimit" class="text-xs text-stone-500">
            {{ t('settings.memberCapacity', { count: feed.members.value.length, limit: memberLimit }, feed.members.value.length) }}
          </span>
        </div>
        <ul class="divide-y divide-stone-100">
          <li v-for="m in feed.members.value" :key="m.user_id" class="flex items-center justify-between gap-2 py-2 text-sm">
            <span>
              {{ m.profile?.display_name ?? '?' }}
              <span v-if="m.user_id === userId" class="text-stone-400">({{ t('group.you') }})</span>
              <span class="ml-1 text-xs text-stone-400">{{ t('settings.joinedOn', { date: d(new Date(m.joined_at), 'short') }) }}</span>
              <span v-if="m.role === 'owner'" class="ml-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-800">{{ t('home.ownerBadge') }}</span>
            </span>
            <button
              v-if="feed.isOwner.value && m.role === 'member'"
              type="button"
              class="btn-danger min-h-9 px-3 py-1"
              :disabled="busy"
              @click="removeMember(m.user_id, m.profile?.display_name ?? '?')"
            >
              {{ t('settings.remove') }}
            </button>
          </li>
        </ul>
        <div class="mt-3">
          <button v-if="!feed.isOwner.value" type="button" class="btn-danger" :disabled="busy" @click="leave">{{ t('settings.leave') }}</button>
          <p v-else class="text-xs text-stone-500">{{ t('settings.ownerCannotLeave') }}</p>
        </div>
      </section>

      <template v-if="feed.isOwner.value">
        <!-- Requests -->
        <section class="card" aria-labelledby="requests-title">
          <h2 id="requests-title" class="mb-2 text-lg font-medium">{{ t('settings.requests') }}</h2>
          <p v-if="!requests.length" class="text-sm text-stone-500">{{ t('settings.noRequests') }}</p>
          <ul v-else class="flex flex-col gap-3">
            <li v-for="req in requests" :key="req.id" class="rounded-lg border border-stone-200 p-3 text-sm">
              <p class="font-medium">{{ t('settings.requestFrom', { name: req.profile?.display_name ?? '?' }) }}</p>
              <p class="mt-1 whitespace-pre-wrap text-stone-700">{{ req.message || t('settings.requestMessageEmpty') }}</p>
              <p class="mt-1 text-xs text-stone-400">{{ d(new Date(req.created_at), 'long') }}</p>
              <div class="mt-2 flex gap-2">
                <button type="button" class="btn-primary" :disabled="busy" @click="review(req.id, true)">{{ t('settings.approve') }}</button>
                <button type="button" class="btn-secondary" :disabled="busy" @click="review(req.id, false)">{{ t('settings.reject') }}</button>
              </div>
            </li>
          </ul>
          <details v-if="reviewedRequests.length" class="mt-3">
            <summary class="cursor-pointer text-sm text-stone-600">{{ t('settings.requestHistory', { count: reviewedRequests.length }, reviewedRequests.length) }}</summary>
            <ul class="mt-2 divide-y divide-stone-100 text-sm">
              <li v-for="req in reviewedRequests" :key="req.id" class="flex items-center justify-between gap-2 py-2">
                <span>
                  {{ req.profile?.display_name ?? '?' }}
                  <span class="text-xs text-stone-400">· {{ d(new Date(req.reviewed_at ?? req.created_at), 'short') }}</span>
                </span>
                <span
                  class="rounded-full px-2 py-0.5 text-xs"
                  :class="req.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'"
                >
                  {{ t(`settings.requestStatus.${req.status}`) }}
                </span>
              </li>
            </ul>
          </details>
        </section>

        <!-- Invitations -->
        <section class="card" aria-labelledby="invitations-title">
          <h2 id="invitations-title" class="mb-1 text-lg font-medium">{{ t('settings.invitations') }}</h2>
          <p class="mb-3 text-sm text-stone-600">{{ t('settings.invitationsHelp') }}</p>
          <div v-if="newInvite" class="alert-info mb-3 flex flex-col gap-2" role="status">
            <p class="font-medium">{{ t('settings.newInviteTitle') }}</p>
            <p>{{ t('settings.newInviteBody', { date: d(new Date(newInvite.expires_at), 'long') }) }}</p>
            <div class="flex flex-col gap-2 sm:flex-row">
              <input type="text" readonly class="input font-mono text-xs" :value="newInvite.url" :aria-label="t('settings.newInviteTitle')" @focus="($event.target as HTMLInputElement).select()" />
              <button type="button" class="btn-secondary" @click="copyInvite">{{ copied ? t('app.copied') : t('app.copy') }}</button>
            </div>
          </div>
          <button type="button" class="btn-primary mb-3" :disabled="busy" @click="createInvitation">{{ t('settings.createInvitation') }}</button>
          <p v-if="!invitations.length" class="text-sm text-stone-500">{{ t('settings.noInvitations') }}</p>
          <ul v-else class="divide-y divide-stone-100 text-sm">
            <li v-for="inv in invitations" :key="inv.id" class="flex items-center justify-between gap-2 py-2">
              <span>
                <span
                  class="mr-2 rounded-full px-2 py-0.5 text-xs"
                  :class="invitationState(inv) === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'"
                >
                  {{ t(`settings.inviteState.${invitationState(inv)}`) }}
                </span>
                <span class="text-xs text-stone-500">
                  {{ t('settings.inviteCreated', { date: d(new Date(inv.created_at), 'short') }) }} ·
                  {{ t('settings.inviteExpires', { date: d(new Date(inv.expires_at), 'long') }) }}
                </span>
              </span>
              <button v-if="invitationState(inv) === 'active'" type="button" class="btn-secondary min-h-9 px-3 py-1" :disabled="busy" @click="revoke(inv.id)">
                {{ t('settings.revoke') }}
              </button>
            </li>
          </ul>
        </section>

        <!-- Transfer ownership -->
        <section v-if="otherMembers.length" class="card" aria-labelledby="transfer-title">
          <h2 id="transfer-title" class="mb-2 text-lg font-medium">{{ t('settings.transfer') }}</h2>
          <form class="flex flex-col gap-2 sm:flex-row" @submit.prevent="transfer">
            <label for="transfer-to" class="sr-only">{{ t('settings.transferTo') }}</label>
            <select id="transfer-to" v-model="transferTarget" class="input" required>
              <option value="" disabled>{{ t('settings.transferTo') }}</option>
              <option v-for="m in otherMembers" :key="m.user_id" :value="m.user_id">{{ m.profile?.display_name ?? '?' }}</option>
            </select>
            <button type="submit" class="btn-secondary" :disabled="busy || !transferTarget">{{ t('settings.transferButton') }}</button>
          </form>
        </section>

        <!-- Delete group -->
        <section class="card border-red-200" aria-labelledby="danger-title">
          <h2 id="danger-title" class="mb-1 text-lg font-medium text-red-800">{{ t('settings.deleteGroup') }}</h2>
          <p class="mb-3 text-sm text-stone-600">{{ t('settings.deleteGroupBody') }}</p>
          <form class="flex flex-col gap-2 sm:flex-row" @submit.prevent="deleteGroup">
            <label for="confirm-name" class="sr-only">{{ t('settings.deleteGroupConfirmLabel') }}</label>
            <input id="confirm-name" v-model="confirmName" type="text" class="input" :placeholder="feed.group.value.name" autocomplete="off" />
            <button type="submit" class="btn-danger" :disabled="busy || confirmName.trim() !== feed.group.value.name">{{ t('settings.deleteGroupButton') }}</button>
          </form>
        </section>
      </template>
      <p v-else class="text-sm text-stone-500">{{ t('settings.ownerOnly') }}</p>
    </div>
  </section>
</template>
