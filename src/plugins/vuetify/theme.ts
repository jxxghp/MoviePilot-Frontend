import { getGlassThemePalette } from '@/utils/themePalette'
import type { VuetifyOptions } from 'vuetify'

/** 普通与玻璃材质共用语义色；默认开启玻璃，明暗切换不重建页面。 */
const theme: VuetifyOptions['theme'] = {
  defaultTheme: 'glass',
  themes: { glass: getGlassThemePalette(), plain: getGlassThemePalette() },
}

export default theme
