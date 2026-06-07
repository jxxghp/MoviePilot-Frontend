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

// 时间序列
const series = ref([
  {
    data: [0],
  },
])

// 当前值
const current = ref(0)

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

// 调用API接口获取最新CPU使用率
async function loadCpuData() {
  if (!props.allowRefresh) return
  try {
    // 请求数据
    current.value = (await api.get('dashboard/cpu')) ?? 0
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
  <VCard class="dashboard-chart-card">
    <VCardItem>
      <VCardTitle>CPU</VCardTitle>
    </VCardItem>
    <VCardText class="dashboard-chart-content">
      <div class="dashboard-chart-plot">
        <VApexChart type="line" :options="chartOptions" :series="series" height="100%" />
      </div>
      <p class="text-center font-weight-medium mb-0">{{ t('dashboard.current') }}：{{ current }}%</p>
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

</style>
