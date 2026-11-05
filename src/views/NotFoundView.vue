<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Illustration from '@/components/Illustration.vue'

const { t } = useI18n()
</script>

<template>
  <div class="screen-fixed items-center justify-center px-6 text-center">
    <Illustration name="lost" class="w-56 max-w-[60%]" />
    <h1 class="mt-4 text-2xl font-bold">{{ t('app.notFoundTitle') }}</h1>
    <p class="mt-1 mb-5 text-stone-600">{{ t('app.notFoundBody') }}</p>
    <RouterLink :to="{ name: 'home' }" class="btn-primary">{{ t('app.goHome') }}</RouterLink>
  </div>
</template>
