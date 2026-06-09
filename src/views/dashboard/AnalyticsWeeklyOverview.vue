<script setup lang="ts">
import { useTheme } from 'vuetify'
import api from '@/api'
import { hexToRgb } from '@layouts/utils'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

const vuetifyTheme = useTheme()

const options = controlledComputed(
  () => vuetifyTheme.name.value,
  () => {
    const currentTheme = ref(vuetifyTheme.current.value.colors)
    const variableTheme = ref(vuetifyTheme.current.value.variables)

    const disabledColor = `rgba(${hexToRgb(currentTheme.value['on-surface'])},${
      variableTheme.value['disabled-opacity']
    })`

    const borderColor = `rgba(${hexToRgb(String(variableTheme.value['border-color']))},${
      variableTheme.value['border-opacity']
    })`

    return {
      chart: {
        parentHeightOffset: 0,
        toolbar: { show: false },
      },
      plotOptions: {
        bar: {
          borderRadius: 9,
          distributed: true,
          columnWidth: '40%',
          endingShape: 'rounded',
          startingShape: 'rounded',
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

// 调用API接口获取数据近7天数据
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
  <VCard class="dashboard-work-card">
    <VCardItem>
      <VCardTitle>{{ t('dashboard.weeklyOverview') }}</VCardTitle>
    </VCardItem>

    <VCardText class="dashboard-work-content">
      <div class="dashboard-work-chart">
        <VApexChart type="bar" :options="options" :series="series" height="100%" />
      </div>
      <div class="d-flex align-center mb-3">
        <h5 class="text-h5 me-4">
          {{ totalCount }}
        </h5>
        <p>{{ t('dashboard.weeklyOverviewDescription', { count: totalCount }) }} 😎</p>
      </div>
      <div>
        <VBtn block to="/history"> {{ t('common.viewDetails') }} </VBtn>
      </div>
    </VCardText>
  </VCard>
</template>

<style scoped>
.dashboard-work-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
}

.dashboard-work-chart {
  flex: 1 1 auto;
  min-block-size: 0;
}
</style>
