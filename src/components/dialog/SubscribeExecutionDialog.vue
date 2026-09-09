<script lang="ts" setup>
import type { SubscriptionExecutionStatus } from '@/api/types'
import router from '@/router'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasItemPermission, PERMISSION_FEATURE } from '@/utils/permission'
import { useNow } from '@vueuse/core'
import { useI18n } from 'vue-i18n'

/** 手动搜索的按需详情；预计时间只在本地更新，不触发额外请求。 */
const props = defineProps<{
  execution: Pick<SubscriptionExecutionStatus, 'state' | 'phase' | 'error' | 'next_run_at'>
  name?: string
  canRetry?: boolean
  retrying?: boolean
}>()
const emit = defineEmits<{
  close: []
  retry: []
}>()
const { t, locale } = useI18n()
const userStore = useUserStore()
const now = useNow({ interval: 1000 })
const terminalStates = new Set(['completed', 'failed', 'cancelled', 'skipped'])
const state = computed(() =>
  terminalStates.has(props.execution.state) ? props.execution.state : props.execution.phase || props.execution.state,
)
const waiting = computed(() => ['waiting_site_budget', 'waiting_subscription'].includes(state.value))
const failed = computed(() => state.value === 'failed')
const canManageSites = computed(() =>
  hasItemPermission(
    { permission: 'manage', feature: PERMISSION_FEATURE.MANAGE_SITE },
    buildUserPermissionContext(userStore.superUser, userStore.permissions),
  ),
)
const resumeHint = computed(() => {
  if (!waiting.value || !props.execution.next_run_at) return ''
  const nextRunAt = Date.parse(props.execution.next_run_at)
  if (!Number.isFinite(nextRunAt)) return ''
  if (nextRunAt <= now.value.getTime()) return t('subscribe.execution.resumeDue')
  const time = new Date(nextRunAt).toLocaleString(locale.value, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  return t('subscribe.execution.resumeAt', { time })
})

/** 跳转到用户有权使用的站点管理页，由现有页面完成检查与配置。 */
function openSiteManager() {
  if (!canManageSites.value) return
  emit('close')
  void router.push('/site')
}
</script>

<template>
  <VDialog :model-value="true" max-width="32rem" scrollable @update:model-value="!$event && emit('close')">
    <VCard>
      <VCardItem>
        <VCardTitle>{{ t('subscribe.execution.details') }}</VCardTitle>
        <VCardSubtitle v-if="name" class="mt-1">{{ name }}</VCardSubtitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <div class="text-body-1 font-weight-medium">{{ t(`subscribe.execution.state.${state}`) }}</div>
        <p v-if="waiting" class="text-body-2 mt-3 mb-0">
          {{
            t(state === 'waiting_subscription' ? 'subscribe.execution.taskResume' : 'subscribe.execution.autoResume')
          }}
        </p>
        <p v-if="resumeHint" class="text-body-2 mt-2 mb-0">{{ resumeHint }}</p>
        <p v-if="failed" class="text-body-2 mt-3 mb-0">{{ t('subscribe.execution.failedHint') }}</p>
        <details v-if="failed && execution.error" class="mt-4">
          <summary class="text-body-2 cursor-pointer">{{ t('subscribe.execution.failureDetails') }}</summary>
          <p class="execution-error text-body-2 mt-2 mb-0">{{ execution.error }}</p>
        </details>
      </VCardText>
      <VCardActions class="flex-wrap gap-2 px-4 pb-4">
        <VBtn v-if="failed && canRetry" color="primary" variant="tonal" :loading="retrying" @click="emit('retry')">
          {{ t('subscribe.execution.retry') }}
        </VBtn>
        <VBtn v-if="failed && canManageSites" variant="text" @click="openSiteManager">
          {{ t('subscribe.execution.checkSites') }}
        </VBtn>
        <VSpacer />
        <VBtn variant="text" @click="emit('close')">{{ t('common.close') }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.execution-error {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>
