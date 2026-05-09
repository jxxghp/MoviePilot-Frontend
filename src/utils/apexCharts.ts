declare global {
  interface Window {
    Apex: any
  }
}

export function configureApexChartsTheme(themeName: string) {
  if (typeof window === 'undefined' || !window.Apex) {
    return
  }

  try {
    const isDark = themeName === 'dark' || themeName === 'transparent'

    window.Apex.dataLabels = {
      formatter: function (_: number, { seriesIndex, w }: { seriesIndex: number; w: any }) {
        const data = w.config.series[seriesIndex]
        return data.toFixed(data % 1 === 0 ? 0 : 1)
      },
    }

    window.Apex.legend = {
      labels: {
        useSeriesColors: true,
      },
    }

    window.Apex.title = {
      style: {
        color: 'rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity))',
      },
    }

    window.Apex.tooltip = {
      theme: isDark ? 'dark' : 'light',
    }
  } catch (error) {
    console.warn('ApexCharts 全局配置失败:', error)
  }
}
