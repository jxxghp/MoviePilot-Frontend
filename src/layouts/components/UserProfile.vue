<script setup lang="ts">
import { useToast } from 'vue-toastification'
import router from '@/router'
import avatar1 from '@images/avatars/avatar-1.png'
import api from '@/api'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useAuthStore, useUserStore, useGlobalSettingsStore } from '@/stores'
import { useI18n } from 'vue-i18n'
import { useTheme } from 'vuetify'
import { SUPPORTED_LOCALES, SupportedLocale } from '@/types/i18n'
import { checkPrefersColorSchemeIsDark } from '@/@core/utils'
import { getCurrentLocale, setI18nLanguage } from '@/plugins/i18n'
import { saveLocalTheme } from '@/@core/utils/theme'
import type { ThemeSwitcherTheme } from '@layouts/types'
import { useConfirm } from '@/composables/useConfirm'
import { themeManager } from '@/utils/themeManager'
import { usePWA, type UIMode } from '@/composables/usePWA'
import { applyStoredTransparencySettings } from '@/composables/useTransparencySettings'
import {
  persistPartialThemeCustomizerSettings,
  readThemeCustomizerSettings,
  THEME_CUSTOMIZER_CHANGE_EVENT,
  THEME_CUSTOMIZER_OPEN_EVENT,
  type ThemeCustomizerSettings,
} from '@/composables/useThemeCustomizer'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'

const AboutDialog = defineAsyncComponent(() => import('@/components/dialog/AboutDialog.vue'))
const CustomCssDialog = defineAsyncComponent(() => import('@/components/dialog/CustomCssDialog.vue'))
const ProgressDialog = defineAsyncComponent(() => import('@/components/dialog/ProgressDialog.vue'))
const TransparencySettingsDialog = defineAsyncComponent(
  () => import('@/components/dialog/TransparencySettingsDialog.vue'),
)
const UserAuthDialog = defineAsyncComponent(() => import('@/components/dialog/UserAuthDialog.vue'))

// 认证 Store
const authStore = useAuthStore()
// 用户 Store
const userStore = useUserStore()
// 全局设置 Store
const globalSettingsStore = useGlobalSettingsStore()
// 国际化
const { t } = useI18n()
// PWA
const { appMode, uiMode, setUIMode } = usePWA()

// 提示框
const $toast = useToast()

// UI模式菜单是否显示
const showUIModeMenu = ref(false)

// 用户头像主菜单是否显示；打开布局级面板前需要主动关闭，避免菜单 overlay 残留。
const showUserMenu = ref(false)

// 主题菜单是否显示
const showThemeMenu = ref(false)

// 语言菜单是否显示
const showLanguageMenu = ref(false)

// 自定义CSS
const customCSS = ref('')

const isTransparentTheme = computed(() => currentThemeName.value === 'transparent')

// 重启轮询控制标识
const restartPollingId = ref<number | null>(null)
const isRestarting = ref(false)
let progressDialogController: ReturnType<typeof openSharedDialog> | null = null
let siteAuthDialogController: ReturnType<typeof openSharedDialog> | null = null
let customCssDialogController: ReturnType<typeof openSharedDialog> | null = null

// 确认框
const { createConfirm } = useConfirm()

// 执行注销操作
function logout() {
  // 清理重启相关状态
  isRestarting.value = false
  if (restartPollingId.value) {
    clearTimeout(restartPollingId.value)
    restartPollingId.value = null
  }

  // 清除登录状态信息
  authStore.logout()
  userStore.reset()
  // 重定向到登录页面或其他适当的页面
  router.push('/login')
}

/** 打开重启进度共享弹窗。 */
function showRestartProgress() {
  progressDialogController?.close()
  progressDialogController = openSharedDialog(ProgressDialog, { text: t('app.restarting') }, {}, { closeOn: false })
}

/** 关闭重启进度共享弹窗。 */
function closeRestartProgress() {
  progressDialogController?.close()
  progressDialogController = null
}

// 检测服务状态
async function checkServiceStatus(): Promise<boolean> {
  try {
    const result: { [key: string]: any } = await api.get('system/ping', { timeout: 3000 })
    return result?.success === true
  } catch (error) {
    return false
  }
}

// 轮询检测服务恢复状态
async function pollServiceStatus() {
  // 如果已经有轮询在运行，先清除
  if (restartPollingId.value) {
    clearTimeout(restartPollingId.value)
    restartPollingId.value = null
  }

  // 最大重试次数（约3分钟）
  const maxRetries = 60
  let retryCount = 0

  const poll = async () => {
    // 如果不在重启状态，停止轮询
    if (!isRestarting.value) {
      return
    }

    retryCount++
    const isServiceUp = await checkServiceStatus()

    if (isServiceUp) {
      // 服务已恢复，清理状态并执行注销
      isRestarting.value = false
      closeRestartProgress()
      restartPollingId.value = null

      setTimeout(() => {
        logout()
      }, 1000)
      return
    }

    if (retryCount >= maxRetries) {
      // 超时未恢复，清理状态并提示用户
      isRestarting.value = false
      closeRestartProgress()
      restartPollingId.value = null
      $toast.error(t('app.restartTimeout'))
      return
    }

    // 继续轮询，每3秒检测一次
    restartPollingId.value = setTimeout(poll, 3000) as unknown as number
  }

  // 开始轮询
  poll()
}

// 执行重启操作
async function restart() {
  if (!canAdmin.value) return

  // 设置重启状态
  isRestarting.value = true

  // 调用API重启
  try {
    // 显示等待框
    showRestartProgress()
    const result: { [key: string]: any } = await api.get('system/restart')
    if (!result?.success) {
      // 重启失败，清理状态
      isRestarting.value = false
      closeRestartProgress()
      $toast.error(result.message)
      return
    }
  } catch (error) {
    // 重启失败，清理状态
    isRestarting.value = false
    closeRestartProgress()
    console.error(error)
    return
  }

  // 重启请求成功，开始轮询检测服务状态
  setTimeout(() => {
    pollServiceStatus()
  }, 5000)
}

// 显示重启确认对话框
async function showRestartDialog() {
  if (!canAdmin.value) return

  const isConfirmed = await createConfirm({
    type: 'warn',
    title: t('app.confirmRestart'),
    content: t('app.restartTip'),
  })

  if (!isConfirmed) return

  await restart()
}

/** 显示站点认证共享弹窗。 */
function showSiteAuthDialog() {
  if (!canAdmin.value || userLevel.value >= 2) return

  siteAuthDialogController?.close()
  siteAuthDialogController = openSharedDialog(
    UserAuthDialog,
    {},
    {
      done: siteAuthDone,
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

/** 显示关于共享弹窗。 */
function showAboutDialog() {
  if (!canAdmin.value) return

  openSharedDialog(AboutDialog, {}, {}, { closeOn: ['close', 'update:modelValue'] })
}

/** 用户站点认证成功后关闭弹窗并退出登录。 */
function siteAuthDone() {
  siteAuthDialogController?.close()
  siteAuthDialogController = null
  logout()
}

// 从用户 Store中获取信息
const superUser = computed(() => userStore.superUser)
const userPermissions = computed(() => buildUserPermissionContext(userStore.superUser, userStore.permissions))
const canAdmin = computed(() => hasPermission(userPermissions.value, 'admin'))
const userName = computed(() => userStore.userName)
const avatar = computed(() => userStore.avatar || avatar1)
const userLevel = computed(() => userStore.level)

// 检查是否为高级模式
const isAdvancedMode = computed(() => {
  return globalSettingsStore.get('ADVANCED_MODE') !== false
})

// UI模式相关
const uiModes = computed(() => [
  {
    name: 'auto',
    title: t('theme.autoUI'),
    icon: 'mdi-devices',
  },
  {
    name: 'desktop',
    title: t('pwa.platforms.desktop'),
    icon: 'mdi-monitor',
  },
  {
    name: 'app',
    title: t('pwa.platforms.mobile'),
    icon: 'mdi-cellphone',
  },
])

// 切换UI模式
function changeUIMode(mode: UIMode) {
  setUIMode(mode)
  showUIModeMenu.value = false
}

// 获取当前UI模式图标
const getUIModeIcon = computed(() => {
  const mode = uiModes.value.find(m => m.name === uiMode.value)
  return mode?.icon || 'mdi-devices'
})

// 主题相关功能
const { name: themeName, global: globalTheme } = useTheme()
const savedTheme = ref(localStorage.getItem('theme') ?? 'auto')
const currentThemeName = ref(savedTheme.value)
const themeCustomizerSettings = ref(readThemeCustomizerSettings())

const themes: ThemeSwitcherTheme[] = [
  {
    name: 'auto',
    title: t('theme.auto'),
    icon: 'mdi-laptop',
  },
  {
    name: 'light',
    title: t('theme.light'),
    icon: 'mdi-weather-sunny',
  },
  {
    name: 'dark',
    title: t('theme.dark'),
    icon: 'mdi-weather-night',
  },
  {
    name: 'purple',
    title: t('theme.purple'),
    icon: 'mdi-brightness-4',
  },
  {
    name: 'transparent',
    title: t('theme.transparent'),
    icon: 'mdi-gradient-horizontal',
  },
]

function getThemeLayoutTitle(layout: ThemeCustomizerSettings['layout']) {
  switch (layout) {
    case 'collapsed':
      return t('theme.customizer.layoutCollapsed')
    case 'horizontal':
      return t('theme.customizer.layoutHorizontal')
    case 'vertical':
    default:
      return t('theme.customizer.layoutVertical')
  }
}

const currentThemeSummary = computed(() => {
  const themeTitle = themes.find(theme => theme.name === currentThemeName.value)?.title || t('theme.auto')
  const layoutTitle = appMode.value ? '' : getThemeLayoutTitle(themeCustomizerSettings.value.layout)

  if (layoutTitle) return `${themeTitle} · ${layoutTitle}`
  return themeTitle
})

// Ace 跟随 Vuetify 当前生效主题，避免 auto 模式或弹窗打开后切主题时颜色不同步。
const editorTheme = computed(() => (globalTheme.current.value.dark ? 'github_dark' : 'github_light_default'))

// 更新主题
async function updateTheme() {
  const autoTheme = checkPrefersColorSchemeIsDark() ? 'dark' : 'light'
  const theme = currentThemeName.value === 'auto' ? autoTheme : currentThemeName.value

  // 设置Vuetify主题
  globalTheme.name.value = theme

  // 统一处理主题切换 - 主题管理器会自动处理CSS加载和错误
  await themeManager.setTheme(currentThemeName.value)

  // 保存原始主题设置，而不是计算后的值
  savedTheme.value = currentThemeName.value
  // 保存主题到本地
  saveLocalTheme(currentThemeName.value, globalTheme)
}

// 切换主题
async function changeTheme(theme: string) {
  currentThemeName.value = theme
  showThemeMenu.value = false

  // 立即更新主题（不再刷新页面）
  await updateTheme()

  // 如果是透明主题，应用透明度设置
  if (theme === 'transparent') {
    applyStoredTransparencySettings()
  }

  // 保存主题到服务端
  try {
    persistPartialThemeCustomizerSettings({ theme: theme as ThemeCustomizerSettings['theme'] })
    api.post('/user/config/Layout', {
      theme,
    })
  } catch (e) {
    console.error(e)
  }
}

function handleThemeCustomizerSettingsChange(event: Event) {
  const nextSettings = (event as CustomEvent<ThemeCustomizerSettings>).detail
  const nextTheme = nextSettings.theme

  themeCustomizerSettings.value = nextSettings

  if (currentThemeName.value === nextTheme) return

  currentThemeName.value = nextTheme
  savedTheme.value = nextTheme
}

// 获取自定义 CSS
async function getCustomCSS() {
  if (!canAdmin.value) return

  try {
    const result: { [key: string]: any } = await api.get('system/setting/UserCustomCSS')
    if (result && result.success && result.data?.value) {
      customCSS.value = result.data?.value ?? ''
      if (customCSS.value) {
        const style = document.createElement('style')
        style.innerHTML = result.data?.value ?? ''
        document.head.appendChild(style)
      }
    }
  } catch (error) {
    console.error(error)
  }
}

/** 打开自定义 CSS 共享弹窗。 */
function showCustomCssDialog() {
  if (!canAdmin.value) return

  customCssDialogController?.close()
  customCssDialogController = openSharedDialog(
    CustomCssDialog,
    {
      css: customCSS.value,
      editorTheme: editorTheme.value,
    },
    {
      save: saveCustomCSS,
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 共享弹窗打开后也要同步主题变化，否则 Ace 会停留在打开时的配色。
watch(editorTheme, theme => {
  customCssDialogController?.updateProps({ editorTheme: theme })
})

/** 打开透明主题设置共享弹窗。 */
function showTransparencySettingsDialog() {
  openSharedDialog(TransparencySettingsDialog, {}, {}, { closeOn: ['close', 'update:modelValue'] })
}

/** 从用户菜单打开主题定制器，App 模式会在面板内部隐藏布局设置。 */
function showThemeCustomizerDrawer() {
  showUserMenu.value = false
  showThemeMenu.value = false

  // 主题定制器由 DefaultLayout 统一挂载
  window.dispatchEvent(new CustomEvent(THEME_CUSTOMIZER_OPEN_EVENT))
}

/** 保存自定义 CSS。 */
async function saveCustomCSS(css: string) {
  if (!canAdmin.value) return

  customCSS.value = css
  try {
    const result: { [key: string]: any } = await api.post('system/setting/UserCustomCSS', css, {
      headers: {
        'Content-Type': 'text/plain',
      },
    })

    if (result.success) {
      customCssDialogController?.close()
      customCssDialogController = null
      $toast.success(t('theme.customCssSaveSuccess'))
    }
  } catch (e) {
    console.error(t('theme.customCssSaveFailed'))
  }
}

// 监听主题变化
watch(
  () => currentThemeName.value,
  async () => {
    await updateTheme()

    // 如果切换到透明主题，应用透明度设置
    if (currentThemeName.value === 'transparent') {
      applyStoredTransparencySettings()
    }
  },
)

// 监听系统主题变化
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
    await updateTheme()
  })
} catch (e) {
  console.error(t('theme.deviceNotSupport'))
}

// 语言相关功能
const currentLocale = ref<SupportedLocale>(getCurrentLocale())

// 支持的语言列表
const locales = computed(() => {
  return Object.entries(SUPPORTED_LOCALES).map(([key, locale]) => ({
    value: key as SupportedLocale,
    title: locale.title,
    flag: locale.flag,
    icon: `flag-${key.split('-')[0]}`,
  }))
})

// 切换语言
async function changeLocale(locale: SupportedLocale) {
  showLanguageMenu.value = false
  try {
    await setI18nLanguage(locale)
    currentLocale.value = locale
    // 刷新页面
    window.location.reload()
  } catch (error) {
    console.error(error)
  }
}

// 获取当前语言图标
const getCurrentIcon = computed(() => {
  const locale = locales.value.find(l => l.value === currentLocale.value)
  return locale?.flag || '🌐'
})

// 获取当前主题图标
const getThemeIcon = computed(() => {
  const theme = themes.find(t => t.name === currentThemeName.value)
  return theme?.icon || 'mdi-laptop'
})

onMounted(() => {
  if (canAdmin.value) getCustomCSS()
  window.addEventListener(THEME_CUSTOMIZER_CHANGE_EVENT, handleThemeCustomizerSettingsChange)

  // 初始化透明度设置
  if (isTransparentTheme.value) {
    applyStoredTransparencySettings()
  }
})

// 组件卸载时清理轮询
onUnmounted(() => {
  // 清理重启轮询
  if (restartPollingId.value) {
    clearTimeout(restartPollingId.value)
    restartPollingId.value = null
  }
  isRestarting.value = false
  closeRestartProgress()
  siteAuthDialogController?.close()
  customCssDialogController?.close()
  window.removeEventListener(THEME_CUSTOMIZER_CHANGE_EVENT, handleThemeCustomizerSettingsChange)
})
</script>

<template>
  <VAvatar class="cursor-pointer ms-3 border" color="primary" variant="tonal">
    <VImg :src="avatar" />

    <VMenu
      v-model="showUserMenu"
      activator="parent"
      width="15rem"
      location="bottom end"
      offset="14px"
      class="user-menu"
      :close-on-content-click="true"
      scrim
    >
      <VList class="pt-0">
        <!-- 👉 User Avatar & Name -->
        <VListItem class="py-4" bg-color="primary" bg-opacity="0.05">
          <template #prepend>
            <VAvatar size="60" color="primary" rounded="sm" class="border-2 border-opacity-10">
              <VImg :src="avatar" />
            </VAvatar>
          </template>
          <div>
            <span class="text-primary text-sm font-medium d-block">
              {{ superUser ? t('user.admin') : t('user.normal') }}
            </span>
            <span class="text-high-emphasis text-lg font-weight-bold">
              {{ userName }}
            </span>
          </div>
        </VListItem>
        <VDivider class="mb-2" />
        <div class="px-2">
          <!-- 👉 Profile -->
          <VListItem link @click="router.push('/profile')" class="mb-1 rounded-lg" hover>
            <template #prepend>
              <VIcon icon="mdi-account-outline" />
            </template>
            <VListItemTitle>{{ t('user.profile') }}</VListItemTitle>
          </VListItem>

          <VListItem
            v-if="canAdmin"
            link
            @click="isAdvancedMode ? router.push('/setting') : router.push('/setup-wizard')"
            class="mb-1 rounded-lg"
            hover
          >
            <template #prepend>
              <VIcon :icon="isAdvancedMode ? 'mdi-cog-outline' : 'mdi-wizard-hat'" />
            </template>
            <VListItemTitle>{{ isAdvancedMode ? t('user.systemSettings') : t('user.wizardSettings') }}</VListItemTitle>
          </VListItem>

          <!-- 👉 Site Auth -->
          <VListItem v-if="userLevel < 2 && canAdmin" link @click="showSiteAuthDialog" class="mb-1 rounded-lg" hover>
            <template #prepend>
              <VIcon icon="mdi-lock-check-outline" />
            </template>
            <VListItemTitle>{{ t('user.siteAuth') }}</VListItemTitle>
          </VListItem>

          <!-- 👉 UI模式设置 - 使用嵌套菜单 -->
          <VMenu location="end" offset-x min-width="200" v-model="showUIModeMenu" :close-on-content-click="true">
            <template v-slot:activator="{ props: menuProps }">
              <VListItem v-bind="menuProps" class="mb-1 rounded-lg" hover>
                <template #prepend>
                  <VIcon :icon="getUIModeIcon" />
                </template>
                <VListItemTitle>{{ t('common.uiMode') }}</VListItemTitle>
                <VListItemSubtitle>
                  {{ uiModes.find(m => m.name === uiMode)?.title || t('theme.autoUI') }}
                </VListItemSubtitle>
                <template #append>
                  <VIcon icon="mdi-chevron-right" size="small" />
                </template>
              </VListItem>
            </template>
            <VList>
              <VListItem
                v-for="mode in uiModes"
                :key="mode.name"
                @click="changeUIMode(mode.name as UIMode)"
                :active="uiMode === mode.name"
                class="mb-1"
              >
                <template #prepend>
                  <VIcon :icon="mode.icon" />
                </template>
                <VListItemTitle>{{ mode.title }}</VListItemTitle>
                <template #append v-if="uiMode === mode.name">
                  <VIcon icon="mdi-check" color="primary" size="small" />
                </template>
              </VListItem>
            </VList>
          </VMenu>

          <!-- 👉 主题设置 - 使用嵌套菜单 -->
          <VMenu location="end" offset-x min-width="200" v-model="showThemeMenu" :close-on-content-click="true">
            <template v-slot:activator="{ props: menuProps }">
              <VListItem v-bind="menuProps" class="mb-1 rounded-lg" hover>
                <template #prepend>
                  <VIcon :icon="getThemeIcon" />
                </template>
                <VListItemTitle>{{ t('common.theme') }}</VListItemTitle>
                <VListItemSubtitle>
                  {{ currentThemeSummary }}
                </VListItemSubtitle>
                <template #append>
                  <VIcon icon="mdi-chevron-right" size="small" />
                </template>
              </VListItem>
            </template>
            <VList>
              <VListItem @click="showThemeCustomizerDrawer">
                <template #prepend>
                  <VIcon icon="mdi-tune-variant" />
                </template>
                <VListItemTitle>{{ t('theme.customizer.title') }}</VListItemTitle>
                <template #append>
                  <VIcon icon="mdi-chevron-right" size="small" />
                </template>
              </VListItem>

              <VDivider class="my-2" />

              <!-- 透明度调整 - 仅在透明主题下显示 -->
              <template v-if="isTransparentTheme">
                <VListItem @click="showTransparencySettingsDialog">
                  <template #prepend>
                    <VIcon icon="mdi-opacity" />
                  </template>
                  <VListItemTitle>{{ t('theme.transparencyAdjust') }}</VListItemTitle>
                  <template #append>
                    <VIcon icon="mdi-chevron-right" size="small" />
                  </template>
                </VListItem>
              </template>

              <VListItem v-if="canAdmin" @click="showCustomCssDialog">
                <template #prepend>
                  <VIcon icon="mdi-palette" />
                </template>
                <VListItemTitle>{{ t('theme.custom') }}</VListItemTitle>
                <template #append>
                  <VIcon icon="mdi-chevron-right" size="small" />
                </template>
              </VListItem>
            </VList>
          </VMenu>

          <!-- 👉 语言设置 - 使用嵌套菜单 -->
          <VMenu location="end" offset-x min-width="200" v-model="showLanguageMenu" :close-on-content-click="true">
            <template v-slot:activator="{ props: menuProps }">
              <VListItem v-bind="menuProps" class="mb-1 rounded-lg" hover>
                <template #prepend>
                  <span class="me-4">{{ getCurrentIcon }}</span>
                </template>
                <VListItemTitle>
                  {{ locales.find(l => l.value === currentLocale)?.title || t('common.language') }}
                </VListItemTitle>
                <template #append>
                  <VIcon icon="mdi-chevron-right" size="small" />
                </template>
              </VListItem>
            </template>
            <VList>
              <VListItem
                v-for="locale in locales"
                :key="locale.value"
                @click="changeLocale(locale.value)"
                :active="currentLocale === locale.value"
                class="mb-1"
              >
                <template #prepend>
                  <span class="text-xl me-2">{{ locale.flag }}</span>
                </template>
                <VListItemTitle>{{ locale.title }}</VListItemTitle>
                <template #append v-if="currentLocale === locale.value">
                  <VIcon icon="mdi-check" color="primary" size="small" />
                </template>
              </VListItem>
            </VList>
          </VMenu>

          <!-- 👉 FAQ -->
          <VListItem href="https://movie-pilot.org" target="_blank" class="mb-1 rounded-lg" hover>
            <template #prepend>
              <VIcon icon="mdi-help-circle-outline" />
            </template>
            <VListItemTitle>{{ t('user.helpDocs') }}</VListItemTitle>
          </VListItem>

          <!-- 👉 About -->
          <VListItem v-if="canAdmin" @click="showAboutDialog" class="mb-1 rounded-lg" hover>
            <template #prepend>
              <VIcon icon="mdi-information-outline" />
            </template>
            <VListItemTitle>{{ t('setting.about.title') }}</VListItemTitle>
          </VListItem>

          <!-- Divider -->
          <VDivider v-if="canAdmin" class="my-3" />

          <!-- 👉 restart -->
          <VListItem v-if="canAdmin" @click="showRestartDialog" class="mb-1 rounded-lg" hover>
            <template #prepend>
              <VIcon icon="mdi-restart" />
            </template>
            <VListItemTitle>{{ t('user.restart') }}</VListItemTitle>
          </VListItem>
        </div>
        <!-- 👉 Logout -->
        <div class="px-2 mt-3 mb-2">
          <VBtn color="error" block class="py-3" elevation="2" @click="logout">
            <template #prepend>
              <VIcon icon="mdi-logout" />
            </template>
            {{ t('app.logout') }}
          </VBtn>
        </div>
      </VList>
    </VMenu>
    <!-- !SECTION -->
  </VAvatar>
</template>

<style lang="scss" scoped>
.v-list-item__prepend {
  min-inline-size: 24px !important;
}
</style>
