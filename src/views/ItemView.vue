<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { invokeFunction, supabase } from '@/lib/supabase'
import { errorKey } from '@/lib/errors'
import { isNoticeDue } from '@/lib/retention'
import { useAuth } from '@/composables/useAuth'
import { useGroupFeed } from '@/composables/useGroupFeed'
import { VOTE_EMOJI } from '@/lib/votes'
import AppIcon from '@/components/AppIcon.vue'
import PhotoImage from '@/components/PhotoImage.vue'
import TopBar from '@/components/TopBar.vue'
import VoteButtons from '@/components/VoteButtons.vue'

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
const counts = computed(() => feed.countsFor(itemId.value))

// Names of members who chose "I want this": only the uploader may read these rows (RLS).
const wanters = ref<string[]>([])
async function loadWanters() {
  if (!isMine.value) return
  const { data } = await supabase.from('votes').select('voter_id, profiles(display_name)').eq('item_id', itemId.value).eq('vote', 'want')
  wanters.value = ((data ?? []) as unknown as { profiles: { display_name: string } | null }[]).map((row) => row.profiles?.display_name ?? '?')
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
  <div class="screen-scroll relative bg-stone-100">
    <TopBar transparent light :back="{ name: 'group', params: { groupId } }" />

    <div v-if="feed.loading.value" class="aspect-[4/5] max-h-[65vh] w-full animate-pulse bg-stone-300" role="status" :aria-label="t('app.loading')"></div>
    <div v-else-if="!item" class="screen-body pt-20"><p class="alert-error" role="alert">{{ t('errors.not_found') }}</p></div>

    <template v-else>
      <div class="relative">
        <PhotoImage
          :path="item.storage_path"
          :alt="item.title ? t('item.photoAlt', { title: item.title }) : t('item.photoAltUntitled')"
          plain
          sizes-class="aspect-[4/5] max-h-[65vh] w-full"
        />
        <div class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-stone-100 via-stone-100/70 to-transparent pb-4 pt-20"></div>
      </div>

      <div class="screen-body relative -mt-12 flex flex-col gap-4 pb-10">
        <div>
          <h2 class="text-2xl font-bold leading-tight">{{ item.title || t('home.untitled') }}</h2>
          <p class="mt-1 text-sm text-stone-600">
            {{ t('group.uploadedBy', { name: isMine ? t('group.you') : feed.memberNames.value.get(item.uploader_id) ?? '?' }) }} ·
            {{ t('item.added', { date: d(new Date(item.created_at), 'short') }) }}
          </p>
        </div>

        <dl class="grid grid-cols-3 gap-2" :aria-label="t('vote.prompt')">
          <div class="card flex flex-col items-center gap-0.5 p-3">
            <dt class="text-xl" aria-hidden="true">{{ VOTE_EMOJI.keep }}</dt>
            <dd class="text-2xl font-bold tabular-nums text-keep-600">{{ counts.keep_count }}</dd>
            <dt class="text-[11px] font-medium text-stone-500">{{ t('vote.keep') }}</dt>
          </div>
          <div class="card flex flex-col items-center gap-0.5 p-3">
            <dt class="text-xl" aria-hidden="true">{{ VOTE_EMOJI.let_go }}</dt>
            <dd class="text-2xl font-bold tabular-nums text-letgo-600">{{ counts.let_go_count }}</dd>
            <dt class="text-[11px] font-medium text-stone-500">{{ t('vote.let_go') }}</dt>
          </div>
          <div class="card flex flex-col items-center gap-0.5 p-3">
            <dt class="text-xl" aria-hidden="true">{{ VOTE_EMOJI.want }}</dt>
            <dd class="text-2xl font-bold tabular-nums text-want-600">{{ counts.want_count }}</dd>
            <dt class="text-[11px] font-medium text-stone-500">{{ t('vote.want') }}</dt>
          </div>
        </dl>

        <section v-if="isMine" class="card flex flex-col gap-3">
          <h3 class="flex items-center gap-2 font-semibold"><AppIcon name="heart" size="18" class="text-want-500" /> {{ t('item.interested') }}</h3>
          <p class="text-sm">{{ wanters.length ? t('vote.wantedBy', { names: wanters.join(', ') }) : t('vote.wantedByNone') }}</p>
          <p class="text-xs text-stone-500">{{ t('vote.wantedByHint') }}</p>
        </section>
        <section v-else class="card">
          <h3 class="mb-3 font-semibold">{{ t('vote.prompt') }}</h3>
          <VoteButtons :item-id="item.id" :current="feed.myVotes.value.get(item.id) ?? null" :vote="feed.vote" />
        </section>

        <ul class="list-group text-sm">
          <li class="list-row" :class="isNoticeDue(item.retention_deadline) ? 'bg-amber-50 text-amber-900' : 'text-stone-600'">
            <AppIcon name="clock" size="18" /> {{ t('group.retentionUntil', { date: d(new Date(item.retention_deadline), 'short') }) }}
          </li>
          <li v-if="isMine" class="list-row">
            <form v-if="editing" class="flex w-full flex-col gap-2" @submit.prevent="saveTitle">
              <label for="edit-title" class="label">{{ t('item.editTitle') }}</label>
              <input id="edit-title" v-model="newTitle" type="text" maxlength="80" class="input" />
              <div class="flex gap-2">
                <button type="submit" class="btn-primary btn-sm flex-1" :disabled="saving">{{ t('app.save') }}</button>
                <button type="button" class="btn-secondary btn-sm flex-1" @click="editing = false">{{ t('app.cancel') }}</button>
              </div>
            </form>
            <button v-else type="button" class="flex w-full items-center gap-3 text-left" @click="startEdit">
              <AppIcon name="edit" size="18" class="text-stone-500" /> <span class="flex-1">{{ t('item.editTitle') }}</span> <AppIcon name="chevron-right" size="18" class="text-stone-400" />
            </button>
          </li>
          <li v-if="canDelete" class="list-row text-red-700">
            <div v-if="confirmDelete" class="flex w-full flex-col gap-2">
              <p class="text-sm text-stone-600">{{ t('item.deleteBody') }}</p>
              <div class="flex gap-2">
                <button type="button" class="btn-danger btn-sm flex-1" :disabled="deleting" @click="remove">{{ deleting ? t('item.deleting') : t('app.confirm') }}</button>
                <button type="button" class="btn-secondary btn-sm flex-1" :disabled="deleting" @click="confirmDelete = false">{{ t('app.cancel') }}</button>
              </div>
            </div>
            <button v-else type="button" class="flex w-full items-center gap-3 text-left" @click="confirmDelete = true">
              <AppIcon name="trash" size="18" /> <span class="flex-1">{{ t('item.deleteTitle') }}</span> <AppIcon name="chevron-right" size="18" class="text-stone-400" />
            </button>
          </li>
        </ul>
        <p v-if="error" class="alert-error" role="alert">{{ t(error) }}</p>
        <p class="text-center text-xs text-stone-500">{{ t('vote.advice') }}</p>
      </div>
    </template>
  </div>
</template>
