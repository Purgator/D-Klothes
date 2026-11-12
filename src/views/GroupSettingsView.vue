<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { invokeFunction, supabase } from '@/lib/supabase'
import { errorKey } from '@/lib/errors'
import { buildInviteUrl, invitationState } from '@/lib/invitations'
import { shareLink } from '@/lib/share'
import { useAuth } from '@/composables/useAuth'
import { useGroupFeed } from '@/composables/useGroupFeed'
import { useGroupsOverview } from '@/composables/useGroupsOverview'
import { useNotifications } from '@/composables/useNotifications'
import { useToast } from '@/composables/useToast'
import AppIcon from '@/components/AppIcon.vue'
import TopBar from '@/components/TopBar.vue'
import type { Invitation, MembershipRequest } from '@/types/database'

const { t, d } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuth()
const toast = useToast()
const overview = useGroupsOverview()

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
    await Promise.all([feed.load(), overview.load()])
    toast.show(t('toast.saved'), { emoji: '✅' })
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
    toast.show(t('toast.saved'), { emoji: '✅' })
  })

// --- Mute (any member, for themselves) -----------------------------------------------
const muted = ref(false)
async function loadMuted() {
  const { data } = await supabase.rpc('my_group_mute', { p_group_id: groupId.value })
  muted.value = data === true
}
watch(groupId, loadMuted, { immediate: true })
const setMuted = (value: boolean) =>
  run(async () => {
    if (!userId.value) return
    const { error: e } = await supabase.from('group_members').update({ muted: value }).eq('group_id', groupId.value).eq('user_id', userId.value)
    if (e) throw e
    await loadMuted()
    toast.show(value ? t('settings.mutedOn') : t('settings.mutedOff'), { emoji: value ? '🔕' : '🔔', tone: 'info' })
  })

// --- Invitations -------------------------------------------------------------
const invitations = ref<Invitation[]>([])
const newInvite = ref<{ url: string; expires_at: string } | null>(null)
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
    await loadInvitations()
  })
async function shareInvite() {
  if (!newInvite.value) return
  const outcome = await shareLink({ title: t('app.name'), text: t('settings.inviteShareText', { group: feed.group.value?.name ?? '' }), url: newInvite.value.url })
  if (outcome === 'copied') toast.show(t('toast.linkCopied'), { emoji: '🔗' })
}
async function copyInvite() {
  if (!newInvite.value) return
  try {
    await navigator.clipboard.writeText(newInvite.value.url)
    toast.show(t('toast.linkCopied'), { emoji: '🔗' })
  } catch {
    // The field below stays selectable.
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
    await Promise.all([loadRequests(), feed.load(), overview.load()])
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
    void overview.load()
    await router.replace({ name: 'groups' })
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
    await Promise.all([feed.load(), overview.load()])
  })

// --- Delete group --------------------------------------------------------------
const confirmName = ref('')
const deleteGroup = () =>
  run(async () => {
    await invokeFunction('delete-group', { group_id: groupId.value, confirm_name: confirmName.value })
    void overview.load()
    await router.replace({ name: 'groups' })
  })
</script>

<template>
  <div class="screen-scroll">
    <TopBar :title="t('settings.title')" :back="{ name: 'group', params: { groupId } }" />
    <div class="screen-body pb-10">
      <p v-if="feed.loading.value" role="status" class="text-stone-500">{{ t('app.loading') }}</p>
      <p v-else-if="feed.notMember.value" class="alert-error" role="alert">{{ t('group.notMember') }}</p>
      <div v-else-if="feed.group.value" class="flex flex-col">
        <p v-if="error" class="alert-error mb-4" role="alert">{{ t(error) }}</p>

        <!-- Requests (owner), first: it is the thing that needs action -->
        <template v-if="feed.isOwner.value">
          <h2 id="requests-title" class="section-title mt-2">{{ t('settings.requests') }}</h2>
          <section class="list-group" aria-labelledby="requests-title">
            <p v-if="!requests.length" class="list-row text-sm text-stone-500">{{ t('settings.noRequests') }}</p>
            <div v-for="req in requests" :key="req.id" class="flex flex-col gap-2 px-4 py-3 text-sm">
              <p class="font-semibold">{{ t('settings.requestFrom', { name: req.profile?.display_name ?? '?' }) }}</p>
              <p class="whitespace-pre-wrap rounded-2xl bg-stone-50 px-3 py-2 text-stone-700">{{ req.message || t('settings.requestMessageEmpty') }}</p>
              <p class="text-xs text-stone-400">{{ d(new Date(req.created_at), 'long') }}</p>
              <div class="flex gap-2">
                <button type="button" class="btn-primary btn-sm flex-1" :disabled="busy" @click="review(req.id, true)"><AppIcon name="check" size="16" /> {{ t('settings.approve') }}</button>
                <button type="button" class="btn-secondary btn-sm flex-1" :disabled="busy" @click="review(req.id, false)"><AppIcon name="x" size="16" /> {{ t('settings.reject') }}</button>
              </div>
            </div>
            <details v-if="reviewedRequests.length" class="px-4 py-3">
              <summary class="cursor-pointer text-sm text-stone-600">{{ t('settings.requestHistory', { count: reviewedRequests.length }, reviewedRequests.length) }}</summary>
              <ul class="mt-2 divide-y divide-stone-100 text-sm">
                <li v-for="req in reviewedRequests" :key="req.id" class="flex items-center justify-between gap-2 py-2">
                  <span>
                    {{ req.profile?.display_name ?? '?' }}
                    <span class="text-xs text-stone-400">· {{ d(new Date(req.reviewed_at ?? req.created_at), 'short') }}</span>
                  </span>
                  <span class="pill" :class="req.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'">
                    {{ t(`settings.requestStatus.${req.status}`) }}
                  </span>
                </li>
              </ul>
            </details>
          </section>

          <!-- Invitations -->
          <h2 id="invitations-title" class="section-title">{{ t('settings.invitations') }}</h2>
          <section class="list-group" aria-labelledby="invitations-title">
            <div class="flex flex-col gap-3 px-4 py-3">
              <p class="text-sm text-stone-600">{{ t('settings.invitationsHelp') }}</p>
              <div v-if="newInvite" class="alert-info flex flex-col gap-2" role="status">
                <p class="font-semibold">{{ t('settings.newInviteTitle') }}</p>
                <p>{{ t('settings.newInviteBody', { date: d(new Date(newInvite.expires_at), 'long') }) }}</p>
                <input type="text" readonly class="input font-mono text-xs" :value="newInvite.url" :aria-label="t('settings.newInviteTitle')" @focus="($event.target as HTMLInputElement).select()" />
                <div class="flex gap-2">
                  <button type="button" class="btn-primary btn-sm flex-1" @click="shareInvite"><AppIcon name="share" size="16" /> {{ t('app.share') }}</button>
                  <button type="button" class="btn-secondary btn-sm flex-1" @click="copyInvite"><AppIcon name="link" size="16" /> {{ t('app.copy') }}</button>
                </div>
              </div>
              <button type="button" class="btn-secondary" :disabled="busy" @click="createInvitation"><AppIcon name="user-plus" size="20" /> {{ t('settings.createInvitation') }}</button>
            </div>
            <p v-if="!invitations.length" class="list-row text-sm text-stone-500">{{ t('settings.noInvitations') }}</p>
            <div v-for="inv in invitations" :key="inv.id" class="list-row text-sm">
              <span class="pill shrink-0" :class="invitationState(inv) === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'">
                {{ t(`settings.inviteState.${invitationState(inv)}`) }}
              </span>
              <span class="min-w-0 flex-1 text-xs text-stone-500">
                {{ t('settings.inviteCreated', { date: d(new Date(inv.created_at), 'short') }) }} ·
                {{ t('settings.inviteExpires', { date: d(new Date(inv.expires_at), 'long') }) }}
              </span>
              <button v-if="invitationState(inv) === 'active'" type="button" class="btn-secondary btn-sm" :disabled="busy" @click="revoke(inv.id)">{{ t('settings.revoke') }}</button>
            </div>
          </section>
        </template>

        <!-- Members -->
        <h2 id="members-title" class="section-title" :class="feed.isOwner.value ? '' : 'mt-2'">
          {{ t('settings.members') }}
          <span v-if="memberLimit" class="ml-1 font-normal normal-case tracking-normal text-stone-400">
            · {{ t('settings.memberCapacity', { count: feed.members.value.length, limit: memberLimit }, feed.members.value.length) }}
          </span>
        </h2>
        <section class="list-group" aria-labelledby="members-title">
          <div v-for="m in feed.members.value" :key="m.user_id" class="list-row text-sm">
            <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-sm font-bold text-stone-600" aria-hidden="true">
              {{ (m.profile?.display_name ?? '?').trim()[0]?.toUpperCase() }}
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-1.5 font-medium">
                <span class="truncate">{{ m.profile?.display_name ?? '?' }}</span>
                <span v-if="m.user_id === userId" class="font-normal text-stone-400">({{ t('group.you') }})</span>
                <AppIcon v-if="m.role === 'owner'" name="crown" size="14" class="text-amber-500" :title="t('home.ownerBadge')" />
              </span>
              <span class="block text-xs text-stone-400">{{ t('settings.joinedOn', { date: d(new Date(m.joined_at), 'short') }) }}</span>
            </span>
            <button v-if="feed.isOwner.value && m.role === 'member'" type="button" class="btn-danger btn-sm" :disabled="busy" @click="removeMember(m.user_id, m.profile?.display_name ?? '?')">
              {{ t('settings.remove') }}
            </button>
          </div>
          <button v-if="!feed.isOwner.value" type="button" class="list-row font-medium text-red-700 hover:bg-red-50" :disabled="busy" @click="leave">
            <AppIcon name="logout" size="18" /> {{ t('settings.leave') }}
          </button>
          <p v-else class="list-row text-xs text-stone-500">{{ t('settings.ownerCannotLeave') }}</p>
        </section>

        <!-- Group options -->
        <h2 id="options-title" class="section-title">{{ t('settings.options') }}</h2>
        <section class="list-group" aria-labelledby="options-title">
          <form v-if="feed.isOwner.value" class="flex flex-col gap-2 px-4 py-3" @submit.prevent="rename">
            <label for="rename" class="label">{{ t('settings.rename') }}</label>
            <div class="flex gap-2">
              <input id="rename" v-model="name" type="text" maxlength="80" required class="input" />
              <button type="submit" class="btn-primary shrink-0" :disabled="busy || !name.trim() || name.trim() === feed.group.value.name">{{ t('app.save') }}</button>
            </div>
          </form>
          <fieldset v-if="feed.isOwner.value" class="px-4 py-3" :disabled="busy">
            <legend class="label">{{ t('group.uploadPolicy') }}</legend>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <label class="flex items-center gap-2 rounded-2xl border-2 px-3 py-2" :class="membersCanUpload ? 'border-brand-500 bg-brand-50' : 'border-stone-200'">
                <input type="radio" name="settings-upload-policy" class="accent-brand-600" :checked="membersCanUpload" @change="saveUploadPolicy(true)" />
                {{ t('group.uploadPolicyEveryone') }}
              </label>
              <label class="flex items-center gap-2 rounded-2xl border-2 px-3 py-2" :class="!membersCanUpload ? 'border-brand-500 bg-brand-50' : 'border-stone-200'">
                <input type="radio" name="settings-upload-policy" class="accent-brand-600" :checked="!membersCanUpload" @change="saveUploadPolicy(false)" />
                {{ t('group.uploadPolicyOwner') }}
              </label>
            </div>
          </fieldset>
          <p v-else-if="!feed.canUpload.value" class="list-row text-sm text-stone-500">{{ t('group.uploadOwnerOnly') }}</p>
          <label class="list-row cursor-pointer">
            <AppIcon :name="muted ? 'bell-off' : 'bell'" size="20" class="text-stone-500" />
            <span class="min-w-0 flex-1">
              <span class="block">{{ t('settings.notifyMe') }}</span>
              <span class="block text-xs text-stone-500">{{ t('settings.notifyHint') }}</span>
            </span>
            <input type="checkbox" class="toggle" :checked="!muted" :disabled="busy" @change="setMuted(!($event.target as HTMLInputElement).checked)" />
          </label>
        </section>

        <template v-if="feed.isOwner.value">
          <h2 id="danger-title" class="section-title text-red-700">{{ t('settings.danger') }}</h2>
          <section class="list-group ring-red-200" aria-labelledby="danger-title">
            <form v-if="otherMembers.length" class="flex flex-col gap-2 px-4 py-3" @submit.prevent="transfer">
              <label for="transfer-to" class="label">{{ t('settings.transfer') }}</label>
              <div class="flex gap-2">
                <select id="transfer-to" v-model="transferTarget" class="input" required>
                  <option value="" disabled>{{ t('settings.transferTo') }}</option>
                  <option v-for="m in otherMembers" :key="m.user_id" :value="m.user_id">{{ m.profile?.display_name ?? '?' }}</option>
                </select>
                <button type="submit" class="btn-secondary shrink-0" :disabled="busy || !transferTarget">{{ t('settings.transferButton') }}</button>
              </div>
            </form>
            <form class="flex flex-col gap-2 px-4 py-3" @submit.prevent="deleteGroup">
              <label for="confirm-name" class="label text-red-800">{{ t('settings.deleteGroup') }}</label>
              <p class="text-sm text-stone-600">{{ t('settings.deleteGroupBody') }}</p>
              <input id="confirm-name" v-model="confirmName" type="text" class="input" :placeholder="feed.group.value.name" autocomplete="off" :aria-label="t('settings.deleteGroupConfirmLabel')" />
              <button type="submit" class="btn-danger" :disabled="busy || confirmName.trim() !== feed.group.value.name"><AppIcon name="trash" size="18" /> {{ t('settings.deleteGroupButton') }}</button>
            </form>
          </section>
        </template>
        <p v-else class="mt-4 text-center text-xs text-stone-500">{{ t('settings.ownerOnly') }}</p>
      </div>
    </div>
  </div>
</template>
