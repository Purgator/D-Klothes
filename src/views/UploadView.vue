<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { PHOTOS_BUCKET, invokeFunction, supabase } from '@/lib/supabase'
import { isAcceptedInput, preparePhoto, type PreparedPhoto } from '@/lib/image'
import { errorKey } from '@/lib/errors'
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
  try {
    const result = await preparePhoto(file)
    prepared.value = result
    previewUrl.value = URL.createObjectURL(result.blob)
  } catch (err) {
    error.value = errorKey(err)
  } finally {
    preparing.value = false
  }
}

async function submit() {
  const uid = auth.user.value?.id
  if (!prepared.value || !uid) return
  uploading.value = true
  error.value = null
  const path = `${groupId.value}/${uid}/${crypto.randomUUID()}.jpg`
  try {
    const { error: upError } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .upload(path, prepared.value.blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '0' })
    if (upError) throw upError
    try {
      await invokeFunction<{ item: ClothingItem }>('register-photo', { group_id: groupId.value, path, title: title.value.trim() })
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

      <p v-if="preparing" role="status" class="text-sm text-stone-600">{{ t('upload.preparing') }}</p>
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
