<script setup lang="ts">
import { useTheme } from 'vuetify'
import api from '@/api'
import { hexToRgb } from '@layouts/utils'
import { formatDashboardCount, useAnimatedDashboardNumber } from '@/composables/useDashboardMotion'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

const vuetifyTheme = useTheme()
const WEEKLY_BAR_RADIUS = 8

/**
 * 将入库统计柱形重绘为仅顶部圆角，规避 Safari 下 ApexCharts 禁用柱形圆角的问题。
 */
function roundWeeklyBarTops(chartContext: { el: HTMLElement }) {
  const barPaths = chartContext.el.querySelectorAll<SVGPathElement>('.apexcharts-bar-area')

  barPaths.forEach(barPath => {
    const { x, y, width, height } = barPath.getBBox()
    if (width <= 0 || height <= 0) return

    const radius = Math.min(WEEKLY_BAR_RADIUS, width / 2, height / 2)
    const right = x + width
    const bottom = y + height

    barPath.setAttribute(
      'd',
      `M ${x} ${bottom} L ${x} ${y + radius} Q ${x} ${y} ${x + radius} ${y} L ${right - radius} ${y} Q ${right} ${y} ${right} ${y + radius} L ${right} ${bottom} Z`,
    )
  })
}

const options = controlledComputed(
  () => vuetifyTheme.name.value,
  () => {
    const currentTheme = ref(vuetifyTheme.current.value.colors)
    const variableTheme = ref(vuetifyTheme.current.value.variables)

    const disabledColor = `rgba(${hexToRgb(currentTheme.value['on-surface'])},${
      variableTheme.value['medium-emphasis-opacity']
    })`

    const borderColor = `rgba(${hexToRgb(String(variableTheme.value['border-color']))},${
      variableTheme.value['border-opacity']
    })`

    return {
      chart: {
        parentHeightOffset: 0,
        toolbar: { show: false },
        zoom: { enabled: false, allowMouseWheelZoom: false },
        selection: { enabled: false },
        animations: { enabled: false },
        events: {
          mounted: roundWeeklyBarTops,
          updated: roundWeeklyBarTops,
        },
      },
      plotOptions: {
        bar: {
          borderRadius: WEEKLY_BAR_RADIUS,
          borderRadiusApplication: 'end',
          distributed: true,
          columnWidth: '40%',
        },
      },
      stroke: {
        width: 2,
        colors: [currentTheme.value.surface],
      },
      legend: { show: false },
      tooltip: {
        enabled: false,
      },
      grid: {
        borderColor,
        strokeDashArray: 7,
        padding: {
          top: -1,
          right: 0,
          left: -12,
          bottom: 5,
        },
      },
      dataLabels: { enabled: false },
      colors: [currentTheme.value.primary],
      states: {
        hover: { filter: { type: 'none' } },
        active: { filter: { type: 'none' } },
      },
      xaxis: {
        categories: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        tickPlacement: 'on',
        labels: { show: false },
        crosshairs: { opacity: 0 },
        axisTicks: { show: false },
        axisBorder: { show: false },
      },
      yaxis: {
        show: true,
        tickAmount: 4,
        labels: {
          offsetX: -17,
          style: {
            colors: disabledColor,
            fontSize: '12px',
          },

          formatter: (value: number) => {
            if (value > 999) {
              return (value / 1000).toFixed(1) + 'k'
            } else {
              return value.toString()
            }
          },
        },
      },
    }
  },
)

// 图表数据
const series = ref([{ data: [0, 0, 0, 0, 0, 0, 0] }])

// 总数
const totalCount = computed(() => series.value[0].data.reduce((a, b) => a + b, 0))
const animatedTotalCount = useAnimatedDashboardNumber(totalCount, {
  delay: 100,
  duration: 850,
})
const animatedTotalCountText = computed(() => formatDashboardCount(animatedTotalCount.value))

/**
 * 调用 API 接口获取近 7 天入库数据。
 */
async function getWeeklyData() {
  try {
    const res: number[] = await api.get('dashboard/transfer')
    // 使用nextTick确保DOM更新完成后再更新图表数据
    await nextTick()
    series.value = [{ data: res }]
  } catch (e) {
    console.log(e)
  }
}

onMounted(() => {
  // 延迟启动，确保组件完全挂载
  nextTick(() => {
    getWeeklyData()
  })
})

onActivated(() => {
  // 使用nextTick确保DOM准备完成后再获取数据
  nextTick(() => {
    getWeeklyData()
  })
})
</script>

<template>
  <VCard class="dashboard-work-card dashboard-grid-fill">
    <VCardItem>
      <VCardTitle>{{ t('dashboard.weeklyOverview') }}</VCardTitle>
    </VCardItem>

    <VCardText class="dashboard-work-content">
      <div class="dashboard-work-chart">
        <VApexChart type="bar" :options="options" :series="series" height="100%" />
      </div>
      <div class="d-flex align-center mb-3">
        <h5 class="dashboard-weekly-count text-h5 me-4">
          {{ animatedTotalCountText }}
        </h5>
        <p>{{ t('dashboard.weeklyOverviewDescription', { count: animatedTotalCountText }) }} 😎</p>
      </div>
      <div>
        <VBtn block to="/history"> {{ t('common.viewDetails') }} </VBtn>
      </div>
    </VCardText>
  </VCard>
</template>

<style scoped>
.dashboard-work-card {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 0;
}

.dashboard-work-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
  overflow: hidden;
}

.dashboard-work-chart {
  flex: 1 1 auto;
  min-block-size: 0;
}

.dashboard-weekly-count {
  font-variant-numeric: tabular-nums;
}
</style>
