import { getGlassThemePalette } from '@/utils/themePalette'
import type { VuetifyOptions } from 'vuetify'

/** 所有页面共用玻璃主题；明暗切换只更新语义色，不重建页面或样式。 */
const theme: VuetifyOptions['theme'] = {
  defaultTheme: 'glass',
  themes: { glass: getGlassThemePalette() },
}

export default theme
