<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { errorKey } from '@/lib/errors'
import { useGroupsOverview } from '@/composables/useGroupsOverview'
import { useToast } from '@/composables/useToast'
import AppIcon from '@/components/AppIcon.vue'
import TopBar from '@/components/TopBar.vue'

const { t } = useI18n()
const router = useRouter()
const toast = useToast()
const overview = useGroupsOverview()

const name = ref('')
const membersCanUpload = ref(true)
const creating = ref(false)
const error = ref<string | null>(null)

async function createGroup() {
  const value = name.value.trim()
  if (!value) return
  creating.value = true
  error.value = null
  try {
    const { data, error: rpcError } = await supabase.rpc('create_group', { p_name: value, p_members_can_upload: membersCanUpload.value })
    if (rpcError) throw rpcError
    toast.show(t('toast.groupCreated'), { emoji: '🎈' })
    overview.selectGroup(data.id)
    void overview.load()
    await router.replace({ name: 'group', params: { groupId: data.id } })
  } catch (err) {
    error.value = errorKey(err)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="screen-scroll">
    <TopBar :title="t('home.createGroup')" :back="{ name: 'groups' }" />
    <form class="screen-body flex flex-col gap-5 pb-8 pt-2" novalidate @submit.prevent="createGroup">
      <div class="card flex flex-col gap-4">
        <div>
          <label for="group-name" class="label">{{ t('home.groupName') }}</label>
          <input id="group-name" v-model="name" type="text" maxlength="80" required class="input" :placeholder="t('home.groupNamePlaceholder')" autofocus />
        </div>
        <fieldset>
          <legend class="label">{{ t('group.uploadPolicy') }}</legend>
          <div class="grid grid-cols-2 gap-2">
            <label class="policy-option" :class="membersCanUpload ? 'policy-option-on' : ''">
              <input v-model="membersCanUpload" type="radio" name="upload-policy" :value="true" class="sr-only" />
              <AppIcon name="users" size="22" />
              <span class="text-sm font-medium">{{ t('group.uploadPolicyEveryone') }}</span>
            </label>
            <label class="policy-option" :class="!membersCanUpload ? 'policy-option-on' : ''">
              <input v-model="membersCanUpload" type="radio" name="upload-policy" :value="false" class="sr-only" />
              <AppIcon name="crown" size="22" />
              <span class="text-sm font-medium">{{ t('group.uploadPolicyOwner') }}</span>
            </label>
          </div>
        </fieldset>
      </div>
      <p class="alert-info">{{ t('home.createHint') }}</p>
      <p v-if="error" class="alert-error" role="alert">{{ t(error) }}</p>
      <button type="submit" class="btn-primary" :disabled="creating || !name.trim()">
        {{ creating ? t('home.creating') : t('home.create') }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.policy-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  border-radius: 1rem;
  border: 2px solid var(--color-stone-200);
  padding: 0.875rem 0.5rem;
  text-align: center;
  color: var(--color-stone-600);
  cursor: pointer;
}
.policy-option-on {
  border-color: var(--color-brand-500);
  background: var(--color-brand-50);
  color: var(--color-brand-800);
}
.policy-option:has(:focus-visible) {
  outline: 2px solid var(--color-brand-600);
  outline-offset: 2px;
}
</style>
