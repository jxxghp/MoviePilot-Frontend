<script setup lang="ts">
import { useToast } from 'vue-toastification'
import api from '@/api'
import { doneNProgress, startNProgress } from '@/api/nprogress'
import type { SubtitleInfo, TransferDirectoryConf } from '@/api/types'
import { formatFileSize } from '@/@core/utils/formatters'
import { useI18n } from 'vue-i18n'
import MediaIdSelector from '../misc/MediaIdSelector.vue'
import { numberValidator } from '@/@validators'
import { useGlobalSettingsStore } from '@/stores'

// 多语言支持
const { t } = useI18n()

// 从 provide 中获取全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 当前识别类型
const mediaSource = ref(globalSettings.RECOGNIZE_SOURCE || 'themoviedb')

// 输入参数
const props = defineProps({
  title: String,
  subtitle: Object as PropType<SubtitleInfo>,
})

// 定义成功和失败事件
const emit = defineEmits(['done', 'error', 'close'])

// 提示框
const $toast = useToast()

// 选择的保存目录
const selectedDirectory = ref<string | null>(null)

// 所有目录设置
const directories = ref<TransferDirectoryConf[]>([])

// 是否正在加载
const loading = ref(false)

// 是否显示高级选项
const showAdvancedOptions = ref(false)

// TMDB ID
const tmdbid = ref<number | undefined>(undefined)

// 豆瓣ID
const doubanId = ref<string | undefined>(undefined)

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
    const result: { [key: string]: any } = await api.get('system/setting/public/Directories')
    directories.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

function convertToUri(item: TransferDirectoryConf) {
  if (!item.download_path) {
    return undefined
  }
  if (item.storage === 'local') {
    return item.download_path
  }
  return item.storage + ':' + item.download_path
}

// 获取保存目录
const targetDirectories = computed(() => {
  const downloadDirectories = directories.value
    .map(item => convertToUri(item))
    .filter((item): item is string => item !== undefined)
  return [...new Set(downloadDirectories)]
})

// 下载字幕
async function addSubtitleDownload() {
  startNProgress()
  loading.value = true
  try {
    const payload: any = {
      subtitle_in: props.subtitle,
      save_path: selectedDirectory.value,
    }

    if (tmdbid.value) {
      payload.tmdbid = tmdbid.value
    }
    if (doubanId.value) {
      payload.doubanid = doubanId.value
    }

    const result: { [key: string]: any } = await api.post('download/subtitle', payload)

    if (result && result.success) {
      $toast.success(
        t('dialog.addSubtitleDownload.downloadSuccess', {
          site: props.subtitle?.site_name,
          title: props.subtitle?.title,
        }),
      )
      emit('done', props.subtitle?.enclosure)
    } else {
      $toast.error(
        t('dialog.addSubtitleDownload.downloadFailed', {
          site: props.subtitle?.site_name,
          title: props.subtitle?.title,
          message: result?.message,
        }),
      )
      emit('error', result?.message)
    }
  } catch (error) {
    console.error(error)
    emit('error', String(error))
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
              v-model="selectedDirectory"
              :items="targetDirectories"
              :label="t('dialog.addSubtitleDownload.saveDirectory')"
              :placeholder="t('dialog.addSubtitleDownload.autoPlaceholder')"
              variant="underlined"
              density="comfortable"
              prepend-inner-icon="mdi-folder"
            />
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
          <VCol cols="12">
            <VTextField
              v-if="mediaSource === 'themoviedb'"
              v-model="tmdbid"
              :label="t('dialog.reorganize.tmdbId')"
              :placeholder="t('dialog.reorganize.mediaIdPlaceholder')"
              :rules="[numberValidator]"
              append-inner-icon="mdi-magnify"
              :hint="t('dialog.reorganize.mediaIdHint')"
              persistent-hint
              prepend-inner-icon="mdi-identifier"
              variant="underlined"
              density="comfortable"
              @click:append-inner="mediaSelectorDialog = true"
            />
            <VTextField
              v-else
              v-model="doubanId"
              :label="t('dialog.reorganize.doubanId')"
              :placeholder="t('dialog.reorganize.mediaIdPlaceholder')"
              :rules="[numberValidator]"
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
        <VBtn variant="elevated" :disabled="loading" @click="addSubtitleDownload" :prepend-icon="icon" class="px-5">
          {{ buttonText }}
        </VBtn>
      </VCardText>
    </VCard>
    <VDialog v-model="mediaSelectorDialog" width="40rem" scrollable max-height="85vh">
      <MediaIdSelector
        v-if="mediaSource === 'themoviedb'"
        v-model="tmdbid"
        @close="mediaSelectorDialog = false"
        :type="mediaSource"
      />
      <MediaIdSelector v-else v-model="doubanId" @close="mediaSelectorDialog = false" :type="mediaSource" />
    </VDialog>
  </VDialog>
</template>
