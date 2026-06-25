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

// 时间序列
const series = ref([
  {
    data: [0],
  },
])

// 占用的内存
const usedMemory = ref(0)
// 内存使用百分比
const memoryUsage = ref(0)
const animatedUsedMemory = useAnimatedDashboardNumber(usedMemory, {
  duration: 650,
})
const animatedUsedMemoryText = computed(() => formatDashboardFileSize(animatedUsedMemory.value, 2, usedMemory.value))

const chartOptions = controlledComputed(
  () => vuetifyTheme.name.value,
  () => {
    return {
      chart: {
        parentHeightOffset: 0,
        toolbar: { show: false },
        animations: { enabled: false },
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
      colors: [currentTheme.value.primary],
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
            strokeColor: currentTheme.value.primary,
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
        labels: { show: false },
        max: 100,
      },
    }
  },
)

// 调用API接口获取最新内存使用量
async function loadMemoryData() {
  if (!props.allowRefresh) return
  try {
    // 请求数据
    const [memory, usage]: [number, number] = await api.get('dashboard/memory')
    usedMemory.value = Number(memory) || 0
    memoryUsage.value = Number(usage) || 0
    // 使用nextTick确保DOM更新完成后再更新图表数据
    await nextTick()
    series.value[0].data.push(memoryUsage.value)
    // 序列超过30条记录时，清掉前面的
    if (series.value[0].data.length > 30) series.value[0].data.shift()
  } catch (e) {
    console.log(e)
  }
}

// 使用数据刷新定时器
const { loading, refresh } = useDataRefresh(
  'analytics-memory',
  loadMemoryData,
  3000, // 3秒间隔
  true // 立即执行
)

useKeepAliveRefresh(refresh)
</script>

<template>
  <VCard class="dashboard-chart-card">
    <VCardItem>
      <VCardTitle>{{ t('dashboard.memory') }}</VCardTitle>
    </VCardItem>
    <VCardText class="dashboard-chart-content">
      <div class="dashboard-chart-plot">
        <VApexChart type="area" :options="chartOptions" :series="series" height="100%" />
      </div>
      <p class="dashboard-chart-value text-center font-weight-medium mb-0">
        {{ t('dashboard.current') }}：{{ animatedUsedMemoryText }}
      </p>
    </VCardText>
  </VCard>
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

.dashboard-chart-value {
  font-variant-numeric: tabular-nums;
}
</style>
