<script setup lang="ts">
import api from '@/api'
import type { MediaServerConf, MediaServerLibrary } from '@/api/types'
import LibraryCard from '@/components/cards/LibraryCard.vue'
import DashboardRetryButton from '@/components/misc/DashboardRetryButton.vue'
import DashboardMediaState from '@/components/misc/DashboardMediaState.vue'
import ProgressiveCardGrid from '@/components/misc/ProgressiveCardGrid.vue'
import { useDashboardSnapshot } from '@/composables/useDashboardSnapshot'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

interface DashboardMediaServerLibrary extends MediaServerLibrary {
  /** 媒体库所属的配置服务器名称，用于跨服务器稳定去重。 */
  dashboardServer: string
}

const { readSnapshot, writeSnapshot } = useDashboardSnapshot<DashboardMediaServerLibrary[]>('media-library-v1')
const currentSnapshot = readSnapshot()

// 媒体库列表
const libraryList = ref<DashboardMediaServerLibrary[]>(currentSnapshot?.value ?? [])
// 空结果同样是成功快照；刷新失败不能把已确认的空状态改写成首次加载失败。
const hasSnapshot = ref(currentSnapshot !== undefined)
const isLoading = ref(!currentSnapshot)
const loadFailed = ref(false)

// 所有媒体服务器设置
const mediaServers = ref<MediaServerConf[]>([])
let libraryLoadId = 0
let canRefreshOnActivated = false

/**
 * 查询媒体服务器设置。
 */
async function loadMediaServerSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/MediaServers')
    mediaServers.value = result.data?.value ?? []
    return true
  } catch (error) {
    console.log(error)
    return false
  }
}

/**
 * 查询指定媒体服务器的媒体库。
 * @param server 媒体服务器名称
 */
async function loadLibrary(server: string) {
  try {
    const result: MediaServerLibrary[] = await api.get('mediaserver/library', {
      params: { server: server, hidden: true },
    })
    return (result ?? []).map(library => ({ ...library, dashboardServer: server }))
  } catch (e) {
    console.log(e)
    return undefined
  }
}

/**
 * 加载已启用媒体服务器的媒体库数据。
 */
async function loadData() {
  const loadId = ++libraryLoadId
  if (!hasSnapshot.value) isLoading.value = true
  if (!(await loadMediaServerSetting())) {
    if (loadId === libraryLoadId) {
      loadFailed.value = true
      isLoading.value = false
    }
    return
  }
  if (loadId !== libraryLoadId) return

  const enabledServers = mediaServers.value.filter(server => server.enabled)
  const serverLibraries = await Promise.all(enabledServers.map(server => loadLibrary(server.name)))

  if (loadId !== libraryLoadId) return
  if (serverLibraries.some(libraries => libraries === undefined)) {
    loadFailed.value = true
    isLoading.value = false
    return
  }

  const libraryMap = new Map<string, DashboardMediaServerLibrary>()
  serverLibraries
    .flatMap(libraries => libraries ?? [])
    .forEach(library => {
      const key = `${library.dashboardServer}:${library.id ?? library.link ?? library.name}`
      if (!libraryMap.has(key)) libraryMap.set(key, library)
    })

  const nextLibraryList = Array.from(libraryMap.values())
  libraryList.value = nextLibraryList
  writeSnapshot(nextLibraryList)
  hasSnapshot.value = true
  loadFailed.value = false
  isLoading.value = false
}

onMounted(() => {
  void loadData()

  // KeepAlive 首次激活紧随 mounted，首轮由 mounted 唯一负责加载。
  void nextTick(() => {
    canRefreshOnActivated = true
  })
})

onActivated(() => {
  if (!canRefreshOnActivated) return

  void loadData()
})
</script>

<template>
  <DashboardMediaState
    v-if="libraryList.length === 0"
    :title="t('dashboard.library')"
    :empty-text="t('dashboard.noLibrary')"
    empty-icon="mdi-folder-multiple-outline"
    :loading="isLoading"
    :failed="loadFailed && !hasSnapshot"
  >
    <template v-if="loadFailed" #append>
      <DashboardRetryButton
        :deferred="hasSnapshot"
        :label="hasSnapshot ? t('dashboard.staleData') : t('dashboard.mediaServerLoadFailed')"
        @retry="loadData"
      />
    </template>
  </DashboardMediaState>

  <VCard v-else class="dashboard-media-card dashboard-grid-fill" data-glass-optical-boundary>
    <VCardItem class="dashboard-media-header">
      <VCardTitle>{{ t('dashboard.library') }}</VCardTitle>
      <template v-if="loadFailed" #append>
        <DashboardRetryButton deferred :label="t('dashboard.staleData')" @retry="loadData" />
      </template>
    </VCardItem>
    <div class="dashboard-media-content px-5 pb-3">
      <ProgressiveCardGrid
        class="dashboard-media-grid"
        :items="libraryList"
        :get-item-key="item => `${item.dashboardServer}:${item.id ?? item.link ?? item.name}`"
        :min-item-width="240"
        :estimated-item-height="160"
        tabindex="0"
      >
        <template #default="{ item }">
          <LibraryCard :media="item" height="10rem" />
        </template>
      </ProgressiveCardGrid>
    </div>
  </VCard>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.dashboard-media-grid {
  flex: 1 1 auto;
  min-block-size: 0;
}

.dashboard-media-card {
  display: flex;
  flex-direction: column;
  block-size: 100%;
  min-block-size: 0;
}

.dashboard-media-header {
  padding-block-end: 0.375rem;
}

.dashboard-media-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
  overflow: auto;
  scrollbar-width: none;
}

@supports not (scrollbar-width: none) {
  .dashboard-media-content::-webkit-scrollbar {
    display: none;
  }
}
</style>
