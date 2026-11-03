<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { PHOTOS_BUCKET, invokeFunction, supabase } from '@/lib/supabase'
import { isAcceptedInput, preparePhoto, type PreparedPhoto } from '@/lib/image'
import { errorKey } from '@/lib/errors'
import { retryOnNetworkError } from '@/lib/retry'
import { useAuth } from '@/composables/useAuth'
import PageTitle from '@/components/PageTitle.vue'
import type { ClothingItem } from '@/types/database'

const { t, d, n } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuth()

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

const retentionDate = computed(() => {
  const date = new Date()
  date.setFullYear(date.getFullYear() + 2)
  return d(date, 'short')
})

function revokePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = null
}

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
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
    await router.push({ name: 'group', params: { groupId: groupId.value } })
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
  <section>
    <PageTitle :title="t('upload.title')" :back-to="{ name: 'group', params: { groupId } }" :back-label="t('group.feed')" />
    <form class="card flex flex-col gap-4" novalidate @submit.prevent="submit">
      <div>
        <label for="photo" class="label">{{ t('upload.choose') }}</label>
        <input
          id="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          class="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-700 file:px-4 file:py-2 file:text-white"
          :disabled="preparing || uploading"
          @change="onFile"
        />
        <p class="help">{{ t('upload.privacyNotice') }}</p>
      </div>

      <div v-if="step" role="status" aria-live="polite" class="flex flex-col gap-2 rounded-lg border border-brand-100 bg-brand-50 p-3">
        <div class="flex items-center gap-2 text-sm text-brand-800">
          <span class="h-4 w-4 animate-spin rounded-full border-2 border-brand-700 border-t-transparent" aria-hidden="true"></span>
          <span>{{ t(`upload.step.${step}`) }}</span>
          <span class="ml-auto text-xs text-brand-700">{{ t('upload.stepOf', { current: stepIndex + 1, total: STEPS.length }) }}</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-white" role="progressbar" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100">
          <div class="h-full rounded-full bg-brand-700 transition-all duration-500" :style="{ width: `${progressPercent}%` }"></div>
        </div>
      </div>
      <div v-if="previewUrl && prepared" class="flex flex-col gap-2">
        <img :src="previewUrl" :alt="t('upload.previewAlt')" class="max-h-96 w-full rounded-lg object-contain bg-stone-100" />
        <p class="text-xs text-stone-500">
          {{ t('upload.ready', { size: `${n(prepared.blob.size / 1024 / 1024, { maximumFractionDigits: 2 })} MiB`, width: prepared.width, height: prepared.height }) }}
        </p>
      </div>

      <div>
        <label for="title" class="label">{{ t('upload.itemTitle') }}</label>
        <input id="title" v-model="title" type="text" maxlength="80" class="input" :placeholder="t('upload.itemTitlePlaceholder')" />
      </div>

      <p class="alert-info">{{ t('upload.retentionNotice', { date: retentionDate }) }}</p>
      <p v-if="error" class="alert-error" role="alert">{{ t(error) }}</p>

      <button type="submit" class="btn-primary self-start" :disabled="!prepared || uploading || preparing">
        {{ uploading ? t('upload.uploading') : t('upload.submit') }}
      </button>
    </form>
  </section>
</template>
