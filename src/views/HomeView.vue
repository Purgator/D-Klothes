<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'
import { errorKey } from '@/lib/errors'
import { daysUntil } from '@/lib/retention'
import { useToast } from '@/composables/useToast'
import ShareButton from '@/components/ShareButton.vue'
import type { ClothingItem, Group, MyMembershipRequest } from '@/types/database'

const { t, d } = useI18n()
const router = useRouter()
const auth = useAuth()
const toast = useToast()

interface GroupRow extends Group {
  memberCount: number
  pendingRequests: number
}
const groups = ref<GroupRow[]>([])
const requests = ref<MyMembershipRequest[]>([])
const notices = ref<ClothingItem[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const newName = ref('')
const newMembersCanUpload = ref(true)
const creating = ref(false)
const createError = ref<string | null>(null)

async function load() {
  error.value = null
  try {
    const [g, r, n, p] = await Promise.all([
      supabase.from('groups').select('*, group_members(count)').order('created_at'),
      supabase.rpc('my_membership_requests'),
      supabase.rpc('my_retention_notices'),
      // Pending applications to the groups I own (RLS limits this to my groups).
      supabase.from('membership_requests').select('group_id').eq('status', 'pending'),
    ])
    for (const res of [g, r, n, p]) if (res.error) throw res.error
    const pendingByGroup = new Map<string, number>()
    for (const row of p.data ?? []) pendingByGroup.set(row.group_id, (pendingByGroup.get(row.group_id) ?? 0) + 1)
    groups.value = ((g.data ?? []) as unknown as (Group & { group_members: { count: number }[] })[]).map((row) => ({
      ...row,
      memberCount: row.group_members?.[0]?.count ?? 0,
      pendingRequests: row.owner_id === auth.user.value?.id ? (pendingByGroup.get(row.id) ?? 0) : 0,
    }))
    requests.value = (r.data ?? []).filter((req) => req.status !== 'approved')
    notices.value = n.data ?? []
  } catch (err) {
    error.value = errorKey(err)
  } finally {
    loading.value = false
  }
}

async function createGroup() {
  const name = newName.value.trim()
  if (!name) return
  creating.value = true
  createError.value = null
  try {
    const { data, error: rpcError } = await supabase.rpc('create_group', { p_name: name, p_members_can_upload: newMembersCanUpload.value })
    if (rpcError) throw rpcError
    newName.value = ''
    newMembersCanUpload.value = true
    toast.show(t('toast.groupCreated'), { emoji: '🎈' })
    await router.push({ name: 'group', params: { groupId: data.id } })
  } catch (err) {
    createError.value = errorKey(err)
  } finally {
    creating.value = false
  }
}

onMounted(load)
</script>

<template>
  <section>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-semibold">{{ t('home.title') }}</h1>
      <ShareButton />
    </div>

    <p v-if="error" class="alert-error mb-4" role="alert">
      {{ t(error) }} <button type="button" class="underline" @click="load">{{ t('app.retry') }}</button>
    </p>
    <p v-if="loading" role="status" class="text-stone-500">{{ t('app.loading') }}</p>

    <template v-else>
      <section v-if="notices.length" class="alert-warning mb-4" aria-labelledby="retention-title">
        <h2 id="retention-title" class="font-semibold">{{ t('home.retentionTitle') }}</h2>
        <p class="mb-2">{{ t('home.retentionBody') }}</p>
        <ul class="list-inside list-disc">
          <li v-for="item in notices" :key="item.id">
            <RouterLink :to="{ name: 'item', params: { groupId: item.group_id, itemId: item.id } }" class="underline">
              {{
                t(
                  'home.retentionItem',
                  {
                    title: item.title || t('home.untitled'),
                    date: d(new Date(item.retention_deadline), 'short'),
                    days: Math.max(0, daysUntil(item.retention_deadline)),
                  },
                  Math.max(0, daysUntil(item.retention_deadline)),
                )
              }}
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="requests.length" class="mb-6" aria-labelledby="requests-title">
        <h2 id="requests-title" class="mb-2 text-lg font-medium">{{ t('home.pendingRequests') }}</h2>
        <ul class="flex flex-col gap-2">
          <li v-for="req in requests" :key="req.id" class="card text-sm" :class="req.status === 'rejected' ? 'text-stone-500' : ''">
            {{
              req.status === 'pending'
                ? t('home.pendingRequestHint', { group: req.group_name })
                : t('home.rejectedRequest', { group: req.group_name })
            }}
            <span class="block text-xs text-stone-400">{{ d(new Date(req.created_at), 'short') }}</span>
          </li>
        </ul>
      </section>

      <p v-if="!groups.length" class="card mb-6 text-sm text-stone-600">{{ t('home.empty') }}</p>
      <ul v-else class="mb-6 grid gap-3 sm:grid-cols-2">
        <li v-for="group in groups" :key="group.id">
          <RouterLink :to="{ name: 'group', params: { groupId: group.id } }" class="card flex items-center justify-between gap-3 hover:border-brand-600">
            <span>
              <span class="block font-medium">{{ group.name }}</span>
              <span class="block text-xs text-stone-500">{{ t('home.memberCount', { count: group.memberCount }, group.memberCount) }}</span>
            </span>
            <span class="flex flex-col items-end gap-1">
              <span v-if="group.owner_id === auth.user.value?.id" class="rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-800">
                {{ t('home.ownerBadge') }}
              </span>
              <span v-if="group.pendingRequests" class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                {{ t('group.pendingRequests', { count: group.pendingRequests }, group.pendingRequests) }}
              </span>
            </span>
          </RouterLink>
        </li>
      </ul>

      <form class="card flex flex-col gap-3" novalidate @submit.prevent="createGroup">
        <h2 class="text-lg font-medium">{{ t('home.createGroup') }}</h2>
        <div>
          <label for="group-name" class="label">{{ t('home.groupName') }}</label>
          <input id="group-name" v-model="newName" type="text" maxlength="80" required class="input" :placeholder="t('home.groupNamePlaceholder')" />
        </div>
        <fieldset>
          <legend class="label">{{ t('group.uploadPolicy') }}</legend>
          <div class="flex flex-col gap-1 text-sm">
            <label class="flex items-center gap-2">
              <input v-model="newMembersCanUpload" type="radio" name="upload-policy" :value="true" />
              {{ t('group.uploadPolicyEveryone') }}
            </label>
            <label class="flex items-center gap-2">
              <input v-model="newMembersCanUpload" type="radio" name="upload-policy" :value="false" />
              {{ t('group.uploadPolicyOwner') }}
            </label>
          </div>
        </fieldset>
        <p v-if="createError" class="alert-error" role="alert">{{ t(createError) }}</p>
        <button type="submit" class="btn-primary self-start" :disabled="creating || !newName.trim()">
          {{ creating ? t('home.creating') : t('home.create') }}
        </button>
      </form>
    </template>
  </section>
</template>
