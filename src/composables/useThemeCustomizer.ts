import { computed, onMounted, onScopeDispose, readonly, ref } from 'vue'
import { useTheme } from 'vuetify'
import { checkPrefersColorSchemeIsDark } from '@/@core/utils'
import { saveLocalTheme } from '@/@core/utils/theme'
import vuetify from '@/plugins/vuetify'
import {
  GLASS_OPTICAL_STRENGTH_DEFAULT,
  GLASS_OPTICAL_STRENGTH_MAX,
  getGlassOpticalPresetParameters,
  normalizeGlassOpticalStrength,
} from '@/utils/glassOptics'
import { themeManager } from '@/utils/themeManager'
import { syncThemeFavicon } from '@/utils/themePalette'

export const THEME_CUSTOMIZER_STORAGE_KEY = 'moviepilot-theme-customizer'
export const THEME_CUSTOMIZER_CHANGE_EVENT = 'moviepilot-theme-customizer-change'
export const THEME_CUSTOMIZER_OPEN_EVENT = 'moviepilot-theme-customizer-open'

export const themeCustomizerPrimaryColors = [
  { name: 'Purple', value: '#8D51F9' },
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
export type ThemeCustomizerGlassAppearance = 'clear' | 'frosted' | 'tinted'
export type ThemeCustomizerGlassQuality = 'balanced' | 'css' | 'high'
export type ThemeCustomizerRadius = 'default' | 'extra' | 'large' | 'none' | 'small'
export type ThemeCustomizerShadow = (typeof themeCustomizerShadowLevels)[number]
export type ThemeCustomizerSkin = 'bordered' | 'default'
export type ThemeCustomizerTheme = 'auto' | 'dark' | 'glass' | 'light' | 'purple' | 'transparent'

export interface ThemeCustomizerSettings {
  /** 玻璃主题的材质语义，与渲染质量保持独立。 */
  glassAppearance: ThemeCustomizerGlassAppearance
  /** 局部非均匀折射与内容弯曲强度，范围 0 到 100。 */
  glassDeformationStrength: number
  /** 轨迹、尾波、惯性与收敛强度，范围 0 到 100。 */
  glassFlowStrength: number
  /** 玻璃主题的渲染质量，决定使用标准 CSS 或共享光学渲染器。 */
  glassQuality: ThemeCustomizerGlassQuality
  /** 玻璃亮边、镜面高光与焦散光照强度，范围 0 到 100。 */
  glassReflectionStrength: number
  /** 共享壁纸在表面内的统一采样平移强度，范围 0 到 100。 */
  glassTranslationStrength: number
  /** 玻璃材质释放真实壁纸的程度，范围 0 到 100。 */
  glassTransparencyStrength: number
  /** 桌面导航布局。 */
  layout: ThemeCustomizerLayout
  /** 主题强调色，也是色调玻璃的颜色来源。 */
  primaryColor: string
  /** 全局表面圆角档位。 */
  radius: ThemeCustomizerRadius
  /** 浅色主题是否使用半深色侧栏。 */
  semiDarkMenu: boolean
  /** 非玻璃主题的表面阴影档位。 */
  shadow: ThemeCustomizerShadow
  /** 非玻璃主题的边框皮肤。 */
  skin: ThemeCustomizerSkin
  /** 用户选择的主题偏好。 */
  theme: ThemeCustomizerTheme
}

type VuetifyThemeApi = ReturnType<typeof useTheme>

const defaultPrimaryColor = themeCustomizerPrimaryColors[0].value
const validGlassAppearances: ThemeCustomizerGlassAppearance[] = ['clear', 'tinted', 'frosted']
const validGlassQualities: ThemeCustomizerGlassQuality[] = ['css', 'balanced', 'high']
const defaultGlassQuality: ThemeCustomizerGlassQuality = 'balanced'
const validLayouts: ThemeCustomizerLayout[] = ['vertical', 'collapsed', 'horizontal']
const validRadii: ThemeCustomizerRadius[] = ['none', 'small', 'default', 'large', 'extra']
const validShadows: readonly ThemeCustomizerShadow[] = themeCustomizerShadowLevels
const validSkins: ThemeCustomizerSkin[] = ['default', 'bordered']
const validThemes: ThemeCustomizerTheme[] = ['auto', 'light', 'dark', 'purple', 'transparent', 'glass']
const legacyShadowMap: Record<string, ThemeCustomizerShadow> = {
  high: '24',
  low: '6',
  medium: '12',
  none: '0',
}

let themeApplyVersion = 0

/** 判断当前代码是否运行在浏览器环境。 */
function isBrowser() {
  return typeof window !== 'undefined'
}

/** 校验主题主色是否为完整的六位十六进制颜色。 */
function isHexColor(color: unknown): color is string {
  return typeof color === 'string' && /^#[\da-f]{6}$/i.test(color)
}

/** 读取并校验本地存储中的主题偏好。 */
function readStoredThemePreference(): ThemeCustomizerTheme {
  if (!isBrowser()) return 'auto'

  const storedTheme = localStorage.getItem('theme')

  return validThemes.includes(storedTheme as ThemeCustomizerTheme) ? (storedTheme as ThemeCustomizerTheme) : 'auto'
}

/** 生成与当前主题偏好一致的定制器默认设置。 */
function getDefaultThemeCustomizerSettings(): ThemeCustomizerSettings {
  const glassParameters = getGlassOpticalPresetParameters('clear', defaultGlassQuality, 'recommended')

  return {
    glassAppearance: 'clear',
    glassDeformationStrength: glassParameters.deformation,
    glassFlowStrength: glassParameters.flow,
    glassQuality: defaultGlassQuality,
    glassReflectionStrength: glassParameters.reflection,
    glassTranslationStrength: glassParameters.translation,
    glassTransparencyStrength: glassParameters.transparency,
    layout: 'vertical',
    primaryColor: defaultPrimaryColor,
    radius: 'default',
    semiDarkMenu: false,
    shadow: '0',
    skin: 'default',
    theme: readStoredThemePreference(),
  }
}

type NormalizableThemeCustomizerSettings = Partial<ThemeCustomizerSettings> & {
  /** 旧版单一动态强度仅用于一次性迁移到三个独立维度。 */
  glassMotionStrength?: unknown
}

/** 新字段缺失时继承旧版动态强度，避免升级后无声重置用户手感。 */
function normalizeMigratedGlassStrength(value: unknown, legacyValue: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return normalizeGlassOpticalStrength(value)
  if (typeof legacyValue === 'number' && Number.isFinite(legacyValue)) return normalizeGlassOpticalStrength(legacyValue)

  return fallback
}

/** 将旧版语义阴影档位迁移到 Vuetify elevation 数值档位。 */
function normalizeThemeCustomizerShadow(shadow: unknown): ThemeCustomizerShadow {
  if (validShadows.includes(shadow as ThemeCustomizerShadow)) return shadow as ThemeCustomizerShadow
  if (typeof shadow === 'string' && legacyShadowMap[shadow]) return legacyShadowMap[shadow]

  return getDefaultThemeCustomizerSettings().shadow
}

/** 规范化持久化的主题定制设置并迁移旧值。 */
function normalizeThemeCustomizerSettings(settings: NormalizableThemeCustomizerSettings): ThemeCustomizerSettings {
  const fallback = getDefaultThemeCustomizerSettings()
  const storedRadius = settings.radius as string | undefined
  const radius = storedRadius === 'huge' ? 'extra' : storedRadius
  const primaryColor = isHexColor(settings.primaryColor) ? settings.primaryColor.toUpperCase() : fallback.primaryColor

  return {
    glassAppearance: validGlassAppearances.includes(settings.glassAppearance as ThemeCustomizerGlassAppearance)
      ? (settings.glassAppearance as ThemeCustomizerGlassAppearance)
      : fallback.glassAppearance,
    glassDeformationStrength: normalizeMigratedGlassStrength(
      settings.glassDeformationStrength,
      settings.glassMotionStrength,
      fallback.glassDeformationStrength,
    ),
    glassFlowStrength: normalizeMigratedGlassStrength(
      settings.glassFlowStrength,
      settings.glassMotionStrength,
      fallback.glassFlowStrength,
    ),
    glassQuality: validGlassQualities.includes(settings.glassQuality as ThemeCustomizerGlassQuality)
      ? (settings.glassQuality as ThemeCustomizerGlassQuality)
      : fallback.glassQuality,
    glassReflectionStrength: normalizeGlassOpticalStrength(settings.glassReflectionStrength),
    glassTranslationStrength: normalizeMigratedGlassStrength(
      settings.glassTranslationStrength,
      settings.glassMotionStrength,
      fallback.glassTranslationStrength,
    ),
    glassTransparencyStrength: normalizeGlassOpticalStrength(settings.glassTransparencyStrength),
    layout: validLayouts.includes(settings.layout as ThemeCustomizerLayout)
      ? (settings.layout as ThemeCustomizerLayout)
      : fallback.layout,
    primaryColor,
    radius: validRadii.includes(radius as ThemeCustomizerRadius) ? (radius as ThemeCustomizerRadius) : fallback.radius,
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
    return normalizeThemeCustomizerSettings({ ...parsed, theme: readStoredThemePreference() })
  } catch (error) {
    console.warn('读取主题定制设置失败，已使用默认设置:', error)

    return fallback
  }
}

// 生产构建会改写导出函数的声明形式，状态初始化必须放在读取函数定义之后，避免首屏执行时引用未完成赋值的函数。
const settingsState = ref<ThemeCustomizerSettings>(readThemeCustomizerSettings())
type ThemeCustomizerGlassSettings = Pick<
  ThemeCustomizerSettings,
  | 'glassAppearance'
  | 'glassDeformationStrength'
  | 'glassFlowStrength'
  | 'glassQuality'
  | 'glassReflectionStrength'
  | 'glassTranslationStrength'
  | 'glassTransparencyStrength'
>
const glassPreviewState = ref<ThemeCustomizerGlassSettings | null>(null)
const effectiveGlassSettings = computed(() => ({
  glassAppearance: glassPreviewState.value?.glassAppearance ?? settingsState.value.glassAppearance,
  glassDeformationStrength:
    glassPreviewState.value?.glassDeformationStrength ?? settingsState.value.glassDeformationStrength,
  glassFlowStrength: glassPreviewState.value?.glassFlowStrength ?? settingsState.value.glassFlowStrength,
  glassQuality: glassPreviewState.value?.glassQuality ?? settingsState.value.glassQuality,
  glassReflectionStrength:
    glassPreviewState.value?.glassReflectionStrength ?? settingsState.value.glassReflectionStrength,
  glassTranslationStrength:
    glassPreviewState.value?.glassTranslationStrength ?? settingsState.value.glassTranslationStrength,
  glassTransparencyStrength:
    glassPreviewState.value?.glassTransparencyStrength ?? settingsState.value.glassTransparencyStrength,
}))

/** 提供当前实际生效的玻璃设置；临时预览优先于已持久化设置。 */
export function useEffectiveGlassSettings() {
  return readonly(effectiveGlassSettings)
}

/** 将完整主题定制设置写入本地存储。 */
function persistThemeCustomizerSettings(settings: ThemeCustomizerSettings) {
  if (!isBrowser()) return

  localStorage.setItem(THEME_CUSTOMIZER_STORAGE_KEY, JSON.stringify(settings))
}

/** 广播主题定制设置变更，供布局与菜单同步响应。 */
function dispatchThemeCustomizerChange(settings: ThemeCustomizerSettings) {
  if (!isBrowser()) return

  window.dispatchEvent(
    new CustomEvent<ThemeCustomizerSettings>(THEME_CUSTOMIZER_CHANGE_EVENT, {
      detail: settings,
    }),
  )
}

/** 根据背景亮度选择可读的前景色。 */
function getTextColorForHex(backgroundColor: string) {
  const hex = backgroundColor.replace('#', '')
  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255

  return luminance > 0.68 ? '#3A3541' : '#FFFFFF'
}

/** 将主色写入所有 Vuetify 运行时主题。 */
export function applyPrimaryColorToVuetify(color: string, themeApi: VuetifyThemeApi) {
  if (!isHexColor(color)) return

  const onPrimaryColor = getTextColorForHex(color)

  for (const themeDefinition of Object.values(themeApi.themes.value)) {
    themeDefinition.colors.primary = color
    themeDefinition.colors['on-primary'] = onPrimaryColor
  }

  const activePrimaryColor = themeApi.current.value.colors.primary

  document.documentElement.style.setProperty('--initial-loader-color', activePrimaryColor)
  localStorage.setItem('materio-initial-loader-color', activePrimaryColor)
  syncThemeFavicon(activePrimaryColor)
}

/** 将外观设置同步为根节点属性，使主题 CSS 无需刷新即可响应。 */
export function applyThemeCustomizerRootSettings(
  settings: Pick<
    ThemeCustomizerSettings,
    | 'glassAppearance'
    | 'glassQuality'
    | 'glassReflectionStrength'
    | 'glassTransparencyStrength'
    | 'layout'
    | 'radius'
    | 'semiDarkMenu'
    | 'shadow'
    | 'skin'
  >,
) {
  if (!isBrowser()) return

  document.documentElement.setAttribute('data-glass-appearance', settings.glassAppearance)
  document.documentElement.setAttribute('data-glass-quality', settings.glassQuality)
  document.documentElement.style.setProperty(
    '--glass-reflection',
    String(normalizeGlassOpticalStrength(settings.glassReflectionStrength) / GLASS_OPTICAL_STRENGTH_MAX),
  )
  document.documentElement.style.setProperty(
    '--glass-transparency',
    String(normalizeGlassOpticalStrength(settings.glassTransparencyStrength) / GLASS_OPTICAL_STRENGTH_MAX),
  )
  document.documentElement.setAttribute('data-theme-layout', settings.layout)
  document.documentElement.setAttribute('data-theme-radius', settings.radius)
  document.documentElement.setAttribute('data-theme-semi-dark-menu', String(settings.semiDarkMenu))
  document.documentElement.setAttribute('data-theme-shadow', settings.shadow)
  document.documentElement.setAttribute('data-theme-skin', settings.skin)
  document.body.setAttribute('data-glass-appearance', settings.glassAppearance)
  document.body.setAttribute('data-glass-quality', settings.glassQuality)
  document.body.style.setProperty(
    '--glass-reflection',
    String(normalizeGlassOpticalStrength(settings.glassReflectionStrength) / GLASS_OPTICAL_STRENGTH_MAX),
  )
  document.body.style.setProperty(
    '--glass-transparency',
    String(normalizeGlassOpticalStrength(settings.glassTransparencyStrength) / GLASS_OPTICAL_STRENGTH_MAX),
  )
  document.body.setAttribute('data-theme-layout', settings.layout)
  document.body.setAttribute('data-theme-radius', settings.radius)
  document.body.setAttribute('data-theme-semi-dark-menu', String(settings.semiDarkMenu))
  document.body.setAttribute('data-theme-shadow', settings.shadow)
  document.body.setAttribute('data-theme-skin', settings.skin)
}

/** 将自动主题偏好解析为当前系统对应的实际主题。 */
function getResolvedThemeName(themePreference: ThemeCustomizerTheme) {
  if (themePreference === 'auto') {
    return checkPrefersColorSchemeIsDark() ? 'dark' : 'light'
  }

  return themePreference
}

/** 将实际主题名称同步到文档根节点和 body。 */
function syncThemeAttribute(themeName: string) {
  document.documentElement.setAttribute('data-theme', themeName)
  document.body.setAttribute('data-theme', themeName)
}

/** 应用主题偏好并避免异步样式加载造成旧主题回写。 */
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

  glassPreviewState.value = null
  settingsState.value = settings
  applyPrimaryColorToVuetify(settings.primaryColor, themeApi)
  applyThemeCustomizerRootSettings(settings)

  return settings
}

/** 持久化部分主题定制设置并同步当前页面外观。 */
export function persistPartialThemeCustomizerSettings(patch: Partial<ThemeCustomizerSettings>) {
  const nextSettings = normalizeThemeCustomizerSettings({
    ...readThemeCustomizerSettings(),
    ...patch,
  })

  glassPreviewState.value = null
  settingsState.value = nextSettings
  persistThemeCustomizerSettings(nextSettings)
  applyPrimaryColorToVuetify(nextSettings.primaryColor, vuetify.theme)
  applyThemeCustomizerRootSettings(nextSettings)
  dispatchThemeCustomizerChange(nextSettings)

  return nextSettings
}

/** 临时应用玻璃设置，不写入存储或广播持久化变更。 */
export function previewGlassSettings(patch: Partial<ThemeCustomizerGlassSettings>) {
  const previewSettings = normalizeThemeCustomizerSettings({
    ...settingsState.value,
    ...glassPreviewState.value,
    ...patch,
  })

  glassPreviewState.value = {
    glassAppearance: previewSettings.glassAppearance,
    glassDeformationStrength: previewSettings.glassDeformationStrength,
    glassFlowStrength: previewSettings.glassFlowStrength,
    glassQuality: previewSettings.glassQuality,
    glassReflectionStrength: previewSettings.glassReflectionStrength,
    glassTranslationStrength: previewSettings.glassTranslationStrength,
    glassTransparencyStrength: previewSettings.glassTransparencyStrength,
  }
  applyThemeCustomizerRootSettings({
    ...settingsState.value,
    ...glassPreviewState.value,
  })

  return glassPreviewState.value
}

/** 将当前玻璃预览作为一个设置事务持久化，避免外观与质量分步提交。 */
export function commitGlassPreview() {
  const previewSettings = glassPreviewState.value

  if (!previewSettings) return settingsState.value

  glassPreviewState.value = null

  return persistPartialThemeCustomizerSettings(previewSettings)
}

/** 丢弃临时玻璃预览并恢复已保存设置。 */
export function cancelGlassPreview() {
  if (!glassPreviewState.value) return settingsState.value

  glassPreviewState.value = null
  applyThemeCustomizerRootSettings(settingsState.value)

  return settingsState.value
}

/** 判断当前主题定制设置是否仍为默认值。 */
export function isDefaultThemeCustomizerSettings(settings: ThemeCustomizerSettings) {
  const defaults = normalizeThemeCustomizerSettings({
    glassAppearance: 'clear',
    glassDeformationStrength: GLASS_OPTICAL_STRENGTH_DEFAULT,
    glassFlowStrength: GLASS_OPTICAL_STRENGTH_DEFAULT,
    glassQuality: defaultGlassQuality,
    glassReflectionStrength: GLASS_OPTICAL_STRENGTH_DEFAULT,
    glassTranslationStrength: GLASS_OPTICAL_STRENGTH_DEFAULT,
    glassTransparencyStrength: GLASS_OPTICAL_STRENGTH_DEFAULT,
    layout: 'vertical',
    primaryColor: defaultPrimaryColor,
    radius: 'default',
    semiDarkMenu: false,
    shadow: '0',
    skin: 'default',
    theme: 'auto',
  })

  return (
    settings.glassAppearance === defaults.glassAppearance &&
    settings.glassDeformationStrength === defaults.glassDeformationStrength &&
    settings.glassFlowStrength === defaults.glassFlowStrength &&
    settings.glassQuality === defaults.glassQuality &&
    settings.glassReflectionStrength === defaults.glassReflectionStrength &&
    settings.glassTranslationStrength === defaults.glassTranslationStrength &&
    settings.glassTransparencyStrength === defaults.glassTransparencyStrength &&
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

  /** 合并、保存并应用一组主题定制设置。 */
  async function updateSettings(patch: Partial<ThemeCustomizerSettings>) {
    const previousTheme = settings.value.theme
    const nextSettings = normalizeThemeCustomizerSettings({
      ...settings.value,
      ...patch,
    })

    glassPreviewState.value = null
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

  /** 更新主题主色。 */
  function setPrimaryColor(color: string) {
    return updateSettings({ primaryColor: color })
  }

  /** 更新玻璃主题材质，不隐式改变渲染质量。 */
  function setGlassAppearance(glassAppearance: ThemeCustomizerGlassAppearance) {
    return updateSettings({ glassAppearance })
  }

  /** 更新玻璃局部非均匀形变强度。 */
  function setGlassDeformationStrength(glassDeformationStrength: number) {
    return updateSettings({ glassDeformationStrength })
  }

  /** 更新玻璃轨迹、尾波与惯性强度。 */
  function setGlassFlowStrength(glassFlowStrength: number) {
    return updateSettings({ glassFlowStrength })
  }

  /** 更新玻璃主题渲染质量档位。 */
  function setGlassQuality(glassQuality: ThemeCustomizerGlassQuality) {
    return updateSettings({ glassQuality })
  }

  /** 更新玻璃表面反射亮度。 */
  function setGlassReflectionStrength(glassReflectionStrength: number) {
    return updateSettings({ glassReflectionStrength })
  }

  /** 更新玻璃统一采样平移强度。 */
  function setGlassTranslationStrength(glassTranslationStrength: number) {
    return updateSettings({ glassTranslationStrength })
  }

  /** 更新玻璃材质的真实壁纸可见度。 */
  function setGlassTransparencyStrength(glassTransparencyStrength: number) {
    return updateSettings({ glassTransparencyStrength })
  }

  /** 更新全局圆角档位。 */
  function setRadius(radius: ThemeCustomizerRadius) {
    return updateSettings({ radius })
  }

  /** 更新当前主题。 */
  function setTheme(theme: ThemeCustomizerTheme) {
    return updateSettings({ theme })
  }

  /** 更新全局阴影档位。 */
  function setShadow(shadow: ThemeCustomizerShadow) {
    return updateSettings({ shadow })
  }

  /** 更新表面皮肤。 */
  function setSkin(skin: ThemeCustomizerSkin) {
    return updateSettings({ skin })
  }

  /** 更新桌面布局模式。 */
  function setLayout(layout: ThemeCustomizerLayout) {
    return updateSettings({ layout })
  }

  /** 更新浅色主题的半深色侧栏设置。 */
  function setSemiDarkMenu(semiDarkMenu: boolean) {
    return updateSettings({ semiDarkMenu })
  }

  /** 将主题定制器恢复到默认设置。 */
  async function resetSettings() {
    await updateSettings({
      glassAppearance: 'clear',
      glassDeformationStrength: GLASS_OPTICAL_STRENGTH_DEFAULT,
      glassFlowStrength: GLASS_OPTICAL_STRENGTH_DEFAULT,
      glassQuality: defaultGlassQuality,
      glassReflectionStrength: GLASS_OPTICAL_STRENGTH_DEFAULT,
      glassTranslationStrength: GLASS_OPTICAL_STRENGTH_DEFAULT,
      glassTransparencyStrength: GLASS_OPTICAL_STRENGTH_DEFAULT,
      layout: 'vertical',
      primaryColor: defaultPrimaryColor,
      radius: 'default',
      semiDarkMenu: false,
      shadow: '0',
      skin: 'default',
      theme: 'auto',
    })
  }

  /** 在自动主题模式下响应系统配色变化。 */
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
    setGlassAppearance,
    setGlassDeformationStrength,
    setGlassFlowStrength,
    setGlassQuality,
    setGlassReflectionStrength,
    setGlassTranslationStrength,
    setGlassTransparencyStrength,
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
