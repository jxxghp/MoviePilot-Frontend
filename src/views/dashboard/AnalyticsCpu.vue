<script setup lang="ts">
import { useTheme } from 'vuetify'
import { hexToRgb } from '@layouts/utils'
import api from '@/api'
import { useAnimatedDashboardNumber } from '@/composables/useDashboardMotion'
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

// 时间序列
const series = ref([
  {
    data: [0],
  },
])

// 当前值
const current = ref(0)
const animatedCurrent = useAnimatedDashboardNumber(current, {
  duration: 520,
})
const animatedCurrentText = computed(() => Math.round(animatedCurrent.value).toLocaleString())

/** 计算指定采样窗口内的平均 CPU 使用率。 */
function getAverageUsage(sampleCount: number) {
  const samples = series.value[0].data.slice(-sampleCount)
  if (!samples.length) return '0.0'

  return (samples.reduce((total, value) => total + value, 0) / samples.length).toFixed(1)
}

const averageUsages = computed(() => [
  { label: '1m', value: getAverageUsage(3) },
  { label: '5m', value: getAverageUsage(10) },
  { label: '15m', value: getAverageUsage(30) },
])

// 根据最近采样动态收紧纵轴，低负载时仍能看清区域图变化。
const cpuChartMax = computed(() => {
  const peak = Math.max(current.value, ...series.value[0].data)

  return Math.min(100, Math.max(10, Math.ceil(peak / 10) * 10))
})

const chartOptions = controlledComputed(
  () => `${vuetifyTheme.name.value}:${cpuChartMax.value}`,
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
      tooltip: { enabled: false },
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
      colors: [currentTheme.value.success],
      fill: {
        opacity: 0.24,
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
            strokeColor: currentTheme.value.success,
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
          formatter: (value: number) => `${Math.round(value)}%`,
          style: {
            colors: axisLabelColor,
            fontSize: '10px',
          },
        },
        tickAmount: 2,
        max: cpuChartMax.value,
        min: 0,
      },
    }
  },
)

// 调用API接口获取最新CPU使用率
async function loadCpuData() {
  if (!props.allowRefresh) return
  try {
    // 请求数据
    current.value = Number(await api.get('dashboard/cpu')) || 0
    // 使用nextTick确保DOM更新完成后再更新图表数据
    await nextTick()
    // 添加到序列
    series.value[0].data.push(current.value)
    // 序列超过30条记录时，清掉前面的
    if (series.value[0].data.length > 30) series.value[0].data.shift()
  } catch (e) {
    console.log(e)
  }
}

// 使用数据刷新定时器
const { loading, refresh } = useDataRefresh(
  'analytics-cpu',
  loadCpuData,
  2000, // 2秒间隔
  true // 立即执行
)

useKeepAliveRefresh(refresh)
</script>

<template>
  <VCard class="dashboard-chart-card dashboard-grid-fill">
    <VCardItem>
      <template #prepend><VIcon icon="mdi-cpu-64-bit" size="20" class="me-2" /></template>
      <VCardTitle>{{ t('dashboard.cpuUsage') }}</VCardTitle>
      <template #append><strong class="dashboard-chart-current">{{ animatedCurrentText }}%</strong></template>
    </VCardItem>
    <VCardText class="dashboard-chart-content">
      <div class="dashboard-chart-plot">
        <VApexChart type="area" :options="chartOptions" :series="series" height="100%" />
      </div>
      <div class="dashboard-chart-footer">
        <span>{{ t('dashboard.averageUsage') }}</span>
        <span v-for="item in averageUsages" :key="item.label"><strong>{{ item.value }}</strong> {{ item.label }}</span>
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

.dashboard-chart-current,
.dashboard-chart-footer strong {
  font-variant-numeric: tabular-nums;
}

.dashboard-chart-current {
  font-size: 0.9rem;
}

.dashboard-chart-footer {
  display: flex;
  justify-content: space-between;
  border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.68rem;
  gap: 0.6rem;
  padding-block-start: 0.55rem;
}

</style>
