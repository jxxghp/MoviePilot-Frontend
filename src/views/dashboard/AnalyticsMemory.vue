<script setup lang="ts">
import { useTheme } from 'vuetify'
import { hexToRgb } from '@layouts/utils'
import api from '@/api'
import type { DashboardMemoryInfo } from '@/api/types'
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
    name: t('dashboard.memoryUsed'),
    data: [0],
  },
  {
    name: t('dashboard.memoryCached'),
    data: [0],
  },
])

// 已使用内存
const usedMemory = ref(0)
// 缓存内存
const cachedMemory = ref(0)
// 可用内存
const availableMemory = ref(0)
// 总内存
const totalMemory = ref(0)
// 内存使用百分比
const memoryUsage = ref(0)
const animatedUsedMemory = useAnimatedDashboardNumber(usedMemory, {
  duration: 650,
})
const animatedCachedMemory = useAnimatedDashboardNumber(cachedMemory, {
  duration: 650,
})
const animatedAvailableMemory = useAnimatedDashboardNumber(availableMemory, {
  duration: 650,
})
const animatedUsedMemoryText = computed(() => formatDashboardFileSize(animatedUsedMemory.value, 2, usedMemory.value))
const animatedCachedMemoryText = computed(() =>
  formatDashboardFileSize(animatedCachedMemory.value, 2, cachedMemory.value),
)
const animatedAvailableMemoryText = computed(() =>
  formatDashboardFileSize(animatedAvailableMemory.value, 2, availableMemory.value),
)
const totalMemoryText = computed(() => formatDashboardFileSize(totalMemory.value, 2, totalMemory.value))

const chartOptions = controlledComputed(
  () => `${vuetifyTheme.name.value}:${totalMemory.value}`,
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
      legend: { show: false },
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
      colors: [currentTheme.value.primary, currentTheme.value.info],
      fill: {
        opacity: [0.22, 0.08],
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
        labels: {
          show: true,
          formatter: (value: number) => formatDashboardFileSize(value, 0, totalMemory.value || value),
          style: {
            colors: axisLabelColor,
            fontSize: '10px',
          },
        },
        tickAmount: 2,
        max: totalMemory.value || undefined,
        min: 0,
      },
    }
  },
)

// 调用API接口获取最新内存使用量
async function loadMemoryData() {
  if (!props.allowRefresh) return
  try {
    // 请求数据
    const memory: DashboardMemoryInfo = await api.get('dashboard/memory')
    usedMemory.value = Number(memory.used) || 0
    cachedMemory.value = Number(memory.cached) || 0
    availableMemory.value = Number(memory.available) || 0
    totalMemory.value = Number(memory.total) || 0
    memoryUsage.value = Number(memory.usage) || 0
    // 使用nextTick确保DOM更新完成后再更新图表数据
    await nextTick()
    series.value[0].data.push(usedMemory.value)
    series.value[1].data.push(cachedMemory.value)
    // 序列超过30条记录时，清掉前面的
    series.value.forEach(item => {
      if (item.data.length > 30) item.data.shift()
    })
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
  <VCard class="dashboard-chart-card dashboard-grid-fill">
    <VCardItem>
      <template #prepend><VIcon icon="mdi-memory" size="20" class="me-2" /></template>
      <VCardTitle>{{ t('dashboard.memoryUsage') }}</VCardTitle>
      <template #append><strong class="dashboard-chart-current">{{ memoryUsage.toFixed(1) }}%</strong></template>
    </VCardItem>
    <VCardText class="dashboard-chart-content">
      <div class="dashboard-memory-value">
        <strong>{{ animatedUsedMemoryText }}</strong>
        <span>/ {{ totalMemoryText }}</span>
      </div>
      <div class="dashboard-chart-plot">
        <VApexChart type="area" :options="chartOptions" :series="series" height="100%" />
      </div>
      <div class="dashboard-chart-footer">
        <span><i class="memory-dot memory-dot--used" />{{ t('dashboard.memoryUsed') }} {{ animatedUsedMemoryText }}</span>
        <span><i class="memory-dot memory-dot--cached" />{{ t('dashboard.memoryCached') }} {{ animatedCachedMemoryText }}</span>
        <span><i class="memory-dot memory-dot--available" />{{ t('dashboard.memoryAvailable') }} {{ animatedAvailableMemoryText }}</span>
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
.dashboard-memory-value strong,
.dashboard-chart-footer {
  font-variant-numeric: tabular-nums;
}

.dashboard-chart-current {
  font-size: 0.9rem;
}

.dashboard-memory-value {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  margin-block-end: 0.15rem;
}

.dashboard-memory-value strong {
  font-size: 1.05rem;
}

.dashboard-memory-value span,
.dashboard-chart-footer {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.68rem;
}

.dashboard-chart-footer {
  display: flex;
  justify-content: space-between;
  border-block-start: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  gap: 0.6rem;
  padding-block-start: 0.55rem;
}

.memory-dot {
  display: inline-block;
  border-radius: 50%;
  block-size: 6px;
  inline-size: 6px;
  margin-inline-end: 0.3rem;
}

.memory-dot--used {
  background: rgb(var(--v-theme-primary));
}

.memory-dot--cached {
  background: rgb(var(--v-theme-info));
}

.memory-dot--available {
  background: rgb(var(--v-theme-success));
}
</style>
