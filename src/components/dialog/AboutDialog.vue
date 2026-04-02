<script lang="ts" setup>
import { formatDateDifference } from '@/@core/utils/formatters'
import api from '@/api'
import { clearCachesAndServiceWorker, reloadWithTimestamp } from '@/composables/useVersionChecker'
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

// 打开日志对话框
function showReleaseDialog(title: string, body: string) {
  releaseDialogTitle.value = title
  releaseDialogBody.value = body ? md.render(body) : ''
  releaseDialog.value = true
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
  await clearCachesAndServiceWorker()
  // 刷新页面，添加时间戳参数以强制更新
  reloadWithTimestamp()
}

onMounted(() => {
  querySystemEnv()
  queryAllRelease()
  querySupportingSites()
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
                        <VBtn
                          size="x-small"
                          variant="tonal"
                          class="ms-2"
                          @click="clearCache"
                        >
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
    <VDialog v-if="releaseDialog" v-model="releaseDialog" width="600" scrollable>
      <VCard>
        <VCardItem>
          <VDialogCloseBtn @click="releaseDialog = false" />
          <VCardTitle>{{ releaseDialogTitle }} {{ t('setting.about.changelog') }}</VCardTitle>
        </VCardItem>
        <VCardText class="markdown-body" v-html="releaseDialogBody" />
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

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  margin-block: 0.5rem;
  font-weight: 600;
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
  padding-inline-start: 1.5rem;
  margin-block: 0.5rem;
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
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  font-size: 0.875em;
  background-color: rgba(127, 127, 127, 0.15);
}

.markdown-body :deep(pre) {
  padding: 0.75rem 1rem;
  margin-block: 0.5rem;
  overflow-x: auto;
  border-radius: 0.375rem;
  background-color: rgba(127, 127, 127, 0.15);
}

.markdown-body :deep(pre code) {
  padding: 0;
  background-color: transparent;
}

.markdown-body :deep(blockquote) {
  padding-inline-start: 1rem;
  margin-block: 0.5rem;
  border-inline-start: 3px solid rgba(127, 127, 127, 0.4);
  color: rgba(127, 127, 127, 0.8);
}

.markdown-body :deep(hr) {
  margin-block: 1rem;
  border: none;
  border-block-start: 1px solid rgba(127, 127, 127, 0.3);
}

.markdown-body :deep(table) {
  width: 100%;
  margin-block: 0.5rem;
  border-collapse: collapse;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 0.4rem 0.75rem;
  border: 1px solid rgba(127, 127, 127, 0.3);
}

.markdown-body :deep(th) {
  font-weight: 600;
  background-color: rgba(127, 127, 127, 0.1);
}

.markdown-body :deep(img) {
  max-width: 100%;
  height: auto;
}
</style>
