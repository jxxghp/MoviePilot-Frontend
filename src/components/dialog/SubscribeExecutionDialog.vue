<script lang="ts" setup>
import { subscriptionDownloadKey } from '@/utils/subscriptionDownload'
import type { SubscriptionBatchStatus, SubscriptionExecutionStatus } from '@/api/types'
import router from '@/router'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasItemPermission, PERMISSION_FEATURE } from '@/utils/permission'
import { useNow } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import {
  formatSubscriptionResumeTime,
  subscriptionExecutionLabel,
  subscriptionExecutionResumeAt,
} from '@/utils/subscriptionExecution'

/** 手动搜索的按需详情；继续时间只在本地更新，不触发额外请求。 */
const props = defineProps<{
  execution: Pick<SubscriptionExecutionStatus, 'state' | 'phase' | 'error' | 'next_run_at' | 'submitted_count'> &
    Partial<Pick<SubscriptionBatchStatus, 'download_counts' | 'downloads' | 'downloads_omitted'>>
  name?: string
  canViewLogs?: boolean
  canRetry?: boolean
  retrying?: boolean
}>()
const emit = defineEmits<{
  close: []
  retry: []
  logs: []
}>()
const { t, locale } = useI18n()
const userStore = useUserStore()
const now = useNow({ interval: 15_000 })
const label = computed(() => subscriptionExecutionLabel(props.execution, now.value.getTime()))
const resumeAt = computed(() => subscriptionExecutionResumeAt(props.execution, now.value.getTime()))
const failed = computed(() => label.value === 'failed')
const canManageSites = computed(() =>
  hasItemPermission(
    { permission: 'manage', feature: PERMISSION_FEATURE.MANAGE_SITE },
    buildUserPermissionContext(userStore.superUser, userStore.permissions),
  ),
)
// 只给能据此行动的说明：排队、没资源、站点要等较久（后端说明哪个站为什么等）。
const hint = computed(() => {
  if (label.value === 'queued') return t('subscribe.execution.queuedHint')
  if (label.value === 'noResult') return t('subscribe.execution.noResultHint')
  if (label.value === 'waiting') return props.execution.error || ''
  return ''
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
        <div v-if="label" class="text-body-1 font-weight-medium">
          {{
            t(`subscribe.execution.label.${label}`, {
              time: resumeAt === null ? '' : formatSubscriptionResumeTime(resumeAt, locale),
            })
          }}
        </div>
        <p v-if="hint" class="text-body-2 mt-3 mb-0">{{ hint }}</p>
        <p v-if="execution.download_counts" class="text-body-2 mt-3 mb-0">
          {{
            t('subscriptionActivity.downloadSummary', {
              initial: execution.download_counts.initial_submitted || 0,
              upgrade: execution.download_counts.upgrade_submitted || 0,
              full: execution.download_counts.full_upgrade_submitted || 0,
            })
          }}
        </p>
        <ul v-if="execution.downloads?.length" class="execution-downloads text-body-2 mt-3">
          <li v-for="(download, index) in execution.downloads" :key="index">
            <strong>{{
              t(`subscriptionActivity.downloadType.${subscriptionDownloadKey(download.subscription_download)}`)
            }}</strong>
            <span class="d-block">{{ download.title }}</span>
          </li>
        </ul>
        <p v-if="execution.downloads_omitted" class="text-caption mt-2">
          {{ t('subscriptionActivity.omitted', { count: execution.downloads_omitted }) }}
        </p>
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
        <VBtn v-if="canViewLogs" variant="text" @click="emit('logs')">{{ t('subscribe.viewLogs') }}</VBtn>
        <VSpacer />
        <VBtn data-native-dialog-close variant="text" @click="emit('close')">{{ t('common.close') }}</VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.execution-downloads {
  padding-inline-start: 20px;
  overflow-wrap: anywhere;
}
.execution-downloads li + li {
  margin-block-start: 8px;
}
.execution-error {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>
