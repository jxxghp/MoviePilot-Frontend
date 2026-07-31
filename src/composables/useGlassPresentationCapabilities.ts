import { useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'
import { useDisplay } from 'vuetify'

const TOUCH_PRESENTATION_QUERY = '(hover: none), (pointer: coarse)'

/** 根据当前视口和主输入能力判断玻璃是否使用移动端静态呈现。 */
export function useGlassMobilePresentation() {
  const { smAndDown } = useDisplay()
  const usesTouchInput = useMediaQuery(TOUCH_PRESENTATION_QUERY)

  return computed(() => smAndDown.value || usesTouchInput.value)
}
