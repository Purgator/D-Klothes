<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { shareLink, welcomeUrl } from '@/lib/share'
import { useToast } from '@/composables/useToast'
import AppIcon from '@/components/AppIcon.vue'

defineProps<{ primary?: boolean; compact?: boolean; light?: boolean }>()
const { t } = useI18n()
const toast = useToast()
const url = ref(welcomeUrl())
const showUrl = ref(false)

async function share() {
  const outcome = await shareLink({ title: t('app.name'), text: t('welcome.shareText'), url: url.value })
  if (outcome === 'copied') toast.show(t('toast.linkCopied'), { emoji: '🔗' })
  else if (outcome === 'unsupported') showUrl.value = true
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <button
      type="button"
      :class="['w-full', primary ? 'btn-primary' : light ? 'btn bg-white/15 text-white ring-1 ring-white/40 hover:bg-white/25' : 'btn-secondary', compact ? 'btn-sm' : '']"
      @click="share"
    >
      <AppIcon name="share" :size="compact ? 16 : 20" /> {{ t('app.share') }}
    </button>
    <input
      v-if="showUrl"
      type="text"
      readonly
      class="input font-mono text-xs"
      :value="url"
      :aria-label="t('app.share')"
      @focus="($event.target as HTMLInputElement).select()"
    />
  </div>
</template>
