import { extractDominantColor } from '@/@core/utils/image'
import { normalizePluginAccentColor } from '@/utils/glassColor'

/** 管理插件卡 Logo 的可选品牌强调色；无有效提色时由 CSS 环境色接管。 */
export function usePluginCardAccent() {
  const accentRgb = ref<string>()
  const imageRef = ref<{ $el: HTMLElement } | null>(null)
  const accentStyle = computed(() => (accentRgb.value ? { '--plugin-card-accent-rgb': accentRgb.value } : undefined))
  let requestGeneration = 0

  async function updateAccentColor() {
    const generation = ++requestGeneration
    const imageElement = imageRef.value?.$el.querySelector('img') as HTMLImageElement | undefined
    const dominantColor = await extractDominantColor(imageElement)
    if (generation !== requestGeneration) return

    accentRgb.value = dominantColor ? normalizePluginAccentColor(dominantColor)?.rgb : undefined
  }

  function resetAccentColor() {
    requestGeneration += 1
    accentRgb.value = undefined
  }

  return {
    accentRgb,
    accentStyle,
    imageRef,
    resetAccentColor,
    updateAccentColor,
  }
}
