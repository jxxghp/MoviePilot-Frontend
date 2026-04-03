<!-- eslint-disable sonarjs/no-duplicate-string -->
<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import { VRow } from 'vuetify/lib/components/index.mjs'
import draggable from 'vuedraggable'
import api from '@/api'
import { DownloaderConf, MediaServerConf } from '@/api/types'
import DownloaderCard from '@/components/cards/DownloaderCard.vue'
import MediaServerCard from '@/components/cards/MediaServerCard.vue'
import { copyToClipboard } from '@/@core/utils/navigator'
import ProgressDialog from '@/components/dialog/ProgressDialog.vue'
import { useI18n } from 'vue-i18n'
import { downloaderOptions, mediaServerOptions } from '@/api/constants'
import { useDisplay } from 'vuetify'

const display = useDisplay()

// 国际化
const { t } = useI18n()

// 系统设置项
const SystemSettings = ref<any>({
  // 基础设置
  Basic: {
    DB_TYPE: 'sqlite',
    APP_DOMAIN: null,
    API_TOKEN: null,
    WALLPAPER: 'tmdb',
    MEDIASERVER_SYNC_INTERVAL: null,
    RECOGNIZE_SOURCE: 'themoviedb',
    GITHUB_TOKEN: null,
    OCR_HOST: null,
    CUSTOMIZE_WALLPAPER_API_URL: null,
    AI_AGENT_ENABLE: false,
    AI_AGENT_GLOBAL: false,
    AI_AGENT_VERBOSE: false,
    AI_AGENT_JOB_INTERVAL: 24,
    LLM_PROVIDER: 'deepseek',
    LLM_MODEL: 'deepseek-chat',
    LLM_API_KEY: null,
    LLM_BASE_URL: 'https://api.deepseek.com',
     AI_AGENT_RETRY_TRANSFER: false,
    AI_RECOMMEND_ENABLED: false,
    AI_RECOMMEND_USER_PREFERENCE: null,
    AI_RECOMMEND_MAX_ITEMS: 50,
    LLM_MAX_CONTEXT_TOKENS: 64,
  },
  // 高级系统设置
  Advanced: {
    // 全局
    AUXILIARY_AUTH_ENABLE: false,
    GLOBAL_IMAGE_CACHE: false,
    SUBSCRIBE_STATISTIC_SHARE: true,
    PLUGIN_STATISTIC_SHARE: true,
    WORKFLOW_STATISTIC_SHARE: true,
    BIG_MEMORY_MODE: false,
    DB_WAL_ENABLE: false,
    AUTO_UPDATE_RESOURCE: true,
    MOVIEPILOT_AUTO_UPDATE: false,
    // 媒体
    RECOGNIZE_PLUGIN_FIRST: false,
    TMDB_API_DOMAIN: null,
    TMDB_IMAGE_DOMAIN: null,
    TMDB_LOCALE: null,
    META_CACHE_EXPIRE: 0,
    SCRAP_FOLLOW_TMDB: true,
    FANART_ENABLE: false,
    FANART_LANG: 'zh,en',
    TMDB_SCRAP_ORIGINAL_IMAGE: null,
    // 网络
    PROXY_HOST: null,
    GITHUB_PROXY: null,
    PIP_PROXY: null,
    DOH_ENABLE: false,
    DOH_RESOLVERS: null,
    DOH_DOMAINS: null,
    SECURITY_IMAGE_DOMAINS: [],
    // 日志
    DEBUG: false,
    LOG_LEVEL: 'INFO',
    LOG_MAX_FILE_SIZE: '5',
    LOG_BACKUP_COUNT: '3',
    LOG_FILE_FORMAT: '【%(levelname)s】%(asctime)s - %(message)s',
    // 实验室
    PLUGIN_AUTO_RELOAD: false,
    ENCODING_DETECTION_PERFORMANCE_MODE: true,
    TRANSFER_THREADS: 1,
  },
})

// 刮削配置
const scrapingConfig = [
  {
    section: 'movie',
    items: [
      { key: 'movie_nfo', label: 'setting.system.movieNfo' },
      { key: 'movie_poster', label: 'setting.system.moviePoster' },
      { key: 'movie_backdrop', label: 'setting.system.movieBackdrop' },
      { key: 'movie_logo', label: 'setting.system.movieLogo' },
      { key: 'movie_disc', label: 'setting.system.movieDisc' },
      { key: 'movie_banner', label: 'setting.system.movieBanner' },
      { key: 'movie_thumb', label: 'setting.system.movieThumb' },
    ],
  },
  {
    section: 'tv',
    items: [
      { key: 'tv_nfo', label: 'setting.system.tvNfo' },
      { key: 'tv_poster', label: 'setting.system.tvPoster' },
      { key: 'tv_backdrop', label: 'setting.system.tvBackdrop' },
      { key: 'tv_banner', label: 'setting.system.tvBanner' },
      { key: 'tv_logo', label: 'setting.system.tvLogo' },
      { key: 'tv_thumb', label: 'setting.system.tvThumb' },
    ],
  },
  {
    section: 'season',
    items: [
      { key: 'season_nfo', label: 'setting.system.seasonNfo' },
      { key: 'season_poster', label: 'setting.system.seasonPoster' },
      { key: 'season_banner', label: 'setting.system.seasonBanner' },
      { key: 'season_thumb', label: 'setting.system.seasonThumb' },
    ],
  },
  {
    section: 'episode',
    items: [
      { key: 'episode_nfo', label: 'setting.system.episodeNfo' },
      { key: 'episode_thumb', label: 'setting.system.episodeThumb' },
    ],
  },
]

// 刮削策略设置
const ScrapingPolicies = ref<Record<string, 'skip' | 'missingOnly' | 'overwrite'>>(
  Object.fromEntries(scrapingConfig.flatMap(section => section.items.map(item => [item.key, 'missingOnly']))),
)

// 是否发送请求的总开关
const isRequest = ref(true)

// 选中的媒体服务器
const mediaServers = ref<MediaServerConf[]>([])

// 下载器
const downloaders = ref<DownloaderConf[]>([])

// 提示框
const $toast = useToast()

// 进度框
const progressDialog = ref(false)

// 高级设置对话框
const advancedDialog = ref(false)

// LLM 模型列表
const llmModels = ref<string[]>([])
const loadingModels = ref(false)

const activeTab = ref('system')

// 元数据语言
const tmdbLanguageItems = [
  { title: t('setting.system.tmdbLanguage.zhCN'), value: 'zh' },
  { title: t('setting.system.tmdbLanguage.zhTW'), value: 'zh-TW' },
  { title: t('setting.system.tmdbLanguage.en'), value: 'en' },
]

// Fanart语言选项
const fanartLanguageItems = [
  { title: t('setting.system.fanartLanguage.zh'), value: 'zh' },
  { title: t('setting.system.fanartLanguage.en'), value: 'en' },
  { title: t('setting.system.fanartLanguage.ja'), value: 'ja' },
  { title: t('setting.system.fanartLanguage.ko'), value: 'ko' },
  { title: t('setting.system.fanartLanguage.de'), value: 'de' },
  { title: t('setting.system.fanartLanguage.fr'), value: 'fr' },
  { title: t('setting.system.fanartLanguage.es'), value: 'es' },
  { title: t('setting.system.fanartLanguage.it'), value: 'it' },
  { title: t('setting.system.fanartLanguage.pt'), value: 'pt' },
  { title: t('setting.system.fanartLanguage.ru'), value: 'ru' },
]

// 日志等级
const logLevelItems = [
  { title: t('setting.system.logLevelItems.debug'), value: 'DEBUG' },
  { title: t('setting.system.logLevelItems.info'), value: 'INFO' },
  { title: t('setting.system.logLevelItems.warning'), value: 'WARNING' },
  { title: t('setting.system.logLevelItems.error'), value: 'ERROR' },
  { title: t('setting.system.logLevelItems.critical'), value: 'CRITICAL' },
]

// 安全域名添加变量
const newSecurityDomain = ref('')

// 加载LLM模型列表
async function loadLlmModels() {
  loadingModels.value = true
  try {
    const result: { [key: string]: any } = await api.get('system/llm-models', {
      params: {
        provider: SystemSettings.value.Basic.LLM_PROVIDER,
        api_key: SystemSettings.value.Basic.LLM_API_KEY,
        base_url: SystemSettings.value.Basic.LLM_BASE_URL,
      },
    })

    if (result.success) {
      llmModels.value = result.data
      if (llmModels.value.length > 0) SystemSettings.value.Basic.LLM_MODEL = llmModels.value[0]
    } else {
      $toast.error(result.message)
    }
  } catch (error) {
    console.log(error)
  }
  loadingModels.value = false
}

// 添加安全域名
function addSecurityDomain() {
  if (
    newSecurityDomain.value &&
    !SystemSettings.value.Advanced.SECURITY_IMAGE_DOMAINS.includes(newSecurityDomain.value)
  ) {
    SystemSettings.value.Advanced.SECURITY_IMAGE_DOMAINS.push(newSecurityDomain.value)
    newSecurityDomain.value = ''
  }
}

// 调用API查询下载器设置
async function loadDownloaderSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Downloaders')
    downloaders.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存下载器设置
async function saveDownloaderSetting() {
  try {
    // 提取启用的下载器
    const enabledDownloaders = downloaders.value.filter(item => item.enabled)
    // 有启动的下载器时
    if (enabledDownloaders.length > 0) {
      downloaders.value = handleDefaultDownloaders(enabledDownloaders, downloaders.value)
    }
    const result: { [key: string]: any } = await api.post('system/setting/Downloaders', downloaders.value)
    if (result.success) $toast.success(t('setting.system.downloaderSaveSuccess'))
    else $toast.error(t('setting.system.downloaderSaveFailed'))

    await loadDownloaderSetting()
  } catch (error) {
    console.log(error)
  }
}

// 处理默认下载器状态
function handleDefaultDownloaders(enabledDownloaders: any[], downloaders: any[]) {
  const enabledDefaultDownloader = enabledDownloaders.find(item => item.default)
  if (enabledDownloaders.length > 0 && !enabledDefaultDownloader) {
    downloaders = downloaders.map(item => {
      if (item === enabledDownloaders[0]) {
        $toast.info(t('setting.system.defaultDownloaderNotice', { name: item.name }))
        return { ...item, default: true }
      }
      // 清除其他下载器的默认下载器状态
      return { ...item, default: false }
    })
  }
  return downloaders
}

// 调用API查询媒体服务器设置
async function loadMediaServerSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/MediaServers')
    mediaServers.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存媒体服务器设置
async function saveMediaServerSetting() {
  try {
    const result: { [key: string]: any } = await api.post('system/setting/MediaServers', mediaServers.value)
    if (result.success) $toast.success(t('setting.system.mediaServerSaveSuccess'))
    else $toast.error(t('setting.system.mediaServerSaveFailed'))

    await loadMediaServerSetting()
  } catch (error) {
    console.log(error)
  }
}

// 加载系统设置
async function loadSystemSettings() {
  try {
    const result: { [key: string]: any } = await api.get('system/env')
    if (result.success) {
      // 将API返回的值赋值给SystemSettings
      for (const sectionKey of Object.keys(SystemSettings.value) as Array<keyof typeof SystemSettings.value>) {
        Object.keys(SystemSettings.value[sectionKey]).forEach((key: string) => {
          if (result.data.hasOwnProperty(key)) (SystemSettings.value[sectionKey] as any)[key] = result.data[key]
        })
      }
    }
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存设置
async function saveSystemSetting(value: { [key: string]: any }) {
  try {
    const result: { [key: string]: any } = await api.post('system/env', value)
    if (result.success) {
      return true
    } else {
      $toast.error(t('setting.system.saveFailed', { message: result?.message }))
      return false
    }
  } catch (error) {
    console.log(error)
  }
  return false
}

// 保存基础设置
async function saveBasicSettings() {
  if (await saveSystemSetting(SystemSettings.value.Basic)) {
    $toast.success(t('setting.system.basicSaveSuccess'))
  }
}

// 保存高级设置
async function saveAdvancedSettings() {
  cleanEmptyFields(SystemSettings.value.Advanced, ['LOG_FILE_FORMAT'])

  // 同时保存高级设置和刮削开关设置
  const advancedResult = await saveSystemSetting(SystemSettings.value.Advanced)
  const scrapingResult = await saveScrapingSwitchs()

  if (advancedResult && scrapingResult) {
    advancedDialog.value = false
    $toast.success(t('setting.system.advancedSaveSuccess'))
  }
}

// 当字段为空时，将其设置为 null 提交，以便后端恢复为默认值
function cleanEmptyFields(settings: any, fields: string[]) {
  fields.forEach(field => {
    if (settings[field]?.trim?.() === '') {
      settings[field] = null
    }
  })
}

// 快捷复制到剪贴板
async function copyValue(value: string) {
  try {
    let success
    success = copyToClipboard(value)
    if (await success) $toast.success(t('setting.system.copySuccess'))
    else $toast.error(t('setting.system.copyFailed'))
  } catch (error) {
    $toast.error(t('setting.system.copyError'))
    console.log(error)
  }
}

// 登录首页壁纸来源
const wallpaperItems = [
  { title: t('setting.system.wallpaperItems.tmdb'), value: 'tmdb' },
  { title: t('setting.system.wallpaperItems.bing'), value: 'bing' },
  { title: t('setting.system.wallpaperItems.mediaserver'), value: 'mediaserver' },
  { title: t('setting.system.wallpaperItems.customize'), value: 'customize' },
  { title: t('setting.system.wallpaperItems.none'), value: '' },
]

// 预设部分Github加速站
const githubMirrorsItems: string[] = [
  // str: 'https://mirror.ghproxy.com/', // GitHub Proxy
  // str: 'https://ghp.ci/', // GitHub Proxy 子站
]

// 预设部分PIP镜像站
const pipMirrorsItems = [
  'https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple', // 清华大学
  'https://pypi.mirrors.ustc.edu.cn/simple', // 中国科技大学
  'https://mirrors.pku.edu.cn/pypi/web/simple', // 北京大学
  'https://mirrors.aliyun.com/pypi/simple', // 阿里云
  'https://mirrors.cloud.tencent.com/pypi/simple', // 腾讯云
  'https://mirrors.163.com/pypi/simple', // 网易云
  'https://pypi.doubanio.com/simple', // 豆瓣
  'https://mirrors.hust.edu.cn/pypi/web/simple', // 华中理工大学
  'https://mirrors.bfsu.edu.cn/pypi/web/simple', // 北京外国语大学
]

// Github加速代理显示处理
const githubProxyDisplay = computed({
  get: () => {
    return SystemSettings.value.Advanced.GITHUB_PROXY || null
  },
  set: val => {
    SystemSettings.value.Advanced.GITHUB_PROXY = val === null ? '' : val
  },
})

// PIP加速代理显示处理
const pipProxyDisplay = computed({
  get: () => {
    return SystemSettings.value.Advanced.PIP_PROXY || null
  },
  set: val => {
    SystemSettings.value.Advanced.PIP_PROXY = val === null ? '' : val
  },
})

// 创建随机字符串
function createRandomString() {
  const charset = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_'
  const array = new Uint8Array(32)
  window.crypto.getRandomValues(array)
  SystemSettings.value.Basic.API_TOKEN = Array.from(array, byte => charset[byte % charset.length]).join('')
}

// 添加下载器
function addDownloader(downloader: string) {
  let name = `下载器${downloaders.value.length + 1}`
  while (downloaders.value.some(item => item.name === name)) {
    name = `下载器${parseInt(name.split('下载器')[1]) + 1}`
  }
  downloaders.value.push({
    name: name,
    type: downloader,
    default: false,
    enabled: false,
    config: {},
  })
}

// 删除下载器
function removeDownloader(ele: DownloaderConf) {
  const index = downloaders.value.indexOf(ele)
  downloaders.value.splice(index, 1)
}

// 下载器变化
function onDownloaderChange(downloader: DownloaderConf, name: string) {
  const index = downloaders.value.findIndex(item => item.name === name)
  if (index !== -1) downloaders.value[index] = downloader
}

// 添加媒体服务器
function addMediaServer(mediaserver: string) {
  let name = `服务器${mediaServers.value.length + 1}`
  while (mediaServers.value.some(item => item.name === name)) {
    name = `服务器${parseInt(name.split('服务器')[1]) + 1}`
  }
  mediaServers.value.push({
    name: name,
    type: mediaserver,
    enabled: false,
    config: {},
  })
}

// 删除媒体服务器
function removeMediaServer(ele: MediaServerConf) {
  const index = mediaServers.value.indexOf(ele)
  if (index !== -1) mediaServers.value.splice(index, 1)
}

// 变更媒体服务器
function onMediaServerChange(mediaserver: MediaServerConf, name: string) {
  const index = mediaServers.value.findIndex(item => item.name === name)
  if (index !== -1) mediaServers.value[index] = mediaserver
}

// 添加计算属性
const moviePilotAutoUpdate = computed({
  get: () => {
    return ['release', 'dev'].includes(SystemSettings.value.Advanced.MOVIEPILOT_AUTO_UPDATE)
  },
  set: val => {
    SystemSettings.value.Advanced.MOVIEPILOT_AUTO_UPDATE = val ? 'release' : 'false'
  },
})

// Fanart语言多选处理
const fanartLanguageSelection = computed({
  get: () => {
    if (!SystemSettings.value.Advanced.FANART_LANG) return []
    return SystemSettings.value.Advanced.FANART_LANG.split(',')
      .filter(Boolean)
      .map((lang: any) => lang.trim())
  },
  set: (val: string[]) => {
    SystemSettings.value.Advanced.FANART_LANG = val.join(',')
  },
})

// 加载刮削开关设置
async function loadScrapingSwitchs() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/ScrapingSwitchs')
    if (result.success && result.data?.value) {
      const loadedSwitches = result.data.value
      for (const key in loadedSwitches) {
        if (typeof loadedSwitches[key] === 'boolean') {
          // 兼容旧数据
          loadedSwitches[key] = loadedSwitches[key] ? 'missingOnly' : 'skip'
        }
      }
      ScrapingPolicies.value = { ...ScrapingPolicies.value, ...loadedSwitches }
    }
  } catch (error) {
    console.log(error)
  }
}

// 保存刮削开关设置
async function saveScrapingSwitchs() {
  try {
    const result: { [key: string]: any } = await api.post('system/setting/ScrapingSwitchs', ScrapingPolicies.value)
    if (result.success) {
      return true
    } else {
      $toast.error(t('setting.system.scrapingSwitchSaveFailed', { message: result?.message }))
      return false
    }
  } catch (error) {
    console.log(error)
    $toast.error(t('setting.system.scrapingSwitchSaveError'))
    return false
  }
}

// 加载数据
onMounted(() => {
  loadDownloaderSetting()
  loadMediaServerSetting()
  loadSystemSettings()
  loadScrapingSwitchs()
})

onActivated(async () => {
  isRequest.value = true
})

onDeactivated(() => {
  isRequest.value = false
})
</script>

<template>
  <ProgressDialog
    v-if="progressDialog"
    v-model="progressDialog"
    :text="t('setting.system.reloading')"
    :indeterminate="true"
  />

  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.system.basicSettings') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.system.basicSettingsDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <VRow>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="SystemSettings.Basic.APP_DOMAIN"
                  :label="t('setting.system.appDomain')"
                  :hint="t('setting.system.appDomainHint')"
                  placeholder="http://localhost:3000"
                  persistent-hint
                  prepend-inner-icon="mdi-web"
                />
              </VCol>

              <VCol cols="12" md="6">
                <VRow>
                  <VCol cols="12" :md="SystemSettings.Basic.WALLPAPER === 'customize' ? 6 : 12">
                    <VSelect
                      v-model="SystemSettings.Basic.WALLPAPER"
                      :label="t('setting.system.wallpaper')"
                      :hint="t('setting.system.wallpaperHint')"
                      persistent-hint
                      :items="wallpaperItems"
                      prepend-inner-icon="mdi-image"
                    />
                  </VCol>

                  <VCol v-if="SystemSettings.Basic.WALLPAPER === 'customize'" cols="12" md="6">
                    <VTextField
                      v-model="SystemSettings.Basic.CUSTOMIZE_WALLPAPER_API_URL"
                      :label="t('setting.system.customizeWallpaperApi')"
                      :hint="t('setting.system.customizeWallpaperApiHint')"
                      :placeholder="t('setting.system.customizeWallpaperApi')"
                      persistent-hint
                      :rules="[v => !!v || t('setting.system.customizeWallpaperApiRequired')]"
                      prepend-inner-icon="mdi-api"
                    />
                  </VCol>
                </VRow>
              </VCol>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="SystemSettings.Basic.RECOGNIZE_SOURCE"
                  :label="t('setting.system.recognizeSource')"
                  :hint="t('setting.system.recognizeSourceHint')"
                  persistent-hint
                  :items="[
                    { title: 'TheMovieDb', value: 'themoviedb' },
                    { title: '豆瓣', value: 'douban' },
                  ]"
                  prepend-inner-icon="mdi-database"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="SystemSettings.Basic.MEDIASERVER_SYNC_INTERVAL"
                  :label="t('setting.system.mediaServerSyncInterval')"
                  :hint="t('setting.system.mediaServerSyncIntervalHint')"
                  persistent-hint
                  :suffix="t('setting.system.hours')"
                  type="number"
                  min="1"
                  :rules="[
                    (v: any) => !!v || t('setting.system.required'),
                    (v: any) => !isNaN(v) || t('setting.system.numbersOnly'),
                    (v: any) => v >= 1 || t('setting.system.minInterval'),
                  ]"
                  prepend-inner-icon="mdi-sync"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="SystemSettings.Basic.API_TOKEN"
                  :label="t('setting.system.apiToken')"
                  :hint="t('setting.system.apiTokenHint')"
                  :placeholder="t('setting.system.apiTokenMinChars')"
                  persistent-hint
                  prepend-inner-icon="mdi-key"
                  :append-inner-icon="SystemSettings.Basic.API_TOKEN ? 'mdi-content-copy' : 'mdi-reload'"
                  @click:append-inner="
                    SystemSettings.Basic.API_TOKEN ? copyValue(SystemSettings.Basic.API_TOKEN) : createRandomString()
                  "
                  :rules="[
                    (v: string) => !!v || t('setting.system.apiTokenRequired'),
                    (v: string) => v.length >= 16 || t('setting.system.apiTokenLength'),
                  ]"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="SystemSettings.Basic.GITHUB_TOKEN"
                  :label="t('setting.system.githubToken')"
                  :placeholder="t('setting.system.githubTokenFormat')"
                  :hint="t('setting.system.githubTokenHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-github"
                >
                </VTextField>
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="SystemSettings.Basic.OCR_HOST"
                  :label="t('setting.system.ocrHost')"
                  placeholder="https://movie-pilot.org"
                  :hint="t('setting.system.ocrHostHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-text-recognition"
                />
              </VCol>
            </VRow>
            <VDivider class="my-4" />
            <VRow>
              <VCol cols="12" md="4">
                <VSwitch
                  v-model="SystemSettings.Basic.AI_AGENT_ENABLE"
                  :label="t('setting.system.aiAgentEnable')"
                  :hint="t('setting.system.aiAgentEnableHint')"
                  persistent-hint
                />
              </VCol>
              <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE" cols="12" md="4">
                <VSwitch
                  v-model="SystemSettings.Basic.AI_AGENT_GLOBAL"
                  :label="t('setting.system.aiAgentGlobal')"
                  :hint="t('setting.system.aiAgentGlobalHint')"
                  persistent-hint
                />
              </VCol>
              <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE" cols="12" md="4">
                <VSwitch
                  v-model="SystemSettings.Basic.AI_AGENT_VERBOSE"
                  :label="t('setting.system.aiAgentVerbose')"
                  :hint="t('setting.system.aiAgentVerboseHint')"
                  persistent-hint
                />
              </VCol>
              <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE" cols="12" md="6">
                <VSelect
                  v-model="SystemSettings.Basic.LLM_PROVIDER"
                  :label="t('setting.system.llmProvider')"
                  :hint="t('setting.system.llmProviderHint')"
                  persistent-hint
                  :items="[
                    { title: 'OpenAI', value: 'openai' },
                    { title: 'Google', value: 'google' },
                    { title: 'DeepSeek', value: 'deepseek' },
                  ]"
                  prepend-inner-icon="mdi-robot"
                />
              </VCol>
              <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE" cols="12" md="6">
                <VTextField
                  v-model="SystemSettings.Basic.LLM_BASE_URL"
                  :label="t('setting.system.llmBaseUrl')"
                  :hint="t('setting.system.llmBaseUrlHint')"
                  placeholder="https://api.deepseek.com"
                  persistent-hint
                  prepend-inner-icon="mdi-link"
                />
              </VCol>
              <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE" cols="12" md="6">
                <VTextField
                  v-model="SystemSettings.Basic.LLM_API_KEY"
                  :label="t('setting.system.llmApiKey')"
                  :hint="t('setting.system.llmApiKeyHint')"
                  :placeholder="t('setting.system.llmApiKeyPlaceholder')"
                  persistent-hint
                  type="password"
                  prepend-inner-icon="mdi-key-variant"
                />
              </VCol>
              <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE" cols="12" md="6">
                <VCombobox
                  v-model="SystemSettings.Basic.LLM_MODEL"
                  :label="t('setting.system.llmModel')"
                  :hint="t('setting.system.llmModelHint')"
                  :placeholder="t('setting.system.llmModelHint')"
                  persistent-hint
                  :items="llmModels"
                  :loading="loadingModels"
                  prepend-inner-icon="mdi-brain"
                >
                  <template #append-inner>
                    <VBtn
                      variant="text"
                      icon="mdi-refresh"
                      size="small"
                      @click="loadLlmModels"
                      :disabled="!SystemSettings.Basic.LLM_API_KEY"
                    />
                  </template>
                </VCombobox>
              </VCol>
              <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE" cols="12" md="6">
                <VTextField
                  v-model.number="SystemSettings.Basic.LLM_MAX_CONTEXT_TOKENS"
                  :label="t('setting.system.llmMaxContextTokens')"
                  :hint="t('setting.system.llmMaxContextTokensHint')"
                  persistent-hint
                  type="number"
                  prepend-inner-icon="mdi-counter"
                />
              </VCol>
              <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE" cols="12" md="6">
                <VSelect
                  v-model="SystemSettings.Basic.AI_AGENT_JOB_INTERVAL"
                  :label="t('setting.system.aiAgentJobInterval')"
                  :hint="t('setting.system.aiAgentJobIntervalHint')"
                  persistent-hint
                  :items="[
                    { title: t('setting.system.aiAgentJobIntervalDisabled'), value: 0 },
                    { title: t('setting.system.aiAgentJobInterval1h'), value: 1 },
                    { title: t('setting.system.aiAgentJobInterval3h'), value: 3 },
                    { title: t('setting.system.aiAgentJobInterval6h'), value: 6 },
                    { title: t('setting.system.aiAgentJobInterval12h'), value: 12 },
                    { title: t('setting.system.aiAgentJobInterval24h'), value: 24 },
                    { title: t('setting.system.aiAgentJobInterval1w'), value: 168 },
                    { title: t('setting.system.aiAgentJobInterval1M'), value: 720 },
                  ]"
                  prepend-inner-icon="mdi-timer-outline"
                />
              </VCol>
              <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE" cols="12">
                <VSwitch
                  v-model="SystemSettings.Basic.AI_AGENT_RETRY_TRANSFER"
                  :label="t('setting.system.aiAgentRetryTransfer')"
                  :hint="t('setting.system.aiAgentRetryTransferHint')"
                  persistent-hint
                />
              </VCol>
              <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE" cols="12">
                <VSwitch
                  v-model="SystemSettings.Basic.AI_RECOMMEND_ENABLED"
                  :label="t('setting.system.aiRecommendEnabled')"
                  :hint="t('setting.system.aiRecommendEnabledHint')"
                  persistent-hint
                />
              </VCol>
              <VCol
                v-if="SystemSettings.Basic.AI_AGENT_ENABLE && SystemSettings.Basic.AI_RECOMMEND_ENABLED"
                cols="12"
                md="6"
              >
                <VTextarea
                  v-model="SystemSettings.Basic.AI_RECOMMEND_USER_PREFERENCE"
                  :label="t('setting.system.aiRecommendUserPreference')"
                  :hint="t('setting.system.aiRecommendUserPreferenceHint')"
                  persistent-hint
                  rows="1"
                  auto-grow
                  prepend-inner-icon="mdi-account-heart"
                />
              </VCol>
              <VCol
                v-if="SystemSettings.Basic.AI_AGENT_ENABLE && SystemSettings.Basic.AI_RECOMMEND_ENABLED"
                cols="12"
                md="6"
              >
                <VTextField
                  v-model.number="SystemSettings.Basic.AI_RECOMMEND_MAX_ITEMS"
                  :label="t('setting.system.aiRecommendMaxItems')"
                  :hint="t('setting.system.aiRecommendMaxItemsHint')"
                  persistent-hint
                  type="number"
                  prepend-inner-icon="mdi-format-list-numbered"
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveBasicSettings" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
              <VSpacer />
              <VBtn
                color="error"
                @click="advancedDialog = true"
                prepend-icon="mdi-cog"
                append-icon="mdi-dots-horizontal"
              >
                {{ t('setting.system.advancedSettings') }}
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.system.downloaders') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.system.downloadersDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <draggable
            v-model="downloaders"
            handle=".cursor-move"
            item-key="name"
            tag="div"
            :component-data="{ 'class': 'grid gap-3 grid-app-card' }"
          >
            <template #item="{ element }">
              <DownloaderCard
                :downloader="element"
                :downloaders="downloaders"
                @close="removeDownloader(element)"
                @change="onDownloaderChange"
                :allow-refresh="isRequest"
              />
            </template>
          </draggable>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveDownloaderSetting" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
              <VBtn color="success" variant="tonal">
                <VIcon icon="mdi-plus" />
                <VMenu activator="parent" close-on-content-click>
                  <VList>
                    <VListItem v-for="item in downloaderOptions" @click="addDownloader(item.value)">
                      <VListItemTitle>{{ item.title }}</VListItemTitle>
                    </VListItem>
                    <VListItem @click="addDownloader('custom')">
                      <VListItemTitle>{{ t('setting.system.custom') }}</VListItemTitle>
                    </VListItem>
                  </VList>
                </VMenu>
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.system.mediaServers') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.system.mediaServersDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <draggable
            v-model="mediaServers"
            handle=".cursor-move"
            item-key="name"
            tag="div"
            :component-data="{ 'class': 'grid gap-3 grid-app-card' }"
          >
            <template #item="{ element }">
              <MediaServerCard
                :mediaserver="element"
                :mediaservers="mediaServers"
                @close="removeMediaServer(element)"
                @change="onMediaServerChange"
              />
            </template>
          </draggable>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveMediaServerSetting" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
              <VBtn color="success" variant="tonal">
                <VIcon icon="mdi-plus" />
                <VMenu activator="parent" close-on-content-click>
                  <VList>
                    <VListItem v-for="item in mediaServerOptions" @click="addMediaServer(item.value)">
                      <VListItemTitle>{{ item.title }}</VListItemTitle>
                    </VListItem>
                    <VListItem @click="addMediaServer('custom')">
                      <VListItemTitle>{{ t('setting.system.custom') }}</VListItemTitle>
                    </VListItem>
                  </VList>
                </VMenu>
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>

  <!-- 高级系统设置 -->
  <VDialog
    v-if="advancedDialog"
    v-model="advancedDialog"
    scrollable
    max-width="60rem"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard>
      <VCardItem class="py-2">
        <template #prepend>
          <VIcon icon="mdi-cog" class="me-2" />
        </template>
        <VCardTitle>{{ t('setting.system.advancedSettings') }}</VCardTitle>
        <VCardSubtitle>{{ t('setting.system.advancedSettingsDesc') }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn @click="advancedDialog = false" />
      <VCardText>
        <VTabs v-model="activeTab" show-arrows>
          <VTab value="system">
            <div>{{ t('setting.system.system') }}</div>
          </VTab>
          <VTab value="media">
            <div>{{ t('setting.system.media') }}</div>
          </VTab>
          <VTab value="network">
            <div>{{ t('setting.system.network') }}</div>
          </VTab>
          <VTab value="log">
            <div>{{ t('setting.system.log') }}</div>
          </VTab>
          <VTab value="dev">
            <div>{{ t('setting.system.lab') }}</div>
          </VTab>
        </VTabs>
        <VWindow v-model="activeTab" class="mt-5 disable-tab-transition" :touch="false">
          <VWindowItem value="system">
            <div>
              <VRow>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.AUXILIARY_AUTH_ENABLE"
                    :label="t('setting.system.auxAuthEnable')"
                    :hint="t('setting.system.auxAuthEnableHint')"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.GLOBAL_IMAGE_CACHE"
                    :label="t('setting.system.globalImageCache')"
                    :hint="t('setting.system.globalImageCacheHint')"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.SUBSCRIBE_STATISTIC_SHARE"
                    :label="t('setting.system.subscribeStatisticShare')"
                    :hint="t('setting.system.subscribeStatisticShareHint')"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.PLUGIN_STATISTIC_SHARE"
                    :label="t('setting.system.pluginStatisticShare')"
                    :hint="t('setting.system.pluginStatisticShareHint')"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.WORKFLOW_STATISTIC_SHARE"
                    :label="t('setting.system.workflowStatisticShare')"
                    :hint="t('setting.system.workflowStatisticShareHint')"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.BIG_MEMORY_MODE"
                    :label="t('setting.system.bigMemoryMode')"
                    :hint="t('setting.system.bigMemoryModeHint')"
                    persistent-hint
                  />
                </VCol>
                <VCol v-if="SystemSettings.Basic.DB_TYPE === 'sqlite'" cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.DB_WAL_ENABLE"
                    :label="t('setting.system.dbWalEnable')"
                    :hint="t('setting.system.dbWalEnableHint')"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="moviePilotAutoUpdate"
                    :label="t('setting.system.moviePilotAutoUpdate')"
                    :hint="t('setting.system.moviePilotAutoUpdateHint')"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.AUTO_UPDATE_RESOURCE"
                    :label="t('setting.system.autoUpdateResource')"
                    :hint="t('setting.system.autoUpdateResourceHint')"
                    persistent-hint
                  />
                </VCol>
              </VRow>
            </div>
          </VWindowItem>
          <VWindowItem value="media">
            <div>
              <VRow>
                <VCol cols="12" md="6">
                  <VCombobox
                    v-model="SystemSettings.Advanced.TMDB_API_DOMAIN"
                    :label="t('setting.system.tmdbApiDomain')"
                    :hint="t('setting.system.tmdbApiDomainHint')"
                    persistent-hint
                    :placeholder="t('setting.system.tmdbApiDomainPlaceholder')"
                    :items="['api.themoviedb.org', 'api.tmdb.org']"
                    :rules="[(v: string) => !!v || t('setting.system.tmdbApiDomainRequired')]"
                    prepend-inner-icon="mdi-api"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VCombobox
                    v-model="SystemSettings.Advanced.TMDB_IMAGE_DOMAIN"
                    :label="t('setting.system.tmdbImageDomain')"
                    :hint="t('setting.system.tmdbImageDomainHint')"
                    persistent-hint
                    :placeholder="t('setting.system.tmdbImageDomainPlaceholder')"
                    :items="['image.tmdb.org']"
                    :rules="[(v: string) => !!v || t('setting.system.tmdbImageDomainRequired')]"
                    prepend-inner-icon="mdi-image"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSelect
                    v-model="SystemSettings.Advanced.TMDB_LOCALE"
                    :label="t('setting.system.tmdbLocale')"
                    :hint="t('setting.system.tmdbLocaleHint')"
                    persistent-hint
                    :placeholder="t('setting.system.tmdbLocalePlaceholder')"
                    :items="tmdbLanguageItems"
                    prepend-inner-icon="mdi-translate"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="SystemSettings.Advanced.META_CACHE_EXPIRE"
                    :label="t('setting.system.metaCacheExpire')"
                    :hint="t('setting.system.metaCacheExpireHint')"
                    persistent-hint
                    min="0"
                    type="number"
                    :suffix="t('setting.system.hour')"
                    :rules="[
                      (v: any) => v === 0 || !!v || t('setting.system.metaCacheExpireRequired'),
                      (v: any) => v >= 0 || t('setting.system.metaCacheExpireMin'),
                    ]"
                    prepend-inner-icon="mdi-timer"
                  />
                </VCol>
              </VRow>
              <VRow>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.SCRAP_FOLLOW_TMDB"
                    :label="t('setting.system.scrapFollowTmdb')"
                    :hint="t('setting.system.scrapFollowTmdbHint')"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.TMDB_SCRAP_ORIGINAL_IMAGE"
                    :label="t('setting.system.scrapOriginalImage')"
                    :hint="t('setting.system.scrapOriginalImageHint')"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.FANART_ENABLE"
                    :label="t('setting.system.fanartEnable')"
                    :hint="t('setting.system.fanartEnableHint')"
                    persistent-hint
                  />
                </VCol>
                <VCol v-if="SystemSettings.Advanced.FANART_ENABLE" cols="12" md="6">
                  <VSelect
                    v-model="fanartLanguageSelection"
                    :label="t('setting.system.fanartLang')"
                    :hint="t('setting.system.fanartLangHint')"
                    persistent-hint
                    :items="fanartLanguageItems"
                    multiple
                    chips
                    closable-chips
                    prepend-inner-icon="mdi-translate"
                  />
                </VCol>
              </VRow>
              <VRow>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.RECOGNIZE_PLUGIN_FIRST"
                    :label="t('setting.system.recognizePluginFirst')"
                    :hint="t('setting.system.recognizePluginFirstHint')"
                    persistent-hint
                  />
                </VCol>
              </VRow>

              <!-- 刮削开关设置 -->
              <VRow class="mt-4">
                <VCol cols="12">
                  <VExpansionPanels>
                    <VExpansionPanel>
                      <VExpansionPanelTitle class="text-lg">
                        <VIcon icon="mdi-checkbox-multiple-outline" class="me-2" />
                        {{ t('setting.system.scrapingSwitchSettings') }}
                        <!-- 帮助图标 -->
                        <VTooltip location="bottom" open-delay="200">
                          <template #activator="{ props: tooltipProps }">
                            <VBtn
                              v-bind="tooltipProps"
                              icon="mdi-help-circle"
                              size="small"
                              variant="text"
                              color="medium-emphasis"
                              class="ml-2"
                              @click.stop
                            />
                          </template>
                          <div class="d-flex flex-column gap-2 py-2">
                            <div class="d-flex align-center">
                              <VIcon icon="mdi-file-remove" color="error" class="mr-2" />
                              <span>{{ t('setting.system.policy.skipDesc') }}</span>
                            </div>
                            <div class="d-flex align-center">
                              <VIcon icon="mdi-file-plus" color="success" class="mr-2" />
                              <span>{{ t('setting.system.policy.missingOnlyDesc') }}</span>
                            </div>
                            <div class="d-flex align-center">
                              <VIcon icon="mdi-file-replace" color="primary" class="mr-2" />
                              <span>{{ t('setting.system.policy.overwriteDesc') }}</span>
                            </div>
                          </div>
                        </VTooltip>
                      </VExpansionPanelTitle>
                      <VExpansionPanelText>
                        <VRow v-for="section in scrapingConfig" :key="section.section">
                          <VCol cols="12" class="pb-2">
                            <VListSubheader class="text-lg">
                              {{ t(`setting.system.${section.section}`) }}
                            </VListSubheader>
                          </VCol>
                          <VCol v-for="item in section.items" :key="item.key" cols="12" md="4">
                            <div class="d-flex align-center">
                              <VBtnToggle
                                :model-value="ScrapingPolicies[item.key]"
                                @update:model-value="ScrapingPolicies[item.key] = $event"
                                color="primary"
                                variant="tonal"
                                rounded="lg"
                              >
                                <VBtn value="skip" color="error">
                                  <VIcon icon="mdi-file-remove" />
                                </VBtn>
                                <VBtn value="missingOnly" color="success">
                                  <VIcon icon="mdi-file-plus" />
                                </VBtn>
                                <VBtn value="overwrite" color="primary">
                                  <VIcon icon="mdi-file-replace" />
                                </VBtn>
                              </VBtnToggle>
                              <span class="ml-2">{{ t(item.label) }}</span>
                            </div>
                          </VCol>
                          <VDivider v-if="section.section !== 'episode'" class="my-4" />
                        </VRow>
                      </VExpansionPanelText>
                    </VExpansionPanel>
                  </VExpansionPanels>
                </VCol>
              </VRow>
            </div>
          </VWindowItem>
          <VWindowItem value="network">
            <div>
              <VRow>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="SystemSettings.Advanced.PROXY_HOST"
                    :label="t('setting.system.proxyHost')"
                    placeholder="http://127.0.0.1:7890"
                    :hint="t('setting.system.proxyHostHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-server-network"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VCombobox
                    v-model="githubProxyDisplay"
                    :label="t('setting.system.githubProxy')"
                    :placeholder="t('setting.system.githubProxyPlaceholder')"
                    :hint="t('setting.system.githubProxyHint')"
                    persistent-hint
                    :items="githubMirrorsItems"
                    clearable
                    prepend-inner-icon="mdi-github"
                  />
                </VCol>
                <VCol cols="12">
                  <VCombobox
                    v-model="pipProxyDisplay"
                    :label="t('setting.system.pipProxy')"
                    :placeholder="t('setting.system.pipProxyPlaceholder')"
                    :hint="t('setting.system.pipProxyHint')"
                    persistent-hint
                    :items="pipMirrorsItems"
                    clearable
                    prepend-inner-icon="mdi-package"
                  />
                </VCol>
              </VRow>
              <VRow>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.DOH_ENABLE"
                    :label="t('setting.system.dohEnable')"
                    :hint="t('setting.system.dohEnableHint')"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" v-show="SystemSettings.Advanced.DOH_ENABLE">
                  <VTextarea
                    v-model="SystemSettings.Advanced.DOH_RESOLVERS"
                    :label="t('setting.system.dohResolvers')"
                    :placeholder="t('setting.system.dohResolversPlaceholder')"
                    :hint="t('setting.system.dohResolversHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-dns"
                  />
                </VCol>
                <VCol cols="12" v-show="SystemSettings.Advanced.DOH_ENABLE">
                  <VTextarea
                    v-model="SystemSettings.Advanced.DOH_DOMAINS"
                    :label="t('setting.system.dohDomains')"
                    :placeholder="t('setting.system.dohDomainsPlaceholder')"
                    :hint="t('setting.system.dohDomainsHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-domain"
                  />
                </VCol>
              </VRow>
              <VRow>
                <VCol cols="12">
                  <VExpansionPanels>
                    <VExpansionPanel>
                      <VExpansionPanelTitle class="text-lg">
                        <template #default>
                          <VIcon icon="mdi-shield-check" class="me-2" />
                          {{ t('setting.system.securityImageDomains') }}
                        </template>
                      </VExpansionPanelTitle>
                      <VExpansionPanelText>
                        <div class="d-flex flex-wrap gap-2 mb-3">
                          <VChip
                            v-for="(domain, index) in SystemSettings.Advanced.SECURITY_IMAGE_DOMAINS"
                            :key="index"
                            closable
                            @click:close="SystemSettings.Advanced.SECURITY_IMAGE_DOMAINS.splice(index, 1)"
                          >
                            {{ domain }}
                          </VChip>
                          <VChip v-if="SystemSettings.Advanced.SECURITY_IMAGE_DOMAINS.length === 0" color="warning">
                            {{ t('setting.system.noSecurityImageDomains') }}
                          </VChip>
                        </div>
                        <div class="d-flex align-center gap-2">
                          <VTextField
                            v-model="newSecurityDomain"
                            :placeholder="t('setting.system.securityImageDomainAdd')"
                            hide-details
                            density="compact"
                            prepend-inner-icon="mdi-shield-check"
                          >
                            <template #append>
                              <VBtn icon color="primary" @click="addSecurityDomain" :disabled="!newSecurityDomain">
                                <VIcon icon="mdi-plus" />
                              </VBtn>
                            </template>
                          </VTextField>
                        </div>
                      </VExpansionPanelText>
                    </VExpansionPanel>
                  </VExpansionPanels>
                </VCol>
              </VRow>
            </div>
          </VWindowItem>
          <VWindowItem value="log">
            <div>
              <VRow>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.DEBUG"
                    :label="t('setting.system.debug')"
                    :hint="t('setting.system.debugHint')"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSelect
                    v-if="!SystemSettings.Advanced.DEBUG"
                    v-model="SystemSettings.Advanced.LOG_LEVEL"
                    :label="t('setting.system.logLevel')"
                    :hint="t('setting.system.logLevelHint')"
                    persistent-hint
                    :items="logLevelItems"
                    prepend-inner-icon="mdi-format-list-bulleted"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="SystemSettings.Advanced.LOG_MAX_FILE_SIZE"
                    :label="t('setting.system.logMaxFileSize')"
                    :hint="t('setting.system.logMaxFileSizeHint')"
                    persistent-hint
                    min="1"
                    type="number"
                    :suffix="t('setting.system.mb')"
                    :rules="[
                      (v: any) => v === 0 || !!v || t('setting.system.logMaxFileSizeRequired'),
                      (v: any) => v >= 1 || t('setting.system.logMaxFileSizeMin'),
                    ]"
                    prepend-inner-icon="mdi-file-document"
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model="SystemSettings.Advanced.LOG_BACKUP_COUNT"
                    :label="t('setting.system.logBackupCount')"
                    :hint="t('setting.system.logBackupCountHint')"
                    persistent-hint
                    min="1"
                    type="number"
                    :rules="[
                      (v: any) => v === 0 || !!v || t('setting.system.logBackupCountRequired'),
                      (v: any) => v >= 1 || t('setting.system.logBackupCountMin'),
                    ]"
                    prepend-inner-icon="mdi-backup-restore"
                  />
                </VCol>
                <VCol cols="12">
                  <VTextField
                    v-model="SystemSettings.Advanced.LOG_FILE_FORMAT"
                    :label="t('setting.system.logFileFormat')"
                    :hint="t('setting.system.logFileFormatHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-format-text"
                  />
                </VCol>
              </VRow>
            </div>
          </VWindowItem>
          <VWindowItem value="dev">
            <div>
              <VRow>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.PLUGIN_AUTO_RELOAD"
                    :label="t('setting.system.pluginAutoReload')"
                    :hint="t('setting.system.pluginAutoReloadHint')"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.ENCODING_DETECTION_PERFORMANCE_MODE"
                    :label="t('setting.system.encodingDetectionPerformanceMode')"
                    :hint="t('setting.system.encodingDetectionPerformanceModeHint')"
                    persistent-hint
                  />
                </VCol>
                <VCol cols="12" md="6">
                  <VTextField
                    v-model.number="SystemSettings.Advanced.TRANSFER_THREADS"
                    :label="t('setting.system.transferThreads')"
                    :hint="t('setting.system.transferThreadsHint')"
                    persistent-hint
                    type="number"
                    min="1"
                    prepend-inner-icon="mdi-swap-horizontal"
                  />
                </VCol>
              </VRow>
            </div>
          </VWindowItem>
        </VWindow>
      </VCardText>
      <VCardActions class="pt-3">
        <VForm @submit.prevent="() => {}">
          <div class="d-flex flex-wrap gap-4 mt-4">
            <VBtn color="primary" prepend-icon="mdi-content-save" @click="saveAdvancedSettings" class="px-5">
              {{ t('common.save') }}
            </VBtn>
          </div>
        </VForm>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
