export function saveLocalTheme(name: string, theme: any) {
  // 存储主题到本地
  localStorage.setItem('theme', name)
  localStorage.setItem('materio-initial-loader-bg', theme.current.value.colors.background)
  localStorage.setItem('materio-initial-loader-color', theme.current.value.colors.primary)

  // 自动主题下次恢复时需要一个稳定的首帧明暗结果，避免媒体查询短暂返回浅色。
  if (name === 'auto') {
    localStorage.setItem('materio-initial-resolved-theme', theme.current.value.dark ? 'dark' : 'light')
  }
}
