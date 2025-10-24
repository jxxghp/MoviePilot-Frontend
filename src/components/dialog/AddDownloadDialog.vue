<script setup lang="ts">
import { useToast } from 'vue-toastification'
import api from '@/api'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import type { DownloaderConf, MediaInfo, TorrentInfo, TransferDirectoryConf } from '@/api/types'
import { formatFileSize } from '@/@core/utils/formatters'
import { VCardTitle, VChip } from 'vuetify/lib/components/index.mjs'
import { useI18n } from 'vue-i18n'

// 多语言支持
const { t } = useI18n()

// 输入参数
const props = defineProps({
  title: String,
  media: Object as PropType<MediaInfo>,
  torrent: Object as PropType<TorrentInfo>,
})

// 定义成功和失败事件
const emit = defineEmits(['done', 'error', 'close'])

// 提示框
const $toast = useToast()

// 选择的下载器
const selectedDownloader = ref<string | null>(null)

// 选择的保存目录
const selectedDirectory = ref<string | null>(null)

// ID字段
const tmdbid = ref<number | null>(null)
const doubanid = ref<string | null>(null)
const bangumiid = ref<number | null>(null)

// 下载器
const downloaders = ref<DownloaderConf[]>([])

// 所有目录设置
const directories = ref<TransferDirectoryConf[]>([])

// 是否正在加载
const loading = ref(false)

// 计算按钮图标
const icon = computed(() => (loading.value ? 'mdi-progress-download' : 'mdi-download'))

// 计算按钮文字
const buttonText = computed(() =>
  loading.value ? t('dialog.addDownload.downloading') : t('dialog.addDownload.startDownload'),
)

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

// 调用API查询下载器设置
async function loadDownloaderSetting() {
  try {
    downloaders.value = await api.get('download/clients')
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
      tmdbid: tmdbid.value,
      doubanid: doubanid.value,
      bangumiid: bangumiid.value,
    }

    if (props.media) {
      payload.media_in = props.media
    }

    const endpoint = props.media ? 'download/' : 'download/add'

    result = await api.post(endpoint, payload)

    if (result && result.success) {
      // 添加下载成功
      $toast.success(
        t('dialog.addDownload.downloadSuccess', { site: props.torrent?.site_name, title: props.torrent?.title }),
      )
      // 下载成功，返回链接
      emit('done', props.torrent?.enclosure)
    } else {
      // 添加下载失败
      $toast.error(
        t('dialog.addDownload.downloadFailed', {
          site: props.torrent?.site_name,
          title: props.torrent?.title,
          message: result?.message,
        }),
      )
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
  <VDialog max-width="35rem" scrollable>
    <VCard>
      <VCardItem class="py-2">
        <template #prepend>
          <VIcon icon="mdi-monitor-arrow-down-variant" class="me-2" />
        </template>
        <VCardTitle>{{ t('dialog.addDownload.confirmDownload') }}</VCardTitle>
        <VCardSubtitle>{{ torrent?.site_name }} - {{ title }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
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
          <VListItem v-if="torrent?.description">
            <template #prepend>
              <VIcon icon="mdi-subtitles-outline"></VIcon>
            </template>
            <VListItemTitle>
              <span class="text-body-2 whitespace-break-spaces">{{ torrent?.description }}</span>
            </VListItemTitle>
          </VListItem>
          <VListItem v-if="torrent?.size">
            <template #prepend>
              <VIcon icon="mdi-database"></VIcon>
            </template>
            <VListItemTitle>
              <span class="text-body-2">
                <VChip variant="tonal" label>
                  {{ formatFileSize(torrent?.size || 0) }}
                </VChip>
              </span>
            </VListItemTitle>
          </VListItem>
        </VList>
        <VRow class="px-5">
          <VCol cols="12" md="6">
            <VSelect
              v-model="selectedDownloader"
              :items="downloaderOptions"
              size="small"
              :label="t('dialog.addDownload.downloader')"
              variant="underlined"
              :placeholder="t('dialog.addDownload.defaultPlaceholder')"
              density="comfortable"
              prepend-inner-icon="mdi-download"
            />
          </VCol>
          <VCol cols="12" md="6">
            <VCombobox
              v-model="selectedDirectory"
              :items="targetDirectories"
              :label="t('dialog.addDownload.saveDirectory')"
              size="small"
              :placeholder="t('dialog.addDownload.autoPlaceholder')"
              variant="underlined"
              density="comfortable"
              prepend-inner-icon="mdi-folder"
            />
          </VCol>
        </VRow>
        <VRow class="px-5">
          <VCol cols="12" md="4">
            <VTextField
              v-model.number="tmdbid"
              type="number"
              size="small"
              label="TMDB ID"
              variant="underlined"
              density="comfortable"
              prepend-inner-icon="mdi-movie-open"
            />
          </VCol>
          <VCol cols="12" md="4">
            <VTextField
              v-model="doubanid"
              type="text"
              size="small"
              label="Douban ID"
              variant="underlined"
              density="comfortable"
              prepend-inner-icon="mdi-book-open-variant"
            />
          </VCol>
          <VCol cols="12" md="4">
            <VTextField
              v-model.number="bangumiid"
              type="number"
              size="small"
              label="Bangumi ID"
              variant="underlined"
              density="comfortable"
              prepend-inner-icon="mdi-television-classic"
            />
          </VCol>
        </VRow>
      </VCardText>
      <VCardText class="text-center">
        <VBtn variant="elevated" :disabled="loading" @click="addDownload" :prepend-icon="icon" class="px-5">
          {{ buttonText }}
        </VBtn>
      </VCardText>
    </VCard>
  </VDialog>
</template>
