<script setup lang="ts">
import api from '@/api'
import type { DashboardSystemInfo } from '@/api/types'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useBackground } from '@/composables/useBackground'
import { useI18n } from 'vue-i18n'

const AboutDialog = defineAsyncComponent(() => import('@/components/dialog/AboutDialog.vue'))

const props = defineProps({
  // 是否允许刷新数据
  allowRefresh: {
    type: Boolean,
    default: true,
  },
})

const { t } = useI18n()
const { useDataRefresh } = useBackground()

// 系统摘要与本地运行时间校准点。
const systemInfo = ref<DashboardSystemInfo | null>(null)
const runtimeSyncedAt = ref(Date.now())
const runtimeNow = ref(Date.now())
let runtimeTimer: ReturnType<typeof setInterval> | null = null

const displayedRuntime = computed(() => {
  if (!systemInfo.value) return 0

  return systemInfo.value.runtime + Math.floor((runtimeNow.value - runtimeSyncedAt.value) / 1000)
})

/** 查询系统摘要并重新校准本地运行时间。 */
async function loadSystemInfo() {
  if (!props.allowRefresh) return

  try {
    systemInfo.value = await api.get('dashboard/system')
    runtimeSyncedAt.value = Date.now()
    runtimeNow.value = runtimeSyncedAt.value
  } catch (error) {
    console.error(error)
  }
}

/** 将运行秒数压缩为天、小时、分钟三级文本。 */
function formatRuntime(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  return t('dashboard.systemInfo.runtimeValue', { days, hours, minutes })
}

/** 打开关于页复用现有版本检查能力。 */
function openVersionDetails() {
  openSharedDialog(AboutDialog, {}, {}, { closeOn: ['close', 'update:modelValue'] })
}

useDataRefresh('dashboard-system-info', loadSystemInfo, 60000, true)

onMounted(() => {
  runtimeTimer = setInterval(() => {
    runtimeNow.value = Date.now()
  }, 60000)
})

onBeforeUnmount(() => {
  if (runtimeTimer) clearInterval(runtimeTimer)
})
</script>

<template>
  <VCard class="dashboard-system-card dashboard-grid-fill">
    <VCardItem class="dashboard-system-heading">
      <VCardTitle>{{ t('dashboard.systemInfo.title') }}</VCardTitle>
    </VCardItem>
    <VCardText class="dashboard-system-content">
      <dl class="dashboard-system-grid">
        <div>
          <dt>{{ t('dashboard.systemInfo.hostname') }}</dt>
          <dd>{{ systemInfo?.hostname || '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('dashboard.systemInfo.operatingSystem') }}</dt>
          <dd>{{ systemInfo?.operating_system || '—' }}</dd>
        </div>
        <div>
          <dt>{{ t('dashboard.systemInfo.runtime') }}</dt>
          <dd>{{ systemInfo ? formatRuntime(displayedRuntime) : '—' }}</dd>
        </div>
      </dl>
      <div class="dashboard-system-footer">
        <span>{{ t('dashboard.systemInfo.version') }}</span>
        <strong>{{ systemInfo?.version || '—' }}</strong>
        <VBtn size="small" variant="text" color="primary" class="dashboard-grid-no-drag" @click="openVersionDetails">
          {{ t('dashboard.systemInfo.checkUpdate') }}
        </VBtn>
      </div>
    </VCardText>
  </VCard>
</template>

<style scoped>
.dashboard-system-card {
  display: flex;
  flex-direction: column;
  block-size: 100%;
}

.dashboard-system-heading {
  padding-block: 0.8rem 0.2rem;
}

.dashboard-system-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  padding-block: 0.35rem 0.7rem;
}

.dashboard-system-grid {
  display: grid;
  grid-template-columns: 0.8fr 1.25fr 1fr;
  margin: 0;
}

.dashboard-system-grid > div {
  min-inline-size: 0;
  padding-inline: 0.75rem;
}

.dashboard-system-grid > div:first-child {
  padding-inline-start: 0;
}

.dashboard-system-grid > div + div {
  border-inline-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.dashboard-system-grid dt,
.dashboard-system-footer > span {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.7rem;
}

.dashboard-system-grid dd {
  overflow: hidden;
  margin: 0.2rem 0 0;
  font-size: 0.76rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-system-footer {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  gap: 0.6rem;
  margin-block-start: auto;
  padding-block-start: 0.5rem;
}

.dashboard-system-footer strong {
  font-size: 0.75rem;
}

@media (max-width: 740px) {
  .dashboard-system-grid {
    grid-template-columns: 1fr;
    gap: 0.6rem;
  }

  .dashboard-system-grid > div {
    padding-inline: 0;
  }

  .dashboard-system-grid > div + div {
    border-inline-start: 0;
  }
}
</style>
