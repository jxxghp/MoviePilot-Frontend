<script setup lang="ts">
import { useTheme } from 'vuetify'
import { hexToRgb } from '@layouts/utils'
import api from '@/api'
import { formatDashboardFileSize, useAnimatedDashboardNumber } from '@/composables/useDashboardMotion'
import { useI18n } from 'vue-i18n'
import { useBackground } from '@/composables/useBackground'
import { useKeepAliveRefresh } from '@/composables/useKeepAliveRefresh'

// 国际化
const { t } = useI18n()
const { useDataRefresh } = useBackground()

// 输入参数
const props = defineProps({
  // 是否允许刷新数据
  allowRefresh: {
    type: Boolean,
    default: true,
  },
})

const vuetifyTheme = useTheme()

const currentTheme = controlledComputed(
  () => vuetifyTheme.name.value,
  () => vuetifyTheme.current.value.colors,
)
const variableTheme = controlledComputed(
  () => vuetifyTheme.name.value,
  () => vuetifyTheme.current.value.variables,
)

// 时间序列 - 上行和下行流量
const series = ref([
  {
    name: t('dashboard.upload'),
    data: [0],
  },
  {
    name: t('dashboard.download'),
    data: [0],
  },
])

// 当前值
const currentUpload = ref(0)
const currentDownload = ref(0)
const animatedCurrentUpload = useAnimatedDashboardNumber(currentUpload, {
  duration: 520,
})
const animatedCurrentDownload = useAnimatedDashboardNumber(currentDownload, {
  duration: 520,
})
const animatedCurrentUploadText = computed(() => `${formatDashboardFileSize(animatedCurrentUpload.value, 2, currentUpload.value)}/s`)
const animatedCurrentDownloadText = computed(
  () => `${formatDashboardFileSize(animatedCurrentDownload.value, 2, currentDownload.value)}/s`,
)

// 根据最近上、下行峰值自动选择图表刻度，低流量时仍保留可读的区域高度。
const networkChartMax = computed(() => {
  const peak = Math.max(...series.value.flatMap(item => item.data), currentUpload.value, currentDownload.value)
  if (peak <= 0) return 1024

  const unit = 1024 ** Math.max(0, Math.floor(Math.log(peak) / Math.log(1024)))

  return Math.max(unit, Math.ceil(peak / unit) * unit)
})

const chartOptions = controlledComputed(
  () => `${vuetifyTheme.name.value}:${networkChartMax.value}`,
  () => {
    const axisLabelColor = `rgba(${hexToRgb(currentTheme.value['on-surface'])},${variableTheme.value['medium-emphasis-opacity']})`

    return {
      chart: {
        parentHeightOffset: 0,
        toolbar: { show: false },
        zoom: { enabled: false, allowMouseWheelZoom: false },
        selection: { enabled: false },
        animations: { enabled: false },
        foreColor: axisLabelColor,
      },
      tooltip: {
        enabled: false,
      },
      grid: {
        borderColor: `rgba(${hexToRgb(String(variableTheme.value['border-color']))},${
          variableTheme.value['border-opacity']
        })`,
        strokeDashArray: 6,
        xaxis: {
          lines: { show: false },
        },
        yaxis: {
          lines: { show: true },
        },
        padding: {
          top: -10,
          left: 0,
          right: 5,
          bottom: 5,
        },
      },
      stroke: {
        width: 3,
        lineCap: 'butt',
        curve: 'smooth',
      },
      colors: [currentTheme.value.warning, currentTheme.value.info],
      fill: {
        opacity: [0.2, 0.12],
      },
      markers: {
        size: 6,
        offsetY: 4,
        offsetX: 4,
        strokeWidth: 3,
        colors: ['transparent'],
        strokeColors: 'transparent',
        discrete: [
          {
            size: 5.5,
            seriesIndex: 0,
            strokeColor: currentTheme.value.warning,
            fillColor: currentTheme.value.surface,
          },
          {
            size: 5.5,
            seriesIndex: 1,
            strokeColor: currentTheme.value.info,
            fillColor: currentTheme.value.surface,
          },
        ],
        hover: { size: 7 },
      },
      dataLabels: {
        enabled: false,
      },
      xaxis: {
        labels: { show: false },
        axisTicks: { show: false },
        axisBorder: { show: false },
      },
      yaxis: {
        labels: {
          show: true,
          formatter: (value: number) =>
            `${formatDashboardFileSize(value, value >= 1024 ** 2 ? 1 : 0, networkChartMax.value)}/s`,
          style: {
            colors: axisLabelColor,
            fontSize: '10px',
          },
        },
        tickAmount: 2,
        max: networkChartMax.value,
        min: 0,
      },
      legend: {
        show: false,
      },
    }
  },
)

// 调用API接口获取最新网络流量
async function getNetworkUsage() {
  if (!props.allowRefresh) return
  try {
    // 请求数据 - 接口返回 [上行流量, 下行流量]
    const data: [number, number] = (await api.get('dashboard/network')) ?? [0, 0]
    currentUpload.value = Number(data[0]) || 0
    currentDownload.value = Number(data[1]) || 0

    // 使用nextTick确保DOM更新完成后再更新图表数据
    await nextTick()

    // 添加到序列
    series.value[0].data.push(currentUpload.value)
    series.value[1].data.push(currentDownload.value)

    // 序列超过30条记录时，清掉前面的
    if (series.value[0].data.length > 30) {
      series.value[0].data.shift()
      series.value[1].data.shift()
    }
  } catch (e) {
    console.log(e)
  }
}

// 使用数据刷新定时器
const { refresh } = useDataRefresh(
  'dashboard-network',
  getNetworkUsage,
  2000, // 2秒间隔
  true // 立即执行
)

useKeepAliveRefresh(refresh)
</script>

<template>
  <VCard class="dashboard-chart-card dashboard-grid-fill">
    <VCardItem>
      <template #prepend><VIcon icon="mdi-swap-vertical-bold" size="20" class="me-2" /></template>
      <VCardTitle>{{ t('dashboard.network') }}</VCardTitle>
    </VCardItem>
    <VCardText class="dashboard-chart-content">
      <div class="dashboard-chart-plot">
        <VApexChart type="area" :options="chartOptions" :series="series" height="100%" />
      </div>
      <div class="dashboard-chart-footer">
        <span><i class="network-dot network-dot--upload" />{{ t('dashboard.upload') }} {{ animatedCurrentUploadText }}</span>
        <span><i class="network-dot network-dot--download" />{{ t('dashboard.download') }} {{ animatedCurrentDownloadText }}</span>
      </div>
    </VCardText>
  </VCard>
</template>

<style scoped>
.dashboard-chart-card {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 270px;
}

.dashboard-chart-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
  overflow: hidden;
}

.dashboard-chart-plot {
  flex: 1 1 auto;
  min-block-size: 120px;
}

.dashboard-chart-footer {
  display: flex;
  justify-content: space-between;
  border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.68rem;
  gap: 0.6rem;
  font-variant-numeric: tabular-nums;
  padding-block-start: 0.55rem;
}

.network-dot {
  display: inline-block;
  border-radius: 50%;
  block-size: 6px;
  inline-size: 6px;
  margin-inline-end: 0.3rem;
}

.network-dot--upload {
  background: rgb(var(--v-theme-warning));
}

.network-dot--download {
  background: rgb(var(--v-theme-info));
}

</style>
