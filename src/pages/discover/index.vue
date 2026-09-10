<script setup lang="ts">
import { getDiscoverTabs } from '@/router/i18n-menu'
import TheMovieDbView from '@/views/discover/TheMovieDbView.vue'
import DoubanView from '@/views/discover/DoubanView.vue'
import BangumiView from '@/views/discover/BangumiView.vue'
import AniListView from '@/views/discover/AniListView.vue'
import MusicView from '@/views/discover/MusicView.vue'
import ExtraSourceView from '@/views/discover/ExtraSourceView.vue'
import { DiscoverSource } from '@/api/types'
import api from '@/api'
import { useI18n } from 'vue-i18n'
import { useDynamicHeaderTab } from '@/composables/useDynamicHeaderTab'
import { useDynamicButton } from '@/composables/useDynamicButton'
import { usePWA } from '@/composables/usePWA'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'
import { useToast } from 'vue-toastification'

const DiscoverTabOrderDialog = defineAsyncComponent(() => import('@/components/dialog/DiscoverTabOrderDialog.vue'))

interface DiscoverTabConfigItem {
  enabled: boolean
  mediaid_prefix?: string
  name: string
}

interface DiscoverTabSettingsPayload {
  enabled: Record<string, boolean>
  tabs: DiscoverSource[]
}

// 国际化
const { t } = useI18n()
const { appMode } = usePWA()
const userStore = useUserStore()
const toast = useToast()

// 路由
const route = useRoute()
const canDiscovery = computed(() =>
  hasPermission(buildUserPermissionContext(userStore.superUser, userStore.permissions), 'discovery'),
)

const activeTab = ref('')

// 本地存储键值
const localOrderKey = 'MP_DISCOVER_TAB_ORDER'

// 标签顺序与显示配置
const orderConfig = ref<DiscoverTabConfigItem[]>([])

// 标签页
const discoverTabs = ref<DiscoverSource[]>([])

// 标签页项
const discoverTabItems = computed(() => {
  return discoverTabs.value.filter(isTabEnabled).map(item => ({
    title: item.name,
    tab: item.mediaid_prefix,
  }))
})

// 额外的数据源
const extraDiscoverSources = ref<DiscoverSource[]>([])

let orderDialogController: ReturnType<typeof openSharedDialog> | null = null
let extraSourcesRequest: Promise<void> | null = null
let initialLoadPromise: Promise<void> | null = null

// 打开发现页标签设置共享弹窗。
function openTabSettingsDialog() {
  orderDialogController?.close()
  const releaseController = () => {
    if (orderDialogController === controller) orderDialogController = null
  }

  const controller = openSharedDialog(
    DiscoverTabOrderDialog,
    {
      enabled: Object.fromEntries(discoverTabs.value.map(tab => [tab.mediaid_prefix, isTabEnabled(tab)])),
      tabs: discoverTabs.value,
    },
    {
      close: releaseController,
      save: settings => saveTabSettings(settings, controller),
      'update:modelValue': (value: boolean) => {
        if (!value) releaseController()
      },
    },
    { closeOn: ['close', 'update:modelValue'] },
  )
  orderDialogController = controller
}

// 关闭发现页标签设置共享弹窗。
function closeTabSettingsDialog(controller = orderDialogController) {
  if (!controller || orderDialogController !== controller) return
  controller.close()
  orderDialogController = null
}

// 构造内置发现标签，扩展来源刷新时以此为稳定基线。
function createBuiltInDiscoverTabs() {
  const tabs = getDiscoverTabs(t)
  return tabs.map(tab => {
    return {
      name: tab.title,
      mediaid_prefix: tab.tab,
      api_path: '',
      filter_params: {},
      filter_ui: [],
    }
  })
}

// 用最近一次成功快照替换扩展来源，并保持 mediaid_prefix 唯一。
function replaceExtraDiscoverSources(sources: DiscoverSource[]) {
  const builtInTabs = createBuiltInDiscoverTabs()
  const seenPrefixes = new Set(builtInTabs.map(tab => tab.mediaid_prefix))
  const nextExtraSources = sources.filter(source => {
    if (seenPrefixes.has(source.mediaid_prefix)) return false
    seenPrefixes.add(source.mediaid_prefix)
    return true
  })

  extraDiscoverSources.value = nextExtraSources
  discoverTabs.value = [...builtInTabs, ...nextExtraSources]
}

// 加载额外的发现数据源；并发生命周期钩子共享同一次请求。
function loadExtraDiscoverSources() {
  if (extraSourcesRequest) return extraSourcesRequest

  extraSourcesRequest = refreshExtraDiscoverSources().finally(() => {
    extraSourcesRequest = null
  })
  return extraSourcesRequest
}

async function refreshExtraDiscoverSources() {
  try {
    const sources: DiscoverSource[] = await api.get('discover/source')
    replaceExtraDiscoverSources(sources)
  } catch (error) {
    console.log(error)
  }
}

// 查找标签对应的持久化设置，优先使用不受语言与名称变化影响的来源标识。
function getTabConfig(tab: DiscoverSource) {
  return orderConfig.value.find(
    item =>
      (item.mediaid_prefix && item.mediaid_prefix === tab.mediaid_prefix) ||
      (!item.mediaid_prefix && item.name === tab.name),
  )
}

// 未出现在历史配置中的新标签默认显示，避免新增来源被旧配置意外隐藏。
function isTabEnabled(tab: DiscoverSource) {
  return getTabConfig(tab)?.enabled !== false
}

// 按用户配置排序全部标签，未配置的新标签保持服务端返回顺序。
function sortDiscoverTabs() {
  if (discoverTabs.value.length === 0) {
    return
  }
  discoverTabs.value.sort((a, b) => {
    const aIndex = orderConfig.value.findIndex(
      item => item.mediaid_prefix === a.mediaid_prefix || (!item.mediaid_prefix && item.name === a.name),
    )
    const bIndex = orderConfig.value.findIndex(
      item => item.mediaid_prefix === b.mediaid_prefix || (!item.mediaid_prefix && item.name === b.name),
    )
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
  })
}

// 校验服务端或旧版本地缓存中的标签配置，并为旧版顺序项补上默认显示状态。
function normalizeTabConfig(value: unknown): DiscoverTabConfigItem[] | null {
  if (!Array.isArray(value)) return null

  const normalized: DiscoverTabConfigItem[] = []
  for (const rawItem of value) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return null

    const item = rawItem as Record<string, unknown>
    if (typeof item.name !== 'string' || !item.name.trim()) return null
    if (item.enabled !== undefined && typeof item.enabled !== 'boolean') return null
    if (item.mediaid_prefix !== undefined && typeof item.mediaid_prefix !== 'string') return null

    normalized.push({
      enabled: item.enabled !== false,
      mediaid_prefix: item.mediaid_prefix?.trim() || undefined,
      name: item.name,
    })
  }
  return normalized
}

// 加载标签设置；服务端是跨浏览器共享的权威来源，本地值仅在远端无配置或请求失败时回退。
async function loadOrderConfig() {
  try {
    const response = await api.get<{ value?: unknown }>(`/user/config/${localOrderKey}`)
    const remoteConfig = normalizeTabConfig(response.value)
    if (remoteConfig) {
      orderConfig.value = remoteConfig
      localStorage.setItem(localOrderKey, JSON.stringify(remoteConfig))
      return
    }
  } catch (error) {
    console.error(error)
  }

  const localOrder = localStorage.getItem(localOrderKey)
  if (!localOrder) return

  try {
    const localConfig = normalizeTabConfig(JSON.parse(localOrder))
    if (localConfig) {
      orderConfig.value = localConfig
      return
    }
  } catch {
    // 损坏的本地缓存不能阻止发现页使用默认标签。
  }
  localStorage.removeItem(localOrderKey)
}

// 保存排序与显示设置，服务端确认成功后再更新页面和本地回退缓存。
async function saveTabSettings(settings: DiscoverTabSettingsPayload, controller = orderDialogController) {
  const nextConfig = settings.tabs.map(item => ({
    enabled: settings.enabled[item.mediaid_prefix] !== false,
    mediaid_prefix: item.mediaid_prefix,
    name: item.name,
  }))
  try {
    await api.post(`/user/config/${localOrderKey}`, nextConfig)
  } catch (error) {
    console.error(error)
    toast.error(t('discover.saveSettingsFailed'))
    return
  }

  discoverTabs.value = [...settings.tabs]
  orderConfig.value = nextConfig
  localStorage.setItem(localOrderKey, JSON.stringify(nextConfig))
  ensureActiveTab()
  closeTabSettingsDialog(controller)
}

// 当前标签被隐藏或来源撤销时切换到第一个可见标签，允许用户主动隐藏全部标签。
function ensureActiveTab(selectFirst = false) {
  const visibleTabs = discoverTabs.value.filter(isTabEnabled)
  if (selectFirst || !visibleTabs.some(tab => tab.mediaid_prefix === activeTab.value)) {
    activeTab.value = visibleTabs[0]?.mediaid_prefix ?? ''
  }
}

// 使用动态标签页
const { registerHeaderTab } = useDynamicHeaderTab()

// 注册动态标签页（在setup阶段，但使用computed保证响应性）
registerHeaderTab({
  items: discoverTabItems, // 传递computed值，会自动响应变化
  modelValue: activeTab,
})

useDynamicButton({
  icon: 'mdi-tune',
  onClick: openTabSettingsDialog,
  permission: 'discovery',
  show: computed(() => appMode.value),
})

async function initializeDiscover() {
  discoverTabs.value = createBuiltInDiscoverTabs()
  try {
    await loadOrderConfig()
  } catch (error) {
    console.log(error)
  }
  await loadExtraDiscoverSources()
  sortDiscoverTabs()
  // VWindow 会在异步配置返回前选中模板首项，初始化完成后必须按用户顺序重新选择。
  ensureActiveTab(true)
}

onBeforeMount(() => {
  initialLoadPromise = initializeDiscover().finally(() => {
    initialLoadPromise = null
  })
})

onActivated(async () => {
  if (initialLoadPromise) {
    await initialLoadPromise
    return
  }

  await loadExtraDiscoverSources()
  sortDiscoverTabs()
  ensureActiveTab()
})
</script>

<template>
  <div>
    <VWindow v-model="activeTab" class="disable-tab-transition" :touch="false">
      <VWindowItem value="themoviedb">
        <div>
          <TheMovieDbView />
        </div>
      </VWindowItem>
      <VWindowItem value="douban">
        <div>
          <DoubanView />
        </div>
      </VWindowItem>
      <VWindowItem value="bangumi">
        <div>
          <BangumiView />
        </div>
      </VWindowItem>
      <VWindowItem value="anilist">
        <div>
          <AniListView />
        </div>
      </VWindowItem>
      <VWindowItem value="musicbrainz">
        <div>
          <MusicView />
        </div>
      </VWindowItem>
      <VWindowItem v-for="item in extraDiscoverSources" :key="item.mediaid_prefix" :value="item.mediaid_prefix">
        <div>
          <ExtraSourceView :source="item" />
        </div>
      </VWindowItem>
    </VWindow>
    <Teleport to="body" v-if="route.path === '/discover'">
      <div v-if="!appMode && canDiscovery" class="compact-fab-stack">
        <VFab
          icon="mdi-tune"
          color="primary"
          appear
          class="compact-fab compact-fab--primary"
          :aria-label="t('discover.customizeTabs')"
          @click="openTabSettingsDialog"
        />
      </div>
    </Teleport>
    <!-- 快速滚动到顶部按钮 -->
    <Teleport to="body" v-if="route.path === '/discover'">
      <VScrollToTopBtn :offset-fab="!appMode && canDiscovery" />
    </Teleport>
  </div>
</template>
