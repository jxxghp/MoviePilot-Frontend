<script setup lang="ts">
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import type { DownloaderConf, MediaInfo, TorrentInfo, TransferDirectoryConf } from '@/api/types'
import { formatFileSize } from '@/@core/utils/formatters'
import { VCardTitle, VChip } from 'vuetify/lib/components/index.mjs'

// 输入参数
const props = defineProps({
  title: String,
  media: Object as PropType<MediaInfo>,
  torrent: Object as PropType<TorrentInfo>,
})

// 提示框
const $toast = useToast()

// 选择的下载器
const selectedDownloader = ref<string | null>(null)

// 选择的保存目录
const selectedDirectory = ref<string | null>(null)

// 定义成功和失败事件
const emit = defineEmits(['done', 'error', 'close'])

// 所有目录设置
const directories = ref<TransferDirectoryConf[]>([])

// 是否正在加载
const loading = ref(false)

// 计算按钮图标
const icon = computed(() => (loading.value ? 'mdi-progress-download' : 'mdi-download'))

// 计算按钮文字
const buttonText = computed(() => (loading.value ? '下载中...' : '开始下载'))

// 加载目录设置
async function loadDirectories() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Directories')
    directories.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 获取保存目录
const targetDirectories = computed(() => {
  const downloadDirectories = directories.value.map(item => item.download_path)
  return [...new Set(downloadDirectories)]
})

// 下载器
const downloaders = ref<DownloaderConf[]>([])

// 调用API查询下载器设置
async function loadDownloaderSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Downloaders')
    downloaders.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 下载器可选项
const downloaderOptions = computed(() => {
  return downloaders.value.map(item => ({
    title: item.name,
    value: item.name,
  }))
})

// 添加下载
async function addDownload() {
  startNProgress()
  loading.value = true
  try {
    let result: { [key: string]: any }

    const payload: any = {
      torrent_in: props.torrent,
      downloader: selectedDownloader.value,
      save_path: selectedDirectory.value,
    }

    if (props.media) {
      payload.media_in = props.media
    }

    const endpoint = props.media ? 'download/' : 'download/add'

    result = await api.post(endpoint, payload)

    if (result && result.success) {
      // 添加下载成功
      $toast.success(`${props.torrent?.site_name} ${props.torrent?.title} 下载成功！`)
      // 下载成功，返回链接
      emit('done', props.torrent?.enclosure)
    } else {
      // 添加下载失败
      $toast.error(`${props.torrent?.site_name} ${props.torrent?.title} 下载失败：${result?.message}！`)
      // 下载失败，返回错误原因
      emit('error', result?.message)
    }
  } catch (error) {
    console.error(error)
  }
  loading.value = false
  doneNProgress()
}

onMounted(() => {
  loadDirectories()
  loadDownloaderSetting()
})
</script>
<template>
  <VDialog max-width="45rem" scrollable>
    <VCard>
      <VCardItem>
        <VCardTitle v-if="title">{{ torrent?.site_name }} - {{ title }}</VCardTitle>
        <VCardTitle v-else>确认下载</VCardTitle>
        <DialogCloseBtn @click="emit('close')" />
      </VCardItem>
      <VDivider />
      <VCardText>
        <VList lines="one">
          <VListItem>
            <template #prepend>
              <VIcon icon="mdi-web"></VIcon>
            </template>
            <VListItemTitle>
              <span class="whitespace-break-spaces me-2">{{ torrent?.title }}</span>
              <span class="text-green-700 ms-2 text-sm">↑{{ torrent?.seeders }}</span>
              <span class="text-orange-700 ms-2 text-sm">↓{{ torrent?.peers }}</span>
            </VListItemTitle>
          </VListItem>
          <VListItem>
            <template #prepend>
              <VIcon icon="mdi-subtitles-outline"></VIcon>
            </template>
            <VListItemTitle>
              <span class="text-body-1 whitespace-break-spaces">{{ torrent?.description }}</span>
            </VListItemTitle>
          </VListItem>
          <VListItem>
            <template #prepend>
              <VIcon icon="mdi-database"></VIcon>
            </template>
            <VListItemTitle>
              <span class="text-body-1">
                <VChip variant="tonal" label>
                  {{ formatFileSize(torrent?.size || 0) }}
                </VChip>
              </span>
            </VListItemTitle>
          </VListItem>
        </VList>
        <VRow>
          <VCol cols="12" md="4">
            <VSelect
              v-model="selectedDownloader"
              :items="downloaderOptions"
              label="指定下载器"
              variant="underlined"
              placeholder="留空默认"
            />
          </VCol>
          <VCol cols="12" md="8">
            <VCombobox
              v-model="selectedDirectory"
              :items="targetDirectories"
              label="指定保存目录"
              placeholder="留空自动匹配"
              variant="underlined"
            />
          </VCol>
        </VRow>
      </VCardText>
      <VCardText class="text-center">
        <VBtn
          variant="elevated"
          :disabled="loading"
          @click="addDownload"
          :prepend-icon="icon"
          class="px-5"
          size="large"
        >
          {{ buttonText }}
        </VBtn>
      </VCardText>
    </VCard>
  </VDialog>
</template>
