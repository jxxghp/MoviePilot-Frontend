<!-- eslint-disable sonarjs/no-duplicate-string -->
<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import { useGlobalSettingsStore } from '@/stores'
import { DownloaderConf, MediaServerConf } from '@/api/types'
import DownloaderCard from '@/components/cards/DownloaderCard.vue'
import MediaServerCard from '@/components/cards/MediaServerCard.vue'
import { copyToClipboard } from '@/@core/utils/navigator'
import { useI18n } from 'vue-i18n'
import { downloaderOptions, mediaServerOptions } from '@/api/constants'
import { useDisplay, useTheme } from 'vuetify'
import { useLlmProviderDirectory } from '@/composables/useLlmProviderDirectory'
import { useSilentSettingRefresh } from '@/composables/useSilentSettingRefresh'
import { openSharedDialog } from '@/composables/useSharedDialog'

const display = useDisplay()
const theme = useTheme()

const isTransparentTheme = computed(() => theme.name.value === 'transparent')
const globalSettingsStore = useGlobalSettingsStore()

// 国际化
const { t } = useI18n()

const props = defineProps({
  active: {
    type: Boolean,
    default: true,
  },
})

// 下载器/媒体服务器排序按需加载，降低系统设置页入口解析量。
const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))
const LlmProviderAuthDialog = defineAsyncComponent(() => import('@/components/dialog/LlmProviderAuthDialog.vue'))
const AgentMcpSettingsDialog = defineAsyncComponent(() => import('@/components/dialog/AgentMcpSettingsDialog.vue'))

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
    AI_AGENT_HIDE_ENTRY: false,
    AI_AGENT_VERBOSE: false,
    AI_AGENT_JOB_INTERVAL: 24,
    LLM_PROVIDER: 'deepseek',
    LLM_MODEL: 'deepseek-chat',
    LLM_THINKING_LEVEL: 'off',
    LLM_SUPPORT_IMAGE_INPUT: false,
    LLM_SUPPORT_AUDIO_INPUT: false,
    LLM_SUPPORT_AUDIO_OUTPUT: false,
    LLM_API_KEY: null,
    LLM_BASE_URL: 'https://api.deepseek.com',
    LLM_USE_PROXY: true,
    LLM_BASE_URL_PRESET: null,
    LLM_MAX_CONTEXT_TOKENS: 128,
    LLM_USER_AGENT: null,
    LLM_TEMPERATURE: 0.3,
    AUDIO_INPUT_PROVIDER: 'openai',
    AUDIO_INPUT_API_KEY: null,
    AUDIO_INPUT_BASE_URL: null,
    AUDIO_INPUT_MODEL: 'gpt-4o-mini-transcribe',
    AUDIO_INPUT_LANGUAGE: 'zh',
    AUDIO_OUTPUT_PROVIDER: 'openai',
    AUDIO_OUTPUT_API_KEY: null,
    AUDIO_OUTPUT_BASE_URL: null,
    AUDIO_OUTPUT_MODEL: 'gpt-4o-mini-tts',
    AUDIO_OUTPUT_VOICE: 'alloy',
    AUDIO_OUTPUT_INCLUDE_TEXT: false,
    AI_AGENT_RETRY_TRANSFER: false,
    AI_RECOMMEND_ENABLED: false,
    AI_RECOMMEND_USER_PREFERENCE: null,
    AI_RECOMMEND_MAX_ITEMS: 50,
  },
  // 高级系统设置
  Advanced: {
    // 全局
    AUXILIARY_AUTH_ENABLE: false,
    GLOBAL_IMAGE_CACHE: false,
    SUBSCRIBE_STATISTIC_SHARE: true,
    PLUGIN_STATISTIC_SHARE: true,
    USAGE_STATISTIC_SHARE: true,
    WORKFLOW_STATISTIC_SHARE: true,
    BIG_MEMORY_MODE: false,
    DB_WAL_ENABLE: false,
    AUTO_UPDATE_RESOURCE: true,
    MOVIEPILOT_AUTO_UPDATE: false,
    DATA_CLEANUP_ENABLE: false,
    DATA_CLEANUP_MESSAGE_DAYS: 90,
    DATA_CLEANUP_DOWNLOAD_HISTORY_DAYS: 180,
    DATA_CLEANUP_SITE_USERDATA_DAYS: 180,
    DATA_CLEANUP_TRANSFER_HISTORY_DAYS: 365 * 3,
    // 媒体
    RECOGNIZE_PLUGIN_FIRST: false,
    MEDIA_RECOGNIZE_SHARE: true,
    TMDB_API_DOMAIN: null,
    TMDB_API_KEY: null,
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
    IMAGE_PROXY_ALLOWED_PRIVATE_RANGES: [],
    // 日志
    DEBUG: false,
    LOG_LEVEL: 'INFO',
    LOG_MAX_FILE_SIZE: '5',
    LOG_BACKUP_COUNT: '3',
    LOG_FILE_FORMAT: '【%(levelname)s】%(asctime)s - %(message)s',
    // 实验室
    PLUGIN_AUTO_RELOAD: false,
    PLUGIN_LOCAL_REPO_PATHS: '',
    RUST_ACCEL: false,
    ENCODING_DETECTION_PERFORMANCE_MODE: true,
    TRANSFER_THREADS: 1,
  },
})

const audioProviderItems = computed(() => [
  { title: t('setting.system.audioProviderOpenAiAudio'), value: 'openai' },
  { title: t('setting.system.audioProviderChatAudio'), value: 'openai_chat_audio' },
  { title: t('setting.system.audioProviderMimo'), value: 'mimo' },
  { title: t('setting.system.audioProviderMinimax'), value: 'minimax' },
])

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

// 高级设置对话框
const advancedDialog = ref(false)

const savingBasic = ref(false)
const testingLlm = ref(false)
const rustAccelAvailable = ref(false)
const agentMcpDialog = ref(false)
const agentMcpServers = ref<AgentMcpServer[]>([])
const loadingAgentMcpServers = ref(false)

// 智能助手配置项较多，默认收起以降低基础设置页的视觉占用。
const aiAgentSettingsCollapsed = ref(true)

type LlmSettingsSnapshot = {
  AI_AGENT_ENABLE: boolean
  LLM_PROVIDER: string
  LLM_MODEL: string
  LLM_THINKING_LEVEL: string
  LLM_API_KEY: string
  LLM_BASE_URL: string
  LLM_USE_PROXY: boolean
  LLM_BASE_URL_PRESET: string
  LLM_USER_AGENT: string
  LLM_TEMPERATURE: number
}

type AgentMcpTransport = 'stdio' | 'sse' | 'http' | 'streamable_http'

interface AgentMcpServer {
  id: string
  name: string
  enabled: boolean
  transport: AgentMcpTransport
  description?: string | null
  command?: string | null
  args: string[]
  env: Record<string, string>
  url?: string | null
  headers: Record<string, string>
  timeout: number
  tool_prefix?: string | null
  require_admin: boolean
}

let llmTestRequestId = 0
let llmTestAbortController: AbortController | null = null

const llmProviderRef = computed({
  get: () => String(SystemSettings.value.Basic.LLM_PROVIDER ?? ''),
  set: value => {
    SystemSettings.value.Basic.LLM_PROVIDER = value || ''
  },
})

const llmApiKeyRef = computed({
  get: () => String(SystemSettings.value.Basic.LLM_API_KEY ?? ''),
  set: value => {
    SystemSettings.value.Basic.LLM_API_KEY = value || ''
  },
})

const llmBaseUrlRef = computed({
  get: () => String(SystemSettings.value.Basic.LLM_BASE_URL ?? ''),
  set: value => {
    SystemSettings.value.Basic.LLM_BASE_URL = value || ''
  },
})

const llmBaseUrlPresetRef = computed({
  get: () => String(SystemSettings.value.Basic.LLM_BASE_URL_PRESET ?? ''),
  set: value => {
    SystemSettings.value.Basic.LLM_BASE_URL_PRESET = value || ''
  },
})

const llmUseProxyRef = computed({
  get: () => Boolean(SystemSettings.value.Basic.LLM_USE_PROXY),
  set: value => {
    SystemSettings.value.Basic.LLM_USE_PROXY = Boolean(value)
  },
})

const llmUserAgentRef = computed({
  get: () => String(SystemSettings.value.Basic.LLM_USER_AGENT ?? ''),
  set: value => {
    SystemSettings.value.Basic.LLM_USER_AGENT = value || ''
  },
})

const llmModelRef = computed({
  get: () => String(SystemSettings.value.Basic.LLM_MODEL ?? ''),
  set: value => {
    SystemSettings.value.Basic.LLM_MODEL = value || ''
  },
})

const llmMaxContextRef = computed({
  get: () => Number(SystemSettings.value.Basic.LLM_MAX_CONTEXT_TOKENS ?? 0),
  set: value => {
    SystemSettings.value.Basic.LLM_MAX_CONTEXT_TOKENS = value || 0
  },
})

const {
  providerItems: llmProviderItems,
  baseUrlPresetItems: llmBaseUrlPresetItems,
  models: llmModels,
  selectedProvider: selectedLlmProvider,
  selectedModel: selectedLlmModel,
  loadingProviders: loadingLlmProviders,
  loadingModels,
  providerConnected,
  showBaseUrlField,
  showApiKeyField,
  canRefreshModels,
  setBaseUrlPreset,
  authDialogVisible,
  authPolling,
  authPopupBlocked,
  authSession,
  handleProviderSelection,
  applyModelMetadata,
  loadProviders: loadLlmProviders,
  loadModels: loadLlmModels,
  openAuthPage,
  startAuth: startLlmProviderAuth,
  pollAuthSession,
  disconnectAuth: disconnectLlmProviderAuth,
  closeAuthDialog,
} = useLlmProviderDirectory({
  provider: llmProviderRef,
  apiKey: llmApiKeyRef,
  baseUrl: llmBaseUrlRef,
  baseUrlPreset: llmBaseUrlPresetRef,
  useProxy: llmUseProxyRef,
  userAgent: llmUserAgentRef,
  model: llmModelRef,
  maxContextTokens: llmMaxContextRef,
})

let authDialogController: ReturnType<typeof openSharedDialog> | null = null

// 生成 LLM 授权共享弹窗所需的最新状态。
function getProviderAuthDialogProps() {
  return {
    authSession: authSession.value,
    polling: authPolling.value,
    popupBlocked: authPopupBlocked.value,
  }
}

// 打开或刷新 LLM 授权共享弹窗。
function openProviderAuthDialog() {
  const dialogProps = getProviderAuthDialogProps()
  if (authDialogController) {
    authDialogController.updateProps(dialogProps)
    return
  }

  authDialogController = openSharedDialog(
    LlmProviderAuthDialog,
    dialogProps,
    {
      close: () => {
        closeAuthDialog()
        authDialogController = null
      },
      openAuthPage,
      poll: () => {
        void pollAuthSession()
      },
      'update:modelValue': (value: boolean) => {
        if (!value) {
          closeAuthDialog()
          authDialogController = null
        }
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 关闭 LLM 授权共享弹窗控制器。
function closeProviderAuthDialog() {
  authDialogController?.close()
  authDialogController = null
}

function buildLlmSnapshot(): LlmSettingsSnapshot {
  return {
    AI_AGENT_ENABLE: Boolean(SystemSettings.value.Basic.AI_AGENT_ENABLE),
    LLM_PROVIDER: String(SystemSettings.value.Basic.LLM_PROVIDER ?? ''),
    LLM_MODEL: String(SystemSettings.value.Basic.LLM_MODEL ?? ''),
    LLM_THINKING_LEVEL: String(SystemSettings.value.Basic.LLM_THINKING_LEVEL ?? 'off'),
    LLM_API_KEY: String(SystemSettings.value.Basic.LLM_API_KEY ?? ''),
    LLM_BASE_URL: String(SystemSettings.value.Basic.LLM_BASE_URL ?? ''),
    LLM_USE_PROXY: Boolean(SystemSettings.value.Basic.LLM_USE_PROXY),
    LLM_BASE_URL_PRESET: String(SystemSettings.value.Basic.LLM_BASE_URL_PRESET ?? ''),
    LLM_USER_AGENT: String(SystemSettings.value.Basic.LLM_USER_AGENT ?? ''),
    LLM_TEMPERATURE: Number(SystemSettings.value.Basic.LLM_TEMPERATURE ?? 0.3),
  }
}

function buildLlmSnapshotKey(snapshot: LlmSettingsSnapshot) {
  return JSON.stringify(snapshot)
}

function buildLlmTestPayload(snapshot: LlmSettingsSnapshot) {
  return {
    enabled: snapshot.AI_AGENT_ENABLE,
    provider: snapshot.LLM_PROVIDER.trim(),
    model: snapshot.LLM_MODEL.trim(),
    thinking_level: snapshot.LLM_THINKING_LEVEL.trim(),
    api_key: snapshot.LLM_API_KEY.trim(),
    base_url: snapshot.LLM_BASE_URL.trim(),
    use_proxy: snapshot.LLM_USE_PROXY,
    base_url_preset: snapshot.LLM_BASE_URL_PRESET.trim(),
    user_agent: snapshot.LLM_USER_AGENT.trim(),
    temperature: Number.isFinite(snapshot.LLM_TEMPERATURE) ? snapshot.LLM_TEMPERATURE : 0.3,
  }
}

function normalizeThinkingLevelValue(value?: unknown) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
  if (!normalized) return ''

  const aliasMap: Record<string, string> = {
    none: 'off',
    disabled: 'off',
    disable: 'off',
    enabled: 'auto',
    enable: 'auto',
    default: 'auto',
    dynamic: 'auto',
  }

  return aliasMap[normalized] || normalized
}

function resolveThinkingLevelValue(data?: Record<string, any>) {
  const explicit = normalizeThinkingLevelValue(data?.LLM_THINKING_LEVEL)
  if (explicit) return explicit

  const legacyEffort = normalizeThinkingLevelValue(data?.LLM_REASONING_EFFORT)
  if (data?.LLM_DISABLE_THINKING === true) return 'off'
  if (data?.LLM_DISABLE_THINKING === false) return legacyEffort || 'auto'
  return legacyEffort || 'off'
}

function showLlmTestFailedToast(message?: string) {
  const normalizedMessage = String(message ?? '').trim()
  if (normalizedMessage) {
    $toast.error(t('setting.system.llmTestFailedToastWithMessage', { message: normalizedMessage }))
    return
  }
  $toast.error(t('setting.system.llmTestFailedToast'))
}

function invalidateLlmTestState() {
  llmTestRequestId += 1
  if (llmTestAbortController) {
    llmTestAbortController.abort()
    llmTestAbortController = null
  }
  testingLlm.value = false
}

const currentLlmSnapshot = computed(() => buildLlmSnapshot())
const currentLlmSnapshotKey = computed(() => buildLlmSnapshotKey(currentLlmSnapshot.value))
const llmProviderAuthMethods = computed(() => selectedLlmProvider.value?.oauth_methods || [])
const llmProviderAuthLabel = computed(() => selectedLlmProvider.value?.auth_status?.label || '')
const selectedLlmModelInfo = computed(() => {
  if (!selectedLlmModel.value?.context_tokens_k) return ''
  return t('setting.system.llmModelResolvedHint', {
    context: selectedLlmModel.value.context_tokens_k,
    source: selectedLlmModel.value.source || 'models.dev',
  })
})
const agentMcpEnabledCount = computed(() => agentMcpServers.value.filter(server => server.enabled).length)
const agentMcpServerPreview = computed(() => agentMcpServers.value.slice(0, 3))

const canTestLlm = computed(() => {
  const snapshot = currentLlmSnapshot.value
  return (
    snapshot.AI_AGENT_ENABLE &&
    Boolean(snapshot.LLM_PROVIDER.trim()) &&
    (Boolean(snapshot.LLM_API_KEY.trim()) || providerConnected.value) &&
    Boolean(snapshot.LLM_MODEL.trim()) &&
    !savingBasic.value &&
    !testingLlm.value
  )
})

const rustAccelHint = computed(() =>
  rustAccelAvailable.value ? t('setting.system.rustAccelHint') : t('setting.system.rustAccelUnavailableHint'),
)

const thinkingLevelItems = computed(() => [
  { title: t('setting.system.llmThinkingLevelOff'), value: 'off' },
  { title: t('setting.system.llmThinkingLevelAuto'), value: 'auto' },
  { title: t('setting.system.llmThinkingLevelMinimal'), value: 'minimal' },
  { title: t('setting.system.llmThinkingLevelLow'), value: 'low' },
  { title: t('setting.system.llmThinkingLevelMedium'), value: 'medium' },
  { title: t('setting.system.llmThinkingLevelHigh'), value: 'high' },
  { title: t('setting.system.llmThinkingLevelMax'), value: 'max' },
  { title: t('setting.system.llmThinkingLevelXhigh'), value: 'xhigh' },
])

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

const dataCleanupFieldRules = [
  (v: any) => v === 0 || !!v || t('setting.system.dataCleanupDaysRequired'),
  (v: any) => v >= 0 || t('setting.system.dataCleanupDaysMin'),
]

// 安全域名添加变量
const newSecurityDomain = ref('')
// 图片代理允许非公网网段添加变量
const newImageProxyAllowedPrivateRange = ref('')

// 加载 LLM 模型列表与 provider 目录
async function refreshLlmModels(forceRefresh = true) {
  try {
    await loadLlmModels(forceRefresh)
  } catch (error) {
    $toast.error(error instanceof Error ? error.message : String(error))
    console.log(error)
  }
}

async function handleLlmProviderChanged() {
  handleProviderSelection(true)
  if (canRefreshModels.value) {
    await refreshLlmModels(false)
  }
}

function handleLlmModelChanged() {
  applyModelMetadata()
}

async function startProviderAuth(methodId: string) {
  try {
    await startLlmProviderAuth(methodId)
  } catch (error) {
    $toast.error(error instanceof Error ? error.message : String(error))
  }
}

async function disconnectProviderAuth() {
  try {
    await disconnectLlmProviderAuth()
    $toast.success(t('setting.system.llmProviderDisconnected'))
  } catch (error) {
    $toast.error(error instanceof Error ? error.message : String(error))
  }
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

// 添加图片代理允许访问的非公网网段
function addImageProxyAllowedPrivateRange() {
  if (
    newImageProxyAllowedPrivateRange.value &&
    !SystemSettings.value.Advanced.IMAGE_PROXY_ALLOWED_PRIVATE_RANGES.includes(
      newImageProxyAllowedPrivateRange.value,
    )
  ) {
    SystemSettings.value.Advanced.IMAGE_PROXY_ALLOWED_PRIVATE_RANGES.push(newImageProxyAllowedPrivateRange.value)
    newImageProxyAllowedPrivateRange.value = ''
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
  invalidateLlmTestState()
  try {
    const result: { [key: string]: any } = await api.get('system/env')
    if (result.success) {
      // 将API返回的值赋值给SystemSettings
      for (const sectionKey of Object.keys(SystemSettings.value) as Array<keyof typeof SystemSettings.value>) {
        Object.keys(SystemSettings.value[sectionKey]).forEach((key: string) => {
          if (result.data.hasOwnProperty(key)) (SystemSettings.value[sectionKey] as any)[key] = result.data[key]
        })
      }
      const accelAvailable = Boolean(result.data.RUST_ACCEL_AVAILABLE ?? result.data.RUST_ACCEL_ENABLED)
      rustAccelAvailable.value = accelAvailable
      if (!accelAvailable) SystemSettings.value.Advanced.RUST_ACCEL = false
      SystemSettings.value.Basic.LLM_THINKING_LEVEL = resolveThinkingLevelValue(result.data)
      await loadLlmProviders()
    }
  } catch (error) {
    console.log(error)
  }
  await loadAgentMcpServers()
}

async function loadAgentMcpServers() {
  loadingAgentMcpServers.value = true
  try {
    const result: { [key: string]: any } = await api.get('message/agent/mcp/servers')
    if (result.success) agentMcpServers.value = result.data?.servers || []
  } catch (error) {
    console.log(error)
  } finally {
    loadingAgentMcpServers.value = false
  }
}

function handleAgentMcpSaved(servers: AgentMcpServer[]) {
  agentMcpServers.value = servers
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
  savingBasic.value = true
  try {
    const llmTemperature = Number(SystemSettings.value.Basic.LLM_TEMPERATURE ?? 0.3)
    SystemSettings.value.Basic.LLM_TEMPERATURE = Number.isFinite(llmTemperature) ? llmTemperature : 0.3
    if (await saveSystemSetting(SystemSettings.value.Basic)) {
      // 更新全局设置store，使Web Agent图标实时生效
      globalSettingsStore.setData({ ...globalSettingsStore.getData, ...SystemSettings.value.Basic })
      $toast.success(t('setting.system.basicSaveSuccess'))
    }
  } finally {
    savingBasic.value = false
  }
}

async function testLlmConnection() {
  if (!canTestLlm.value) return

  const snapshot = buildLlmSnapshot()
  const snapshotKey = buildLlmSnapshotKey(snapshot)
  const payload = buildLlmTestPayload(snapshot)
  const requestId = ++llmTestRequestId
  if (llmTestAbortController) llmTestAbortController.abort()
  const abortController = new AbortController()
  llmTestAbortController = abortController

  testingLlm.value = true
  try {
    const result: { [key: string]: any } = await api.post('llm/test', payload, {
      signal: abortController.signal,
    })
    if (
      requestId !== llmTestRequestId ||
      abortController.signal.aborted ||
      currentLlmSnapshotKey.value !== snapshotKey
    ) {
      return
    }

    if (result?.success) $toast.success(t('setting.system.llmTestSuccessToast'))
    else showLlmTestFailedToast(result?.message)
  } catch (error) {
    if (
      requestId !== llmTestRequestId ||
      abortController.signal.aborted ||
      currentLlmSnapshotKey.value !== snapshotKey
    ) {
      return
    }
    showLlmTestFailedToast(error instanceof Error ? error.message : String(error))
    console.log(error)
  } finally {
    if (requestId !== llmTestRequestId) return
    if (llmTestAbortController === abortController) llmTestAbortController = null
    testingLlm.value = false
  }
}

// 保存高级设置
async function saveAdvancedSettings() {
  if (!rustAccelAvailable.value) SystemSettings.value.Advanced.RUST_ACCEL = false
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
async function loadPageData() {
  await Promise.all([loadDownloaderSetting(), loadMediaServerSetting(), loadSystemSettings(), loadScrapingSwitchs()])
}

onMounted(loadPageData)

onActivated(async () => {
  isRequest.value = true
})

onDeactivated(() => {
  isRequest.value = false
})

onBeforeUnmount(() => {
  invalidateLlmTestState()
})

watch(authDialogVisible, visible => {
  if (visible) {
    openProviderAuthDialog()
    return
  }

  closeProviderAuthDialog()
})

watch([authSession, authPolling, authPopupBlocked], () => {
  authDialogController?.updateProps(getProviderAuthDialogProps())
})

useSilentSettingRefresh(
  async () => {
    if (advancedDialog.value || testingLlm.value || savingBasic.value) return
    await loadPageData()
  },
  {
    active: computed(() => props.active),
  },
)

watch(currentLlmSnapshotKey, (snapshotKey, previousSnapshotKey) => {
  if (snapshotKey !== previousSnapshotKey) invalidateLlmTestState()
})
</script>

<template>
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
            <VCard
              variant="outlined"
              :class="['mt-6', isTransparentTheme ? 'ai-agent-settings-card-transparent' : 'ai-agent-settings-card']"
            >
              <VCardItem class="pb-3">
                <template #prepend>
                  <VAvatar color="primary" variant="tonal" size="40">
                    <VIcon icon="mdi-robot-outline" />
                  </VAvatar>
                </template>
                <VCardTitle class="text-subtitle-1">
                  {{ t('setting.system.aiAgentSectionTitle') }}
                </VCardTitle>
                <VCardSubtitle>
                  {{ t('setting.system.aiAgentSectionDesc') }}
                </VCardSubtitle>
                <template #append>
                  <VTooltip location="top">
                    <template #activator="{ props }">
                      <VBtn
                        v-bind="props"
                        :icon="aiAgentSettingsCollapsed ? 'mdi-chevron-down' : 'mdi-chevron-up'"
                        variant="text"
                        color="primary"
                        size="small"
                        :aria-label="aiAgentSettingsCollapsed ? t('setting.about.expand') : t('setting.about.collapse')"
                        @click="aiAgentSettingsCollapsed = !aiAgentSettingsCollapsed"
                      />
                    </template>
                    <span>{{
                      aiAgentSettingsCollapsed ? t('setting.about.expand') : t('setting.about.collapse')
                    }}</span>
                  </VTooltip>
                </template>
              </VCardItem>
              <VExpandTransition>
                <VCardText v-show="!aiAgentSettingsCollapsed" class="pt-2">
                  <VRow>
                    <VCol cols="12" md="6">
                      <VSwitch
                        v-model="SystemSettings.Basic.AI_AGENT_ENABLE"
                        :label="t('setting.system.aiAgentEnable')"
                        :hint="t('setting.system.aiAgentEnableHint')"
                        persistent-hint
                      />
                    </VCol>
                    <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE" cols="12" md="6">
                      <VSwitch
                        v-model="SystemSettings.Basic.AI_AGENT_GLOBAL"
                        :label="t('setting.system.aiAgentGlobal')"
                        :hint="t('setting.system.aiAgentGlobalHint')"
                        persistent-hint
                      />
                    </VCol>
                    <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE" cols="12" md="6">
                      <VSwitch
                        v-model="SystemSettings.Basic.AI_AGENT_VERBOSE"
                        :label="t('setting.system.aiAgentVerbose')"
                        :hint="t('setting.system.aiAgentVerboseHint')"
                        persistent-hint
                      />
                    </VCol>
                    <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE" cols="12" md="6">
                      <VSwitch
                        v-model="SystemSettings.Basic.AI_AGENT_HIDE_ENTRY"
                        :label="t('setting.system.aiAgentHideEntry')"
                        :hint="t('setting.system.aiAgentHideEntryHint')"
                        persistent-hint
                      />
                    </VCol>
                    <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE" cols="12" md="6">
                      <VAutocomplete
                        v-model="SystemSettings.Basic.LLM_PROVIDER"
                        :label="t('setting.system.llmProvider')"
                        :hint="t('setting.system.llmProviderHint')"
                        persistent-hint
                        :items="llmProviderItems"
                        :loading="loadingLlmProviders"
                        prepend-inner-icon="mdi-robot"
                        @update:model-value="handleLlmProviderChanged"
                      />
                    </VCol>
                    <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE && showBaseUrlField" cols="12" md="6">
                      <VCombobox
                        :model-value="SystemSettings.Basic.LLM_BASE_URL"
                        @update:model-value="
                          (value: any) => {
                            if (typeof value === 'object' && value !== null) {
                              setBaseUrlPreset(value.id, value.value)
                            } else {
                              setBaseUrlPreset('', value || '')
                            }
                          }
                        "
                        :label="t('setting.system.llmBaseUrl')"
                        :hint="t('setting.system.llmBaseUrlHint')"
                        :placeholder="selectedLlmProvider?.default_base_url || 'https://api.deepseek.com'"
                        :items="llmBaseUrlPresetItems"
                        item-title="title"
                        item-value="value"
                        persistent-hint
                        prepend-inner-icon="mdi-link"
                      >
                        <template #item="{ props, item }">
                          <VListItem v-bind="props" :subtitle="item.raw.subtitle" />
                        </template>
                      </VCombobox>
                    </VCol>
                    <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE && showBaseUrlField" cols="12">
                      <VSwitch
                        v-model="SystemSettings.Basic.LLM_USE_PROXY"
                        :label="t('setting.system.llmUseProxy')"
                        :hint="t('setting.system.llmUseProxyHint')"
                        persistent-hint
                      />
                    </VCol>
                    <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE && showApiKeyField" cols="12" md="6">
                      <VTextField
                        v-model="SystemSettings.Basic.LLM_API_KEY"
                        :label="selectedLlmProvider?.api_key_label || t('setting.system.llmApiKey')"
                        :hint="selectedLlmProvider?.api_key_hint || t('setting.system.llmApiKeyHint')"
                        :placeholder="t('setting.system.llmApiKeyPlaceholder')"
                        persistent-hint
                        type="password"
                        prepend-inner-icon="mdi-key-variant"
                      />
                    </VCol>
                    <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE && llmProviderAuthMethods.length > 0" cols="12">
                      <VAlert type="info" variant="tonal">
                        <div class="d-flex flex-column flex-md-row justify-space-between ga-3">
                          <div>
                            <div class="text-subtitle-2">{{ t('setting.system.llmProviderAuth') }}</div>
                            <div class="text-body-2">
                              {{ selectedLlmProvider?.description || t('setting.system.llmProviderAuthHint') }}
                            </div>
                            <div v-if="providerConnected" class="text-body-2 mt-2">
                              {{
                                t('setting.system.llmProviderConnectedAs', {
                                  label: llmProviderAuthLabel || selectedLlmProvider?.name,
                                })
                              }}
                            </div>
                          </div>

                          <div class="d-flex flex-wrap ga-2">
                            <VBtn
                              v-for="method in llmProviderAuthMethods"
                              :key="method.id"
                              color="primary"
                              variant="tonal"
                              prepend-icon="mdi-account-arrow-right-outline"
                              @click="startProviderAuth(method.id)"
                            >
                              {{ method.label }}
                            </VBtn>

                            <VBtn
                              v-if="providerConnected"
                              color="error"
                              variant="text"
                              prepend-icon="mdi-link-off"
                              @click="disconnectProviderAuth"
                            >
                              {{ t('setting.system.llmProviderDisconnect') }}
                            </VBtn>
                          </div>
                        </div>
                      </VAlert>
                    </VCol>
                    <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE" cols="12" md="6">
                      <div>
                        <VCombobox
                          :model-value="SystemSettings.Basic.LLM_MODEL"
                          @update:model-value="
                            (val: any) => {
                              SystemSettings.Basic.LLM_MODEL = typeof val === 'object' && val !== null ? val.id : val
                              handleLlmModelChanged()
                            }
                          "
                          :label="t('setting.system.llmModel')"
                          :hint="t('setting.system.llmModelHint')"
                          :placeholder="t('setting.system.llmModelHint')"
                          persistent-hint
                          :items="llmModels"
                          item-title="name"
                          item-value="id"
                          :loading="loadingModels"
                          prepend-inner-icon="mdi-brain"
                        >
                          <template #append-inner>
                            <VBtn
                              variant="text"
                              icon="mdi-refresh"
                              size="small"
                              @click="refreshLlmModels(true)"
                              :disabled="!canRefreshModels"
                            />
                          </template>
                        </VCombobox>

                        <VAlert v-if="selectedLlmModelInfo" type="info" variant="tonal" density="compact" class="mt-2">
                          {{ selectedLlmModelInfo }}
                        </VAlert>

                        <div class="d-flex justify-end mt-2">
                          <VBtn
                            color="info"
                            variant="tonal"
                            density="comfortable"
                            prepend-icon="mdi-connection"
                            :disabled="!canTestLlm"
                            :loading="testingLlm"
                            class="llm-test-trigger"
                            @click="testLlmConnection"
                          >
                            {{ t('setting.system.llmTestAction') }}
                          </VBtn>
                        </div>
                      </div>
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
                      <VTextField
                        v-model.number="SystemSettings.Basic.LLM_TEMPERATURE"
                        :label="t('setting.system.llmTemperature')"
                        :hint="t('setting.system.llmTemperatureHint')"
                        persistent-hint
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        prepend-inner-icon="mdi-thermometer"
                      />
                    </VCol>
                    <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE && showBaseUrlField" cols="12" md="6">
                      <VTextField
                        v-model="SystemSettings.Basic.LLM_USER_AGENT"
                        :label="t('setting.system.llmUserAgent')"
                        :hint="t('setting.system.llmUserAgentHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-card-account-details-outline"
                      />
                    </VCol>
                    <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE" cols="12" md="6">
                      <VSelect
                        v-model="SystemSettings.Basic.LLM_THINKING_LEVEL"
                        :label="t('setting.system.llmThinking')"
                        :hint="t('setting.system.llmThinkingHint')"
                        :items="thinkingLevelItems"
                        persistent-hint
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
                      <VAlert type="info" variant="tonal" class="agent-mcp-summary">
                        <div class="agent-mcp-summary__content">
                          <div>
                            <div class="text-subtitle-2">{{ t('setting.system.aiAgentMcpTitle') }}</div>
                            <div class="text-body-2">
                              {{
                                t('setting.system.aiAgentMcpSummary', {
                                  enabled: agentMcpEnabledCount,
                                  total: agentMcpServers.length,
                                })
                              }}
                            </div>
                            <div v-if="agentMcpServers.length" class="agent-mcp-summary__chips mt-2">
                              <VChip
                                v-for="server in agentMcpServerPreview"
                                :key="server.id"
                                size="small"
                                variant="tonal"
                                :color="server.enabled ? 'success' : 'default'"
                              >
                                {{ server.name }}
                              </VChip>
                              <VChip v-if="agentMcpServers.length > 3" size="small" variant="tonal">
                                +{{ agentMcpServers.length - 3 }}
                              </VChip>
                            </div>
                          </div>
                          <VBtn
                            color="primary"
                            variant="tonal"
                            prepend-icon="mdi-server-network"
                            :loading="loadingAgentMcpServers"
                            @click="agentMcpDialog = true"
                          >
                            {{ t('setting.system.aiAgentMcpSettings') }}
                          </VBtn>
                        </div>
                      </VAlert>
                    </VCol>
                  </VRow>
                  <VRow>
                    <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE" cols="12" md="4">
                      <VSwitch
                        v-model="SystemSettings.Basic.LLM_SUPPORT_IMAGE_INPUT"
                        :label="t('setting.system.llmSupportImageInput')"
                        :hint="t('setting.system.llmSupportImageInputHint')"
                        persistent-hint
                      />
                    </VCol>
                  </VRow>
                  <VRow>
                    <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE" cols="12" md="6">
                      <VSwitch
                        v-model="SystemSettings.Basic.LLM_SUPPORT_AUDIO_INPUT"
                        :label="t('setting.system.llmSupportAudioInput')"
                        :hint="t('setting.system.llmSupportAudioInputHint')"
                        persistent-hint
                      />
                    </VCol>
                    <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE" cols="12" md="6">
                      <VSwitch
                        v-model="SystemSettings.Basic.LLM_SUPPORT_AUDIO_OUTPUT"
                        :label="t('setting.system.llmSupportAudioOutput')"
                        :hint="t('setting.system.llmSupportAudioOutputHint')"
                        persistent-hint
                      />
                    </VCol>
                    <VCol
                      v-if="SystemSettings.Basic.AI_AGENT_ENABLE && SystemSettings.Basic.LLM_SUPPORT_AUDIO_INPUT"
                      cols="12"
                      md="6"
                    >
                      <VSelect
                        v-model="SystemSettings.Basic.AUDIO_INPUT_PROVIDER"
                        :label="t('setting.system.audioInputProvider')"
                        :hint="t('setting.system.audioInputProviderHint')"
                        :items="audioProviderItems"
                        persistent-hint
                        prepend-inner-icon="mdi-microphone-message"
                      />
                    </VCol>
                    <VCol
                      v-if="SystemSettings.Basic.AI_AGENT_ENABLE && SystemSettings.Basic.LLM_SUPPORT_AUDIO_INPUT"
                      cols="12"
                      md="6"
                    >
                      <VTextField
                        v-model="SystemSettings.Basic.AUDIO_INPUT_MODEL"
                        :label="t('setting.system.audioInputModel')"
                        :hint="t('setting.system.audioInputModelHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-waveform"
                      />
                    </VCol>
                    <VCol
                      v-if="SystemSettings.Basic.AI_AGENT_ENABLE && SystemSettings.Basic.LLM_SUPPORT_AUDIO_INPUT"
                      cols="12"
                      md="6"
                    >
                      <VTextField
                        v-model="SystemSettings.Basic.AUDIO_INPUT_API_KEY"
                        :label="t('setting.system.audioInputApiKey')"
                        :hint="t('setting.system.audioInputApiKeyHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-key-variant"
                        type="password"
                      />
                    </VCol>
                    <VCol
                      v-if="SystemSettings.Basic.AI_AGENT_ENABLE && SystemSettings.Basic.LLM_SUPPORT_AUDIO_INPUT"
                      cols="12"
                      md="6"
                    >
                      <VTextField
                        v-model="SystemSettings.Basic.AUDIO_INPUT_BASE_URL"
                        :label="t('setting.system.audioInputBaseUrl')"
                        :hint="t('setting.system.audioInputBaseUrlHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-link-variant"
                      />
                    </VCol>
                    <VCol
                      v-if="SystemSettings.Basic.AI_AGENT_ENABLE && SystemSettings.Basic.LLM_SUPPORT_AUDIO_INPUT"
                      cols="12"
                      md="6"
                    >
                      <VTextField
                        v-model="SystemSettings.Basic.AUDIO_INPUT_LANGUAGE"
                        :label="t('setting.system.audioInputLanguage')"
                        :hint="t('setting.system.audioInputLanguageHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-translate"
                      />
                    </VCol>
                    <VCol
                      v-if="SystemSettings.Basic.AI_AGENT_ENABLE && SystemSettings.Basic.LLM_SUPPORT_AUDIO_OUTPUT"
                      cols="12"
                      md="6"
                    >
                      <VSelect
                        v-model="SystemSettings.Basic.AUDIO_OUTPUT_PROVIDER"
                        :label="t('setting.system.audioOutputProvider')"
                        :hint="t('setting.system.audioOutputProviderHint')"
                        :items="audioProviderItems"
                        persistent-hint
                        prepend-inner-icon="mdi-account-voice"
                      />
                    </VCol>
                    <VCol
                      v-if="SystemSettings.Basic.AI_AGENT_ENABLE && SystemSettings.Basic.LLM_SUPPORT_AUDIO_OUTPUT"
                      cols="12"
                      md="6"
                    >
                      <VTextField
                        v-model="SystemSettings.Basic.AUDIO_OUTPUT_MODEL"
                        :label="t('setting.system.audioOutputModel')"
                        :hint="t('setting.system.audioOutputModelHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-waveform"
                      />
                    </VCol>
                    <VCol
                      v-if="SystemSettings.Basic.AI_AGENT_ENABLE && SystemSettings.Basic.LLM_SUPPORT_AUDIO_OUTPUT"
                      cols="12"
                      md="6"
                    >
                      <VTextField
                        v-model="SystemSettings.Basic.AUDIO_OUTPUT_API_KEY"
                        :label="t('setting.system.audioOutputApiKey')"
                        :hint="t('setting.system.audioOutputApiKeyHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-key-variant"
                        type="password"
                      />
                    </VCol>
                    <VCol
                      v-if="SystemSettings.Basic.AI_AGENT_ENABLE && SystemSettings.Basic.LLM_SUPPORT_AUDIO_OUTPUT"
                      cols="12"
                      md="6"
                    >
                      <VTextField
                        v-model="SystemSettings.Basic.AUDIO_OUTPUT_BASE_URL"
                        :label="t('setting.system.audioOutputBaseUrl')"
                        :hint="t('setting.system.audioOutputBaseUrlHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-link-variant"
                      />
                    </VCol>
                    <VCol
                      v-if="SystemSettings.Basic.AI_AGENT_ENABLE && SystemSettings.Basic.LLM_SUPPORT_AUDIO_OUTPUT"
                      cols="12"
                      md="6"
                    >
                      <VTextField
                        v-model="SystemSettings.Basic.AUDIO_OUTPUT_VOICE"
                        :label="t('setting.system.audioOutputVoice')"
                        :hint="t('setting.system.audioOutputVoiceHint')"
                        persistent-hint
                        prepend-inner-icon="mdi-account-voice"
                      />
                    </VCol>
                    <VCol
                      v-if="SystemSettings.Basic.AI_AGENT_ENABLE && SystemSettings.Basic.LLM_SUPPORT_AUDIO_OUTPUT"
                      cols="12"
                    >
                      <VSwitch
                        v-model="SystemSettings.Basic.AUDIO_OUTPUT_INCLUDE_TEXT"
                        :label="t('setting.system.audioOutputIncludeText')"
                        :hint="t('setting.system.audioOutputIncludeTextHint')"
                        persistent-hint
                      />
                    </VCol>
                  </VRow>
                  <VRow>
                    <VCol v-if="SystemSettings.Basic.AI_AGENT_ENABLE" cols="12">
                      <VSwitch
                        v-model="SystemSettings.Basic.AI_AGENT_RETRY_TRANSFER"
                        :label="t('setting.system.aiAgentRetryTransfer')"
                        :hint="t('setting.system.aiAgentRetryTransferHint')"
                        persistent-hint
                      />
                    </VCol>
                  </VRow>
                  <VRow>
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
                </VCardText>
              </VExpandTransition>
            </VCard>
          </VForm>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="setting-actions mt-4">
              <VBtn
                type="submit"
                @click="saveBasicSettings"
                prepend-icon="mdi-content-save"
                :loading="savingBasic"
                :disabled="testingLlm"
                class="text-no-wrap"
              >
                {{ t('common.save') }}
              </VBtn>
              <VBtn
                color="error"
                @click="advancedDialog = true"
                prepend-icon="mdi-cog"
                append-icon="mdi-dots-horizontal"
                class="text-no-wrap setting-actions__secondary"
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
          <Draggable
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
          </Draggable>
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
          <Draggable
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
          </Draggable>
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

  <AgentMcpSettingsDialog
    v-if="agentMcpDialog"
    v-model="agentMcpDialog"
    :servers="agentMcpServers"
    @saved="handleAgentMcpSaved"
  />

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
          <VTab value="data">
            <div>{{ t('setting.system.data') }}</div>
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
                    v-model="SystemSettings.Advanced.USAGE_STATISTIC_SHARE"
                    :label="t('setting.system.usageStatisticShare')"
                    :hint="t('setting.system.usageStatisticShareHint')"
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
                  <VTextField
                    v-model="SystemSettings.Advanced.TMDB_API_KEY"
                    :label="t('setting.system.tmdbApiKey')"
                    :hint="t('setting.system.tmdbApiKeyHint')"
                    persistent-hint
                    :placeholder="t('setting.system.tmdbApiKeyPlaceholder')"
                    :rules="[(v: string) => !!v || t('setting.system.tmdbApiKeyRequired')]"
                    prepend-inner-icon="mdi-key-variant"
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
                <VCol cols="12" md="6">
                  <VSwitch
                    v-model="SystemSettings.Advanced.MEDIA_RECOGNIZE_SHARE"
                    :label="t('setting.system.mediaRecognizeShare')"
                    :hint="t('setting.system.mediaRecognizeShareHint')"
                    persistent-hint
                  />
                </VCol>
              </VRow>
              <VRow>
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
                          <VCol cols="12">
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
                                size="small"
                                rounded="lg"
                              >
                                <VBtn value="skip" color="error" size="small">
                                  <VIcon icon="mdi-file-remove" />
                                </VBtn>
                                <VBtn value="missingOnly" color="success" size="small">
                                  <VIcon icon="mdi-file-plus" />
                                </VBtn>
                                <VBtn value="overwrite" color="primary" size="small">
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
                        <VDivider class="my-4" />
                        <div class="text-subtitle-2 mb-1">
                          {{ t('setting.system.imageProxyAllowedPrivateRanges') }}
                        </div>
                        <div class="text-caption text-medium-emphasis mb-3">
                          {{ t('setting.system.imageProxyAllowedPrivateRangesHint') }}
                        </div>
                        <div class="d-flex flex-wrap gap-2 mb-3">
                          <VChip
                            v-for="(range, index) in SystemSettings.Advanced.IMAGE_PROXY_ALLOWED_PRIVATE_RANGES"
                            :key="index"
                            closable
                            @click:close="
                              SystemSettings.Advanced.IMAGE_PROXY_ALLOWED_PRIVATE_RANGES.splice(index, 1)
                            "
                          >
                            {{ range }}
                          </VChip>
                          <VChip
                            v-if="SystemSettings.Advanced.IMAGE_PROXY_ALLOWED_PRIVATE_RANGES.length === 0"
                            color="warning"
                          >
                            {{ t('setting.system.noImageProxyAllowedPrivateRanges') }}
                          </VChip>
                        </div>
                        <div class="d-flex align-center gap-2">
                          <VTextField
                            v-model="newImageProxyAllowedPrivateRange"
                            :placeholder="t('setting.system.imageProxyAllowedPrivateRangeAdd')"
                            hide-details
                            density="compact"
                            prepend-inner-icon="mdi-ip-network"
                          >
                            <template #append>
                              <VBtn
                                icon
                                color="primary"
                                @click="addImageProxyAllowedPrivateRange"
                                :disabled="!newImageProxyAllowedPrivateRange"
                              >
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
          <VWindowItem value="data">
            <div>
              <VRow>
                <VCol cols="12">
                  <VSwitch
                    v-model="SystemSettings.Advanced.DATA_CLEANUP_ENABLE"
                    :label="t('setting.system.dataCleanupEnable')"
                    :hint="t('setting.system.dataCleanupEnableHint')"
                    persistent-hint
                  />
                </VCol>
                <template v-if="SystemSettings.Advanced.DATA_CLEANUP_ENABLE">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model.number="SystemSettings.Advanced.DATA_CLEANUP_MESSAGE_DAYS"
                      :label="t('setting.system.dataCleanupMessageDays')"
                      :hint="t('setting.system.dataCleanupMessageDaysHint')"
                      persistent-hint
                      min="0"
                      type="number"
                      :suffix="t('setting.system.day')"
                      :rules="dataCleanupFieldRules"
                      prepend-inner-icon="mdi-email-outline"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model.number="SystemSettings.Advanced.DATA_CLEANUP_DOWNLOAD_HISTORY_DAYS"
                      :label="t('setting.system.dataCleanupDownloadHistoryDays')"
                      :hint="t('setting.system.dataCleanupDownloadHistoryDaysHint')"
                      persistent-hint
                      min="0"
                      type="number"
                      :suffix="t('setting.system.day')"
                      :rules="dataCleanupFieldRules"
                      prepend-inner-icon="mdi-download-circle-outline"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model.number="SystemSettings.Advanced.DATA_CLEANUP_SITE_USERDATA_DAYS"
                      :label="t('setting.system.dataCleanupSiteUserDataDays')"
                      :hint="t('setting.system.dataCleanupSiteUserDataDaysHint')"
                      persistent-hint
                      min="0"
                      type="number"
                      :suffix="t('setting.system.day')"
                      :rules="dataCleanupFieldRules"
                      prepend-inner-icon="mdi-chart-line"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model.number="SystemSettings.Advanced.DATA_CLEANUP_TRANSFER_HISTORY_DAYS"
                      :label="t('setting.system.dataCleanupTransferHistoryDays')"
                      :hint="t('setting.system.dataCleanupTransferHistoryDaysHint')"
                      persistent-hint
                      min="0"
                      type="number"
                      :suffix="t('setting.system.day')"
                      :rules="dataCleanupFieldRules"
                      prepend-inner-icon="mdi-swap-horizontal"
                    />
                  </VCol>
                </template>
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
                  <VTextField
                    v-model="SystemSettings.Advanced.PLUGIN_LOCAL_REPO_PATHS"
                    :label="t('setting.system.pluginLocalRepoPaths')"
                    :hint="t('setting.system.pluginLocalRepoPathsHint')"
                    persistent-hint
                    prepend-inner-icon="mdi-folder"
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
                  <VSwitch
                    v-model="SystemSettings.Advanced.RUST_ACCEL"
                    :label="t('setting.system.rustAccel')"
                    :hint="rustAccelHint"
                    :disabled="!rustAccelAvailable"
                    persistent-hint
                  />
                </VCol>
              </VRow>
            </div>
          </VWindowItem>
        </VWindow>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn color="primary" variant="flat" prepend-icon="mdi-content-save" @click="saveAdvancedSettings" class="px-5">
          {{ t('common.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.ai-agent-settings-card {
  border-color: rgba(var(--v-theme-primary), 0.15);
  background: linear-gradient(180deg, rgba(var(--v-theme-primary), 0.04) 0%, rgba(var(--v-theme-surface), 0.92) 100%);
}

.ai-agent-settings-card-transparent {
  border-color: rgba(var(--v-theme-primary), 0);
  background-color: rgba(var(--v-theme-surface), 0) !important;
}

.setting-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.setting-actions__secondary {
  flex-shrink: 0;
}

.llm-test-trigger {
  min-inline-size: 0;
}

.agent-mcp-summary__content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.agent-mcp-summary__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

@media (max-width: 600px) {
  .agent-mcp-summary__content {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
