<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { invokeFunction, supabase } from '@/lib/supabase'
import { errorKey } from '@/lib/errors'
import { isNoticeDue } from '@/lib/retention'
import { useAuth } from '@/composables/useAuth'
import { useGroupFeed } from '@/composables/useGroupFeed'
import PageTitle from '@/components/PageTitle.vue'
import PhotoImage from '@/components/PhotoImage.vue'
import VoteButtons from '@/components/VoteButtons.vue'
import VoteCountsLine from '@/components/VoteCountsLine.vue'

const { t, d } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuth()

const groupId = computed(() => String(route.params.groupId))
const itemId = computed(() => String(route.params.itemId))
const userId = computed(() => auth.user.value?.id ?? null)
const feed = useGroupFeed(groupId, userId)

const item = computed(() => feed.items.value.find((i) => i.id === itemId.value) ?? null)
const isMine = computed(() => !!item.value && item.value.uploader_id === userId.value)
const canDelete = computed(() => isMine.value || feed.isOwner.value)

// Names of members who chose "I want this": only the uploader may read these rows (RLS).
const wanters = ref<string[]>([])
async function loadWanters() {
  if (!isMine.value) return
  const { data } = await supabase
    .from('votes')
    .select('voter_id, profiles(display_name)')
    .eq('item_id', itemId.value)
    .eq('vote', 'want')
  wanters.value = ((data ?? []) as unknown as { profiles: { display_name: string } | null }[]).map(
    (row) => row.profiles?.display_name ?? '?',
  )
}
watch([isMine, () => feed.counts.value], loadWanters, { immediate: true })

const editing = ref(false)
const newTitle = ref('')
const saving = ref(false)
const deleting = ref(false)
const confirmDelete = ref(false)
const error = ref<string | null>(null)

function startEdit() {
  newTitle.value = item.value?.title ?? ''
  editing.value = true
}
async function saveTitle() {
  if (!item.value) return
  saving.value = true
  error.value = null
  try {
    const { error: upError } = await supabase.from('clothing_items').update({ title: newTitle.value.trim().slice(0, 80) }).eq('id', item.value.id)
    if (upError) throw upError
    editing.value = false
    await feed.load()
  } catch (err) {
    error.value = errorKey(err)
  } finally {
    saving.value = false
  }
}
async function remove() {
  deleting.value = true
  error.value = null
  try {
    await invokeFunction('delete-photo', { item_id: itemId.value })
    await router.replace({ name: 'group', params: { groupId: groupId.value } })
  } catch (err) {
    error.value = errorKey(err)
    deleting.value = false
  }
}
</script>

<template>
  <section>
    <PageTitle :title="item?.title || t('item.title')" :back-to="{ name: 'group', params: { groupId } }" :back-label="t('group.feed')" />
    <p v-if="feed.loading.value" role="status" class="text-stone-500">{{ t('app.loading') }}</p>
    <p v-else-if="!item" class="alert-error" role="alert">{{ t('errors.not_found') }}</p>
    <div v-else class="flex flex-col gap-4">
      <PhotoImage
        :path="item.storage_path"
        :alt="item.title ? t('item.photoAlt', { title: item.title }) : t('item.photoAltUntitled')"
        sizes-class="aspect-[4/5] max-h-[70vh]"
      />
      <div class="card flex flex-col gap-3">
        <p class="text-sm text-stone-600">
          {{ t('group.uploadedBy', { name: isMine ? t('group.you') : feed.memberNames.value.get(item.uploader_id) ?? '?' }) }}
          · {{ t('item.added', { date: d(new Date(item.created_at), 'short') }) }}
        </p>
        <p class="text-sm" :class="isNoticeDue(item.retention_deadline) ? 'alert-warning' : 'text-stone-600'">
          {{ t('group.retentionUntil', { date: d(new Date(item.retention_deadline), 'short') }) }}
        </p>
        <VoteCountsLine :counts="feed.countsFor(item.id)" />

        <template v-if="isMine">
          <p class="text-sm">
            {{ wanters.length ? t('vote.wantedBy', { names: wanters.join(', ') }) : t('vote.wantedByNone') }}
          </p>
          <p class="text-xs text-stone-500">{{ t('vote.wantedByHint') }}</p>
          <form v-if="editing" class="flex flex-col gap-2 sm:flex-row" @submit.prevent="saveTitle">
            <label for="edit-title" class="sr-only">{{ t('item.editTitle') }}</label>
            <input id="edit-title" v-model="newTitle" type="text" maxlength="80" class="input" />
            <button type="submit" class="btn-primary" :disabled="saving">{{ t('app.save') }}</button>
            <button type="button" class="btn-secondary" @click="editing = false">{{ t('app.cancel') }}</button>
          </form>
          <button v-else type="button" class="btn-secondary self-start" @click="startEdit">{{ t('item.editTitle') }}</button>
        </template>
        <VoteButtons v-else :item-id="item.id" :current="feed.myVotes.value.get(item.id) ?? null" :vote="feed.vote" />
        <p class="text-xs text-stone-500">{{ t('vote.advice') }}</p>
      </div>

      <div v-if="canDelete" class="card border-red-200">
        <h2 class="mb-1 font-medium text-red-800">{{ t('item.deleteTitle') }}</h2>
        <p class="mb-3 text-sm text-stone-600">{{ t('item.deleteBody') }}</p>
        <div v-if="confirmDelete" class="flex gap-2">
          <button type="button" class="btn-danger" :disabled="deleting" @click="remove">
            {{ deleting ? t('item.deleting') : t('app.confirm') }}
          </button>
          <button type="button" class="btn-secondary" :disabled="deleting" @click="confirmDelete = false">{{ t('app.cancel') }}</button>
        </div>
        <button v-else type="button" class="btn-danger" @click="confirmDelete = true">{{ t('app.delete') }}</button>
      </div>
      <p v-if="error" class="alert-error" role="alert">{{ t(error) }}</p>
    </div>
  </section>
</template>
