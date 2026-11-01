<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <section class="mx-auto mt-10 max-w-md text-center">
    <h1 class="mb-2 text-2xl font-semibold">{{ t('app.notFoundTitle') }}</h1>
    <p class="mb-4 text-stone-600">{{ t('app.notFoundBody') }}</p>
    <RouterLink :to="{ name: 'home' }" class="btn-primary">{{ t('app.goHome') }}</RouterLink>
  </section>
</template>
