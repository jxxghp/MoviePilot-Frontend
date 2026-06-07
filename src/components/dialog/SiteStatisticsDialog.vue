<script lang="ts" setup>
import type { PropType } from 'vue'
import api from '@/api'
import type { Site, SiteStatistic } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 国际化
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  sites: {
    type: Array as PropType<Site[]>,
    default: () => [],
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue'])

// 站点统计数据
const siteStats = ref<SiteStatistic[]>([])

// 是否加载中
const loading = ref(false)

// 当前选中的站点
const selectedSite = ref<Site | null>(null)

// 耗时记录详情弹窗
const detailDialog = ref(false)

// 获取站点统计数据
async function fetchSiteStats() {
  try {
    loading.value = true
    const response = await api.get('site/statistic')
    siteStats.value = Array.isArray(response) ? response : response.data || []
    loading.value = false
  } catch (error) {
    console.error('Failed to fetch site statistics:', error)
    loading.value = false
  }
}

// 根据站点域名获取统计数据
function getSiteStats(domain: string): SiteStatistic | undefined {
  return siteStats.value.find(stat => stat.domain === domain)
}

// 获取站点连接状态
function getConnectionStatus(stats: SiteStatistic | undefined): string {
  if (!stats || Object.keys(stats).length === 0) {
    return 'unknown'
  }
  if (stats.lst_state === 1) {
    return 'failed'
  } else if (stats.lst_state === 0) {
    if (!stats.seconds) return 'unknown'
    if (stats.seconds >= 5) return 'slow'
    return 'connected'
  }
  return 'unknown'
}

// 获取状态颜色
function getStatusColor(status: string): string {
  switch (status) {
    case 'connected':
      return 'success'
    case 'slow':
      return 'warning'
    case 'failed':
      return 'error'
    default:
      return 'secondary'
  }
}

// 获取状态图标
function getStatusIcon(status: string): string {
  switch (status) {
    case 'connected':
      return 'mdi-wifi'
    case 'slow':
      return 'mdi-wifi-strength-2'
    case 'failed':
      return 'mdi-wifi-off'
    default:
      return 'mdi-help-circle'
  }
}

// 获取状态文本
function getStatusText(status: string): string {
  switch (status) {
    case 'connected':
      return t('site.connectionNormal')
    case 'slow':
      return t('site.connectionSlow')
    case 'failed':
      return t('site.connectionFailed')
    default:
      return t('site.connectionUnknown')
  }
}

// 获取耗时颜色
function getTimeColor(seconds: number | undefined): string {
  if (!seconds) return 'secondary'
  if (seconds < 2) return 'success'
  if (seconds < 5) return 'warning'
  return 'error'
}

// 获取成功率（与列表/概览口径一致）
function getSuccessRate(stats: SiteStatistic | undefined): string {
  if (!stats) return '-'
  const success = Number(stats.success ?? 0)
  const fail = Number(stats.fail ?? 0)
  const total = success + fail
  if (total <= 0) return '-'
  return String(Math.round((success / total) * 100))
}

// 解析耗时记录
function parseTimeRecords(note: any): Array<{ time: string; duration: number }> {
  if (!note) return []

  try {
    // note可能是字符串或对象，如果是字符串则解析
    const records = typeof note === 'string' ? JSON.parse(note) : note

    if (typeof records === 'object' && records !== null) {
      const result = Object.entries(records)
        .map(([time, duration]) => ({
          time,
          duration: Number(duration) || 0,
        }))
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .slice(0, 10) // 只显示最近10条记录

      return result
    }
  } catch (error) {
    console.error('Failed to parse time records:', error)
  }

  return []
}

// 查看详情
function viewDetail(site: Site) {
  selectedSite.value = site
  detailDialog.value = true
}

// 关闭弹窗
function closeDialog() {
  emit('update:modelValue', false)
}

// 计算属性：按平均耗时排序的站点列表
const sortedSites = computed(() => {
  return props.sites
    .map(site => {
      const stats = getSiteStats(site.domain)
      return {
        site,
        stats,
        status: getConnectionStatus(stats),
        avgTime: stats?.seconds || 0,
      }
    })
    .sort((a, b) => {
      // 先按状态排序：connected > slow > failed > unknown
      const statusOrder = { connected: 0, slow: 1, failed: 2, unknown: 3 }
      const statusDiff =
        statusOrder[a.status as keyof typeof statusOrder] - statusOrder[b.status as keyof typeof statusOrder]
      if (statusDiff !== 0) return statusDiff

      // 再按平均耗时排序
      return a.avgTime - b.avgTime
    })
})

// 统计总览（与列表口径一致）
const overviewCounts = computed(() => {
  const items = sortedSites.value
  const total = items.length
  const connected = items.filter(i => i.status === 'connected').length
  const slow = items.filter(i => i.status === 'slow').length
  const failed = items.filter(i => i.status === 'failed').length
  const unknown = total - connected - slow - failed
  return { total, connected, slow, failed, unknown }
})

onMounted(() => {
  fetchSiteStats()
})
</script>

<template>
  <VDialog max-width="50rem" :fullscreen="display.smAndDown.value" scrollable>
    <VCard>
      <!-- 标题栏 -->
      <VCardItem>
        <VDialogCloseBtn @click="closeDialog" />
        <template #prepend>
          <VIcon icon="mdi-chart-line" class="me-2" />
        </template>
        <VCardTitle>
          {{ t('site.statistics') }}
        </VCardTitle>
      </VCardItem>
      <VDivider />
      <!-- 内容区域 -->
      <VCardText class="pa-0">
        <LoadingBanner v-if="loading" class="my-8" />

        <div v-else class="site-statistics-content">
          <!-- 统计概览 -->
          <div class="statistics-overview pa-4">
            <div class="d-flex flex-wrap gap-4">
              <div class="stat-card">
                <div class="stat-number">{{ overviewCounts.total }}</div>
                <div class="stat-label">{{ t('site.totalSites') }}</div>
              </div>
              <div class="stat-card">
                <div class="stat-number success--text">{{ overviewCounts.connected }}</div>
                <div class="stat-label">{{ t('site.normalSites') }}</div>
              </div>
              <div class="stat-card">
                <div class="stat-number warning--text">{{ overviewCounts.slow }}</div>
                <div class="stat-label">{{ t('site.slowSites') }}</div>
              </div>
              <div class="stat-card">
                <div class="stat-number error--text">{{ overviewCounts.failed }}</div>
                <div class="stat-label">{{ t('site.failedSites') }}</div>
              </div>
            </div>
          </div>

          <!-- 站点列表 -->
          <div class="sites-list">
            <div
              v-for="item in sortedSites"
              :key="item.site.id"
              class="site-item pa-4 border-b"
              :class="`border-${getStatusColor(item.status)}`"
            >
              <div class="d-flex align-center justify-space-between">
                <!-- 左侧：站点信息 -->
                <div class="d-flex align-center flex-1 min-w-0">
                  <!-- 状态指示器 -->
                  <div class="status-indicator me-3" :class="getStatusColor(item.status)">
                    <VIcon :icon="getStatusIcon(item.status)" size="20" />
                  </div>

                  <!-- 站点名称和状态 -->
                  <div class="flex-1 min-w-0">
                    <div class="d-flex align-center">
                      <h4 class="text-h6 mb-1 truncate">{{ item.site.name }}</h4>
                      <VChip :color="getStatusColor(item.status)" size="small" class="ml-2" variant="tonal">
                        {{ getStatusText(item.status) }}
                      </VChip>
                    </div>
                    <div class="text-caption text-medium-emphasis">{{ item.site.domain }}</div>
                  </div>
                </div>

                <!-- 右侧：统计信息 -->
                <div class="d-flex align-center gap-4">
                  <!-- 平均耗时 -->
                  <div class="text-center">
                    <div class="text-h6 font-weight-bold" :class="`text-${getTimeColor(item.stats?.seconds)}`">
                      {{ item.stats?.seconds || '-' }}s
                    </div>
                    <div class="text-caption text-medium-emphasis">{{ t('site.averageTime') }}</div>
                  </div>

                  <!-- 成功率 -->
                  <div class="text-center">
                    <div class="text-h6 font-weight-bold">{{ getSuccessRate(item.stats) }}%</div>
                    <div class="text-caption text-medium-emphasis">{{ t('site.successRate') }}</div>
                  </div>

                  <!-- 详情按钮 -->
                  <VBtn icon variant="text" size="small" @click="viewDetail(item.site)">
                    <VIcon icon="mdi-information-outline" />
                  </VBtn>
                </div>
              </div>
            </div>
          </div>
        </div>
      </VCardText>
    </VCard>

    <!-- 详情弹窗 -->
    <VDialog v-model="detailDialog" :max-width="display.mdAndUp.value ? 600 : '95%'" scrollable>
      <VCard v-if="selectedSite">
        <VCardItem class="py-3">
          <template #prepend>
            <VIcon icon="mdi-information-outline" class="me-2" />
          </template>
          <VCardTitle> {{ selectedSite.name }} - {{ t('site.timeRecords') }} </VCardTitle>
          <VDialogCloseBtn @click="detailDialog = false" />
        </VCardItem>
        <VDivider />
        <VCardText>
          <div v-if="getSiteStats(selectedSite.domain)">
            <div class="mb-4">
              <h5 class="text-h6 mb-2">{{ t('site.statistics') }}</h5>
              <div class="d-flex flex-wrap gap-4">
                <div class="stat-item">
                  <span class="stat-label">{{ t('site.successCount') }}:</span>
                  <span class="stat-value success--text">
                    {{ getSiteStats(selectedSite.domain)?.success || 0 }}
                  </span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">{{ t('site.failCount') }}:</span>
                  <span class="stat-value error--text">
                    {{ getSiteStats(selectedSite.domain)?.fail || 0 }}
                  </span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">{{ t('site.averageTime') }}:</span>
                  <span class="stat-value" :class="`text-${getTimeColor(getSiteStats(selectedSite.domain)?.seconds)}`">
                    {{ getSiteStats(selectedSite.domain)?.seconds || '-' }}s
                  </span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">{{ t('site.lastAccess') }}:</span>
                  <span class="stat-value">
                    {{ getSiteStats(selectedSite.domain)?.lst_mod_date || '-' }}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h5 class="text-h6 mb-2">{{ t('site.recentTimeRecords') }}</h5>
              <div class="time-records">
                <div
                  v-for="(record, index) in parseTimeRecords(getSiteStats(selectedSite.domain)?.note)"
                  :key="index"
                  class="time-record-item pa-3 border rounded mb-2"
                  :class="`border-${getTimeColor(record.duration)}`"
                >
                  <div class="d-flex justify-space-between align-center">
                    <div>
                      <div class="text-body-2 font-weight-medium">{{ record.time }}</div>
                      <div class="text-caption text-medium-emphasis">{{ t('site.accessTime') }}</div>
                    </div>
                    <div class="text-end">
                      <div class="text-h6 font-weight-bold" :class="`text-${getTimeColor(record.duration)}`">
                        {{ record.duration }}s
                      </div>
                      <div class="text-caption text-medium-emphasis">{{ t('site.responseTime') }}</div>
                    </div>
                  </div>
                </div>

                <div
                  v-if="parseTimeRecords(getSiteStats(selectedSite.domain)?.note).length === 0"
                  class="text-center pa-4"
                >
                  <VIcon icon="mdi-information-outline" size="48" color="secondary" class="mb-2" />
                  <div class="text-body-1 text-medium-emphasis">{{ t('site.noTimeRecords') }}</div>
                </div>
              </div>
            </div>
          </div>
        </VCardText>
      </VCard>
    </VDialog>
  </VDialog>
</template>

<style scoped>
.statistics-overview {
  background: linear-gradient(135deg, var(--v-theme-surface) 0%, var(--v-theme-surface-variant) 100%);
  border-block-end: 1px solid var(--v-border-color);
}

.stat-card {
  padding: 16px;
  background: var(--v-theme-surface);
  min-inline-size: 100px;
  text-align: center;
}

.stat-number {
  font-size: 24px;
  font-weight: bold;
  line-height: 1;
  margin-block-end: 4px;
}

.stat-label {
  color: var(--v-theme-on-surface-variant);
  font-size: 12px;
}

.sites-list {
  background: var(--v-theme-surface);
}

.site-item {
  transition: background-color 0.2s ease;
}

.site-item:hover {
  background: var(--v-theme-surface-variant);
}

.status-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--v-theme-surface-variant);
  block-size: 40px;
  inline-size: 40px;
}

.status-indicator.success {
  background: rgba(var(--v-theme-success), 0.1);
  color: rgb(var(--v-theme-success));
}

.status-indicator.warning {
  background: rgba(var(--v-theme-warning), 0.1);
  color: rgb(var(--v-theme-warning));
}

.status-indicator.error {
  background: rgba(var(--v-theme-error), 0.1);
  color: rgb(var(--v-theme-error));
}

.status-indicator.secondary {
  background: rgba(var(--v-theme-secondary), 0.1);
  color: rgb(var(--v-theme-secondary));
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stat-item .stat-label {
  color: var(--v-theme-on-surface-variant);
  font-weight: 500;
}

.stat-value {
  font-weight: bold;
}

.time-records {
  max-block-size: 300px;
  overflow-y: auto;
}

.time-record-item {
  transition: all 0.2s ease;
}
</style>
