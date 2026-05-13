<script setup lang="ts">
import { useToast } from 'vue-toastification'
import router from '@/router'
import avatar1 from '@images/avatars/avatar-1.png'
import api from '@/api'
import ProgressDialog from '@/components/dialog/ProgressDialog.vue'
import UserAuthDialog from '@/components/dialog/UserAuthDialog.vue'
import AboutDialog from '@/components/dialog/AboutDialog.vue'
import { useAuthStore, useUserStore, useGlobalSettingsStore } from '@/stores'
import { useI18n } from 'vue-i18n'
import { useDisplay, useTheme } from 'vuetify'
import { SUPPORTED_LOCALES, SupportedLocale } from '@/types/i18n'
import { checkPrefersColorSchemeIsDark } from '@/@core/utils'
import { getCurrentLocale, setI18nLanguage } from '@/plugins/i18n'
import { saveLocalTheme } from '@/@core/utils/theme'
import type { ThemeSwitcherTheme } from '@layouts/types'
import { useConfirm } from '@/composables/useConfirm'
import { themeManager } from '@/utils/themeManager'
import { usePWA, type UIMode } from '@/composables/usePWA'

// 认证 Store
const authStore = useAuthStore()
// 用户 Store
const userStore = useUserStore()
// 全局设置 Store
const globalSettingsStore = useGlobalSettingsStore()
// 国际化
const { t } = useI18n()
// 显示器
const display = useDisplay()
// PWA
const { uiMode, setUIMode } = usePWA()

// 提示框
const $toast = useToast()

// 进度框
const progressDialog = ref(false)

// 站点认证对话框
const siteAuthDialog = ref(false)

// 自定义CSS弹窗
const cssDialog = ref(false)

// UI模式菜单是否显示
const showUIModeMenu = ref(false)

// 主题菜单是否显示
const showThemeMenu = ref(false)

// 语言菜单是否显示
const showLanguageMenu = ref(false)

// 自定义CSS
const customCSS = ref('')

// 透明度相关
const transparencyOpacity = ref(parseFloat(localStorage.getItem('transparency-opacity') || '0.3'))
const transparencyBlur = ref(parseFloat(localStorage.getItem('transparency-blur') || '10'))
const backgroundPosterOpacity = ref(parseFloat(localStorage.getItem('transparency-background-poster-opacity') || '1'))
const backgroundBlur = ref(parseFloat(localStorage.getItem('transparency-background-blur') || '16'))
const transparencyLevel = ref(localStorage.getItem('transparency-level') || 'medium')
const isTransparentTheme = computed(() => currentThemeName.value === 'transparent')
const showTransparencyDialog = ref(false)

// 关于对话框
const aboutDialog = ref(false)

// 预设值配置
const transparencyPresets = {
  low: { opacity: 0.1, blur: 5 },
  medium: { opacity: 0.3, blur: 10 },
  high: { opacity: 0.6, blur: 15 },
}

// 判断当前值是否匹配预设值
const currentPresetLevel = computed(() => {
  for (const [level, preset] of Object.entries(transparencyPresets)) {
    if (
      Math.abs(transparencyOpacity.value - preset.opacity) < 0.01 &&
      Math.abs(transparencyBlur.value - preset.blur) < 0.1
    ) {
      return level
    }
  }
  return null
})

// 重启轮询控制标识
const restartPollingId = ref<number | null>(null)
const isRestarting = ref(false)

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

// 检测服务状态
async function checkServiceStatus(): Promise<boolean> {
  try {
    const result: { [key: string]: any } = await api.get('system/env', { timeout: 3000 })
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
      progressDialog.value = false
      restartPollingId.value = null

      setTimeout(() => {
        logout()
      }, 1000)
      return
    }

    if (retryCount >= maxRetries) {
      // 超时未恢复，清理状态并提示用户
      isRestarting.value = false
      progressDialog.value = false
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
  // 设置重启状态
  isRestarting.value = true

  // 调用API重启
  try {
    // 显示等待框
    progressDialog.value = true
    const result: { [key: string]: any } = await api.get('system/restart')
    if (!result?.success) {
      // 重启失败，清理状态
      isRestarting.value = false
      progressDialog.value = false
      $toast.error(result.message)
      return
    }
  } catch (error) {
    // 重启失败，清理状态
    isRestarting.value = false
    progressDialog.value = false
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
  const isConfirmed = await createConfirm({
    type: 'warn',
    title: t('app.confirmRestart'),
    content: t('app.restartTip'),
  })

  if (!isConfirmed) return

  await restart()
}

// 显示站点认证对话框
function showSiteAuthDialog() {
  siteAuthDialog.value = true
}

// 显示关于对话框
function showAboutDialog() {
  aboutDialog.value = true
}

// 用户站点认证成功
function siteAuthDone() {
  siteAuthDialog.value = false
  logout()
}

// 从用户 Store中获取信息
const superUser = computed(() => userStore.superUser)
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

// 编辑器主题
const editorTheme = computed(() => (currentThemeName.value === 'light' ? 'github' : 'monokai'))

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
    applyTransparencySettings()
  }

  // 保存主题到服务端
  try {
    api.post('/user/config/Layout', {
      theme,
    })
  } catch (e) {
    console.error(e)
  }
}

// 获取自定义 CSS
async function getCustomCSS() {
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

// 保存自定义 CSS
async function saveCustomCSS() {
  cssDialog.value = false
  try {
    const result: { [key: string]: any } = await api.post('system/setting/UserCustomCSS', customCSS.value, {
      headers: {
        'Content-Type': 'text/plain',
      },
    })

    if (result.success) $toast.success(t('theme.customCssSaveSuccess'))
  } catch (e) {
    console.error(t('theme.customCssSaveFailed'))
  }
}

// 应用透明度设置
function applyTransparencySettings() {
  const root = document.documentElement

  if (!Number.isFinite(backgroundPosterOpacity.value)) {
    backgroundPosterOpacity.value = 1
  }
  backgroundPosterOpacity.value = Math.min(1, Math.max(0, backgroundPosterOpacity.value))
  if (!Number.isFinite(backgroundBlur.value)) {
    backgroundBlur.value = 16
  }
  backgroundBlur.value = Math.min(30, Math.max(0, backgroundBlur.value))

  // 设置CSS变量
  root.style.setProperty('--transparent-opacity', transparencyOpacity.value.toString())
  root.style.setProperty('--transparent-opacity-light', (transparencyOpacity.value * 0.67).toString())
  root.style.setProperty('--transparent-opacity-heavy', (transparencyOpacity.value * 1.67).toString())
  root.style.setProperty('--transparent-blur', `${transparencyBlur.value}px`)
  root.style.setProperty('--transparent-blur-light', `${transparencyBlur.value * 0.6}px`)
  root.style.setProperty('--transparent-blur-heavy', `${transparencyBlur.value * 1.6}px`)
  root.style.setProperty('--transparent-background-poster-opacity', backgroundPosterOpacity.value.toString())
  root.style.setProperty('--transparent-background-blur', `${backgroundBlur.value}px`)

  // 保存到本地存储
  localStorage.setItem('transparency-opacity', transparencyOpacity.value.toString())
  localStorage.setItem('transparency-blur', transparencyBlur.value.toString())
  localStorage.setItem('transparency-background-poster-opacity', backgroundPosterOpacity.value.toString())
  localStorage.setItem('transparency-background-blur', backgroundBlur.value.toString())
}

// 调整透明度预设
function adjustTransparency(level: string) {
  transparencyLevel.value = level
  localStorage.setItem('transparency-level', level)

  // 设置预设值
  switch (level) {
    case 'low':
      transparencyOpacity.value = 0.1
      transparencyBlur.value = 5
      break
    case 'medium':
      transparencyOpacity.value = 0.3
      transparencyBlur.value = 10
      break
    case 'high':
      transparencyOpacity.value = 0.6
      transparencyBlur.value = 15
      break
  }

  applyTransparencySettings()
}

// 透明度变化处理
function onOpacityChange() {
  applyTransparencySettings()
  // 清除预设级别，因为用户手动调整了
  transparencyLevel.value = ''
}

// 模糊度变化处理
function onBlurChange() {
  applyTransparencySettings()
  // 清除预设级别，因为用户手动调整了
  transparencyLevel.value = ''
}

// 背景海报透明度变化处理
function onBackgroundPosterOpacityChange() {
  applyTransparencySettings()
}

// 背景磨砂变化处理
function onBackgroundBlurChange() {
  applyTransparencySettings()
}

// 重置透明度设置
function resetTransparencySettings() {
  transparencyOpacity.value = 0.3
  transparencyBlur.value = 10
  backgroundPosterOpacity.value = 1
  backgroundBlur.value = 16
  transparencyLevel.value = 'medium'
  applyTransparencySettings()
}

// 监听主题变化
watch(
  () => currentThemeName.value,
  async () => {
    await updateTheme()

    // 如果切换到透明主题，应用透明度设置
    if (currentThemeName.value === 'transparent') {
      applyTransparencySettings()
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
  getCustomCSS()

  // 初始化透明度设置
  if (isTransparentTheme.value) {
    applyTransparencySettings()
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
})
</script>

<template>
  <VAvatar class="cursor-pointer ms-3 border" color="primary" variant="tonal">
    <VImg :src="avatar" />

    <VMenu
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
            v-if="superUser"
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
          <VListItem v-if="userLevel < 2 && superUser" link @click="showSiteAuthDialog" class="mb-1 rounded-lg" hover>
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
                  {{ themes.find(t => t.name === currentThemeName)?.title || t('theme.auto') }}
                </VListItemSubtitle>
                <template #append>
                  <VIcon icon="mdi-chevron-right" size="small" />
                </template>
              </VListItem>
            </template>
            <VList>
              <VListItem
                v-for="theme in themes"
                :key="theme.name"
                @click="changeTheme(theme.name)"
                :active="currentThemeName === theme.name"
                class="mb-1"
              >
                <template #prepend>
                  <VIcon :icon="theme.icon" />
                </template>
                <VListItemTitle>{{ theme.title }}</VListItemTitle>
                <template #append v-if="currentThemeName === theme.name">
                  <VIcon icon="mdi-check" color="primary" size="small" />
                </template>
              </VListItem>
              <VListItem @click="cssDialog = true">
                <template #prepend>
                  <VIcon icon="mdi-palette" />
                </template>
                <VListItemTitle>{{ t('theme.custom') }}</VListItemTitle>
              </VListItem>

              <!-- 透明度调整 - 仅在透明主题下显示 -->
              <template v-if="isTransparentTheme">
                <VDivider class="my-2" />
                <VListItem @click="showTransparencyDialog = true">
                  <template #prepend>
                    <VIcon icon="mdi-opacity" />
                  </template>
                  <VListItemTitle>{{ t('theme.transparencyAdjust') }}</VListItemTitle>
                  <template #append>
                    <VIcon icon="mdi-chevron-right" size="small" />
                  </template>
                </VListItem>
              </template>
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
          <VListItem @click="showAboutDialog" class="mb-1 rounded-lg" hover>
            <template #prepend>
              <VIcon icon="mdi-information-outline" />
            </template>
            <VListItemTitle>{{ t('setting.about.title') }}</VListItemTitle>
          </VListItem>

          <!-- Divider -->
          <VDivider v-if="superUser" class="my-3" />

          <!-- 👉 restart -->
          <VListItem v-if="superUser" @click="showRestartDialog" class="mb-1 rounded-lg" hover>
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

  <!-- 重启进度框 -->
  <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="t('app.restarting')" />
  <!-- 用户认证对话框 -->
  <UserAuthDialog v-if="siteAuthDialog" v-model="siteAuthDialog" @done="siteAuthDone" @close="siteAuthDialog = false" />
  <!-- 自定义 CSS -->
  <VDialog v-if="cssDialog" v-model="cssDialog" max-width="50rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem>
        <VCardTitle>
          <VIcon icon="mdi-palette" class="me-2" />
          {{ t('theme.custom') }}
        </VCardTitle>
        <VDialogCloseBtn @click="cssDialog = false" />
      </VCardItem>
      <VDivider />
      <VAceEditor v-model:value="customCSS" lang="css" :theme="editorTheme" class="w-full min-h-[30rem]" />
      <VDivider />
      <VCardText class="text-center">
        <VBtn @click="saveCustomCSS" class="w-1/2">
          <template #prepend>
            <VIcon icon="mdi-content-save" />
          </template>
          {{ t('common.save') }}
        </VBtn>
      </VCardText>
    </VCard>
  </VDialog>

  <!-- 透明度调整对话框 -->
  <VDialog v-if="showTransparencyDialog" v-model="showTransparencyDialog" max-width="30rem">
    <VCard>
      <VCardItem>
        <VCardTitle>
          <VIcon icon="mdi-opacity" class="me-2" />
          {{ t('theme.transparencyAdjust') }}
        </VCardTitle>
        <VDialogCloseBtn @click="showTransparencyDialog = false" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <div class="space-y-6">
          <!-- 透明度滑动条 -->
          <div>
            <div class="d-flex align-center justify-space-between mb-2">
              <span class="text-body-2">{{ t('theme.transparencyOpacity') }}</span>
              <span class="text-caption">{{ Math.round(transparencyOpacity * 100) }}%</span>
            </div>
            <VSlider
              v-model="transparencyOpacity"
              :min="0"
              :max="1"
              :step="0.01"
              color="primary"
              @update:model-value="onOpacityChange"
            />
          </div>

          <!-- 模糊度滑动条 -->
          <div>
            <div class="d-flex align-center justify-space-between mb-2">
              <span class="text-body-2">{{ t('theme.transparencyBlur') }}</span>
              <span class="text-caption">{{ transparencyBlur }}px</span>
            </div>
            <VSlider
              v-model="transparencyBlur"
              :min="0"
              :max="30"
              :step="1"
              color="primary"
              @update:model-value="onBlurChange"
            />
          </div>

          <!-- 背景海报透明度滑动条 -->
          <div>
            <div class="d-flex align-center justify-space-between mb-2">
              <span class="text-body-2">{{ t('theme.backgroundPosterOpacity') }}</span>
              <span class="text-caption">{{ Math.round(backgroundPosterOpacity * 100) }}%</span>
            </div>
            <VSlider
              v-model="backgroundPosterOpacity"
              :min="0"
              :max="1"
              :step="0.01"
              color="primary"
              @update:model-value="onBackgroundPosterOpacityChange"
            />
          </div>

          <!-- 背景磨砂滑动条 -->
          <div>
            <div class="d-flex align-center justify-space-between mb-2">
              <span class="text-body-2">{{ t('theme.backgroundBlur') }}</span>
              <span class="text-caption">{{ backgroundBlur }}px</span>
            </div>
            <VSlider
              v-model="backgroundBlur"
              :min="0"
              :max="30"
              :step="1"
              color="primary"
              @update:model-value="onBackgroundBlurChange"
            />
          </div>

          <!-- 预设按钮 -->
          <div>
            <span class="text-body-2 d-block mb-2">{{ t('common.preset') }}</span>
            <VBtnGroup density="compact" variant="outlined" class="w-full">
              <VBtn
                size="small"
                :color="currentPresetLevel === 'low' ? 'primary' : undefined"
                @click="adjustTransparency('low')"
                class="flex-1"
              >
                {{ t('theme.transparencyLow') }}
              </VBtn>
              <VBtn
                size="small"
                :color="currentPresetLevel === 'medium' ? 'primary' : undefined"
                @click="adjustTransparency('medium')"
                class="flex-1"
              >
                {{ t('theme.transparencyMedium') }}
              </VBtn>
              <VBtn
                size="small"
                :color="currentPresetLevel === 'high' ? 'primary' : undefined"
                @click="adjustTransparency('high')"
                class="flex-1"
              >
                {{ t('theme.transparencyHigh') }}
              </VBtn>
            </VBtnGroup>
          </div>
        </div>
      </VCardText>
      <VDivider />
      <VCardText class="text-center">
        <VBtn @click="resetTransparencySettings" variant="outlined" class="me-2">
          <template #prepend>
            <VIcon icon="mdi-refresh" />
          </template>
          {{ t('theme.transparencyReset') }}
        </VBtn>
        <VBtn @click="showTransparencyDialog = false" color="primary">
          {{ t('common.confirm') }}
        </VBtn>
      </VCardText>
    </VCard>
  </VDialog>

  <!-- 关于对话框 -->
  <AboutDialog v-if="aboutDialog" v-model="aboutDialog" @close="aboutDialog = false" />
</template>

<style lang="scss" scoped>
.v-list-item__prepend {
  min-inline-size: 24px !important;
}
</style>
