<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import type { TorrentCacheData, TorrentCacheItem } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { formatFileSize, formatDateDifference } from '@core/utils/formatters'
import { useConfirm } from '@/composables/useConfirm'
import { useGlobalSettingsStore } from '@/stores'
import { usePWA } from '@/composables/usePWA'

// 国际化
const { t } = useI18n()

// PWA模式检测
const { appMode } = usePWA()

// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 确认框
const createConfirm = useConfirm()

// 提示框
const $toast = useToast()

// 缓存数据
const cacheData = ref<TorrentCacheData>({
  count: 0,
  sites: 0,
  data: [],
})

// 筛选条件
const titleFilter = ref<string | null>(null)
const siteFilter = ref<string | null>(null)

// 获取所有站点选项
const siteOptions = computed(() => {
  const sites = new Set<string>()
  cacheData.value.data.forEach(item => {
    if (item.site_name) {
      sites.add(item.site_name)
    }
  })
  return Array.from(sites).sort()
})

// 筛选后的数据
const filteredData = computed(() => {
  return cacheData.value.data.filter(item => {
    const titleMatch = !titleFilter.value || item.title?.toLowerCase().includes(titleFilter.value?.toLowerCase())
    const siteMatch = !siteFilter.value || item.site_name === siteFilter.value
    return titleMatch && siteMatch
  })
})

// 选中的缓存项
const selectedItems = ref<string[]>([])

// 加载状态
const loading = ref(false)

// 重新识别对话框
const reidentifyDialog = ref(false)
const currentReidentifyItem = ref<TorrentCacheItem | null>(null)
const tmdbId = ref<number | undefined>()
const doubanId = ref<string | undefined>()

const tableStyle = computed(() => {
  return appMode ? '' : 'height: calc(100vh - 21rem - env(safe-area-inset-bottom)'
})

// 调用API加载缓存数据
async function loadCacheData() {
  try {
    loading.value = true
    const res: any = await api.get('torrent/cache')
    cacheData.value = res.data
  } catch (e) {
    console.log(e)
    $toast.error(t('setting.cache.loadFailed'))
  } finally {
    loading.value = false
  }
}

// 清空所有缓存
async function clearAllCache() {
  const isConfirmed = await createConfirm({
    type: 'warn',
    title: t('common.confirm'),
    content: t('setting.cache.clearConfirm'),
  })

  if (!isConfirmed) return
  try {
    loading.value = true
    await api.delete('torrent/cache')
    $toast.success(t('setting.cache.clearSuccess'))
    await loadCacheData()
    selectedItems.value = []
  } catch (e) {
    console.log(e)
    $toast.error(t('setting.cache.clearFailed'))
  } finally {
    loading.value = false
  }
}

// 刷新缓存
async function refreshCache() {
  try {
    loading.value = true
    const res: any = await api.post('torrent/cache/refresh')
    $toast.success(res.message || t('setting.cache.refreshSuccess'))
    await loadCacheData()
  } catch (e) {
    console.log(e)
    $toast.error(t('setting.cache.refreshFailed'))
  } finally {
    loading.value = false
  }
}

// 删除选中的缓存项
async function deleteSelectedItems() {
  if (selectedItems.value.length === 0) {
    $toast.warning(t('setting.cache.selectDeleteWarning'))
    return
  }

  try {
    loading.value = true
    const deletePromises = selectedItems.value.map(hash => {
      const item = cacheData.value.data.find(d => d.hash === hash)
      if (item) {
        return api.delete(`torrent/cache/${item.domain}/${hash}`)
      }
      return Promise.resolve()
    })

    await Promise.all(deletePromises)
    $toast.success(t('setting.cache.deleteSelectedSuccess', { count: selectedItems.value.length }))
    await loadCacheData()
    selectedItems.value = []
  } catch (e) {
    console.log(e)
    $toast.error(t('setting.cache.deleteSelectedFailed'))
  } finally {
    loading.value = false
  }
}

// 删除单个缓存项
async function deleteSingleItem(item: TorrentCacheItem) {
  try {
    loading.value = true
    await api.delete(`torrent/cache/${item.domain}/${item.hash}`)
    $toast.success(t('setting.cache.deleteSuccess'))
    await loadCacheData()
    // 从选中列表中移除
    const index = selectedItems.value.indexOf(item.hash)
    if (index > -1) {
      selectedItems.value.splice(index, 1)
    }
  } catch (e) {
    console.log(e)
    $toast.error(t('setting.cache.deleteFailed'))
  } finally {
    loading.value = false
  }
}

// 打开重新识别对话框
function openReidentifyDialog(item: TorrentCacheItem) {
  currentReidentifyItem.value = item
  tmdbId.value = undefined
  doubanId.value = undefined
  reidentifyDialog.value = true
}

// 重新识别
async function performReidentify() {
  if (!currentReidentifyItem.value) return

  try {
    loading.value = true
    const params: any = {}
    if (tmdbId.value) params.tmdbid = tmdbId.value
    if (doubanId.value) params.doubanid = doubanId.value

    const res: any = await api.post(
      `torrent/cache/reidentify/${currentReidentifyItem.value.domain}/${currentReidentifyItem.value.hash}`,
      null,
      {
        params,
      },
    )

    $toast.success(res.message || t('setting.cache.reidentifySuccess'))
    await loadCacheData()
    reidentifyDialog.value = false
  } catch (e) {
    console.log(e)
    $toast.error(t('setting.cache.reidentifyFailed'))
  } finally {
    loading.value = false
  }
}

// 获取媒体类型颜色
function getMediaTypeColor(type: string): string {
  switch (type) {
    case t('setting.cache.mediaType.movie'):
      return 'primary'
    case t('setting.cache.mediaType.tv'):
      return 'success'
    default:
      return 'default'
  }
}

// 打开详情页面
function openPageUrl(url: string) {
  window.open(url, '_blank')
}

onMounted(() => {
  loadCacheData()
})
</script>

<template>
  <div>
    <!-- 工具栏统计信息和操作按钮 -->
    <VCard class="mb-4">
      <VCardItem>
        <!-- 移动端垂直布局，桌面端水平布局 -->
        <div class="d-flex flex-column flex-md-row align-center justify-space-between w-100 gap-4">
          <!-- 左侧统计信息 -->
          <div class="d-flex align-center gap-2 gap-md-6 w-100 w-md-auto">
            <!-- 统计信息卡片 -->
            <div class="d-flex gap-2 gap-md-4 flex-wrap">
              <VCard variant="tonal" color="primary" class="pa-2 pa-md-3 flex-grow-1 flex-md-grow-0" style="min-width: 120px;">
                <div class="d-flex align-center gap-2">
                  <VIcon color="primary" size="small">mdi-database</VIcon>
                  <div>
                    <div class="text-h6 text-md-h6 font-weight-bold">{{ cacheData.count }}</div>
                    <div class="text-caption text-medium-emphasis">{{ t('setting.cache.totalCount') }}</div>
                  </div>
                </div>
              </VCard>

              <VCard variant="tonal" color="success" class="pa-2 pa-md-3 flex-grow-1 flex-md-grow-0" style="min-width: 120px;">
                <div class="d-flex align-center gap-2">
                  <VIcon color="success" size="small">mdi-web</VIcon>
                  <div>
                    <div class="text-h6 text-md-h6 font-weight-bold">{{ cacheData.sites }}</div>
                    <div class="text-caption text-medium-emphasis">{{ t('setting.cache.siteCount') }}</div>
                  </div>
                </div>
              </VCard>
            </div>
          </div>

          <!-- 右侧操作按钮 -->
          <div class="d-flex gap-1 gap-md-2 flex-wrap justify-center justify-md-end">
            <VBtn icon color="primary" :loading="loading" @click="refreshCache" size="small">
              <VIcon size="small">mdi-refresh</VIcon>
              <VTooltip activator="parent" location="bottom">{{ t('setting.cache.refresh') }}</VTooltip>
            </VBtn>

            <VBtn
              icon
              color="warning"
              :loading="loading"
              :disabled="selectedItems.length === 0"
              @click="deleteSelectedItems"
              size="small"
            >
              <VIcon size="small">mdi-delete-sweep</VIcon>
              <VTooltip activator="parent" location="bottom"
                >{{ t('setting.cache.deleteSelected') }} ({{ selectedItems.length }})</VTooltip
              >
            </VBtn>

            <VBtn icon color="error" :loading="loading" @click="clearAllCache" size="small">
              <VIcon size="small">mdi-delete-variant</VIcon>
              <VTooltip activator="parent" location="bottom">{{ t('setting.cache.clearAll') }}</VTooltip>
            </VBtn>
          </div>
        </div>
      </VCardItem>
    </VCard>

    <!-- 筛选框 -->
    <VRow class="mb-4">
      <VCol cols="6">
        <VTextField
          v-model="titleFilter"
          :label="t('setting.cache.filterByTitle')"
          prepend-inner-icon="mdi-magnify"
          clearable
          density="compact"
        />
      </VCol>
      <VCol cols="6">
        <VAutocomplete
          v-model="siteFilter"
          :label="t('setting.cache.filterBySite')"
          :items="siteOptions"
          prepend-inner-icon="mdi-web"
          clearable
          density="compact"
          :placeholder="t('setting.cache.selectSite')"
        />
      </VCol>
    </VRow>

    <!-- 缓存列表 -->
    <VDataTable
      v-model="selectedItems"
      :headers="[
        { title: '', key: 'data-table-select', sortable: false, width: '48px' },
        { title: t('setting.cache.poster'), key: 'poster', sortable: false, width: '80px' },
        { title: t('setting.cache.torrentTitle'), key: 'title', sortable: true },
        { title: t('setting.cache.site'), key: 'site_name', sortable: true, width: '120px' },
        { title: t('setting.cache.size'), key: 'size', sortable: true, width: '100px' },
        { title: t('setting.cache.publishTime'), key: 'pubdate', sortable: true, width: '150px' },
        { title: t('setting.cache.recognitionResult'), key: 'media_info', sortable: false, width: '200px' },
        { title: t('setting.cache.actions'), key: 'actions', sortable: false, width: '150px' },
      ]"
      :items="filteredData"
      :loading="loading"
      item-value="hash"
      show-select
      hover
      fixed-header
      :items-per-page-text="t('common.itemsPerPage')"
      :no-data-text="t('common.noDataText')"
      :loading-text="t('common.loadingText')"
      :style="tableStyle"
    >
      <!-- 全选复选框 -->
      <template #header.data-table-select="{ allSelected, selectAll, someSelected }">
        <VCheckbox
          :indeterminate="someSelected && !allSelected"
          :model-value="allSelected"
          @update:model-value="(value: boolean | null) => selectAll(value as boolean)"
        />
      </template>

      <!-- 海报列 -->
      <template #item.poster="{ item }">
        <div class="text-center">
          <VImg
            v-if="item.poster_path"
            :src="item.poster_path"
            :alt="item.media_name || item.title"
            cover
            rounded="md"
            class="w-12 my-1 ms-auto"
          />
          <VIcon v-else size="x-large" color="grey-lighten-1">
            {{ item.media_type === 'movie' ? 'mdi-movie-open' : 'mdi-television-play' }}
          </VIcon>
        </div>
      </template>

      <!-- 标题列 -->
      <template #item.title="{ item }">
        <div class="d-flex flex-column min-w-40">
          <div class="text-subtitle-2 font-weight-bold">
            {{ item.title }}
          </div>
          <div v-if="item.description" class="text-caption text-grey">
            {{ item.description }}
          </div>
          <div v-if="item.season_episode || item.resource_term" class="text-caption text-primary mt-1">
            {{ item.season_episode }} {{ item.resource_term }}
          </div>
        </div>
      </template>

      <!-- 大小列 -->
      <template #item.size="{ item }">
        {{ formatFileSize(item.size) }}
      </template>

      <!-- 发布时间列 -->
      <template #item.pubdate="{ item }">
        {{ formatDateDifference(item.pubdate || '') }}
      </template>

      <!-- 识别结果列 -->
      <template #item.media_info="{ item }">
        <div v-if="item.media_name" class="d-flex flex-column">
          <div class="text-subtitle-2">
            {{ item.media_name }}
            <span v-if="item.media_year" class="text-caption text-grey"> ({{ item.media_year }}) </span>
          </div>
          <div>
            <VChip v-if="item.media_type" :color="getMediaTypeColor(item.media_type)" size="x-small">
              {{ item.media_type }}
            </VChip>
          </div>
        </div>
        <div v-else class="text-caption text-grey">
          {{ t('setting.cache.unrecognized') }}
        </div>
      </template>

      <!-- 操作列 -->
      <template #item.actions="{ item }">
        <div class="d-flex gap-1">
          <VBtn icon size="small" color="primary" variant="text" @click="openReidentifyDialog(item)">
            <VIcon size="16">mdi-text-recognition</VIcon>
          </VBtn>

          <VBtn icon size="small" color="error" variant="text" @click="deleteSingleItem(item)">
            <VIcon size="16">mdi-delete</VIcon>
          </VBtn>

          <VBtn
            v-if="item.page_url"
            icon
            size="small"
            color="info"
            variant="text"
            @click="openPageUrl(item.page_url || '')"
            target="_blank"
          >
            <VIcon size="16">mdi-open-in-new</VIcon>
          </VBtn>
        </div>
      </template>

      <!-- 空状态 -->
      <template #no-data>
        <div class="text-center pa-4">
          <VIcon size="64" class="mb-4"> mdi-database-off </VIcon>
          <div class="text-body-2 text-grey">
            {{ t('setting.cache.noData') }}
          </div>
        </div>
      </template>
    </VDataTable>

    <!-- 重新识别对话框 -->
    <VDialog v-model="reidentifyDialog" scrollable max-width="35rem">
      <VCard>
        <VCardItem class="py-2">
          <template #prepend>
            <VIcon>mdi-text-recognition</VIcon>
          </template>
          <VCardTitle>{{ t('setting.cache.reidentifyDialog.title') }}</VCardTitle>
          <VCardSubtitle>{{ currentReidentifyItem?.title }}</VCardSubtitle>
        </VCardItem>
        <VDialogCloseBtn @click="reidentifyDialog = false" />
        <VDivider />
        <VCardText>
          <VRow>
            <VCol cols="12">
              <VTextField
                v-if="globalSettings.RECOGNIZE_SOURCE === 'themoviedb'"
                v-model="tmdbId"
                :label="t('setting.cache.reidentifyDialog.tmdbId')"
                :hint="t('setting.cache.reidentifyDialog.tmdbIdHint')"
                clearable
                prepend-inner-icon="mdi-id-card"
                persistent-hint
              />
              <VTextField
                v-else
                v-model="doubanId"
                :label="t('setting.cache.reidentifyDialog.doubanId')"
                :hint="t('setting.cache.reidentifyDialog.doubanIdHint')"
                clearable
                prepend-inner-icon="mdi-id-card"
                persistent-hint
              />
            </VCol>
          </VRow>
          <VAlert type="info" variant="tonal" class="mt-4">
            {{ t('setting.cache.reidentifyDialog.autoHint') }}
          </VAlert>
        </VCardText>

        <VCardActions>
          <VSpacer />
          <VBtn color="primary" :loading="loading" prepend-icon="mdi-check" @click="performReidentify">
            {{ t('setting.cache.reidentifyDialog.confirm') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
