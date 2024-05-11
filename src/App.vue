<script lang="ts" setup>
import { useTheme } from 'vuetify'
import { checkPrefersColorSchemeIsDark } from '@/@core/utils'

const { global: globalTheme } = useTheme()

// 生效主题
async function setTheme() {
  let themeValue = localStorage.getItem('theme') || 'light'
  const autoTheme = checkPrefersColorSchemeIsDark() ? 'dark' : 'light'
  globalTheme.name.value = themeValue === 'auto' ? autoTheme : themeValue
}

// ApexCharts 全局配置
declare global {
  interface Window {
    Apex: any
  }
}

if (window.Apex) {
  // 数据标签
  window.Apex.dataLabels = {
    formatter: function (_: number, { seriesIndex, w }: { seriesIndex: number; w: any }) {
      // 如果有小数点，保留两位小数，否则保留整数
      const data = w.config.series[seriesIndex]
      return data.toFixed(data % 1 === 0 ? 0 : 1)
    },
  }
  // 图例
  window.Apex.legend = {
    labels: {
      useSeriesColors: true,
    },
  }
  // 标题
  window.Apex.title = {
    style: {
      color: 'rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity))',
    },
  }
}

// 页面加载时，加载当前用户数据
onBeforeMount(async () => {
  setTheme()
})
</script>

<template>
  <VApp>
    <RouterView />
  </VApp>
</template>
