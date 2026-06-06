<script setup lang="ts">
import { useTheme } from 'vuetify'
import { hexToRgb } from '@layouts/utils'
import api from '@/api'
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
    name: '上行流量',
    data: [0],
  },
  {
    name: '下行流量',
    data: [0],
  },
])

// 当前值
const currentUpload = ref(0)
const currentDownload = ref(0)

// 格式化流量显示
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B/s'
  const k = 1024
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const chartOptions = controlledComputed(
  () => vuetifyTheme.name.value,
  () => {
    return {
      chart: {
        parentHeightOffset: 0,
        toolbar: { show: false },
        animations: { enabled: false },
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
          left: -7,
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
      markers: {
        size: 6,
        offsetY: 4,
        offsetX: -2,
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
      xaxis: {
        labels: { show: false },
        axisTicks: { show: false },
        axisBorder: { show: false },
      },
      yaxis: {
        labels: { show: false },
      },
      legend: {
        show: true,
        position: 'top',
        horizontalAlign: 'left',
        fontSize: '12px',
        fontFamily: 'inherit',
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
    currentUpload.value = data[0] || 0
    currentDownload.value = data[1] || 0

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
  <VHover>
    <template #default="hover">
      <VCard v-bind="hover.props" class="dashboard-chart-card">
        <VCardItem>
          <VCardTitle>{{ t('dashboard.network') }}</VCardTitle>
        </VCardItem>
        <VCardText class="dashboard-chart-content">
          <div class="dashboard-chart-plot">
            <VApexChart type="line" :options="chartOptions" :series="series" height="100%" />
          </div>
          <div class="d-flex justify-space-between">
            <p class="text-center font-weight-medium mb-0">
              <span class="text-warning">{{ t('dashboard.upload') }}</span
              >：{{ formatBytes(currentUpload) }}
            </p>
            <p class="text-center font-weight-medium mb-0">
              <span class="text-info">{{ t('dashboard.download') }}</span
              >：{{ formatBytes(currentDownload) }}
            </p>
          </div>
        </VCardText>
      </VCard>
    </template>
  </VHover>
</template>

<style scoped>
.dashboard-chart-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
}

.dashboard-chart-plot {
  flex: 1 1 auto;
  min-block-size: 0;
}

.dashboard-chart-plot :deep(.vue-apexcharts),
.dashboard-chart-plot :deep(.apexcharts-canvas),
.dashboard-chart-plot :deep(svg) {
  block-size: 100% !important;
}
</style>
