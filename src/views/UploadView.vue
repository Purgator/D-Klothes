<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { PHOTOS_BUCKET, invokeFunction, supabase } from '@/lib/supabase'
import { isAcceptedInput, preparePhoto, type PreparedPhoto } from '@/lib/image'
import { errorKey } from '@/lib/errors'
import { retryOnNetworkError } from '@/lib/retry'
import { useAuth } from '@/composables/useAuth'
import { useGroupsOverview } from '@/composables/useGroupsOverview'
import { haptic, useToast } from '@/composables/useToast'
import { takeSharedPhoto } from '@/lib/sharedPhoto'
import AppIcon from '@/components/AppIcon.vue'
import TopBar from '@/components/TopBar.vue'
import type { ClothingItem } from '@/types/database'

const { t, d, n } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuth()
const toast = useToast()
const overview = useGroupsOverview()

const groupId = computed(() => String(route.params.groupId))
const title = ref('')
const prepared = ref<PreparedPhoto | null>(null)
const previewUrl = ref<string | null>(null)
const preparing = ref(false)
const uploading = ref(false)
const error = ref<string | null>(null)

// Progress steps shown while the photo is processed and sent.
type Step = 'decoding' | 'compressing' | 'uploading' | 'registering'
const STEPS: Step[] = ['decoding', 'compressing', 'uploading', 'registering']
const step = ref<Step | null>(null)
const stepIndex = computed(() => (step.value ? STEPS.indexOf(step.value) : -1))
const progressPercent = computed(() => Math.round(((stepIndex.value + 1) / (STEPS.length + 1)) * 100))

// The server refuses uploads the group does not allow; this check only explains it earlier.
const allowed = ref<boolean | null>(null)
onMounted(async () => {
  // A photo shared from another app arrives already chosen.
  const shared = takeSharedPhoto()
  if (shared) void takeFile(shared)
  const { data } = await supabase.rpc('can_upload_to_group', { p_group_id: groupId.value })
  allowed.value = data === true
})

const retentionDate = computed(() => {
  const date = new Date()
  date.setFullYear(date.getFullYear() + 2)
  return d(date, 'short')
})

function revokePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = null
}

function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) void takeFile(file)
}

async function takeFile(file: File) {
  error.value = null
  prepared.value = null
  revokePreview()
  if (!isAcceptedInput(file)) {
    error.value = 'upload.unsupported'
    return
  }
  preparing.value = true
  step.value = 'decoding'
  try {
    const result = await preparePhoto(file, undefined, (phase) => (step.value = phase))
    prepared.value = result
    previewUrl.value = URL.createObjectURL(result.blob)
  } catch (err) {
    error.value = errorKey(err)
  } finally {
    preparing.value = false
    step.value = null
  }
}

async function submit() {
  const uid = auth.user.value?.id
  if (!prepared.value || !uid) return
  uploading.value = true
  step.value = 'uploading'
  error.value = null
  const path = `${groupId.value}/${uid}/${crypto.randomUUID()}.jpg`
  try {
    // Both steps are safe to repeat: the path is unique to this attempt, and the server
    // treats a second registration of the same object as the first one.
    await retryOnNetworkError(async () => {
      const { error: upError } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .upload(path, prepared.value!.blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '0' })
      // "Already exists" means an earlier attempt did reach the server.
      if (upError && !/exists|duplicate/i.test(upError.message)) throw upError
    })
    step.value = 'registering'
    try {
      await retryOnNetworkError(() =>
        invokeFunction<{ item: ClothingItem }>('register-photo', { group_id: groupId.value, path, title: title.value.trim() }),
      )
    } catch (err) {
      // The function removes rejected objects itself; this covers network failures before it ran.
      await supabase.storage.from(PHOTOS_BUCKET).remove([path])
      throw err
    }
    haptic([10, 30, 10])
    toast.show(t('toast.photoPublished'), { emoji: '📸' })
    void overview.load()
    // The review deck hides the uploader's own photos, so land on the collection instead.
    await router.replace({ name: 'group', params: { groupId: groupId.value } })
  } catch (err) {
    error.value = errorKey(err)
  } finally {
    uploading.value = false
    step.value = null
  }
}

onUnmounted(revokePreview)
</script>

<template>
  <div class="screen-scroll">
    <TopBar :title="t('upload.title')" :back="{ name: 'group', params: { groupId } }" />
    <div class="screen-body pb-8 pt-2">
      <p v-if="allowed === false" class="alert-warning" role="alert">{{ t('errors.upload_not_allowed') }}</p>
      <form v-else class="flex flex-col gap-4" novalidate @submit.prevent="submit">
        <input
          id="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          class="sr-only"
          :disabled="preparing || uploading"
          @change="onFile"
        />

        <!-- Picker: a big tap target before a photo is chosen, the preview afterwards -->
        <label
          v-if="!previewUrl"
          for="photo"
          class="flex aspect-[4/5] max-h-[55vh] cursor-pointer flex-col items-center justify-center gap-3 rounded-4xl border-2 border-dashed border-brand-300 bg-brand-50 text-brand-800 transition hover:bg-brand-100 active:scale-[0.99]"
        >
          <span class="inline-flex h-16 w-16 items-center justify-center rounded-full bg-white text-brand-600 shadow-float"><AppIcon name="camera" size="30" /></span>
          <span class="text-base font-semibold">{{ t('upload.choose') }}</span>
          <span class="px-6 text-center text-xs text-brand-700/80">{{ t('upload.chooseHint') }}</span>
        </label>
        <div v-else class="relative overflow-hidden rounded-4xl bg-stone-200 shadow-card">
          <img :src="previewUrl" :alt="t('upload.previewAlt')" class="max-h-[55vh] w-full object-contain" />
          <label for="photo" class="btn-secondary btn-sm absolute right-3 top-3 cursor-pointer shadow"><AppIcon name="refresh" size="16" /> {{ t('upload.changePhoto') }}</label>
          <p v-if="prepared" class="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
            {{ t('upload.ready', { size: `${n(prepared.blob.size / 1024 / 1024, { maximumFractionDigits: 2 })} MiB`, width: prepared.width, height: prepared.height }) }}
          </p>
        </div>

        <div v-if="step" role="status" aria-live="polite" class="flex flex-col gap-2 rounded-2xl border border-brand-100 bg-brand-50 p-3">
          <div class="flex items-center gap-2 text-sm text-brand-800">
            <span class="h-4 w-4 animate-spin rounded-full border-2 border-brand-700 border-t-transparent" aria-hidden="true"></span>
            <span>{{ t(`upload.step.${step}`) }}</span>
            <span class="ml-auto text-xs text-brand-700">{{ t('upload.stepOf', { current: stepIndex + 1, total: STEPS.length }) }}</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-white" role="progressbar" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100">
            <div class="h-full rounded-full bg-brand-600 transition-all duration-500" :style="{ width: `${progressPercent}%` }"></div>
          </div>
        </div>

        <div class="card">
          <label for="title" class="label">{{ t('upload.itemTitle') }}</label>
          <input id="title" v-model="title" type="text" maxlength="80" class="input" :placeholder="t('upload.itemTitlePlaceholder')" />
        </div>

        <ul class="flex flex-col gap-2 text-xs text-stone-600">
          <li class="flex gap-2"><AppIcon name="shield" size="16" class="mt-0.5 shrink-0 text-brand-600" /> {{ t('upload.privacyNotice') }}</li>
          <li class="flex gap-2"><AppIcon name="clock" size="16" class="mt-0.5 shrink-0 text-brand-600" /> {{ t('upload.retentionNotice', { date: retentionDate }) }}</li>
        </ul>
        <p v-if="error" class="alert-error" role="alert">{{ t(error) }}</p>

        <button type="submit" class="btn-primary" :disabled="!prepared || uploading || preparing">
          <AppIcon name="send" size="20" /> {{ uploading ? t('upload.uploading') : t('upload.submit') }}
        </button>
      </form>
    </div>
  </div>
</template>
