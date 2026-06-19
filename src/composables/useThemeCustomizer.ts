import { computed, onMounted, onScopeDispose, readonly, ref } from 'vue'
import { useTheme } from 'vuetify'
import { checkPrefersColorSchemeIsDark } from '@/@core/utils'
import { saveLocalTheme } from '@/@core/utils/theme'
import vuetify from '@/plugins/vuetify'
import { themeManager } from '@/utils/themeManager'

export const THEME_CUSTOMIZER_STORAGE_KEY = 'moviepilot-theme-customizer'
export const THEME_CUSTOMIZER_CHANGE_EVENT = 'moviepilot-theme-customizer-change'
export const THEME_CUSTOMIZER_OPEN_EVENT = 'moviepilot-theme-customizer-open'

export const themeCustomizerPrimaryColors = [
  { name: 'Purple', value: '#9155FD' },
  { name: 'Indigo', value: '#3F51B5' },
  { name: 'Blue', value: '#1976D2' },
  { name: 'Cyan', value: '#00BCD4' },
  { name: 'Teal', value: '#009688' },
  { name: 'Green', value: '#4CAF50' },
  { name: 'Amber', value: '#FFB400' },
  { name: 'Orange', value: '#FF9800' },
  { name: 'Coral', value: '#FF4C51' },
  { name: 'Pink', value: '#E91E63' },
  { name: 'Sky', value: '#16B1FF' },
  { name: 'Slate', value: '#607D8B' },
] as const

export const themeCustomizerShadowLevels = [
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
] as const

export type ThemeCustomizerLayout = 'collapsed' | 'horizontal' | 'vertical'
export type ThemeCustomizerRadius = 'default' | 'extra' | 'large' | 'none' | 'small'
export type ThemeCustomizerShadow = (typeof themeCustomizerShadowLevels)[number]
export type ThemeCustomizerSkin = 'bordered' | 'default'
export type ThemeCustomizerTheme = 'auto' | 'dark' | 'light' | 'purple' | 'transparent'

export interface ThemeCustomizerSettings {
  layout: ThemeCustomizerLayout
  primaryColor: string
  radius: ThemeCustomizerRadius
  semiDarkMenu: boolean
  shadow: ThemeCustomizerShadow
  skin: ThemeCustomizerSkin
  theme: ThemeCustomizerTheme
}

type VuetifyThemeApi = ReturnType<typeof useTheme>

const defaultPrimaryColor = themeCustomizerPrimaryColors[0].value
const validLayouts: ThemeCustomizerLayout[] = ['vertical', 'collapsed', 'horizontal']
const validRadii: ThemeCustomizerRadius[] = ['none', 'small', 'default', 'large', 'extra']
const validShadows: readonly ThemeCustomizerShadow[] = themeCustomizerShadowLevels
const validSkins: ThemeCustomizerSkin[] = ['default', 'bordered']
const validThemes: ThemeCustomizerTheme[] = ['auto', 'light', 'dark', 'purple', 'transparent']
const legacyShadowMap: Record<string, ThemeCustomizerShadow> = {
  high: '24',
  low: '6',
  medium: '12',
  none: '0',
}

let themeApplyVersion = 0

function isBrowser() {
  return typeof window !== 'undefined'
}

function isHexColor(color: unknown): color is string {
  return typeof color === 'string' && /^#[\da-f]{6}$/i.test(color)
}

function readStoredThemePreference(): ThemeCustomizerTheme {
  if (!isBrowser()) return 'auto'

  const storedTheme = localStorage.getItem('theme')

  return validThemes.includes(storedTheme as ThemeCustomizerTheme) ? (storedTheme as ThemeCustomizerTheme) : 'auto'
}

function getDefaultThemeCustomizerSettings(): ThemeCustomizerSettings {
  return {
    layout: 'vertical',
    primaryColor: defaultPrimaryColor,
    radius: 'default',
    semiDarkMenu: false,
    shadow: '0',
    skin: 'default',
    theme: readStoredThemePreference(),
  }
}

/** 将旧版语义阴影档位迁移到 Vuetify elevation 数值档位。 */
function normalizeThemeCustomizerShadow(shadow: unknown): ThemeCustomizerShadow {
  if (validShadows.includes(shadow as ThemeCustomizerShadow)) return shadow as ThemeCustomizerShadow
  if (typeof shadow === 'string' && legacyShadowMap[shadow]) return legacyShadowMap[shadow]

  return getDefaultThemeCustomizerSettings().shadow
}

function normalizeThemeCustomizerSettings(settings: Partial<ThemeCustomizerSettings>): ThemeCustomizerSettings {
  const fallback = getDefaultThemeCustomizerSettings()
  const storedRadius = settings.radius as string | undefined
  const radius = storedRadius === 'huge' ? 'extra' : storedRadius

  return {
    layout: validLayouts.includes(settings.layout as ThemeCustomizerLayout)
      ? (settings.layout as ThemeCustomizerLayout)
      : fallback.layout,
    primaryColor: isHexColor(settings.primaryColor) ? settings.primaryColor.toUpperCase() : fallback.primaryColor,
    radius: validRadii.includes(radius as ThemeCustomizerRadius)
      ? (radius as ThemeCustomizerRadius)
      : fallback.radius,
    semiDarkMenu: typeof settings.semiDarkMenu === 'boolean' ? settings.semiDarkMenu : fallback.semiDarkMenu,
    shadow: normalizeThemeCustomizerShadow(settings.shadow),
    skin: validSkins.includes(settings.skin as ThemeCustomizerSkin)
      ? (settings.skin as ThemeCustomizerSkin)
      : fallback.skin,
    theme: validThemes.includes(settings.theme as ThemeCustomizerTheme)
      ? (settings.theme as ThemeCustomizerTheme)
      : fallback.theme,
  }
}

/** 从本地存储读取主题定制器设置，异常数据会自动回落到默认值。 */
export function readThemeCustomizerSettings(): ThemeCustomizerSettings {
  const fallback = getDefaultThemeCustomizerSettings()

  if (!isBrowser()) return fallback

  try {
    const stored = localStorage.getItem(THEME_CUSTOMIZER_STORAGE_KEY)
    const parsed = stored ? JSON.parse(stored) : {}

    return normalizeThemeCustomizerSettings({
      ...fallback,
      ...parsed,
      theme: readStoredThemePreference(),
    })
  } catch (error) {
    console.warn('读取主题定制设置失败，已使用默认设置:', error)

    return fallback
  }
}

// 生产构建会改写导出函数的声明形式，状态初始化必须放在读取函数定义之后，避免首屏执行时引用未完成赋值的函数。
const settingsState = ref<ThemeCustomizerSettings>(readThemeCustomizerSettings())

function persistThemeCustomizerSettings(settings: ThemeCustomizerSettings) {
  if (!isBrowser()) return

  localStorage.setItem(THEME_CUSTOMIZER_STORAGE_KEY, JSON.stringify(settings))
}

function dispatchThemeCustomizerChange(settings: ThemeCustomizerSettings) {
  if (!isBrowser()) return

  window.dispatchEvent(
    new CustomEvent<ThemeCustomizerSettings>(THEME_CUSTOMIZER_CHANGE_EVENT, {
      detail: settings,
    }),
  )
}

function getTextColorForHex(backgroundColor: string) {
  const hex = backgroundColor.replace('#', '')
  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255

  return luminance > 0.68 ? '#3A3541' : '#FFFFFF'
}

/** 将主色写入 Vuetify 运行时主题，所有已注册主题会同步更新。 */
export function applyPrimaryColorToVuetify(color: string, themeApi: VuetifyThemeApi) {
  if (!isHexColor(color)) return

  const onPrimaryColor = getTextColorForHex(color)

  for (const themeDefinition of Object.values(themeApi.themes.value)) {
    themeDefinition.colors.primary = color
    themeDefinition.colors['on-primary'] = onPrimaryColor
  }

  document.documentElement.style.setProperty('--initial-loader-color', color)
  localStorage.setItem('materio-initial-loader-color', color)
}

/** 布局、圆角、阴影、皮肤和局部菜单风格只依赖根节点属性，CSS 可以在不刷新页面的情况下即时响应。 */
export function applyThemeCustomizerRootSettings(
  settings: Pick<ThemeCustomizerSettings, 'layout' | 'radius' | 'semiDarkMenu' | 'shadow' | 'skin'>,
) {
  if (!isBrowser()) return

  document.documentElement.setAttribute('data-theme-layout', settings.layout)
  document.documentElement.setAttribute('data-theme-radius', settings.radius)
  document.documentElement.setAttribute('data-theme-semi-dark-menu', String(settings.semiDarkMenu))
  document.documentElement.setAttribute('data-theme-shadow', settings.shadow)
  document.documentElement.setAttribute('data-theme-skin', settings.skin)
  document.body.setAttribute('data-theme-layout', settings.layout)
  document.body.setAttribute('data-theme-radius', settings.radius)
  document.body.setAttribute('data-theme-semi-dark-menu', String(settings.semiDarkMenu))
  document.body.setAttribute('data-theme-shadow', settings.shadow)
  document.body.setAttribute('data-theme-skin', settings.skin)
}

function getResolvedThemeName(themePreference: ThemeCustomizerTheme) {
  if (themePreference === 'auto') {
    return checkPrefersColorSchemeIsDark() ? 'dark' : 'light'
  }

  return themePreference
}

function syncThemeAttribute(themeName: string) {
  document.documentElement.setAttribute('data-theme', themeName)
  document.body.setAttribute('data-theme', themeName)
}

async function applyThemePreference(themePreference: ThemeCustomizerTheme, themeApi: VuetifyThemeApi) {
  const currentVersion = ++themeApplyVersion
  const resolvedTheme = getResolvedThemeName(themePreference)

  themeApi.global.name.value = resolvedTheme

  await themeManager.setTheme(themePreference)

  // 这里再同步一次实际主题，确保自定义主题色应用后根节点底色也保持最新。
  if (currentVersion === themeApplyVersion) {
    syncThemeAttribute(resolvedTheme)
    saveLocalTheme(themePreference, themeApi.global)
  }
}

/** 应用已保存的主色、皮肤和布局，供 App 启动阶段在面板挂载前使用。 */
export function applyStoredThemeCustomizerAppearance(themeApi: VuetifyThemeApi) {
  const settings = readThemeCustomizerSettings()

  settingsState.value = settings
  applyPrimaryColorToVuetify(settings.primaryColor, themeApi)
  applyThemeCustomizerRootSettings(settings)

  return settings
}

export function persistPartialThemeCustomizerSettings(patch: Partial<ThemeCustomizerSettings>) {
  const nextSettings = normalizeThemeCustomizerSettings({
    ...readThemeCustomizerSettings(),
    ...patch,
  })

  settingsState.value = nextSettings
  persistThemeCustomizerSettings(nextSettings)
  applyPrimaryColorToVuetify(nextSettings.primaryColor, vuetify.theme)
  applyThemeCustomizerRootSettings(nextSettings)
  dispatchThemeCustomizerChange(nextSettings)

  return nextSettings
}

export function isDefaultThemeCustomizerSettings(settings: ThemeCustomizerSettings) {
  const defaults = normalizeThemeCustomizerSettings({
    layout: 'vertical',
    primaryColor: defaultPrimaryColor,
    radius: 'default',
    semiDarkMenu: false,
    shadow: '0',
    skin: 'default',
    theme: 'auto',
  })

  return (
    settings.layout === defaults.layout &&
    settings.primaryColor === defaults.primaryColor &&
    settings.radius === defaults.radius &&
    settings.semiDarkMenu === defaults.semiDarkMenu &&
    settings.shadow === defaults.shadow &&
    settings.skin === defaults.skin &&
    settings.theme === defaults.theme
  )
}

/** 提供主题定制器面板使用的响应式状态与操作。 */
export function useThemeCustomizer() {
  const themeApi = useTheme()
  const settings = settingsState

  async function updateSettings(patch: Partial<ThemeCustomizerSettings>) {
    const previousTheme = settings.value.theme
    const nextSettings = normalizeThemeCustomizerSettings({
      ...settings.value,
      ...patch,
    })

    settings.value = nextSettings
    persistThemeCustomizerSettings(nextSettings)
    applyPrimaryColorToVuetify(nextSettings.primaryColor, themeApi)
    applyThemeCustomizerRootSettings(nextSettings)

    if (
      previousTheme !== nextSettings.theme ||
      themeApi.global.name.value !== getResolvedThemeName(nextSettings.theme)
    ) {
      await applyThemePreference(nextSettings.theme, themeApi)
    }

    dispatchThemeCustomizerChange(nextSettings)
  }

  function setPrimaryColor(color: string) {
    return updateSettings({ primaryColor: color })
  }

  function setRadius(radius: ThemeCustomizerRadius) {
    return updateSettings({ radius })
  }

  function setTheme(theme: ThemeCustomizerTheme) {
    return updateSettings({ theme })
  }

  function setShadow(shadow: ThemeCustomizerShadow) {
    return updateSettings({ shadow })
  }

  function setSkin(skin: ThemeCustomizerSkin) {
    return updateSettings({ skin })
  }

  function setLayout(layout: ThemeCustomizerLayout) {
    return updateSettings({ layout })
  }

  function setSemiDarkMenu(semiDarkMenu: boolean) {
    return updateSettings({ semiDarkMenu })
  }

  async function resetSettings() {
    await updateSettings({
      layout: 'vertical',
      primaryColor: defaultPrimaryColor,
      radius: 'default',
      semiDarkMenu: false,
      shadow: '0',
      skin: 'default',
      theme: 'auto',
    })
  }

  function handleSystemThemeChange() {
    if (settings.value.theme === 'auto') {
      updateSettings({ theme: 'auto' })
    }
  }

  let mediaQuery: MediaQueryList | null = null

  onMounted(() => {
    settings.value = readThemeCustomizerSettings()
    applyPrimaryColorToVuetify(settings.value.primaryColor, themeApi)
    applyThemeCustomizerRootSettings(settings.value)

    mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null
    mediaQuery?.addEventListener('change', handleSystemThemeChange)
  })

  onScopeDispose(() => {
    mediaQuery?.removeEventListener('change', handleSystemThemeChange)
  })

  return {
    isCustomized: computed(() => !isDefaultThemeCustomizerSettings(settings.value)),
    resetSettings,
    setLayout,
    setPrimaryColor,
    setRadius,
    setSemiDarkMenu,
    setShadow,
    setSkin,
    setTheme,
    settings: readonly(settings),
  }
}
