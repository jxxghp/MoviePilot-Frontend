<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import { useConfirm } from 'vuetify-use-dialog'
import api from '@/api'
import type { TorrentInfo } from '@/api/types'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import { formatFileSize } from '@core/utils/formatters'

// 输入参数
const props = defineProps({
  site: Number,
  width: String,
  height: String,
})

// 提示框
const $toast = useToast()

// 确认框
const createConfirm = useConfirm()

// 数据列表
const resourceDataList = ref<TorrentInfo[]>([])

// 搜索
const resourceSearch = ref('')

// 总条数
const resourceTotalItems = ref(0)

// 每页条数
const resourceItemsPerPage = ref(25)

// 加载状态
const resourceLoading = ref(false)

// 资源浏览表头
const resourceHeaders = [
  { title: '标题', key: 'title', sortable: false },
  { title: '时间', key: 'pubdate', sortable: true },
  { title: '大小', key: 'size', sortable: true },
  { title: '做种', key: 'seeders', sortable: true },
  { title: '下载', key: 'peers', sortable: true },
  { title: '', key: 'actions', sortable: false },
]

// 打开种子详情页面
function openTorrentDetail(page_url: string) {
  window.open(page_url, '_blank')
}

// 下载种子文件
async function downloadTorrentFile(enclosure: string) {
  window.open(enclosure, '_blank')
}

// 调用API，查询站点资源
async function getResourceList() {
  resourceLoading.value = true
  try {
    resourceDataList.value = await api.get(`site/resource/${props.site}`)
    resourceLoading.value = false
  } catch (error) {
    console.error(error)
  }
}

// 促销Chip类
function getVolumeFactorClass(downloadVolume: number, uploadVolume: number) {
  if (downloadVolume === 0) return 'text-white bg-lime-500'
  else if (downloadVolume < 1) return 'text-white bg-green-500'
  else if (uploadVolume !== 1) return 'text-white bg-sky-500'
  else return 'text-white bg-gray-500'
}

// 添加下载
async function addDownload(_torrent: any) {
  const isConfirmed = await createConfirm({
    title: '确认',
    content: `是否确认下载【${_torrent.site_name}】${_torrent?.title} ?`,
  })

  if (!isConfirmed) return

  startNProgress()
  try {
    const result: { [key: string]: any } = await api.post('download/add', _torrent)

    if (result.success) {
      // 添加下载成功
      $toast.success(`${_torrent?.site_name} ${_torrent?.title} 添加下载成功！`)
    } else {
      // 添加下载失败
      $toast.error(`${_torrent?.site_name} ${_torrent?.title} 添加下载失败：${result.message || '未知错误'}`)
    }
  } catch (error) {
    console.error(error)
  }
  doneNProgress()
}

// 装载时查询站点图标
onMounted(() => {
  getResourceList()
})
</script>

<template>
  <VDataTable
    v-model:items-per-page="resourceItemsPerPage"
    :headers="resourceHeaders"
    :items="resourceDataList"
    :items-length="resourceTotalItems"
    :search="resourceSearch"
    :loading="resourceLoading"
    density="compact"
    item-value="title"
    return-object
    fixed-header
    hover
    items-per-page-text="每页条数"
    page-text="{0}-{1} 共 {2} 条"
    loading-text="加载中..."
  >
    <template #item.title="{ item }">
      <a href="javascript:void(0)" @click.stop="addDownload(item)">
        <div class="text-high-emphasis pt-1">
          {{ item.title }}
        </div>
        <div class="text-sm my-1">
          {{ item.description }}
        </div>
        <VChip v-if="item.hit_and_run" variant="elevated" size="small" class="me-1 mb-1 text-white bg-black">
          H&R
        </VChip>
        <VChip v-if="item.freedate_diff" variant="elevated" color="secondary" size="small" class="me-1 mb-1">
          {{ item.freedate_diff }}
        </VChip>
        <VChip
          v-for="(label, index) in item.labels"
          :key="index"
          variant="elevated"
          size="small"
          color="primary"
          class="me-1 mb-1"
        >
          {{ label }}
        </VChip>
        <VChip
          v-if="item.downloadvolumefactor !== 1 || item.uploadvolumefactor !== 1"
          :class="getVolumeFactorClass(item.downloadvolumefactor, item.uploadvolumefactor)"
          variant="elevated"
          size="small"
          class="me-1 mb-1"
        >
          {{ item.volume_factor }}
        </VChip>
      </a>
    </template>
    <template #item.pubdate="{ item }">
      <div>{{ item.date_elapsed }}</div>
      <div class="text-sm">
        {{ item.pubdate }}
      </div>
    </template>
    <template #item.size="{ item }">
      <div class="text-nowrap whitespace-nowrap">
        {{ formatFileSize(item.size) }}
      </div>
    </template>
    <template #item.seeders="{ item }">
      <div>{{ item.seeders }}</div>
    </template>
    <template #item.peers="{ item }">
      <div>{{ item.peers }}</div>
    </template>
    <template #item.actions="{ item }">
      <div class="me-n3">
        <IconBtn>
          <VIcon icon="mdi-dots-vertical" />
          <VMenu activator="parent" close-on-content-click>
            <VList>
              <VListItem variant="plain" @click="openTorrentDetail(item.page_url || '')">
                <template #prepend>
                  <VIcon icon="mdi-information" />
                </template>
                <VListItemTitle>查看详情</VListItemTitle>
              </VListItem>
              <VListItem
                v-if="item.enclosure?.startsWith('http')"
                variant="plain"
                @click="downloadTorrentFile(item.enclosure)"
              >
                <template #prepend>
                  <VIcon icon="mdi-download" />
                </template>
                <VListItemTitle>下载种子文件</VListItemTitle>
              </VListItem>
            </VList>
          </VMenu>
        </IconBtn>
      </div>
    </template>
    <template #no-data> 没有数据 </template>
  </VDataTable>
</template>
