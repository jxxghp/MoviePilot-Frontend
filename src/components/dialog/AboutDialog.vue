<script lang="ts" setup>
import { getSharedConfiguration } from '@/api/configuration'
import { formatDateDifference } from '@/@core/utils/formatters'
import api from '@/api'
import type { Process as SystemProcess } from '@/api/types'
import { clearCacheAndReload } from '@/composables/useVersionChecker'
import MarkdownIt from 'markdown-it'
import mdLinkAttributes from 'markdown-it-link-attributes'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 国际化
const { t } = useI18n()

// APP版本
const appVersion = __APP_VERSION__

// 定义事件
const emit = defineEmits(['close'])

// 显示器
const display = useDisplay()

// 初始化 markdown-it
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
})

// 插件：链接在新窗口打开
md.use(mdLinkAttributes, {
  attrs: {
    target: '_blank',
    rel: 'noopener noreferrer',
  },
})

interface SystemEnvInfo {
  VERSION?: string
  FRONTEND_VERSION?: string
  AUTH_VERSION?: string
  INDEXER_VERSION?: string
  CONFIG_DIR?: string
  TZ?: string
  USAGE_STATISTIC_SHARE?: boolean
}

interface ReleaseItem {
  tag_name: string
  published_at: string
  body: string
}

interface SupportingSiteInfo {
  name: string
  url: string
}

interface UniqueSiteEntry {
  name: string
  urls: Array<{ domain: string; url: string }>
}

// 系统环境变量
const systemEnv = ref<SystemEnvInfo>({})

// 系统运行时间的基准秒数和同步时间，用于在弹窗打开后实时递增展示。
const systemUptimeBaseSeconds = ref<number | null>(null)
const systemUptimeSyncedAt = ref(0)
const systemUptimeNow = ref(Date.now())
let systemUptimeTimer: ReturnType<typeof setInterval> | null = null

// 所有Release
const allRelease = ref<ReleaseItem[]>([])

// 支持站点
const supportingSites = ref<Record<string, SupportingSiteInfo>>({})

// 支持站点折叠状态
const sitesExpanded = ref(false)

// 去重后的支持站点
const uniqueSupportingSites = computed(() => {
  const sitesMap = new Map<string, UniqueSiteEntry>()

  Object.entries(supportingSites.value).forEach(([domain, site]) => {
    const existing = sitesMap.get(site.name)
    if (!existing) {
      sitesMap.set(site.name, {
        name: site.name,
        urls: [{ domain, url: site.url }],
      })
    } else {
      existing.urls.push({ domain, url: site.url })
    }
  })

  return Array.from(sitesMap.values())
})

// 显示的支持站点（折叠时只显示前5个）
const displayedSites = computed(() => {
  if (sitesExpanded.value) {
    return uniqueSupportingSites.value
  }
  return uniqueSupportingSites.value.slice(0, 5)
})

// 变更日志对话框
const releaseDialog = ref(false)

// 最新版本
const latestRelease = ref('')

// 变更日志对话框标题
const releaseDialogTitle = ref('')

// 变更日志对话框内容
const releaseDialogBody = ref('')

// 版本统计对话框
const versionStatisticDialog = ref(false)

// 版本统计加载状态
const versionStatisticLoading = ref(false)

interface VersionStatisticRow {
  version: string
  count: number
}

interface ActiveUsersStatistic {
  today?: number
  last_7_days?: number
  last_30_days?: number
}

interface UsageVersionStatistic {
  total_users?: number
  app_total_users?: number
  active_users?: ActiveUsersStatistic
  backend_versions?: VersionStatisticRow[]
  frontend_versions?: VersionStatisticRow[]
  app_versions?: VersionStatisticRow[]
  ios_app_versions?: VersionStatisticRow[]
  android_app_versions?: VersionStatisticRow[]
  harmony_app_versions?: VersionStatisticRow[]
  updated_at?: string
}

// 版本统计数据
const versionStatistic = ref<UsageVersionStatistic>({})

const MIN_VISIBLE_VERSION_INSTALLS = 10

/** 过滤安装实例过少的版本，避免在版本统计中展示孤立记录。 */
function filterVersionStatistics(items: unknown): VersionStatisticRow[] {
  if (!Array.isArray(items)) return []

  return items
    .map(item => {
      const record = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>

      return {
        version: String(record.version ?? '').trim(),
        count: Number(record.count || 0),
      }
    })
    .filter(item => item.version.length > 0 && item.count >= MIN_VISIBLE_VERSION_INSTALLS)
}

/** 统一各渠道 App 版本名称并合并 iOS / Android / HarmonyOS 全渠道安装统计。 */
function mergeAppChannelVersions(stat: UsageVersionStatistic | null | undefined): VersionStatisticRow[] {
  if (!stat) return []
  const sourceGroups = Array.isArray(stat.app_versions)
    ? [stat.app_versions]
    : [stat.ios_app_versions, stat.android_app_versions, stat.harmony_app_versions]

  const merged = new Map<string, number>()

  for (const group of sourceGroups) {
    if (!Array.isArray(group)) continue
    for (const item of group) {
      const count = Number(item?.count || 0)
      if (!Number.isFinite(count) || count <= 0) continue
      const normalizedVersion = String(item?.version ?? '')
        .trim()
        .replace(/^v(?=\d)/i, '')

      if (!normalizedVersion || normalizedVersion.toLowerCase() === 'unknown') continue
      merged.set(normalizedVersion, (merged.get(normalizedVersion) ?? 0) + count)
    }
  }

  return Array.from(merged.entries())
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => b.count - a.count || a.version.localeCompare(b.version))
}

// 主程序版本统计
const backendVersionStatistics = computed(() => filterVersionStatistics(versionStatistic.value?.backend_versions))

// 全渠道 App 版本合并结果（未过滤，用于总安装数计算）
const allAppVersionStatistics = computed(() => mergeAppChannelVersions(versionStatistic.value))

// 全渠道 App 安装版本统计（合并后再按最少安装量过滤）
const appVersionStatistics = computed(() => filterVersionStatistics(allAppVersionStatistics.value))

// App 累计安装量
const totalAppInstalls = computed(() => {
  const explicitTotal = Number(versionStatistic.value?.app_total_users)
  if (Number.isFinite(explicitTotal) && explicitTotal > 0) return explicitTotal

  return allAppVersionStatistics.value.reduce((sum, item) => sum + item.count, 0)
})

const backendVisibleTotal = computed(() => backendVersionStatistics.value.reduce((sum, item) => sum + item.count, 0))
const appVisibleTotal = computed(() => appVersionStatistics.value.reduce((sum, item) => sum + item.count, 0))
const backendMaxCount = computed(() => Math.max(0, ...backendVersionStatistics.value.map(item => item.count)))
const appMaxCount = computed(() => Math.max(0, ...appVersionStatistics.value.map(item => item.count)))

/** 计算版本在当前面板中的进度条宽度百分比。 */
function resolveVersionBarPercent(count: number, maxCount: number) {
  if (!maxCount || count <= 0) return 0

  return Math.max(4, Math.min(100, Math.round((count / maxCount) * 100)))
}

/** 格式化单个版本占可见总量的百分比文本。 */
function formatVersionShare(count: number, total: number) {
  if (!total || count <= 0) return '0%'
  const ratio = (count / total) * 100

  return `${ratio.toFixed(1)}%`
}

// 活跃用户统计
const activeUsers = computed(() => versionStatistic.value?.active_users ?? {})

// 系统运行秒数
const systemUptimeSeconds = computed(() => {
  if (systemUptimeBaseSeconds.value === null) return null

  const elapsedSeconds = Math.floor((systemUptimeNow.value - systemUptimeSyncedAt.value) / 1000)

  return Math.max(0, systemUptimeBaseSeconds.value + elapsedSeconds)
})

// 友好的系统运行时间文本
const systemUptimeText = computed(() => {
  if (systemUptimeSeconds.value === null) return ''

  return formatUptimeDuration(systemUptimeSeconds.value)
})

/** 格式化版本安装统计数字为千分位展示。 */
function formatVersionStatisticNumber(value: unknown) {
  const numberValue = Number(value ?? 0)

  if (!Number.isFinite(numberValue)) return '0'

  return numberValue.toLocaleString()
}

/** 将秒数保存为运行时间基准，并记录本地同步时间。 */
function syncSystemUptime(seconds: number | null) {
  if (seconds === null) return

  const now = Date.now()

  systemUptimeBaseSeconds.value = seconds
  systemUptimeSyncedAt.value = now
  systemUptimeNow.value = now
}

/** 将接口返回值规范化为可展示的秒数。 */
function normalizeUptimeSeconds(value: unknown) {
  const numberValue = Number(value)

  if (!Number.isFinite(numberValue) || numberValue < 0) return null

  return Math.floor(numberValue)
}

/** 从进程创建时间推导运行秒数；兼容秒级和毫秒级时间戳。 */
function uptimeSecondsFromCreateTime(value: unknown) {
  const timestamp = Number(value)

  if (!Number.isFinite(timestamp) || timestamp <= 0) return null

  const timestampMs = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000

  return Math.max(0, Math.floor((Date.now() - timestampMs) / 1000))
}

/** 获取单个进程的运行秒数，优先使用创建时间以保留跨天运行时长。 */
function getProcessUptimeSeconds(process: SystemProcess) {
  return uptimeSecondsFromCreateTime(process.create_time) ?? normalizeUptimeSeconds(process.run_time)
}

/** 从进程列表中挑选 MoviePilot 主进程，找不到时使用运行时间最长的进程兜底。 */
function resolveSystemUptimeSeconds(processes: SystemProcess[]) {
  const availableProcesses = processes
    .map(process => ({
      process,
      uptimeSeconds: getProcessUptimeSeconds(process),
    }))
    .filter((item): item is { process: SystemProcess; uptimeSeconds: number } => item.uptimeSeconds !== null)

  if (!availableProcesses.length) return null

  const preferredProcesses = availableProcesses.filter(({ process }) =>
    /moviepilot|python|uvicorn|gunicorn|hypercorn/i.test(process.name ?? ''),
  )
  const targetProcesses = preferredProcesses.length ? preferredProcesses : availableProcesses

  return targetProcesses.reduce((max, item) => (item.uptimeSeconds > max.uptimeSeconds ? item : max)).uptimeSeconds
}

/** 格式化单个运行时间单位。 */
function formatUptimeUnit(value: number, unit: 'day' | 'hour' | 'minute' | 'second') {
  const unitKey = value === 1 ? unit : `${unit}s`

  return t(`setting.about.uptimeUnits.${unitKey}`, { count: value })
}

/** 将运行秒数格式化为两段以内的友好文本，例如“3天 2小时”。 */
function formatUptimeDuration(totalSeconds: number) {
  const normalizedSeconds = Math.max(0, Math.floor(totalSeconds))
  const days = Math.floor(normalizedSeconds / 86400)
  const hours = Math.floor((normalizedSeconds % 86400) / 3600)
  const minutes = Math.floor((normalizedSeconds % 3600) / 60)
  const seconds = normalizedSeconds % 60
  const parts: string[] = []

  if (days > 0) parts.push(formatUptimeUnit(days, 'day'))
  if (hours > 0) parts.push(formatUptimeUnit(hours, 'hour'))
  if (minutes > 0 && parts.length < 2) parts.push(formatUptimeUnit(minutes, 'minute'))
  if (!parts.length) parts.push(formatUptimeUnit(seconds, 'second'))

  return parts.slice(0, 2).join(' ')
}

// 打开日志对话框
function showReleaseDialog(title: string, body: string) {
  releaseDialogTitle.value = title
  releaseDialogBody.value = body ? md.render(body) : ''
  releaseDialog.value = true
}

// 查询版本统计
async function queryVersionStatistic() {
  if (!systemEnv.value.USAGE_STATISTIC_SHARE) return
  versionStatisticLoading.value = true
  try {
    const statistic = await api.get<UsageVersionStatistic | null>('system/usage/statistic')
    versionStatistic.value = statistic ?? {}
  } catch (error) {
    console.log(error)
    versionStatistic.value = {}
  } finally {
    versionStatisticLoading.value = false
  }
}

// 打开版本统计对话框
async function showVersionStatisticDialog() {
  versionStatisticDialog.value = true
  await queryVersionStatistic()
}

// 查询系统环境变量
async function querySystemEnv() {
  try {
    systemEnv.value = (await getSharedConfiguration<SystemEnvInfo | null>('system/env')) ?? {}
  } catch (error) {
    console.log(error)
  }
}

// 查询系统运行时间
async function querySystemUptime() {
  try {
    const processes: SystemProcess[] = await api.get('dashboard/processes')

    syncSystemUptime(resolveSystemUptimeSeconds(processes))
  } catch (error) {
    console.log(error)
  }
}

/** 只展示主程序正式版本，避免独立工具 Release 混入历史及最新版本判断。 */
async function queryAllRelease() {
  try {
    const releases = (await api.get<Array<Partial<ReleaseItem>> | null>('system/versions')) ?? []
    allRelease.value = releases
      .map(release => ({
        tag_name: release?.tag_name ?? '',
        published_at: release?.published_at ?? '',
        body: release?.body ?? '',
      }))
      .filter(release => /^v\d+\.\d+\.\d+(?:-\d+)?$/.test(release.tag_name))

    // 最新版本
    latestRelease.value = allRelease.value[0]?.tag_name ?? ''
  } catch (error) {
    console.log(error)
  }
}

// 查询支持站点
async function querySupportingSites() {
  try {
    supportingSites.value = await api.get('site/supporting')
  } catch (error) {
    console.log(error)
  }
}

// 切换站点列表展开状态
function toggleSitesExpanded() {
  sitesExpanded.value = !sitesExpanded.value
}

// 计算发布时间
function releaseTime(releaseDate: string) {
  // 上一次更新时间
  return formatDateDifference(releaseDate)
}

// 强制清除缓存
async function clearCache() {
  await clearCacheAndReload()
}

onMounted(() => {
  querySystemEnv()
  querySystemUptime()
  queryAllRelease()
  querySupportingSites()

  systemUptimeTimer = setInterval(() => {
    if (systemUptimeBaseSeconds.value !== null) systemUptimeNow.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (systemUptimeTimer) clearInterval(systemUptimeTimer)
})
</script>

<template>
  <VDialog max-width="50rem" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem>
        <VCardTitle>
          <VIcon icon="mdi-information" class="me-2" />
          {{ t('setting.about.title') }}
        </VCardTitle>
        <VDialogCloseBtn @click="emit('close')" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <div class="px-3">
          <div class="section">
            <div class="section border-gray-800">
              <dl>
                <div>
                  <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                    <dt class="block text-sm font-bold">{{ t('setting.about.softwareVersion') }}</dt>
                    <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                      <span class="flex-grow flex flex-row items-center truncate">
                        <code class="truncate">{{ systemEnv.VERSION }}</code>
                        <a
                          v-if="latestRelease === systemEnv.VERSION"
                          href="https://github.com/jxxghp/MoviePilot/releases"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span
                            class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full whitespace-nowrap bg-green-500 bg-opacity-80 border border-green-500 !text-green-100 ml-2 !cursor-pointer transition hover:bg-green-400"
                          >
                            {{ t('setting.about.latest') }}
                          </span>
                        </a>
                        <VTooltip v-if="systemEnv.USAGE_STATISTIC_SHARE" :text="t('setting.about.versionStatistic')">
                          <template #activator="{ props }">
                            <VBtn
                              v-bind="props"
                              icon="mdi-chart-bar"
                              size="x-small"
                              variant="text"
                              class="ms-2 flex-shrink-0"
                              @click="showVersionStatisticDialog"
                            />
                          </template>
                        </VTooltip>
                      </span>
                    </dd>
                  </div>
                </div>
                <div v-if="systemEnv.FRONTEND_VERSION">
                  <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                    <dt class="block text-sm font-bold">{{ t('setting.about.frontendVersion') }}</dt>
                    <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                      <span class="flex-grow flex flex-row items-center truncate">
                        <code class="truncate">{{ systemEnv.FRONTEND_VERSION }}</code>
                      </span>
                    </dd>
                  </div>
                </div>
                <div>
                  <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                    <dt class="block text-sm font-bold">{{ t('setting.about.browserVersion') }}</dt>
                    <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                      <span class="flex-grow flex flex-row items-center truncate">
                        <code class="truncate">{{ appVersion }}</code>
                        <VBtn size="x-small" variant="tonal" class="ms-2" @click="clearCache">
                          <template #prepend>
                            <VIcon icon="mdi-refresh" size="14" />
                          </template>
                          {{ t('setting.about.clearCache') }}
                        </VBtn>
                      </span>
                    </dd>
                  </div>
                </div>
                <div>
                  <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                    <dt class="block text-sm font-bold">{{ t('setting.about.authVersion') }}</dt>
                    <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                      <span class="flex-grow flex flex-row items-center truncate">
                        <code class="truncate">{{ systemEnv.AUTH_VERSION }}</code>
                      </span>
                    </dd>
                  </div>
                </div>
                <div>
                  <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                    <dt class="block text-sm font-bold">{{ t('setting.about.indexerVersion') }}</dt>
                    <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                      <span class="flex-grow flex flex-row items-center truncate">
                        <code class="truncate">{{ systemEnv.INDEXER_VERSION }}</code>
                      </span>
                    </dd>
                  </div>
                </div>
                <div>
                  <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                    <dt class="block text-sm font-bold">{{ t('setting.about.configDir') }}</dt>
                    <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                      <span class="flex-grow break-all">
                        <code>{{ systemEnv.CONFIG_DIR }}</code>
                      </span>
                    </dd>
                  </div>
                  <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                    <dt class="block text-sm font-bold">{{ t('setting.about.dataDir') }}</dt>
                    <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                      <span class="flex-grow break-all"
                        ><code>{{ t('setting.about.dataDirectory') }}</code></span
                      >
                    </dd>
                  </div>
                </div>
                <div>
                  <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                    <dt class="block text-sm font-bold">{{ t('setting.about.timezone') }}</dt>
                    <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                      <span class="flex-grow break-all">
                        <code>{{ systemEnv.TZ }}</code>
                      </span>
                    </dd>
                  </div>
                </div>
                <div v-if="systemUptimeText">
                  <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                    <dt class="block text-sm font-bold">{{ t('setting.about.systemUptime') }}</dt>
                    <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                      <span class="flex-grow flex flex-row items-center truncate">
                        <code class="truncate">{{ systemUptimeText }}</code>
                      </span>
                    </dd>
                  </div>
                </div>
                <div>
                  <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                    <dt class="block text-sm font-bold">{{ t('setting.about.supportingSites') }}</dt>
                    <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                      <div class="flex flex-col gap-2">
                        <div class="flex flex-wrap gap-2 mt-1 ms-1">
                          <VChip v-for="site in displayedSites" :key="site.name" variant="outlined" size="small">
                            <span class="truncate max-w-32">{{ site.name }}</span>
                          </VChip>
                          <VChip
                            v-if="!sitesExpanded && uniqueSupportingSites.length > 5"
                            variant="tonal"
                            size="small"
                            @click="toggleSitesExpanded"
                          >
                            <span> {{ uniqueSupportingSites.length }}+ ...</span>
                          </VChip>
                          <VChip
                            v-if="sitesExpanded && uniqueSupportingSites.length > 5"
                            variant="tonal"
                            size="small"
                            @click="toggleSitesExpanded"
                          >
                            <span>< {{ t('setting.about.collapse') }}</span>
                          </VChip>
                        </div>
                      </div>
                    </dd>
                  </div>
                </div>
              </dl>
            </div>
          </div>
          <div class="section">
            <div>
              <h3 class="heading">{{ t('setting.about.support') }}</h3>
            </div>
            <div class="section border-t border-gray-800">
              <dl>
                <div>
                  <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                    <dt class="block text-sm font-bold">{{ t('setting.about.documentation') }}</dt>
                    <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                      <span class="flex-grow break-all">
                        <a
                          href="https://movie-pilot.org"
                          target="_blank"
                          rel="noreferrer"
                          class="text-indigo-500 transition duration-300 hover:underline"
                        >
                          https://movie-pilot.org
                        </a>
                      </span>
                    </dd>
                  </div>
                </div>
                <div>
                  <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                    <dt class="block text-sm font-bold">{{ t('setting.about.feedback') }}</dt>
                    <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                      <span class="flex-grow break-all">
                        <a
                          href="https://github.com/jxxghp/MoviePilot/issues/new/choose"
                          target="_blank"
                          rel="noreferrer"
                          class="text-indigo-500 transition duration-300 hover:underline"
                        >
                          https://github.com/jxxghp/MoviePilot/issues/new/choose
                        </a>
                      </span>
                    </dd>
                  </div>
                </div>
                <div>
                  <div class="max-w-6xl py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                    <dt class="block text-sm font-bold">{{ t('setting.about.channel') }}</dt>
                    <dd class="flex text-sm sm:col-span-2 sm:mt-0">
                      <span class="flex-grow break-all">
                        <a
                          href="https://t.me/moviepilot_channel"
                          target="_blank"
                          rel="noreferrer"
                          class="text-indigo-500 transition duration-300 hover:underline"
                        >
                          https://t.me/moviepilot_channel
                        </a>
                      </span>
                    </dd>
                  </div>
                </div>
              </dl>
            </div>
          </div>
          <div class="section">
            <div>
              <h3 class="heading">{{ t('setting.about.versions') }}</h3>
              <div class="section space-y-3">
                <div>
                  <div
                    v-for="release in allRelease"
                    :key="release.tag_name"
                    class="mb-3 flex w-full flex-col space-y-3 rounded-md px-4 py-2 ring-1 ring-gray-400 sm:flex-row sm:space-y-0 sm:space-x-3"
                  >
                    <div class="flex w-full flex-grow items-center justify-start space-x-2 truncate sm:justify-start">
                      <span class="truncate text-lg font-bold">
                        <span class="mr-2 whitespace-nowrap text-xs font-normal">{{
                          releaseTime(release.published_at)
                        }}</span>
                        {{ release.tag_name }}
                      </span>
                      <span
                        v-if="release.tag_name === latestRelease"
                        class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full whitespace-nowrap cursor-default bg-green-500 bg-opacity-80 border border-green-500 !text-green-100"
                      >
                        {{ t('setting.about.latestVersion') }}
                      </span>
                      <span
                        v-if="release.tag_name === systemEnv.VERSION"
                        class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full whitespace-nowrap cursor-default bg-indigo-500 bg-opacity-80 border border-indigo-500 !text-indigo-100"
                      >
                        {{ t('setting.about.currentVersion') }}
                      </span>
                    </div>
                    <VBtn @click.stop="showReleaseDialog(release.tag_name, release.body)">
                      <template #prepend>
                        <VIcon icon="mdi-text-box-outline" />
                      </template>
                      {{ t('setting.about.viewChangelog') }}
                    </VBtn>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </VCardText>
    </VCard>
    <VDialog v-if="releaseDialog" v-model="releaseDialog" width="600" scrollable max-height="85vh">
      <VCard>
        <VCardItem>
          <VDialogCloseBtn @click="releaseDialog = false" />
          <VCardTitle>{{ releaseDialogTitle }} {{ t('setting.about.changelog') }}</VCardTitle>
        </VCardItem>
        <VCardText class="markdown-body" v-html="releaseDialogBody" />
      </VCard>
    </VDialog>
    <VDialog v-if="versionStatisticDialog" v-model="versionStatisticDialog" width="760" scrollable max-height="85vh">
      <VCard>
        <VCardItem>
          <VDialogCloseBtn @click="versionStatisticDialog = false" />
          <VCardTitle class="d-flex align-center">
            <VIcon icon="mdi-chart-bar" class="me-2" color="primary" />
            {{ t('setting.about.versionStatisticTitle') }}
          </VCardTitle>
        </VCardItem>
        <VDivider />
        <VProgressLinear v-if="versionStatisticLoading" indeterminate color="primary" />
        <VCardText class="pt-4 pb-5">
          <div class="version-stat-summary">
            <div class="version-stat-metric">
              <div class="text-caption text-medium-emphasis">{{ t('setting.about.totalInstallUsers') }}</div>
              <div class="version-stat-number text-primary">
                {{ formatVersionStatisticNumber(versionStatistic.total_users) }}
              </div>
            </div>
            <div class="version-stat-metric">
              <div class="text-caption text-medium-emphasis">{{ t('setting.about.totalAppInstalls') }}</div>
              <div class="version-stat-number text-info">
                {{ formatVersionStatisticNumber(totalAppInstalls) }}
              </div>
            </div>
            <div class="version-stat-metric">
              <div class="text-caption text-medium-emphasis">{{ t('setting.about.activeToday') }}</div>
              <div class="version-stat-number">{{ formatVersionStatisticNumber(activeUsers.today) }}</div>
            </div>
            <div class="version-stat-metric">
              <div class="text-caption text-medium-emphasis">{{ t('setting.about.active7Days') }}</div>
              <div class="version-stat-number">{{ formatVersionStatisticNumber(activeUsers.last_7_days) }}</div>
            </div>
            <div class="version-stat-metric">
              <div class="text-caption text-medium-emphasis">{{ t('setting.about.active30Days') }}</div>
              <div class="version-stat-number">{{ formatVersionStatisticNumber(activeUsers.last_30_days) }}</div>
            </div>
          </div>

          <div class="version-stat-panels mt-5">
            <section class="version-stat-panel">
              <header class="version-stat-panel__header">
                <div class="d-flex align-center gap-2">
                  <VIcon icon="mdi-server-network" size="18" color="primary" />
                  <span class="text-subtitle-2 font-weight-bold">{{ t('setting.about.backendVersionStatistic') }}</span>
                </div>
                <VChip size="x-small" variant="tonal" color="primary">
                  {{ formatVersionStatisticNumber(backendVisibleTotal) }}
                </VChip>
              </header>
              <div v-if="backendVersionStatistics.length" class="version-stat-list">
                <div v-for="item in backendVersionStatistics" :key="`backend-${item.version}`" class="version-stat-row">
                  <div class="version-stat-row__meta">
                    <div class="d-flex align-center gap-2 min-w-0">
                      <code class="version-stat-code truncate">{{ item.version }}</code>
                      <VChip
                        v-if="systemEnv.VERSION && item.version === systemEnv.VERSION"
                        size="x-small"
                        color="primary"
                        variant="tonal"
                      >
                        {{ t('setting.about.currentTag') }}
                      </VChip>
                    </div>
                    <div class="version-stat-row__numbers">
                      <span class="font-weight-medium">{{ formatVersionStatisticNumber(item.count) }}</span>
                      <span class="version-stat-share">{{ formatVersionShare(item.count, backendVisibleTotal) }}</span>
                    </div>
                  </div>
                  <div class="version-stat-bar">
                    <div
                      class="version-stat-bar__fill version-stat-bar__fill--primary"
                      :style="{ width: `${resolveVersionBarPercent(item.count, backendMaxCount)}%` }"
                    />
                  </div>
                </div>
              </div>
              <div v-else class="version-stat-empty text-medium-emphasis">
                {{ t('setting.about.noVersionStatisticData') }}
              </div>
            </section>

            <section class="version-stat-panel">
              <header class="version-stat-panel__header">
                <div class="d-flex align-center gap-2">
                  <VIcon icon="mdi-cellphone-link" size="18" color="info" />
                  <span class="text-subtitle-2 font-weight-bold">{{ t('setting.about.appVersionStatistic') }}</span>
                </div>
                <VChip size="x-small" variant="tonal" color="info">
                  {{ formatVersionStatisticNumber(appVisibleTotal) }}
                </VChip>
              </header>
              <div v-if="appVersionStatistics.length" class="version-stat-list">
                <div v-for="item in appVersionStatistics" :key="`app-${item.version}`" class="version-stat-row">
                  <div class="version-stat-row__meta">
                    <code class="version-stat-code truncate">{{ item.version }}</code>
                    <div class="version-stat-row__numbers">
                      <span class="font-weight-medium">{{ formatVersionStatisticNumber(item.count) }}</span>
                      <span class="version-stat-share">{{ formatVersionShare(item.count, appVisibleTotal) }}</span>
                    </div>
                  </div>
                  <div class="version-stat-bar">
                    <div
                      class="version-stat-bar__fill version-stat-bar__fill--info"
                      :style="{ width: `${resolveVersionBarPercent(item.count, appMaxCount)}%` }"
                    />
                  </div>
                </div>
              </div>
              <div v-else class="version-stat-empty text-medium-emphasis">
                {{ t('setting.about.noVersionStatisticData') }}
              </div>
            </section>
          </div>

          <div v-if="versionStatistic.updated_at" class="mt-4 d-flex align-center text-caption text-medium-emphasis">
            <VIcon icon="mdi-clock-outline" size="14" class="me-1" />
            {{ t('setting.about.lastUpdated') }}: {{ versionStatistic.updated_at }}
          </div>
        </VCardText>
      </VCard>
    </VDialog>
  </VDialog>
</template>

<style type="scss" scoped>
.heading {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 2rem;

  --tw-text-opacity: 1;
}

.section {
  margin-block: 0.5rem 2.5rem;
}

.version-stat-summary {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(7.25rem, 1fr));
}

.version-stat-metric {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 0.75rem;
  background-color: rgba(var(--v-theme-on-surface), 0.025);
  padding-block: 0.75rem;
  padding-inline: 0.875rem;
}

.version-stat-number {
  font-size: 1.375rem;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  line-height: 1.85rem;
  margin-block-start: 0.2rem;
}

.version-stat-panels {
  display: grid;
  gap: 1rem;
  grid-template-columns: 1fr;
}

@media (width >= 640px) {
  .version-stat-panels {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.version-stat-panel {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 0.875rem;
  background-color: rgba(var(--v-theme-on-surface), 0.02);
  overflow: hidden;
}

.version-stat-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding-block: 0.75rem;
  padding-inline: 1rem;
}

.version-stat-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-block-size: 21rem;
  overflow-y: auto;
  padding-block: 0.875rem;
  padding-inline: 1rem;
}

.version-stat-row {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.version-stat-row__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.85rem;
  gap: 0.5rem;
}

.version-stat-row__numbers {
  display: flex;
  flex-shrink: 0;
  align-items: baseline;
  font-variant-numeric: tabular-nums;
  gap: 0.45rem;
}

.version-stat-share {
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 0.75rem;
  min-inline-size: 2.8rem;
  text-align: end;
}

.version-stat-code {
  border-radius: 0.3rem;
  background-color: rgba(var(--v-theme-on-surface), 0.06);
  font-size: 0.8125rem;
  padding-block: 0.1rem;
  padding-inline: 0.4rem;
}

.version-stat-bar {
  border-radius: 999px;
  background-color: rgba(var(--v-theme-on-surface), 0.08);
  block-size: 0.375rem;
  inline-size: 100%;
  overflow: hidden;
}

.version-stat-bar__fill {
  border-radius: 999px;
  block-size: 100%;
  transition: inline-size 0.25s ease;
}

.version-stat-bar__fill--primary {
  background-color: rgb(var(--v-theme-primary));
}

.version-stat-bar__fill--info {
  background-color: rgb(var(--v-theme-info));
}

.version-stat-empty {
  font-size: 0.85rem;
  padding-block: 2.25rem;
  padding-inline: 1rem;
  text-align: center;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  font-weight: 600;
  margin-block: 0.5rem;
}

.markdown-body :deep(h1) {
  font-size: 1.5rem;
}

.markdown-body :deep(h2) {
  font-size: 1.25rem;
}

.markdown-body :deep(h3) {
  font-size: 1.1rem;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin-block: 0.5rem;
  padding-inline-start: 1.5rem;
}

/* 恢复被 Tailwind Preflight 清除的 Markdown 列表标记。 */
.markdown-body :deep(ul) {
  list-style-type: disc;
}

.markdown-body :deep(ol) {
  list-style-type: decimal;
}

.markdown-body :deep(li) {
  margin-block: 0.25rem;
}

.markdown-body :deep(p) {
  margin-block: 0.5rem;
}

.markdown-body :deep(a) {
  color: rgb(99 102 241);
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(code) {
  border-radius: 0.25rem;
  background-color: rgba(127, 127, 127, 15%);
  font-size: 0.875em;
  padding-block: 0.15rem;
  padding-inline: 0.4rem;
}

.markdown-body :deep(pre) {
  border-radius: 0.375rem;
  background-color: rgba(127, 127, 127, 15%);
  margin-block: 0.5rem;
  overflow-x: auto;
  padding-block: 0.75rem;
  padding-inline: 1rem;
}

.markdown-body :deep(pre code) {
  padding: 0;
  background-color: transparent;
}

.markdown-body :deep(blockquote) {
  border-inline-start: 3px solid rgba(127, 127, 127, 40%);
  color: rgba(127, 127, 127, 80%);
  margin-block: 0.5rem;
  padding-inline-start: 1rem;
}

.markdown-body :deep(hr) {
  border: none;
  border-block-start: 1px solid rgba(127, 127, 127, 30%);
  margin-block: 1rem;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  inline-size: 100%;
  margin-block: 0.5rem;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid rgba(127, 127, 127, 30%);
  padding-block: 0.4rem;
  padding-inline: 0.75rem;
}

.markdown-body :deep(th) {
  background-color: rgba(127, 127, 127, 10%);
  font-weight: 600;
}

.markdown-body :deep(img) {
  block-size: auto;
  max-inline-size: 100%;
}
</style>
