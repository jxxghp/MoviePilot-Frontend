<script lang="ts" setup>
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

// 系统环境变量
const systemEnv = ref<any>({})

// 系统运行时间的基准秒数和同步时间，用于在弹窗打开后实时递增展示。
const systemUptimeBaseSeconds = ref<number | null>(null)
const systemUptimeSyncedAt = ref(0)
const systemUptimeNow = ref(Date.now())
let systemUptimeTimer: ReturnType<typeof setInterval> | null = null

// 所有Release
const allRelease = ref<any>([])

// 支持站点
const supportingSites = ref<any>({})

// 支持站点折叠状态
const sitesExpanded = ref(false)

// 去重后的支持站点
const uniqueSupportingSites = computed(() => {
  const sitesMap = new Map()

  Object.entries(supportingSites.value).forEach(([domain, site]: [string, any]) => {
    if (!sitesMap.has(site.name)) {
      sitesMap.set(site.name, {
        name: site.name,
        urls: [{ domain, url: site.url }],
      })
    } else {
      sitesMap.get(site.name).urls.push({ domain, url: site.url })
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

// 版本统计数据
const versionStatistic = ref<any>({})

// 后端版本统计
const backendVersionStatistics = computed(() => versionStatistic.value?.backend_versions ?? [])

// 前端版本统计
const frontendVersionStatistics = computed(() => versionStatistic.value?.frontend_versions ?? [])

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
    const result: { [key: string]: any } = await api.get('system/usage/statistic')

    versionStatistic.value = result.data ?? {}
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
    const result: { [key: string]: any } = await api.get('system/env')

    systemEnv.value = result.data
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

// 查询所有Release
async function queryAllRelease() {
  try {
    const result: { [key: string]: any } = await api.get('system/versions')

    allRelease.value = result.data ?? []

    // 最新版本
    if (allRelease.value.length > 0) latestRelease.value = allRelease.value[0].tag_name
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
    <VDialog v-if="versionStatisticDialog" v-model="versionStatisticDialog" width="680" scrollable max-height="85vh">
      <VCard>
        <VCardItem>
          <VDialogCloseBtn @click="versionStatisticDialog = false" />
          <VCardTitle>
            <VIcon icon="mdi-chart-bar" class="me-2" />
            {{ t('setting.about.versionStatisticTitle') }}
          </VCardTitle>
        </VCardItem>
        <VDivider />
        <VProgressLinear v-if="versionStatisticLoading" indeterminate color="primary" />
        <VCardText>
          <div class="version-stat-summary">
            <div>
              <div class="text-caption text-medium-emphasis">{{ t('setting.about.totalInstallUsers') }}</div>
              <div class="version-stat-number">{{ formatVersionStatisticNumber(versionStatistic.total_users) }}</div>
            </div>
            <div>
              <div class="text-caption text-medium-emphasis">{{ t('setting.about.activeToday') }}</div>
              <div class="version-stat-number">{{ formatVersionStatisticNumber(activeUsers.today) }}</div>
            </div>
            <div>
              <div class="text-caption text-medium-emphasis">{{ t('setting.about.active7Days') }}</div>
              <div class="version-stat-number">{{ formatVersionStatisticNumber(activeUsers.last_7_days) }}</div>
            </div>
            <div>
              <div class="text-caption text-medium-emphasis">{{ t('setting.about.active30Days') }}</div>
              <div class="version-stat-number">{{ formatVersionStatisticNumber(activeUsers.last_30_days) }}</div>
            </div>
          </div>
          <div class="mt-5">
            <div class="text-subtitle-2 mb-2">{{ t('setting.about.backendVersionStatistic') }}</div>
            <VTable density="compact">
              <thead>
                <tr>
                  <th>{{ t('setting.about.version') }}</th>
                  <th class="text-end">{{ t('setting.about.users') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in backendVersionStatistics" :key="`backend-${item.version}`">
                  <td>
                    <code>{{ item.version }}</code>
                  </td>
                  <td class="text-end">{{ formatVersionStatisticNumber(item.count) }}</td>
                </tr>
                <tr v-if="!backendVersionStatistics.length">
                  <td colspan="2" class="text-medium-emphasis">{{ t('setting.about.noVersionStatisticData') }}</td>
                </tr>
              </tbody>
            </VTable>
          </div>
          <div class="mt-5">
            <div class="text-subtitle-2 mb-2">{{ t('setting.about.frontendVersionStatistic') }}</div>
            <VTable density="compact">
              <thead>
                <tr>
                  <th>{{ t('setting.about.version') }}</th>
                  <th class="text-end">{{ t('setting.about.users') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in frontendVersionStatistics" :key="`frontend-${item.version}`">
                  <td>
                    <code>{{ item.version }}</code>
                  </td>
                  <td class="text-end">{{ formatVersionStatisticNumber(item.count) }}</td>
                </tr>
                <tr v-if="!frontendVersionStatistics.length">
                  <td colspan="2" class="text-medium-emphasis">{{ t('setting.about.noVersionStatisticData') }}</td>
                </tr>
              </tbody>
            </VTable>
          </div>
          <div v-if="versionStatistic.updated_at" class="mt-4 text-caption text-medium-emphasis">
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
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
}

.version-stat-number {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 2rem;
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
