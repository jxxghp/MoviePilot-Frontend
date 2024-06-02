<script lang="ts" setup>
import type { PropType } from 'vue'
import { useToast } from 'vue-toast-notification'
import { useConfirm } from 'vuetify-use-dialog'
import { formatFileSize } from '@/@core/utils/formatters'
import api from '@/api'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import type { Context, MediaInfo, TorrentInfo } from '@/api/types'

// 输入参数
const props = defineProps({
  torrent: Object as PropType<Context>,
})

// 提示框
const $toast = useToast()

// 确认框
const createConfirm = useConfirm()

// 更多来源界面
const showMoreTorrents = ref(false)

// 种子信息
const torrent = ref(props.torrent?.torrent_info)

// 媒体信息
const media = ref(props.torrent?.media_info)

// 识别元数据
const meta = ref(props.torrent?.meta_info)

// 站点图标
const siteIcon = ref('')

// 存储是否已经下载过的记录
const downloaded = ref<String[]>([])

// 查询站点图标
async function getSiteIcon() {
  try {
    siteIcon.value = (await api.get(`site/icon/${torrent?.value?.site}`)).data.icon
  } catch (error) {
    console.error(error)
  }
}

// 询问并添加下载
async function handleAddDownload(_site: any = undefined, _media: any = undefined, _torrent: any = undefined) {
  if (!_media || !_torrent || !_site) {
    _site = torrent.value?.site_name
    _media = media.value
    _torrent = torrent.value
  }

  const isConfirmed = await createConfirm({
    title: '确认',
    content: `是否确认下载【${_site}】${_torrent?.title} ?`,
  })

  if (!isConfirmed) return

  addDownload(_media, _torrent)
}

// 添加下载
async function addDownload(_media: MediaInfo, _torrent: TorrentInfo) {
  startNProgress()
  try {
    let result: { [key: string]: any }

    if (_media) {
      result = await api.post('download/', {
        media_in: _media,
        torrent_in: _torrent,
      })
    } else {
      result = await api.post('download/add', _torrent)
    }

    if (result && result.success) {
      // 添加下载成功
      $toast.success(`${_torrent?.site_name} ${_torrent?.title} 下载成功！`)
      downloaded.value.push(_torrent?.enclosure || '')
    } else {
      // 添加下载失败
      $toast.error(`${_torrent?.site_name} ${_torrent?.title} 下载失败：${result?.message}！`)
    }
  } catch (error) {
    console.error(error)
  }
  doneNProgress()
}

// 打开种子详情页面
function openTorrentDetail() {
  window.open(torrent.value?.page_url, '_blank')
}

// 下载种子文件
async function downloadTorrentFile() {
  window.open(torrent.value?.enclosure, '_blank')
}

// 促销Chip类
function getVolumeFactorClass(downloadVolume: number, uploadVolume: number) {
  if (downloadVolume === 0) return 'text-white bg-lime-500'
  else if (downloadVolume < 1) return 'text-white bg-green-500'
  else if (uploadVolume !== 1) return 'text-white bg-sky-500'
  else return 'text-white bg-gray-500'
}

// 装载时查询站点图标
onMounted(() => {
  getSiteIcon()
})
</script>

<template>
  <VListItem @click="handleAddDownload" :variant="downloaded.includes(torrent?.enclosure || '') ? 'outlined' : 'flat'">
    <template v-if="!showMoreTorrents" #prepend>
      <VAvatar class="rounded" variant="flat" @click.stop="openTorrentDetail">
        <VImg :src="siteIcon" />
      </VAvatar>
    </template>
    <VListItemTitle class="break-words overflow-visible whitespace-break-spaces">
      {{ torrent?.title }}
      <span class="text-green-700 ms-2 text-sm">↑{{ torrent?.seeders }}</span>
      <span class="text-orange-700 ms-2 text-sm">↓{{ torrent?.peers }}</span>
    </VListItemTitle>
    <VListItemSubtitle>
      {{ torrent?.description }}
    </VListItemSubtitle>
    <div v-if="torrent?.labels" class="pt-2">
      <VChip v-if="torrent?.hit_and_run" variant="elevated" size="small" class="me-1 mb-1 text-white bg-black">
        H&R
      </VChip>
      <VChip v-if="torrent?.freedate_diff" variant="elevated" color="secondary" size="small" class="me-1 mb-1">
        {{ torrent?.freedate_diff }}
      </VChip>
      <VChip
        v-for="(label, index) in torrent?.labels"
        :key="index"
        variant="elevated"
        size="small"
        color="primary"
        class="me-1 mb-1"
      >
        {{ label }}
      </VChip>
      <VChip v-if="meta?.edition" variant="elevated" size="small" class="me-1 mb-1 text-white bg-red-500">
        {{ meta?.edition }}
      </VChip>
      <VChip v-if="meta?.resource_pix" variant="elevated" size="small" class="me-1 mb-1 text-white bg-red-500">
        {{ meta?.resource_pix }}
      </VChip>
      <VChip v-if="meta?.video_encode" variant="elevated" size="small" class="me-1 mb-1 text-white bg-orange-500">
        {{ meta?.video_encode }}
      </VChip>
      <VChip v-if="torrent?.size" variant="elevated" size="small" class="me-1 mb-1 text-white bg-yellow-500">
        {{ formatFileSize(torrent?.size) }}
      </VChip>
      <VChip v-if="meta?.resource_team" variant="elevated" size="small" class="me-1 mb-1 text-white bg-cyan-500">
        {{ meta?.resource_team }}
      </VChip>
      <VChip
        v-if="torrent?.downloadvolumefactor !== 1 || torrent?.uploadvolumefactor !== 1"
        :class="getVolumeFactorClass(torrent?.downloadvolumefactor, torrent?.uploadvolumefactor)"
        variant="elevated"
        size="small"
        class="me-1 mb-1"
      >
        {{ torrent?.volume_factor }}
      </VChip>
    </div>
    <template #append>
      <div class="me-n3">
        <IconBtn>
          <VIcon icon="mdi-dots-vertical" />
          <VMenu activator="parent" close-on-content-click>
            <VList>
              <VListItem variant="plain" @click="openTorrentDetail()">
                <template #prepend>
                  <VIcon icon="mdi-information" />
                </template>
                <VListItemTitle>查看详情</VListItemTitle>
              </VListItem>
              <VListItem
                v-if="props.torrent?.torrent_info?.enclosure?.startsWith('http')"
                variant="plain"
                @click="downloadTorrentFile()"
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
  </VListItem>
</template>
