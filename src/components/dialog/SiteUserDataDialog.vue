<script lang="ts" setup>
import type { Site, SiteUserData } from '@/api/types'
import api from '@/api'
import { useDisplay, useTheme } from 'vuetify'
import { formatFileSize } from '@/@core/utils/formatters'
import ProgressDialog from '@/components/dialog/ProgressDialog.vue'
import { useI18n } from 'vue-i18n'
import { hexToRgb } from '@layouts/utils'

// 多语言支持
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  site: Object as PropType<Site>,
})

// 注册事件
const emit = defineEmits(['close'])

// 进度框
const progressDialog = ref(false)

// 失败状态保留对应操作，重试时不改变已展示的站点数据。
const failedOperation = ref<'load' | 'refresh'>()

const vuetifyTheme = useTheme()

const currentTheme = controlledComputed(
  () => vuetifyTheme.name.value,
  () => vuetifyTheme.current.value.colors,
)

const variableTheme = controlledComputed(
  () => vuetifyTheme.name.value,
  () => vuetifyTheme.current.value.variables,
)

/** 将 Vuetify 主题颜色转换为 ApexCharts 使用的透明色。 */
function toThemeRgba(color: unknown, opacity: string | number) {
  const rgb = hexToRgb(String(color))

  return rgb ? `rgba(${rgb},${opacity})` : String(color)
}

/** 将站点统计日期格式化为本地化短日期，减少图表横轴占用空间。 */
function formatChartDate(value: string) {
  if (!value) return ''

  return new Date(value).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  })
}

// 站点数据列表
const siteDatas = ref<SiteUserData[]>([])

// 只有最近一次加载或刷新操作可以更新弹窗状态，避免异步响应覆盖较新的操作结果。
let operationGeneration = 0

// 最新一天的数据
const siteData = computed(() => siteDatas.value[siteDatas.value.length - 1])

// 站点数据列表中的上传量、下载量数据生成图形使用的数据
const historySeries = computed(() => {
  return [
    {
      name: t('dialog.siteUserData.uploadTitle'),
      data: siteDatas.value.map(item => Math.round((item.upload ?? 0) / 1024 / 1024 / 1024)),
    },
    {
      name: t('dialog.siteUserData.downloadTitle'),
      data: siteDatas.value.map(item => Math.round((item.download ?? 0) / 1024 / 1024 / 1024)),
    },
  ]
})

// 图形选项
const historyChartOptions = computed(() => {
  const axisLabelColor = toThemeRgba(currentTheme.value['on-surface'], variableTheme.value['medium-emphasis-opacity'])
  const gridColor = toThemeRgba(variableTheme.value['border-color'], variableTheme.value['border-opacity'])
  const themeMode = vuetifyTheme.global.current.value.dark ? 'dark' : 'light'

  return {
    chart: {
      type: 'area',
      parentHeightOffset: 0,
      toolbar: { show: false },
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 450,
        animateGradually: { enabled: true, delay: 100 },
        dynamicAnimation: { enabled: true, speed: 350 },
      },
      background: 'transparent',
      foreColor: axisLabelColor,
      zoom: {
        enabled: false,
        allowMouseWheelZoom: false,
      },
      selection: { enabled: false },
    },
    theme: {
      mode: themeMode,
    },
    tooltip: {
      enabled: true,
      shared: true,
      intersect: false,
      theme: themeMode,
      x: {
        formatter: (value: string) => formatChartDate(value),
      },
      y: {
        formatter: (value: number) => `${value.toLocaleString()} GB`,
      },
    },
    grid: {
      borderColor: gridColor,
      strokeDashArray: 6,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: -10, left: 2, right: 8, bottom: 0 },
    },
    stroke: {
      width: [3, 3],
      lineCap: 'round',
      curve: 'smooth',
    },
    colors: [currentTheme.value.success, currentTheme.value.warning],
    legend: { show: false },
    markers: {
      size: 0,
      strokeWidth: 2,
      strokeColors: currentTheme.value.surface,
      hover: { size: 6, sizeOffset: 2 },
    },
    dataLabels: { enabled: false },
    xaxis: {
      type: 'category',
      categories: siteDatas.value.map(item => item.updated_day),
      labels: {
        show: true,
        formatter: (val: string) => formatChartDate(val),
        style: { colors: axisLabelColor, fontSize: '10px' },
      },
      axisTicks: { show: false },
      axisBorder: { show: false },
      crosshairs: { stroke: { color: currentTheme.value.success, opacity: 0.2, dashArray: 4 } },
    },
    yaxis: {
      title: {
        text: 'GB',
        style: { color: axisLabelColor, fontSize: '10px', fontWeight: 500 },
      },
      labels: {
        formatter: function (val: number) {
          return val.toLocaleString()
        },
        style: { colors: axisLabelColor, fontSize: '10px' },
      },
    },
    fill: {
      type: 'gradient',
      gradient: {
        shade: 'light',
        type: 'vertical',
        shadeIntensity: 0.28,
        opacityFrom: 0.38,
        opacityTo: 0.04,
        stops: [0, 90, 100],
      },
    },
    noData: {
      text: t('dialog.siteUserData.noData'),
      align: 'center',
      verticalAlign: 'middle',
      style: { color: axisLabelColor, fontSize: '13px' },
    },
  }
})

// 做种分布列，seeding_info的格式为[[x, y], [x, y], ...]，x为做种数，y为做种体积，做种体积需要转换为GB
const seedingSeries = computed(() => {
  const seedingInfo = siteData.value?.seeding_info as [number?, number?][] | undefined

  return [
    {
      name: t('dialog.siteUserData.volumeTitle'),
      data: seedingInfo?.map(item => [item[0] ?? 0, Math.round((item[1] ?? 0) / 1024 / 1024 / 1024)]) ?? [],
    },
  ]
})

// 做种分布图形选项
const seedingChartOptions = computed(() => {
  const axisLabelColor = toThemeRgba(currentTheme.value['on-surface'], variableTheme.value['medium-emphasis-opacity'])
  const gridColor = toThemeRgba(variableTheme.value['border-color'], variableTheme.value['border-opacity'])
  const themeMode = vuetifyTheme.global.current.value.dark ? 'dark' : 'light'

  return {
    chart: {
      type: 'scatter',
      parentHeightOffset: 0,
      toolbar: { show: false },
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 420,
        dynamicAnimation: { speed: 320 },
      },
      background: 'transparent',
      foreColor: axisLabelColor,
      zoom: {
        enabled: false,
        allowMouseWheelZoom: false,
      },
      selection: { enabled: false },
    },
    theme: {
      mode: themeMode,
    },
    tooltip: {
      enabled: true,
      theme: themeMode,
      intersect: true,
      x: {
        formatter: function (val: number) {
          return `${t('dialog.siteUserData.countTitle')}${val.toLocaleString()}`
        },
      },
      y: {
        formatter: (val: number) => `${val.toLocaleString()} GB`,
      },
    },
    grid: {
      borderColor: gridColor,
      strokeDashArray: 6,
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: true } },
      padding: { top: -4, left: 4, right: 12, bottom: 4 },
    },
    colors: [currentTheme.value.primary],
    markers: {
      size: 7,
      strokeWidth: 2,
      strokeColors: currentTheme.value.surface,
      hover: { size: 9, sizeOffset: 2 },
    },
    dataLabels: { enabled: false },
    xaxis: {
      type: 'numeric',
      labels: {
        show: true,
        formatter: function (val: number) {
          return Math.round(val).toLocaleString()
        },
        style: { colors: axisLabelColor, fontSize: '10px' },
      },
      title: {
        text: t('dialog.siteUserData.countTitle'),
        style: { color: axisLabelColor, fontSize: '10px', fontWeight: 500 },
      },
      tickAmount: 10,
      axisTicks: { show: false },
      axisBorder: { show: false },
    },
    yaxis: {
      title: {
        text: 'GB',
        style: { color: axisLabelColor, fontSize: '10px', fontWeight: 500 },
      },
      labels: {
        formatter: function (val: number) {
          return val.toLocaleString() + ' GB'
        },
        style: { colors: axisLabelColor, fontSize: '10px' },
      },
    },
    noData: {
      text: t('dialog.siteUserData.noData'),
      align: 'center',
      verticalAlign: 'middle',
      style: { color: axisLabelColor, fontSize: '13px' },
    },
  }
})

// 根据传入属性，计算列表数据中第一条与第二条的差值，如果没有第二条则差值为全部
const diffData = computed(() => {
  if (siteDatas.value.length < 2) {
    return siteData.value
  }
  const first = siteDatas.value[siteDatas.value.length - 1]
  const second = siteDatas.value[siteDatas.value.length - 2]
  return {
    bonus: (first.bonus ?? 0) - (second.bonus ?? 0),
    ratio: (first.ratio ?? 0) - (second.ratio ?? 0),
    upload: (first.upload ?? 0) - (second.upload ?? 0),
    download: (first.download ?? 0) - (second.download ?? 0),
    seeding: (first.seeding ?? 0) - (second.seeding ?? 0),
    seeding_size: (first.seeding_size ?? 0) - (second.seeding_size ?? 0),
  }
})

// 格式化差值
function getDiffString(diff: number | undefined, format: boolean = true) {
  if (diff === undefined) {
    return '0'
  }
  if (format) {
    return diff >= 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()
  }
  return diff >= 0 ? `+${diff}` : diff
}

// 根据差值的正负，返回不同的样式
function getDiffClass(diff: number | undefined) {
  if (diff === undefined) {
    return ''
  }
  if (diff == 0) {
    return ''
  }
  return diff > 0 ? 'text-success' : 'text-error'
}

// 查询站点用户数据
async function fetchSiteUserData(failureOperation: 'load' | 'refresh' = 'load', generation?: number) {
  const activeGeneration = generation ?? ++operationGeneration

  try {
    const result = await api.get<SiteUserData[]>(`site/userdata/${props.site?.id}`, { feedback: 'silent' })
    if (activeGeneration !== operationGeneration) return false

    // 使用nextTick确保DOM更新完成后再更新图表数据
    await nextTick()
    if (activeGeneration !== operationGeneration) return false

    siteDatas.value = result.sort((a, b) => (a.updated_day || '').localeCompare(b.updated_day || ''))

    failedOperation.value = undefined
    return true
  } catch (error) {
    if (activeGeneration !== operationGeneration) return false

    console.error(error)
    failedOperation.value = failureOperation
  }

  return false
}

// 刷新站点数据
async function refreshSiteData() {
  const generation = ++operationGeneration
  progressDialog.value = true
  try {
    await api.post<null>(`site/userdata/${props.site?.id}`, undefined, { feedback: 'silent' })
    if (generation !== operationGeneration) return

    await fetchSiteUserData('refresh', generation)
  } catch (error) {
    if (generation !== operationGeneration) return

    console.error(error)
    failedOperation.value = 'refresh'
  } finally {
    if (generation === operationGeneration) {
      progressDialog.value = false
    }
  }
}

// 重试最近失败的请求，刷新失败时继续保留当前数据。
function retryFailedOperation() {
  if (failedOperation.value === 'refresh') {
    refreshSiteData()
  } else {
    fetchSiteUserData()
  }
}

onBeforeMount(() => {
  // 延迟加载，确保组件完全挂载
  nextTick(() => {
    fetchSiteUserData()
  })
})
</script>

<template>
  <VDialog scrollable eager max-width="80rem" :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem>
        <VCardTitle>
          {{ t('dialog.siteUserData.title') }} - {{ props.site?.name }}
          <IconBtn @click.stop="refreshSiteData" color="info"><VIcon icon="mdi-refresh" /></IconBtn>
        </VCardTitle>
        <VDialogCloseBtn @click="emit('close')" />
      </VCardItem>
      <VDivider />
      <VCardText class="pt-5">
        <VAlert v-if="failedOperation" type="error" variant="tonal" class="mb-5">
          <div class="d-flex flex-wrap align-center justify-space-between gap-3">
            <span>
              {{
                failedOperation === 'refresh'
                  ? t('dialog.siteUserData.refreshFailed')
                  : t('dialog.siteUserData.loadFailed')
              }}
            </span>
            <VBtn size="small" variant="tonal" prepend-icon="mdi-refresh" @click="retryFailedOperation">
              {{ t('common.retry') }}
            </VBtn>
          </div>
        </VAlert>
        <VRow class="match-height site-data-summary-grid">
          <!-- 用户信息 -->
          <VCol cols="12" sm="6" md="3">
            <VCard class="site-data-summary-card site-data-summary-card--primary">
              <VCardText class="d-flex align-center">
                <div class="d-flex justify-space-between" style="inline-size: 100%">
                  <div class="d-flex flex-column gap-y-1 overflow-hidden">
                    <span class="text-base">{{ t('dialog.siteUserData.userLevel') }}</span>
                    <h5 class="text-h5 d-flex align-center gap-2 text-wrap">
                      {{ siteData?.user_level || t('dialog.siteUserData.noData') }}
                    </h5>
                  </div>
                  <VAvatar variant="tonal" size="42" rounded>
                    <VIcon icon="mdi-account"></VIcon>
                  </VAvatar>
                </div>
              </VCardText>
            </VCard>
          </VCol>
          <!-- 积分 -->
          <VCol cols="12" sm="6" md="3">
            <VCard class="site-data-summary-card site-data-summary-card--warning">
              <VCardText class="d-flex align-center">
                <div class="d-flex justify-space-between" style="inline-size: 100%">
                  <div class="d-flex flex-column gap-y-1 overflow-hidden">
                    <span class="text-base">{{ t('dialog.siteUserData.bonus') }}</span>
                    <h5 class="text-h5 d-flex align-center gap-2 text-wrap">
                      {{ siteData?.bonus?.toLocaleString() }}
                      <span class="text-base font-weight-regular" :class="getDiffClass(diffData?.bonus)">
                        ({{ getDiffString(diffData?.bonus) }})
                      </span>
                    </h5>
                  </div>
                  <VAvatar variant="tonal" size="42" rounded>
                    <VIcon icon="mdi-scoreboard"></VIcon>
                  </VAvatar>
                </div>
              </VCardText>
            </VCard>
          </VCol>
          <!-- 分享率 -->
          <VCol cols="12" sm="6" md="3">
            <VCard class="site-data-summary-card site-data-summary-card--info">
              <VCardText class="d-flex align-center">
                <div class="d-flex justify-space-between" style="inline-size: 100%">
                  <div class="d-flex flex-column gap-y-1">
                    <span class="text-base">{{ t('dialog.siteUserData.ratio') }}</span>
                    <h5 class="text-h5 d-flex align-center gap-2 text-wrap">
                      {{ siteData?.ratio }}
                      <span class="text-base font-weight-regular" :class="getDiffClass(diffData?.ratio)">
                        ({{ getDiffString(diffData?.ratio) }})
                      </span>
                    </h5>
                  </div>
                  <VAvatar variant="tonal" size="42" rounded>
                    <VIcon icon="mdi-percent"></VIcon>
                  </VAvatar>
                </div>
              </VCardText>
            </VCard>
          </VCol>
          <!-- 总上传量 -->
          <VCol cols="12" sm="6" md="3">
            <VCard class="site-data-summary-card site-data-summary-card--success">
              <VCardText class="d-flex align-center">
                <div class="d-flex justify-space-between" style="inline-size: 100%">
                  <div class="d-flex flex-column gap-y-1 overflow-hidden">
                    <span class="text-base">{{ t('dialog.siteUserData.uploadTotal') }}</span>
                    <h5 class="text-h5 d-flex align-center gap-2 text-wrap">
                      {{ formatFileSize(siteData?.upload || 0) }}
                      <span class="text-base font-weight-regular" :class="getDiffClass(diffData?.upload)">
                        ({{ formatFileSize(diffData?.upload || 0, 2, true) }})
                      </span>
                    </h5>
                  </div>
                  <VAvatar variant="tonal" size="42" rounded>
                    <VIcon icon="mdi-upload"></VIcon>
                  </VAvatar>
                </div>
              </VCardText>
            </VCard>
          </VCol>
          <!-- 总下载量 -->
          <VCol cols="12" sm="6" md="3">
            <VCard class="site-data-summary-card site-data-summary-card--warning">
              <VCardText class="d-flex align-center">
                <div class="d-flex justify-space-between" style="inline-size: 100%">
                  <div class="d-flex flex-column gap-y-1 overflow-hidden">
                    <span class="text-base">{{ t('dialog.siteUserData.downloadTotal') }}</span>
                    <h5 class="text-h5 d-flex align-center gap-2 text-wrap">
                      {{ formatFileSize(siteData?.download || 0) }}
                      <span class="text-base font-weight-regular" :class="getDiffClass(diffData?.download)">
                        ({{ formatFileSize(diffData?.download || 0, 2, true) }})
                      </span>
                    </h5>
                  </div>
                  <VAvatar variant="tonal" size="42" rounded>
                    <VIcon icon="mdi-download"></VIcon>
                  </VAvatar>
                </div>
              </VCardText>
            </VCard>
          </VCol>
          <!-- 总做种数 -->
          <VCol cols="12" sm="6" md="3">
            <VCard class="site-data-summary-card site-data-summary-card--primary">
              <VCardText class="d-flex align-center">
                <div class="d-flex justify-space-between" style="inline-size: 100%">
                  <div class="d-flex flex-column gap-y-1 overflow-hidden">
                    <span class="text-base">{{ t('dialog.siteUserData.seedingCount') }}</span>
                    <h5 class="text-h5 d-flex align-center gap-2 text-wrap">
                      {{ siteData?.seeding?.toLocaleString() }}
                      <span class="text-base font-weight-regular" :class="getDiffClass(diffData?.seeding)">
                        ({{ getDiffString(diffData?.seeding) }})
                      </span>
                    </h5>
                  </div>
                  <VAvatar variant="tonal" size="42" rounded>
                    <VIcon icon="mdi-seed"></VIcon>
                  </VAvatar>
                </div>
              </VCardText>
            </VCard>
          </VCol>
          <!-- 总做种体积 -->
          <VCol cols="12" sm="6" md="3">
            <VCard class="site-data-summary-card site-data-summary-card--info">
              <VCardText class="d-flex align-center">
                <div class="d-flex justify-space-between" style="inline-size: 100%">
                  <div class="d-flex flex-column gap-y-1 overflow-hidden">
                    <span class="text-base">{{ t('dialog.siteUserData.seedingSize') }}</span>
                    <h5 class="text-h5 d-flex align-center gap-2 text-wrap">
                      {{ formatFileSize(siteData?.seeding_size || 0) }}
                      <span class="text-base font-weight-regular" :class="getDiffClass(diffData?.seeding_size)">
                        ({{ formatFileSize(diffData?.seeding_size || 0, 2, true) }})
                      </span>
                    </h5>
                  </div>
                  <VAvatar variant="tonal" size="42" rounded>
                    <VIcon icon="mdi-database"></VIcon>
                  </VAvatar>
                </div>
              </VCardText>
            </VCard>
          </VCol>
          <!-- 加入时间 -->
          <VCol cols="12" sm="6" md="3">
            <VCard class="site-data-summary-card site-data-summary-card--secondary">
              <VCardText class="d-flex align-center">
                <div class="d-flex justify-space-between" style="inline-size: 100%">
                  <div class="d-flex flex-column gap-y-1 overflow-hidden">
                    <span class="text-base">{{ t('dialog.siteUserData.joinTime') }}</span>
                    <h5 class="text-h5 d-flex align-center gap-2 text-wrap">
                      {{ siteData?.join_at?.split(' ')[0] }}
                    </h5>
                  </div>
                  <VAvatar variant="tonal" size="42" rounded>
                    <VIcon icon="mdi-calendar"></VIcon>
                  </VAvatar>
                </div>
              </VCardText>
            </VCard>
          </VCol>
        </VRow>
        <VRow class="site-data-chart-grid match-height">
          <VCol cols="12" md="7">
            <VCard class="site-data-chart-card">
              <VCardItem class="site-data-chart-header">
                <template #prepend>
                  <VAvatar color="success" variant="tonal" size="34" rounded="lg">
                    <VIcon icon="mdi-chart-areaspline" size="19" />
                  </VAvatar>
                </template>
                <VCardTitle>{{ t('dialog.siteUserData.trafficHistory') }}</VCardTitle>
                <template #append>
                  <span class="site-data-chart-caption">GB</span>
                </template>
              </VCardItem>
              <VCardText class="site-data-chart-content">
                <div class="site-data-chart-plot">
                  <VApexChart type="line" :options="historyChartOptions" :series="historySeries" height="100%" />
                </div>
                <div class="site-data-chart-legend">
                  <span
                    ><i class="site-data-legend-dot site-data-legend-dot--upload" />{{ historySeries[0].name }}</span
                  >
                  <span
                    ><i class="site-data-legend-dot site-data-legend-dot--download" />{{ historySeries[1].name }}</span
                  >
                </div>
              </VCardText>
            </VCard>
          </VCol>
          <VCol cols="12" md="5">
            <VCard class="site-data-chart-card">
              <VCardItem class="site-data-chart-header">
                <template #prepend>
                  <VAvatar color="primary" variant="tonal" size="34" rounded="lg">
                    <VIcon icon="mdi-chart-scatter-plot" size="19" />
                  </VAvatar>
                </template>
                <VCardTitle>{{ t('dialog.siteUserData.seedingDistribution') }}</VCardTitle>
                <template #append>
                  <span class="site-data-chart-caption">GB</span>
                </template>
              </VCardItem>
              <VCardText class="site-data-chart-content">
                <div class="site-data-chart-plot">
                  <VApexChart type="scatter" :options="seedingChartOptions" :series="seedingSeries" height="100%" />
                </div>
                <div class="site-data-chart-legend">
                  <span><i class="site-data-legend-dot site-data-legend-dot--seed" />{{ seedingSeries[0].name }}</span>
                </div>
              </VCardText>
            </VCard>
          </VCol>
        </VRow>
      </VCardText>
    </VCard>
    <!-- 进度框 -->
    <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="t('dialog.siteUserData.refreshing')" />
  </VDialog>
</template>

<style scoped>
.site-data-summary-card,
.site-data-chart-card {
  overflow: hidden;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 0.35rem 1rem rgba(var(--v-theme-on-surface), 0.06);
}

.site-data-summary-card {
  --site-data-accent: var(--v-theme-primary);

  block-size: 100%;
  transition:
    border-color 0.2s ease,
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.site-data-summary-card--success {
  --site-data-accent: var(--v-theme-success);
}

.site-data-summary-card--warning {
  --site-data-accent: var(--v-theme-warning);
}

.site-data-summary-card--info {
  --site-data-accent: var(--v-theme-info);
}

.site-data-summary-card--secondary {
  --site-data-accent: var(--v-theme-secondary);
}

.site-data-summary-card:hover {
  border-color: rgba(var(--site-data-accent), 0.34);
  box-shadow: 0 0.5rem 1.25rem rgba(var(--v-theme-on-surface), 0.09);
  transform: translateY(-2px);
}

.site-data-summary-card :deep(.v-card-text) {
  position: relative;
  z-index: 1;
  min-block-size: 98px;
  padding: 1rem;
}

.site-data-summary-card :deep(.v-card-text > .d-flex) {
  gap: 0.85rem;
}

.site-data-summary-card .text-base {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.01em;
}

.site-data-summary-card .text-h5 {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 1.05rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.35;
}

.site-data-summary-card .text-h5 > .text-base {
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.045);
  font-size: 0.66rem;
  font-weight: 600;
  line-height: 1;
  padding: 0.28rem 0.42rem;
}

.site-data-summary-card .text-h5 > .text-base.text-success {
  border-color: rgba(var(--v-theme-success), 0.22);
  background: rgba(var(--v-theme-success), 0.1);
  color: rgb(var(--v-theme-success)) !important;
}

.site-data-summary-card .text-h5 > .text-base.text-error {
  border-color: rgba(var(--v-theme-error), 0.22);
  background: rgba(var(--v-theme-error), 0.1);
  color: rgb(var(--v-theme-error)) !important;
}

.site-data-summary-card :deep(.v-avatar) {
  flex: 0 0 auto;
  border: 1px solid rgba(var(--site-data-accent), 0.18);
  background: rgba(var(--site-data-accent), 0.13) !important;
  box-shadow: 0 0.45rem 1rem rgba(var(--site-data-accent), 0.12);
  color: rgb(var(--site-data-accent)) !important;
}

.site-data-chart-card {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 310px;
}

.site-data-chart-header {
  min-block-size: 64px;
}

.site-data-chart-header :deep(.v-card-title) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-data-chart-caption {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.site-data-chart-content {
  display: flex;
  flex: 1 1 auto;
  min-block-size: 0;
  flex-direction: column;
  overflow: hidden;
}

.site-data-chart-plot {
  flex: 1 1 auto;
  min-block-size: 230px;
  block-size: clamp(15rem, 25vw, 20rem);
  min-inline-size: 0;
}

.site-data-chart-legend {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 1rem;
  border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.72rem;
  padding-block-start: 0.65rem;
}

.site-data-chart-legend > span {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-inline-size: 0;
}

.site-data-legend-dot {
  display: inline-block;
  border-radius: 50%;
  block-size: 0.48rem;
  inline-size: 0.48rem;
  box-shadow: 0 0 0 3px rgba(var(--v-theme-on-surface), 0.06);
}

.site-data-legend-dot--upload {
  background: rgb(var(--v-theme-success));
}

.site-data-legend-dot--download {
  background: rgb(var(--v-theme-warning));
}

.site-data-legend-dot--seed {
  background: rgb(var(--v-theme-primary));
}

@media (max-width: 600px) {
  .site-data-chart-card {
    min-block-size: 290px;
  }

  .site-data-chart-plot {
    min-block-size: 210px;
    block-size: 14rem;
  }

  .site-data-chart-legend {
    gap: 0.75rem;
  }
}
</style>
