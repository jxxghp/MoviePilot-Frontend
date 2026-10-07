<script setup lang="ts">
import { useToast } from 'vue-toastification'
import api from '@/api'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import { listDownloadDirectories } from '@/api/storage'
import { MediaSource, type DownloadDirectory, type MediaDataSource, type SubtitleInfo } from '@/api/types'
import { formatFileSize } from '@/@core/utils/formatters'
import { useI18n } from 'vue-i18n'
import MediaIdSelector from '../misc/MediaIdSelector.vue'
import { useGlobalSettingsStore } from '@/stores'
import {
  buildDownloadDirectoryOptions,
  filterDownloadDirectoryOption,
  toDownloadDirectoryValue,
} from '@/utils/downloadDirectory'
import type { DownloadDirectoryOption } from '@/utils/downloadDirectory'
import { isMediaDataSource, isValidMediaSourceId } from '@/utils/mediaId'
import { useMediaSources } from '@/composables/useMediaSources'

// 多语言支持
const { t } = useI18n()

// 从 provide 中获取全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 输入参数
const props = defineProps<{
  title?: string
  subtitle?: SubtitleInfo
  mediaSource?: MediaDataSource
  mediaId?: string
}>()

const initialMediaId = isMediaDataSource(props.mediaSource) ? props.mediaId?.trim() || undefined : undefined
const mediaSource = ref<MediaDataSource>(
  isMediaDataSource(props.mediaSource)
    ? props.mediaSource
    : isMediaDataSource(globalSettings.RECOGNIZE_SOURCE)
      ? globalSettings.RECOGNIZE_SOURCE
      : MediaSource.TMDB,
)

// 定义成功和失败事件
const emit = defineEmits(['done', 'error', 'close'])

// 提示框
const $toast = useToast()

// 选择的保存目录
const selectedDirectory = ref<string | null>(null)

// 所有目录设置
const directories = ref<DownloadDirectory[]>([])

// 是否正在加载
const loading = ref(false)

// 是否显示高级选项
const showAdvancedOptions = ref(!initialMediaId)

// 当前数据源的原生媒体ID
const selectedMediaId = ref<string | undefined>(initialMediaId)

const normalizedMediaId = computed(() => selectedMediaId.value?.trim() || undefined)
const hasValidMediaIdentity = computed(
  () => Boolean(normalizedMediaId.value) && isValidMediaSourceId(normalizedMediaId.value, mediaSource.value),
)
const { mediaSourceItems: getMediaSourceItems } = useMediaSources()
const mediaSourceItems = getMediaSourceItems('media')

// 当前数据源对应的原生ID标签。
const mediaIdLabel = computed(() => {
  const labels: Partial<Record<MediaDataSource, string>> = {
    themoviedb: t('dialog.reorganize.tmdbId'),
    douban: t('dialog.reorganize.doubanId'),
    bangumi: t('dialog.reorganize.bangumiId'),
    anilist: t('dialog.reorganize.anilistId'),
    imdb: 'IMDb ID',
    tvdb: 'TVDB ID',
    musicbrainz: 'MusicBrainz ID',
    theaudiodb: 'TheAudioDB ID',
    doubanmusic: t('dialog.reorganize.doubanId'),
  }
  return labels[mediaSource.value] ?? t('dialog.reorganize.mediaId')
})

// TMDB选择对话框
const mediaSelectorDialog = ref(false)

// 计算按钮图标
const icon = computed(() => (loading.value ? 'mdi-progress-download' : 'mdi-download'))

// 计算按钮文字
const buttonText = computed(() =>
  loading.value ? t('dialog.addSubtitleDownload.downloading') : t('dialog.addSubtitleDownload.startDownload'),
)

// 加载目录设置
async function loadDirectories() {
  try {
    directories.value = await listDownloadDirectories()
  } catch (error) {
    console.log(error)
  }
}

// 保存目录下拉项：Vuetify 的 title 固定为路径，别名标签只在列表项插槽里展示，避免输入框被标签污染
const targetDirectories = computed(() => buildDownloadDirectoryOptions(directories.value))

// VCombobox 选中选项时回传整个对象，这里归一为路径字符串；自由输入和追加子路径保持原样
const selectedDirectoryModel = computed({
  get: () => selectedDirectory.value,
  set: (value: string | DownloadDirectoryOption | null) => {
    selectedDirectory.value = toDownloadDirectoryValue(value)
  },
})

// 下载字幕
async function addSubtitleDownload() {
  if (!normalizedMediaId.value || !hasValidMediaIdentity.value) return

  startNProgress()
  loading.value = true
  try {
    const payload: {
      media_id: string
      media_source: MediaDataSource
      save_path: string | null
      subtitle_in: SubtitleInfo | undefined
    } = {
      subtitle_in: props.subtitle,
      save_path: selectedDirectory.value,
      media_source: mediaSource.value,
      media_id: normalizedMediaId.value,
    }

    await api.post<null>('download/subtitle', payload, { feedback: 'silent' })

    $toast.success(
      t('dialog.addSubtitleDownload.downloadSuccess', {
        site: props.subtitle?.site_name,
        title: props.subtitle?.title,
      }),
    )
    emit('done', props.subtitle?.enclosure)
  } catch (error) {
    console.error(error)
    const message = error instanceof Error ? error.message : String(error)
    $toast.error(
      t('dialog.addSubtitleDownload.downloadFailed', {
        site: props.subtitle?.site_name,
        title: props.subtitle?.title,
        message,
      }),
    )
    emit('error', message)
  }
  loading.value = false
  doneNProgress()
}

onMounted(() => {
  loadDirectories()
})
</script>

<template>
  <VDialog max-width="35rem" scrollable>
    <VCard>
      <VCardItem class="py-2">
        <template #prepend>
          <VIcon icon="mdi-subtitles-outline" class="me-2" />
        </template>
        <VCardTitle>{{ t('dialog.addSubtitleDownload.confirmDownload') }}</VCardTitle>
        <VCardSubtitle>{{ subtitle?.site_name }} - {{ title }}</VCardSubtitle>
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
              <span class="whitespace-break-spaces me-2">{{ subtitle?.title }}</span>
            </VListItemTitle>
          </VListItem>
          <VListItem v-if="subtitle?.description">
            <template #prepend>
              <VIcon icon="mdi-text-box-outline"></VIcon>
            </template>
            <VListItemTitle>
              <span class="text-body-2 whitespace-break-spaces">{{ subtitle?.description }}</span>
            </VListItemTitle>
          </VListItem>
          <VListItem v-if="subtitle?.language || subtitle?.uploader">
            <template #prepend>
              <VIcon icon="mdi-translate"></VIcon>
            </template>
            <VListItemTitle>
              <span class="text-body-2">
                {{ subtitle?.language || t('common.unknown') }}
                <span v-if="subtitle?.uploader" class="text-medium-emphasis ms-2">{{ subtitle.uploader }}</span>
              </span>
            </VListItemTitle>
          </VListItem>
          <VListItem v-if="subtitle?.size">
            <template #prepend>
              <VIcon icon="mdi-database"></VIcon>
            </template>
            <VListItemTitle>
              <VChip variant="tonal" label>
                {{ formatFileSize(subtitle?.size || 0) }}
              </VChip>
            </VListItemTitle>
          </VListItem>
        </VList>
        <VRow class="px-5">
          <VCol cols="12">
            <VCombobox
              v-model="selectedDirectoryModel"
              :items="targetDirectories"
              item-title="value"
              item-value="value"
              :custom-filter="filterDownloadDirectoryOption"
              :label="t('dialog.addSubtitleDownload.saveDirectory')"
              :placeholder="t('dialog.addSubtitleDownload.autoPlaceholder')"
              variant="underlined"
              density="comfortable"
              prepend-inner-icon="mdi-folder"
            >
              <template #item="{ props: itemProps, item }">
                <VListItem v-bind="itemProps" role="option" :title="item.raw.title" />
              </template>
            </VCombobox>
          </VCol>
        </VRow>
        <VRow class="px-5 mt-2">
          <VCol cols="12">
            <VBtn
              variant="text"
              :prepend-icon="showAdvancedOptions ? 'mdi-chevron-up' : 'mdi-chevron-down'"
              @click="showAdvancedOptions = !showAdvancedOptions"
            >
              {{
                showAdvancedOptions
                  ? t('dialog.addDownload.hideAdvancedOptions')
                  : t('dialog.addDownload.showAdvancedOptions')
              }}
            </VBtn>
          </VCol>
        </VRow>
        <VRow v-show="showAdvancedOptions" class="px-5">
          <VCol cols="12" md="5">
            <VSelect
              v-model="mediaSource"
              :items="mediaSourceItems"
              :label="t('setting.cache.reidentifyDialog.mediaSource')"
              prepend-inner-icon="mdi-database-search"
              variant="underlined"
              density="comfortable"
            />
          </VCol>
          <VCol cols="12" md="7">
            <VTextField
              v-model="selectedMediaId"
              :label="mediaIdLabel"
              :placeholder="t('dialog.reorganize.mediaIdPlaceholder')"
              :rules="[
                (value: any) => isValidMediaSourceId(value, mediaSource) || t('dialog.reorganize.mediaIdInvalid'),
              ]"
              append-inner-icon="mdi-magnify"
              :hint="t('dialog.reorganize.mediaIdHint')"
              persistent-hint
              prepend-inner-icon="mdi-identifier"
              variant="underlined"
              density="comfortable"
              @click:append-inner="mediaSelectorDialog = true"
            />
          </VCol>
        </VRow>
      </VCardText>
      <VCardText class="text-center">
        <VBtn
          variant="elevated"
          :disabled="loading || !hasValidMediaIdentity"
          @click="addSubtitleDownload"
          :prepend-icon="icon"
          class="px-5"
        >
          {{ buttonText }}
        </VBtn>
      </VCardText>
    </VCard>
    <VDialog v-model="mediaSelectorDialog" width="40rem" scrollable max-height="85vh">
      <MediaIdSelector v-model="selectedMediaId" @close="mediaSelectorDialog = false" :type="mediaSource" />
    </VDialog>
  </VDialog>
</template>
