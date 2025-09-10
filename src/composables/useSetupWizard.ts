import { ref, computed } from 'vue'
import { useToast } from 'vue-toastification'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import api from '@/api'
import { copyToClipboard } from '@/@core/utils/navigator'

export interface WizardData {
  basic: {
    appDomain: string
    apiToken: string
    username: string
    password: string
    confirmPassword: string
    proxyHost: string
    githubToken: string
  }
  storage: {
    downloadPath: string
    libraryPath: string
    transferType: string
    overwriteMode: string
  }
  downloader: {
    type: string
    name: string
    config: any
  }
  mediaServer: {
    type: string
    name: string
    config: any
    sync_libraries: any[]
  }
  notification: {
    type: string
    name: string
    enabled: boolean
    config: any
    switchs: any[]
  }
  preferences: {
    quality: string
    subtitle: string
    resolution: string
  }
}

export interface ConnectivityTestState {
  isTesting: boolean
  testMessage: string
  testProgress: number
  testResult: 'success' | 'error' | null
  showResult: boolean
}

export function useSetupWizard() {
  const { t } = useI18n()
  const router = useRouter()
  const $toast = useToast()

  // 当前步骤
  const currentStep = ref(1)
  const totalSteps = 6

  // 选中的预设规则
  const selectedPreset = ref('')

  // 向导数据
  const wizardData = ref<WizardData>({
    basic: {
      appDomain: '',
      apiToken: '',
      username: '',
      password: '',
      confirmPassword: '',
      proxyHost: '',
      githubToken: '',
    },
    storage: {
      downloadPath: '',
      libraryPath: '',
      transferType: 'link',
      overwriteMode: 'never',
    },
    downloader: {
      type: '',
      name: '',
      config: {},
    },
    mediaServer: {
      type: '',
      name: '',
      config: {},
      sync_libraries: [],
    },
    notification: {
      type: '',
      name: '',
      enabled: false,
      config: {},
      switchs: [],
    },
    preferences: {
      quality: '4K',
      subtitle: 'chinese',
      resolution: '2160p',
    },
  })

  // 步骤标题
  const stepTitles = computed(() => [
    t('setupWizard.basic.title'),
    t('setupWizard.storage.title'),
    t('setupWizard.downloader.title'),
    t('setupWizard.mediaServer.title'),
    t('setupWizard.notification.title'),
    t('setupWizard.preferences.title'),
  ])

  // 步骤描述
  const stepDescriptions = computed(() => [
    t('setupWizard.basic.description'),
    t('setupWizard.storage.description'),
    t('setupWizard.downloader.description'),
    t('setupWizard.mediaServer.description'),
    t('setupWizard.notification.description'),
    t('setupWizard.preferences.description'),
  ])

  // 连通性测试状态
  const connectivityTest = ref<ConnectivityTestState>({
    isTesting: false,
    testMessage: '',
    testProgress: 0,
    testResult: null,
    showResult: false,
  })

  // 创建随机API Token
  function createRandomString() {
    const charset = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_'
    const array = new Uint8Array(32)
    window.crypto.getRandomValues(array)
    wizardData.value.basic.apiToken = Array.from(array, byte => charset[byte % charset.length]).join('')
  }

  // 复制到剪贴板
  async function copyValue(value: string) {
    try {
      const success = copyToClipboard(value)
      if (await success) {
        $toast.success(t('setting.system.copySuccess'))
      } else {
        $toast.error(t('setting.system.copyFailed'))
      }
    } catch (error) {
      $toast.error(t('setting.system.copyError'))
      console.error(error)
    }
  }

  // 选择下载器
  function selectDownloader(type: string) {
    wizardData.value.downloader.type = type
    wizardData.value.downloader.name = `${type} 下载器`
    wizardData.value.downloader.config = {}
  }

  // 选择媒体服务器
  function selectMediaServer(type: string) {
    wizardData.value.mediaServer.type = type
    wizardData.value.mediaServer.name = `${type} 服务器`
    wizardData.value.mediaServer.config = {}
  }

  // 选择通知
  function selectNotification(type: string) {
    wizardData.value.notification.type = type
    wizardData.value.notification.name = `${type} 通知`
    wizardData.value.notification.config = {}
  }

  // 选择预设规则
  function selectPreset(preset: string) {
    selectedPreset.value = preset

    switch (preset) {
      case '4k':
        wizardData.value.preferences.quality = '4K'
        wizardData.value.preferences.subtitle = 'bilingual'
        wizardData.value.preferences.resolution = '2160p'
        break
      case 'balanced':
        wizardData.value.preferences.quality = '1080P'
        wizardData.value.preferences.subtitle = 'chinese'
        wizardData.value.preferences.resolution = '1080p'
        break
      case 'chinese':
        wizardData.value.preferences.quality = '1080P'
        wizardData.value.preferences.subtitle = 'chinese'
        wizardData.value.preferences.resolution = '1080p'
        break
    }
  }

  // 连通性测试函数
  async function testConnectivity(step: number) {
    connectivityTest.value.isTesting = true
    connectivityTest.value.testMessage = ''
    connectivityTest.value.testProgress = 0
    connectivityTest.value.testResult = null
    connectivityTest.value.showResult = false

    try {
      let testResult: { success: boolean; message: string | null } = { success: false, message: null }

      switch (step) {
        case 2: // 存储目录测试
          testResult = await testStorageConnectivity()
          break
        case 3: // 下载器测试
          testResult = await testDownloaderConnectivity()
          break
        case 4: // 媒体服务器测试
          testResult = await testMediaServerConnectivity()
          break
        case 5: // 消息通知测试
          testResult = await testNotificationConnectivity()
          break
      }

      // 设置测试结果
      connectivityTest.value.isTesting = false
      connectivityTest.value.testResult = testResult.success ? 'success' : 'error'
      connectivityTest.value.showResult = true

      // 根据结果显示不同的消息
      if (testResult.success) {
        connectivityTest.value.testMessage = t('setupWizard.connectivityTestSuccess')
      } else {
        // 显示API返回的具体错误原因
        connectivityTest.value.testMessage = testResult.message || t('setupWizard.connectivityTestFailed')
      }

      // 成功时2秒后隐藏结果，失败时保持显示直到用户操作
      if (testResult.success) {
        setTimeout(() => {
          connectivityTest.value.showResult = false
          connectivityTest.value.testResult = null
        }, 2000)
      }

      return testResult.success
    } catch (error) {
      console.error('Connectivity test failed:', error)
      connectivityTest.value.isTesting = false
      connectivityTest.value.testResult = 'error'
      connectivityTest.value.showResult = true
      connectivityTest.value.testMessage = (error as Error).message || t('setupWizard.connectivityTestFailed')
      return false
    }
  }

  // 存储目录连通性测试
  async function testStorageConnectivity() {
    try {
      connectivityTest.value.testProgress = 30
      connectivityTest.value.testMessage = t('setupWizard.testingStorage')

      // 等待设置生效
      await new Promise(resolve => setTimeout(resolve, 2000))

      connectivityTest.value.testProgress = 60
      connectivityTest.value.testMessage = t('setupWizard.checkingStorage')

      // 调用存储测试API
      const result = await api.get('system/storagetest')
      connectivityTest.value.testProgress = 100

      if (result.data?.success) {
        return { success: true, message: null }
      } else {
        return { success: false, message: result.data?.message || t('setupWizard.storageTestFailed') }
      }
    } catch (error) {
      console.error('Storage test failed:', error)
      return { success: false, message: (error as Error).message || t('setupWizard.storageTestFailed') }
    }
  }

  // 下载器连通性测试
  async function testDownloaderConnectivity() {
    try {
      connectivityTest.value.testProgress = 30
      connectivityTest.value.testMessage = t('setupWizard.testingDownloader')

      // 等待设置生效
      await new Promise(resolve => setTimeout(resolve, 2000))

      connectivityTest.value.testProgress = 60
      connectivityTest.value.testMessage = t('setupWizard.checkingDownloader')

      // 调用下载器测试API
      const moduleid = wizardData.value.downloader.type
      if (!moduleid) {
        return { success: false, message: t('setupWizard.downloaderNotSelected') }
      }

      const result: { [key: string]: any } = await api.get(`system/moduletest/${moduleid}`)
      connectivityTest.value.testProgress = 100

      if (result.data?.success) {
        return { success: true, message: null }
      } else {
        return { success: false, message: result.data?.message || t('setupWizard.downloaderTestFailed') }
      }
    } catch (error) {
      console.error('Downloader test failed:', error)
      return { success: false, message: (error as Error).message || t('setupWizard.downloaderTestFailed') }
    }
  }

  // 媒体服务器连通性测试
  async function testMediaServerConnectivity() {
    try {
      connectivityTest.value.testProgress = 30
      connectivityTest.value.testMessage = t('setupWizard.testingMediaServer')

      // 等待设置生效
      await new Promise(resolve => setTimeout(resolve, 2000))

      connectivityTest.value.testProgress = 60
      connectivityTest.value.testMessage = t('setupWizard.checkingMediaServer')

      // 调用媒体服务器测试API
      const moduleid = wizardData.value.mediaServer.type
      if (!moduleid) {
        return { success: false, message: t('setupWizard.mediaServerNotSelected') }
      }

      const result: { [key: string]: any } = await api.get(`system/moduletest/${moduleid}`)
      connectivityTest.value.testProgress = 100

      if (result.data?.success) {
        return { success: true, message: null }
      } else {
        return { success: false, message: result.data?.message || t('setupWizard.mediaServerTestFailed') }
      }
    } catch (error) {
      console.error('Media server test failed:', error)
      return { success: false, message: (error as Error).message || t('setupWizard.mediaServerTestFailed') }
    }
  }

  // 消息通知连通性测试
  async function testNotificationConnectivity() {
    try {
      connectivityTest.value.testProgress = 30
      connectivityTest.value.testMessage = t('setupWizard.testingNotification')

      // 等待设置生效
      await new Promise(resolve => setTimeout(resolve, 2000))

      connectivityTest.value.testProgress = 60
      connectivityTest.value.testMessage = t('setupWizard.checkingNotification')

      // 调用通知测试API
      const moduleid = wizardData.value.notification.type
      if (!moduleid) {
        return { success: false, message: t('setupWizard.notificationNotSelected') }
      }

      const result: { [key: string]: any } = await api.get(`system/moduletest/${moduleid}`)
      connectivityTest.value.testProgress = 100

      if (result.data?.success) {
        return { success: true, message: null }
      } else {
        return { success: false, message: result.data?.message || t('setupWizard.notificationTestFailed') }
      }
    } catch (error) {
      console.error('Notification test failed:', error)
      return { success: false, message: (error as Error).message || t('setupWizard.notificationTestFailed') }
    }
  }

  // 下一步
  async function nextStep() {
    if (currentStep.value < totalSteps) {
      // 保存当前步骤的设置
      await saveCurrentStepSettings()

      // 对于需要测试的步骤，进行连通性测试
      if ([2, 3, 4, 5].includes(currentStep.value)) {
        const testResult = await testConnectivity(currentStep.value)
        if (!testResult) {
          return
        }
      }

      currentStep.value++
    }
  }

  // 上一步
  function prevStep() {
    if (currentStep.value > 1) {
      currentStep.value--
    }
  }

  // 保存当前步骤的设置
  async function saveCurrentStepSettings() {
    try {
      switch (currentStep.value) {
        case 1:
          await saveBasicSettings()
          break
        case 2:
          await saveStorageSettings()
          break
        case 3:
          await saveDownloaderSettings()
          break
        case 4:
          await saveMediaServerSettings()
          break
        case 5:
          await saveNotificationSettings()
          break
        case 6:
          await savePreferenceSettings()
          break
      }
    } catch (error) {
      console.error('Save current step settings failed:', error)
      $toast.error(t('setupWizard.saveStepFailed'))
    }
  }

  // 完成向导
  async function completeWizard() {
    try {
      // 验证密码一致性
      if (wizardData.value.basic.password !== wizardData.value.basic.confirmPassword) {
        $toast.error(t('user.passwordMismatch'))
        return
      }

      // 创建用户（如果还没有创建）
      await createUser()

      // 保存最后一步的设置（资源偏好）
      await savePreferenceSettings()

      $toast.success(t('setupWizard.completed'))
      router.push('/setting')
    } catch (error) {
      console.error('Setup wizard failed:', error)
      $toast.error(t('setupWizard.failed'))
    }
  }

  // 创建用户
  async function createUser() {
    if (wizardData.value.basic.username && wizardData.value.basic.password) {
      try {
        // 检查用户是否已存在
        const response = await api.get('user/')
        const existingUsers = response.data || []
        const userExists = existingUsers.some((user: any) => user.name === wizardData.value.basic.username)

        if (!userExists) {
          const userData = {
            name: wizardData.value.basic.username,
            password: wizardData.value.basic.password,
            is_active: true,
            is_superuser: true,
          }

          await api.post('user/', userData)
        }
      } catch (error) {
        console.log('Create user failed or user already exists:', error)
      }
    }
  }

  // 保存基础设置
  async function saveBasicSettings() {
    try {
      const basicSettings = {
        APP_DOMAIN: wizardData.value.basic.appDomain,
        API_TOKEN: wizardData.value.basic.apiToken,
        PROXY_HOST: wizardData.value.basic.proxyHost,
        GITHUB_TOKEN: wizardData.value.basic.githubToken,
      }

      const response = await api.post('system/env', basicSettings)
      if (response.data?.success) {
        $toast.success(t('setupWizard.basicSettingsSaved'))
      }
    } catch (error) {
      console.error('Save basic settings failed:', error)
      $toast.error(t('setupWizard.saveBasicSettingsFailed'))
    }
  }

  // 保存存储配置
  async function saveStorageSettings() {
    try {
      // 创建本地存储
      const storage = {
        name: '本地存储',
        type: 'local',
        config: {},
      }

      await api.post('system/setting/Storages', [storage])

      // 创建目录配置
      const directory = {
        name: '默认目录',
        storage: 'local',
        download_path: wizardData.value.storage.downloadPath,
        library_path: wizardData.value.storage.libraryPath,
        priority: 0,
        monitor_type: 'compatibility',
        media_type: 'movie,tv',
        media_category: 'default',
        transfer_type: wizardData.value.storage.transferType,
        overwrite_mode: wizardData.value.storage.overwriteMode,
      }

      const response = await api.post('system/setting/Directories', [directory])
      if (response.data?.success) {
        $toast.success(t('setupWizard.storageSettingsSaved'))
      }
    } catch (error) {
      console.error('Save storage settings failed:', error)
      $toast.error(t('setupWizard.saveStorageSettingsFailed'))
    }
  }

  // 保存下载器配置
  async function saveDownloaderSettings() {
    if (wizardData.value.downloader.type) {
      try {
        const downloader = {
          name: wizardData.value.downloader.name,
          type: wizardData.value.downloader.type,
          default: true,
          enabled: true,
          config: wizardData.value.downloader.config,
        }

        const response = await api.post('system/setting/Downloaders', [downloader])
        if (response.data?.success) {
          $toast.success(t('setupWizard.downloaderSettingsSaved'))
        }
      } catch (error) {
        console.error('Save downloader settings failed:', error)
        $toast.error(t('setupWizard.saveDownloaderSettingsFailed'))
      }
    }
  }

  // 保存媒体服务器配置
  async function saveMediaServerSettings() {
    if (wizardData.value.mediaServer.type) {
      try {
        const mediaServer = {
          name: wizardData.value.mediaServer.name,
          type: wizardData.value.mediaServer.type,
          enabled: true,
          config: wizardData.value.mediaServer.config,
        }

        const response = await api.post('system/setting/MediaServers', [mediaServer])
        if (response.data?.success) {
          $toast.success(t('setupWizard.mediaServerSettingsSaved'))
        }
      } catch (error) {
        console.error('Save media server settings failed:', error)
        $toast.error(t('setupWizard.saveMediaServerSettingsFailed'))
      }
    }
  }

  // 保存通知配置
  async function saveNotificationSettings() {
    if (wizardData.value.notification.type) {
      try {
        const notification = {
          name: wizardData.value.notification.name,
          type: wizardData.value.notification.type,
          enabled: true,
          config: wizardData.value.notification.config,
        }

        const response = await api.post('system/setting/Notifications', [notification])
        if (response.data?.success) {
          $toast.success(t('setupWizard.notificationSettingsSaved'))
        }
      } catch (error) {
        console.error('Save notification settings failed:', error)
        $toast.error(t('setupWizard.saveNotificationSettingsFailed'))
      }
    }
  }

  // 保存资源偏好设置
  async function savePreferenceSettings() {
    try {
      // 这里可以根据偏好设置创建相应的过滤规则
      // 暂时保存到系统设置中
      const preferenceSettings = {
        QUALITY_PREFERENCE: wizardData.value.preferences.quality,
        SUBTITLE_PREFERENCE: wizardData.value.preferences.subtitle,
        RESOLUTION_PREFERENCE: wizardData.value.preferences.resolution,
      }

      const response = await api.post('system/env', preferenceSettings)
      if (response.data?.success) {
        $toast.success(t('setupWizard.preferenceSettingsSaved'))
      }
    } catch (error) {
      console.error('Save preference settings failed:', error)
      $toast.error(t('setupWizard.savePreferenceSettingsFailed'))
    }
  }

  // 加载系统设置
  async function loadSystemSettings() {
    try {
      const result: { [key: string]: any } = await api.get('system/env')
      if (result.success) {
        // 加载基础设置
        if (result.data.APP_DOMAIN) {
          wizardData.value.basic.appDomain = result.data.APP_DOMAIN
        }
        if (result.data.API_TOKEN) {
          wizardData.value.basic.apiToken = result.data.API_TOKEN
        }
        if (result.data.PROXY_HOST) {
          wizardData.value.basic.proxyHost = result.data.PROXY_HOST
        }
        if (result.data.GITHUB_TOKEN) {
          wizardData.value.basic.githubToken = result.data.GITHUB_TOKEN
        }
      }
    } catch (error) {
      console.log('Load system settings failed:', error)
    }
  }

  // 加载存储设置
  async function loadStorageSettings() {
    try {
      const result: { [key: string]: any } = await api.get('system/setting/Directories')
      if (result.success && result.data?.value && result.data.value.length > 0) {
        const directory = result.data.value[0]
        wizardData.value.storage.downloadPath = directory.download_path || ''
        wizardData.value.storage.libraryPath = directory.library_path || ''
        wizardData.value.storage.transferType = directory.transfer_type || 'link'
        wizardData.value.storage.overwriteMode = directory.overwrite_mode || 'never'
      }
    } catch (error) {
      console.log('Load storage settings failed:', error)
    }
  }

  // 加载下载器设置
  async function loadDownloaderSettings() {
    try {
      const result: { [key: string]: any } = await api.get('system/setting/Downloaders')
      if (result.success && result.data?.value && result.data.value.length > 0) {
        const downloader = result.data.value[0]
        wizardData.value.downloader.type = downloader.type
        wizardData.value.downloader.name = downloader.name
        wizardData.value.downloader.config = downloader.config || {}
      }
    } catch (error) {
      console.log('Load downloader settings failed:', error)
    }
  }

  // 加载媒体服务器设置
  async function loadMediaServerSettings() {
    try {
      const result: { [key: string]: any } = await api.get('system/setting/MediaServers')
      if (result.success && result.data?.value && result.data.value.length > 0) {
        const mediaServer = result.data.value[0]
        wizardData.value.mediaServer.type = mediaServer.type
        wizardData.value.mediaServer.name = mediaServer.name
        wizardData.value.mediaServer.config = mediaServer.config || {}
        wizardData.value.mediaServer.sync_libraries = mediaServer.sync_libraries || []
      }
    } catch (error) {
      console.log('Load media server settings failed:', error)
    }
  }

  // 加载通知设置
  async function loadNotificationSettings() {
    try {
      const result: { [key: string]: any } = await api.get('system/setting/Notifications')
      if (result.success && result.data?.value && result.data.value.length > 0) {
        const notification = result.data.value[0]
        wizardData.value.notification.type = notification.type
        wizardData.value.notification.name = notification.name
        wizardData.value.notification.enabled = notification.enabled
        wizardData.value.notification.config = notification.config || {}
        wizardData.value.notification.switchs = notification.switchs || []
      }
    } catch (error) {
      console.log('Load notification settings failed:', error)
    }
  }

  // 加载资源偏好设置
  async function loadPreferenceSettings() {
    try {
      const result: { [key: string]: any } = await api.get('system/env')
      if (result.success) {
        if (result.data.QUALITY_PREFERENCE) {
          wizardData.value.preferences.quality = result.data.QUALITY_PREFERENCE
        }
        if (result.data.SUBTITLE_PREFERENCE) {
          wizardData.value.preferences.subtitle = result.data.SUBTITLE_PREFERENCE
        }
        if (result.data.RESOLUTION_PREFERENCE) {
          wizardData.value.preferences.resolution = result.data.RESOLUTION_PREFERENCE
        }
      }
    } catch (error) {
      console.log('Load preference settings failed:', error)
    }
  }

  // 初始化
  async function initialize() {
    createRandomString()
    await loadSystemSettings()
    await loadStorageSettings()
    await loadDownloaderSettings()
    await loadMediaServerSettings()
    await loadNotificationSettings()
    await loadPreferenceSettings()
  }

  return {
    // 状态
    currentStep,
    totalSteps,
    stepTitles,
    stepDescriptions,
    wizardData,
    selectedPreset,
    connectivityTest,
    
    // 方法
    createRandomString,
    copyValue,
    selectDownloader,
    selectMediaServer,
    selectNotification,
    selectPreset,
    testConnectivity,
    nextStep,
    prevStep,
    completeWizard,
    initialize,
  }
}