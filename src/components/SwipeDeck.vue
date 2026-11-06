<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import { useReviewQueue } from '@/composables/useReviewQueue'
import { haptic, useToast } from '@/composables/useToast'
import { errorKey } from '@/lib/errors'
import { VOTE_EMOJI } from '@/lib/votes'
import AppIcon from '@/components/AppIcon.vue'
import Illustration from '@/components/Illustration.vue'
import PhotoImage from '@/components/PhotoImage.vue'
import type { ClothingItem, VoteType } from '@/types/database'

// `groupId` null reviews the photos of every group the caller belongs to.
const props = defineProps<{ groupId: string | null }>()
const emit = defineEmits<{ reviewed: [groupId: string, delta: number] }>()

const { t, d } = useI18n()
const auth = useAuth()
const toast = useToast()

const userId = computed(() => auth.user.value?.id ?? null)
const feed = useReviewQueue(toRef(props, 'groupId'), userId)
const allGroups = computed(() => props.groupId === null)

// Items the caller has not voted on yet, oldest first, excluding their own uploads.
// Locally decided ids are hidden immediately so the stack advances before the refetch lands.
const decided = ref<Set<string>>(new Set())
watch(() => props.groupId, () => {
  decided.value = new Set()
  lastVoted.value = null
})
const queue = computed<ClothingItem[]>(() =>
  [...feed.items.value]
    .filter((i) => i.uploader_id !== userId.value && !feed.myVotes.value.has(i.id) && !decided.value.has(i.id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at)),
)
const current = computed(() => queue.value[0] ?? null)
const next = computed(() => queue.value[1] ?? null)
const total = computed(() => queue.value.length + decided.value.size)
const progress = computed(() => (total.value ? (decided.value.size / total.value) * 100 : 0))
const lastVoted = ref<ClothingItem | null>(null)
const error = ref<string | null>(null)

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
  haptic(vote === 'want' ? [10, 40, 20] : 12)
  await new Promise((r) => setTimeout(r, 300))
  decided.value = new Set([...decided.value, item.id])
  lastVoted.value = item
  flyOut.value = null
  dx.value = 0
  dy.value = 0
  try {
    await feed.vote(item.id, vote)
    emit('reviewed', item.group_id, -1)
    if (queue.value.length === 0) {
      haptic([20, 60, 20, 60, 40])
      toast.show(t('toast.allReviewed'), { emoji: '🎉', durationMs: 4000 })
    }
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
    await feed.vote(item.id, null, { allowUndo: true })
    decided.value = new Set([...decided.value].filter((id) => id !== item.id))
    emit('reviewed', item.group_id, 1)
    toast.show(t('toast.voteRemoved'), { emoji: '↩️', tone: 'info' })
  } catch (err) {
    error.value = errorKey(err)
  }
}

function onKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return
  if (e.key === 'ArrowRight') void decide('keep')
  else if (e.key === 'ArrowLeft') void decide('let_go')
  else if (e.key === 'ArrowUp') void decide('want')
  else if (e.key === 'Backspace' && lastVoted.value) void undo()
  else return
  e.preventDefault()
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

const stampStyles: Record<VoteType, string> = {
  keep: 'left-4 top-4 -rotate-12 border-keep-500 text-keep-600',
  let_go: 'right-4 top-4 rotate-12 border-letgo-500 text-letgo-600',
  want: 'left-1/2 top-4 -translate-x-1/2 border-want-500 text-want-600',
}
const tintStyles: Record<VoteType, string> = {
  keep: 'bg-keep-500/35',
  let_go: 'bg-letgo-500/35',
  want: 'bg-want-500/35',
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <!-- Loading: a placeholder card keeps the layout still -->
    <div v-if="feed.loading.value" class="flex min-h-0 flex-1 flex-col gap-4 py-2">
      <div class="h-1.5 w-full rounded-full bg-stone-200"></div>
      <div class="min-h-0 flex-1 animate-pulse rounded-4xl bg-stone-200" role="status" :aria-label="t('app.loading')"></div>
      <div class="flex items-center justify-center gap-5 py-2">
        <span class="h-16 w-16 rounded-full bg-stone-200"></span>
        <span class="h-14 w-14 rounded-full bg-stone-200"></span>
        <span class="h-16 w-16 rounded-full bg-stone-200"></span>
      </div>
    </div>

    <p v-else-if="feed.notMember.value" class="alert-error" role="alert">{{ t('group.notMember') }}</p>

    <template v-else>
      <p v-if="feed.error.value" class="alert-error mb-2" role="alert">{{ t(feed.error.value) }}</p>
      <p v-if="error" class="alert-error mb-2" role="alert">{{ t(error) }}</p>

      <!-- Nothing to review yet -->
      <div v-if="!feed.items.value.length" class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center">
        <Illustration name="wardrobe" class="w-56 max-w-[60%]" />
        <div class="space-y-1">
          <p class="text-lg font-bold">{{ t('swipe.emptyTitle') }}</p>
          <p class="text-sm text-stone-600">{{ allGroups ? t('swipe.emptyAll') : feed.canUpload.value ? t('group.emptyFeed') : t('group.emptyFeedOwnerOnly') }}</p>
        </div>
        <RouterLink v-if="allGroups" :to="{ name: 'groups' }" class="btn-primary"><AppIcon name="users" size="20" /> {{ t('swipe.seeGroups') }}</RouterLink>
        <RouterLink v-else-if="feed.canUpload.value && groupId" :to="{ name: 'upload', params: { groupId } }" class="btn-primary">
          <AppIcon name="camera" size="20" /> {{ t('group.addPhoto') }}
        </RouterLink>
      </div>

      <!-- Everything reviewed -->
      <div v-else-if="!current" class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 text-center">
        <Illustration name="done" class="w-56 max-w-[60%]" />
        <div class="space-y-1">
          <p class="text-lg font-bold">{{ t('swipe.doneTitle') }}</p>
          <p class="text-sm text-stone-600">{{ allGroups ? t('swipe.doneAll') : t('swipe.done') }}</p>
        </div>
        <div class="flex flex-wrap justify-center gap-2">
          <RouterLink v-if="allGroups" :to="{ name: 'groups' }" class="btn-primary"><AppIcon name="users" size="20" /> {{ t('swipe.seeGroups') }}</RouterLink>
          <RouterLink v-else-if="groupId" :to="{ name: 'group', params: { groupId } }" class="btn-primary"><AppIcon name="image" size="20" /> {{ t('swipe.seeAll') }}</RouterLink>
          <button v-if="lastVoted" type="button" class="btn-secondary" @click="undo"><AppIcon name="undo" size="20" /> {{ t('swipe.undo') }}</button>
        </div>
      </div>

      <!-- The deck -->
      <div v-else class="flex min-h-0 flex-1 flex-col gap-3">
        <div class="flex items-center gap-3 pt-1 text-xs font-medium text-stone-500">
          <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200" role="progressbar" :aria-valuenow="Math.round(progress)" aria-valuemin="0" aria-valuemax="100">
            <div class="h-full rounded-full bg-brand-500 transition-all duration-300" :style="{ width: `${progress}%` }"></div>
          </div>
          <span aria-live="polite" class="tabular-nums">{{ t('swipe.remaining', { count: queue.length }, queue.length) }}</span>
        </div>

        <div class="relative min-h-0 flex-1 select-none" style="touch-action: none">
          <!-- Next card, peeking from behind -->
          <div v-if="next" :key="`next-${next.id}`" class="absolute inset-0 translate-y-3 scale-95 overflow-hidden rounded-4xl bg-white opacity-70 shadow-card" aria-hidden="true">
            <PhotoImage :path="next.storage_path" alt="" plain sizes-class="h-full" />
          </div>
          <!-- Current card. Keyed by item so a decided card is never reused for the next one. -->
          <div
            :key="current.id"
            class="swipe-card absolute inset-0 cursor-grab touch-none overflow-hidden rounded-4xl bg-white shadow-card active:cursor-grabbing"
            :style="cardStyle"
            role="img"
            :aria-label="t('swipe.cardLabel', { index: decided.size + 1, total, title: current.title || t('home.untitled') })"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
          >
            <PhotoImage :path="current.storage_path" :alt="current.title || t('item.photoAltUntitled')" plain sizes-class="h-full pointer-events-none" />
            <div v-if="direction" class="pointer-events-none absolute inset-0 transition-opacity" :class="tintStyles[direction]" :style="{ opacity: String(intensity * 0.8) }" aria-hidden="true"></div>
            <div class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-5 pb-5 pt-16 text-white">
              <p v-if="allGroups" class="mb-1.5 inline-flex max-w-full items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold backdrop-blur">
                <AppIcon name="users" size="14" /> <span class="truncate">{{ feed.groups.value.get(current.group_id)?.name ?? '?' }}</span>
              </p>
              <p class="text-xl font-bold leading-tight drop-shadow">{{ current.title || t('home.untitled') }}</p>
              <p class="mt-1 text-sm text-white/85">
                {{ t('group.uploadedBy', { name: feed.uploaderNames.value.get(current.uploader_id) ?? '?' }) }} · {{ d(new Date(current.created_at), 'short') }}
              </p>
            </div>
            <span
              v-if="direction"
              class="pointer-events-none absolute rounded-xl border-4 bg-white/90 px-3 py-1 text-2xl font-black uppercase tracking-wide"
              :class="stampStyles[direction]"
              :style="{ opacity: String(intensity) }"
              aria-hidden="true"
            >
              {{ VOTE_EMOJI[direction] }} {{ t(`vote.${direction}`) }}
            </span>
          </div>
        </div>

        <div class="flex items-center justify-center gap-4 py-1" role="group" :aria-label="t('vote.prompt')">
          <button type="button" class="vote-btn h-11 w-11 text-stone-500 ring-stone-200" :class="lastVoted ? '' : 'invisible'" :aria-label="t('swipe.undo')" :title="t('swipe.undo')" @click="undo">
            <AppIcon name="undo" size="20" />
          </button>
          <button type="button" class="vote-btn h-[68px] w-[68px] text-3xl ring-letgo-500/50" :aria-label="t('vote.let_go')" :title="t('vote.let_go')" @click="decide('let_go')">
            <span aria-hidden="true">{{ VOTE_EMOJI.let_go }}</span>
          </button>
          <button type="button" class="vote-btn h-14 w-14 text-2xl ring-want-500/50" :aria-label="t('vote.want')" :title="t('vote.want')" @click="decide('want')">
            <span aria-hidden="true">{{ VOTE_EMOJI.want }}</span>
          </button>
          <button type="button" class="vote-btn h-[68px] w-[68px] text-3xl ring-keep-500/50" :aria-label="t('vote.keep')" :title="t('vote.keep')" @click="decide('keep')">
            <span aria-hidden="true">{{ VOTE_EMOJI.keep }}</span>
          </button>
          <span class="h-11 w-11" aria-hidden="true"></span>
        </div>
        <p class="pb-1 text-center text-[11px] leading-snug text-stone-500">{{ t('swipe.hint') }}</p>
      </div>
    </template>
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
