<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'
import { useGroupFeed } from '@/composables/useGroupFeed'
import { useNotifications } from '@/composables/useNotifications'
import PageTitle from '@/components/PageTitle.vue'
import PhotoImage from '@/components/PhotoImage.vue'
import { errorKey } from '@/lib/errors'
import type { ClothingItem, VoteType } from '@/types/database'

const { t } = useI18n()
const route = useRoute()
const auth = useAuth()

const groupId = computed(() => String(route.params.groupId))
const userId = computed(() => auth.user.value?.id ?? null)
const feed = useGroupFeed(groupId, userId)

// Items the caller has not voted on yet, oldest first, excluding their own uploads.
// Locally decided ids are hidden immediately so the stack advances before the refetch lands.
const decided = ref<Set<string>>(new Set())
const queue = computed<ClothingItem[]>(() =>
  [...feed.items.value]
    .filter((i) => i.uploader_id !== userId.value && !feed.myVotes.value.has(i.id) && !decided.value.has(i.id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at)),
)
const current = computed(() => queue.value[0] ?? null)
const next = computed(() => queue.value[1] ?? null)
const total = computed(() => queue.value.length + decided.value.size)
const lastVoted = ref<ClothingItem | null>(null)
const error = ref<string | null>(null)

// Owners: how many membership requests are waiting (refreshed with the feed and via notifications).
const pendingRequests = ref(0)
const notifications = useNotifications()
async function loadPending() {
  if (!feed.isOwner.value) {
    pendingRequests.value = 0
    return
  }
  const { count } = await supabase
    .from('membership_requests')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId.value)
    .eq('status', 'pending')
  pendingRequests.value = count ?? 0
}
watch([() => feed.isOwner.value, () => notifications.items.value], loadPending, { immediate: true })

// --- Drag gesture ---------------------------------------------------------------
const THRESHOLD = 110
const dragging = ref(false)
const dx = ref(0)
const dy = ref(0)
const flyOut = ref<VoteType | null>(null)
let startX = 0
let startY = 0

const direction = computed<VoteType | null>(() => {
  if (flyOut.value) return flyOut.value
  if (Math.abs(dx.value) < 40 && -dy.value < 40) return null
  if (-dy.value > Math.abs(dx.value)) return 'want'
  return dx.value > 0 ? 'keep' : 'let_go'
})
const intensity = computed(() => Math.min(1, Math.max(Math.abs(dx.value), -dy.value) / THRESHOLD))

const cardStyle = computed(() => {
  if (flyOut.value) {
    const x = flyOut.value === 'keep' ? 1200 : flyOut.value === 'let_go' ? -1200 : 0
    const y = flyOut.value === 'want' ? -1200 : dy.value
    return { transform: `translate(${x}px, ${y}px) rotate(${x / 40}deg)`, transition: 'transform 320ms ease-in', opacity: '0' }
  }
  return {
    transform: `translate(${dx.value}px, ${dy.value}px) rotate(${dx.value / 18}deg)`,
    transition: dragging.value ? 'none' : 'transform 200ms ease-out',
  }
})

function onPointerDown(e: PointerEvent) {
  if (!current.value || flyOut.value) return
  dragging.value = true
  startX = e.clientX
  startY = e.clientY
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  dx.value = e.clientX - startX
  dy.value = Math.min(40, e.clientY - startY)
}
function onPointerUp() {
  if (!dragging.value) return
  dragging.value = false
  const dir = direction.value
  if (dir && intensity.value >= 1) void decide(dir)
  else {
    dx.value = 0
    dy.value = 0
  }
}

async function decide(vote: VoteType) {
  const item = current.value
  if (!item || flyOut.value) return
  error.value = null
  flyOut.value = vote
  await new Promise((r) => setTimeout(r, 300))
  decided.value = new Set([...decided.value, item.id])
  lastVoted.value = item
  flyOut.value = null
  dx.value = 0
  dy.value = 0
  try {
    await feed.vote(item.id, vote)
  } catch (err) {
    error.value = errorKey(err)
    decided.value = new Set([...decided.value].filter((id) => id !== item.id))
  }
}

async function undo() {
  const item = lastVoted.value
  if (!item) return
  lastVoted.value = null
  try {
    await feed.vote(item.id, null)
    decided.value = new Set([...decided.value].filter((id) => id !== item.id))
  } catch (err) {
    error.value = errorKey(err)
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') void decide('keep')
  else if (e.key === 'ArrowLeft') void decide('let_go')
  else if (e.key === 'ArrowUp') void decide('want')
  else return
  e.preventDefault()
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

const labelStyles: Record<VoteType, string> = {
  keep: 'left-4 top-4 -rotate-12 border-emerald-500 text-emerald-700',
  let_go: 'right-4 top-4 rotate-12 border-amber-500 text-amber-700',
  want: 'left-1/2 top-4 -translate-x-1/2 border-rose-500 text-rose-700',
}
</script>

<template>
  <section>
    <p v-if="feed.loading.value" role="status" class="text-stone-500">{{ t('app.loading') }}</p>
    <p v-else-if="feed.notMember.value" class="alert-error" role="alert">{{ t('group.notMember') }}</p>
    <template v-else-if="feed.group.value">
      <PageTitle :title="feed.group.value.name" :back-to="{ name: 'home' }" :back-label="t('nav.home')">
        <template #actions>
          <RouterLink :to="{ name: 'group-settings', params: { groupId } }" class="btn-secondary">{{ t('group.settings') }}</RouterLink>
          <RouterLink :to="{ name: 'group-photos', params: { groupId } }" class="btn-secondary">
            {{ t('group.photos') }}
            <span class="rounded-full bg-brand-100 px-2 text-xs text-brand-800">{{ feed.items.value.length }}</span>
          </RouterLink>
          <RouterLink v-if="feed.canUpload.value" :to="{ name: 'upload', params: { groupId } }" class="btn-primary">{{ t('group.addPhoto') }}</RouterLink>
        </template>
      </PageTitle>

      <RouterLink
        v-if="feed.isOwner.value && pendingRequests > 0"
        :to="{ name: 'group-settings', params: { groupId }, hash: '#requests-title' }"
        class="alert-warning mb-3 flex items-center justify-between gap-3 hover:border-amber-400"
      >
        <span>{{ t('group.pendingRequests', { count: pendingRequests }, pendingRequests) }}</span>
        <span class="font-medium underline">{{ t('group.reviewRequests') }}</span>
      </RouterLink>
      <p v-if="feed.error.value" class="alert-error mb-3" role="alert">{{ t(feed.error.value) }}</p>
      <p v-if="error" class="alert-error mb-3" role="alert">{{ t(error) }}</p>

      <!-- Nothing in the group yet -->
      <div v-if="!feed.items.value.length" class="card flex flex-col items-start gap-3">
        <p class="text-sm text-stone-600">{{ feed.canUpload.value ? t('group.emptyFeed') : t('group.emptyFeedOwnerOnly') }}</p>
        <RouterLink v-if="feed.canUpload.value" :to="{ name: 'upload', params: { groupId } }" class="btn-primary">{{ t('group.addPhoto') }}</RouterLink>
      </div>

      <!-- Everything reviewed: point to the collection -->
      <div v-else-if="!current" class="card flex flex-col items-start gap-3">
        <p>{{ t('swipe.done') }}</p>
        <div class="flex flex-wrap gap-2">
          <RouterLink :to="{ name: 'group-photos', params: { groupId } }" class="btn-primary">{{ t('swipe.seeAll') }}</RouterLink>
          <button v-if="lastVoted" type="button" class="btn-secondary" @click="undo">{{ t('swipe.undo') }}</button>
        </div>
      </div>

      <div v-else class="mx-auto flex max-w-sm flex-col gap-4">
        <p class="text-sm text-stone-600">{{ t('swipe.intro') }}</p>
        <p class="text-center text-xs text-stone-500" aria-live="polite">
          {{ t('swipe.remaining', { count: queue.length }, queue.length) }}
        </p>

        <div class="relative aspect-[4/5] select-none" style="touch-action: none">
          <!-- Next card, peeking from behind -->
          <div v-if="next" :key="`next-${next.id}`" class="absolute inset-0 scale-95 translate-y-3 opacity-70" aria-hidden="true">
            <PhotoImage :path="next.storage_path" alt="" sizes-class="h-full" />
          </div>
          <!-- Current card. Keyed by item so a decided card is never reused for the next one:
               a reused element would animate from its fly-out position back to the centre. -->
          <div
            :key="current.id"
            class="swipe-card absolute inset-0 cursor-grab touch-none rounded-xl bg-white shadow-lg active:cursor-grabbing"
            :style="cardStyle"
            role="img"
            :aria-label="t('swipe.cardLabel', { index: decided.size + 1, total, title: current.title || t('home.untitled') })"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
          >
            <PhotoImage :path="current.storage_path" :alt="current.title || t('item.photoAltUntitled')" sizes-class="h-full pointer-events-none" />
            <div class="absolute inset-x-0 bottom-0 rounded-b-xl bg-gradient-to-t from-black/70 to-transparent p-3 text-white">
              <p class="font-medium">{{ current.title || t('home.untitled') }}</p>
              <p class="text-xs opacity-80">{{ t('group.uploadedBy', { name: feed.memberNames.value.get(current.uploader_id) ?? '?' }) }}</p>
            </div>
            <span
              v-if="direction"
              class="absolute rounded-lg border-4 bg-white/90 px-3 py-1 text-xl font-bold uppercase tracking-wide"
              :class="labelStyles[direction]"
              :style="{ opacity: String(intensity) }"
              aria-hidden="true"
            >
              {{ t(`vote.${direction}`) }}
            </span>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2" role="group" :aria-label="t('vote.prompt')">
          <button type="button" class="btn border border-amber-300 bg-white text-amber-800 hover:bg-amber-50" @click="decide('let_go')">
            ← {{ t('vote.let_go') }}
          </button>
          <button type="button" class="btn border border-rose-300 bg-white text-rose-800 hover:bg-rose-50" @click="decide('want')">
            ↑ {{ t('vote.want') }}
          </button>
          <button type="button" class="btn border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50" @click="decide('keep')">
            {{ t('vote.keep') }} →
          </button>
        </div>
        <button v-if="lastVoted" type="button" class="btn-secondary self-center" @click="undo">{{ t('swipe.undo') }}</button>
        <p class="text-center text-xs text-stone-500">{{ t('vote.advice') }}</p>
      </div>
    </template>

<style scoped>
/* A fresh card settles in from the "peeking" state instead of popping. */
@keyframes swipe-card-in {
  from {
    transform: translateY(0.75rem) scale(0.95);
    opacity: 0.7;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
.swipe-card {
  animation: swipe-card-in 220ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .swipe-card {
    animation: none;
  }
}
</style>
  </section>
</template>
