<script setup lang="ts">
import VueApexCharts from 'vue3-apexcharts'
import { useTheme } from 'vuetify'
import { hexToRgb } from '@layouts/utils'
import api from '@/api'
import { formatBytes } from '@/@core/utils/formatters'

const vuetifyTheme = useTheme()

const currentTheme = controlledComputed(
  () => vuetifyTheme.name.value,
  () => vuetifyTheme.current.value.colors,
)
const variableTheme = controlledComputed(
  () => vuetifyTheme.name.value,
  () => vuetifyTheme.current.value.variables,
)

// 定时器
let refreshTimer: NodeJS.Timeout | null = null

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
async function getMemorgUsage() {
  try {
    // 请求数据
    ;[usedMemory.value, memoryUsage.value] = await api.get('dashboard/memory')
    series.value[0].data.push(memoryUsage.value)
    // 序列超过30条记录时，清掉前面的
    if (series.value[0].data.length > 30) series.value[0].data.shift()
  } catch (e) {
    console.log(e)
  }
}

onMounted(() => {
  getMemorgUsage()
  // 启动定时器
  refreshTimer = setInterval(() => {
    getMemorgUsage()
  }, 3000)
})

// 组件卸载时停止定时器
onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<template>
  <VHover>
    <template #default="hover">
      <VCard v-bind="hover.props">
        <VCardItem>
          <template #append>
            <VIcon class="cursor-move" v-if="hover.isHovering">mdi-drag</VIcon>
          </template>
          <VCardTitle>内存</VCardTitle>
        </VCardItem>
        <VCardText>
          <VueApexCharts type="area" :options="chartOptions" :series="series" :height="150" />

          <p class="text-center font-weight-medium mb-0">当前：{{ formatBytes(usedMemory) }}</p>
        </VCardText>
      </VCard>
    </template>
  </VHover>
</template>
