<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useGroupsOverview } from '@/composables/useGroupsOverview'
import { collectSharedPhoto, holdSharedPhoto } from '@/lib/sharedPhoto'
import AppIcon from '@/components/AppIcon.vue'
import GroupAvatar from '@/components/GroupAvatar.vue'
import Illustration from '@/components/Illustration.vue'
import TopBar from '@/components/TopBar.vue'

const { t } = useI18n()
const router = useRouter()
const auth = useAuth()
const overview = useGroupsOverview()

const file = ref<File | null>(null)
const previewUrl = ref<string | null>(null)
const collected = ref(false)

// Groups the caller may add photos to (the server re-checks on upload).
const targets = computed(() =>
  overview.groups.value.filter((g) => g.members_can_upload || g.owner_id === auth.user.value?.id),
)

onMounted(async () => {
  file.value = await collectSharedPhoto()
  if (file.value) previewUrl.value = URL.createObjectURL(file.value)
  collected.value = true
  void overview.load()
})
onUnmounted(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})

function pick(groupId: string) {
  holdSharedPhoto(file.value)
  void router.replace({ name: 'upload', params: { groupId } })
}
</script>

<template>
  <div class="screen-scroll">
    <TopBar :title="t('share.title')" :back="{ name: 'home' }" />
    <div class="screen-body pb-8 pt-2">
      <div v-if="!collected || !overview.loaded.value" class="h-40 animate-pulse rounded-3xl bg-stone-200" role="status" :aria-label="t('app.loading')"></div>

      <div v-else-if="!file" class="flex flex-col items-center gap-4 py-8 text-center">
        <Illustration name="inbox" class="w-52 max-w-[55%]" />
        <p class="text-sm text-stone-600">{{ t('share.nothing') }}</p>
        <RouterLink :to="{ name: 'home' }" class="btn-primary" replace>{{ t('app.goHome') }}</RouterLink>
      </div>

      <template v-else>
        <div class="mb-4 flex items-center gap-3 rounded-3xl bg-white p-3 shadow-card">
          <img v-if="previewUrl" :src="previewUrl" :alt="t('upload.previewAlt')" class="h-20 w-20 shrink-0 rounded-2xl object-cover" />
          <div class="min-w-0">
            <p class="truncate font-semibold">{{ file.name }}</p>
            <p class="text-xs text-stone-500">{{ t('share.body') }}</p>
          </div>
        </div>

        <p v-if="!targets.length" class="alert-warning" role="alert">{{ t('share.noGroup') }}</p>
        <ul v-else class="list-group">
          <li v-for="g in targets" :key="g.id">
            <button type="button" class="list-row" @click="pick(g.id)">
              <GroupAvatar :name="g.name" size="sm" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-medium">{{ g.name }}</span>
                <span class="block text-xs text-stone-500">{{ t('home.memberCount', { count: g.memberCount }, g.memberCount) }}</span>
              </span>
              <AppIcon name="chevron-right" size="18" class="text-stone-400" />
            </button>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>
