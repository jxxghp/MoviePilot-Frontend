<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import MediaIdSelector from '../misc/MediaIdSelector.vue'
import api from '@/api'
import { transferTypeOptions } from '@/api/constants'
import { numberValidator } from '@/@validators'
import { useDisplay } from 'vuetify'
import ProgressDialog from './ProgressDialog.vue'
import { FileItem, StorageConf, TransferDirectoryConf, TransferForm } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useGlobalSettingsStore } from '@/stores'
import { useBackgroundOptimization } from '@/composables/useBackgroundOptimization'
import CryptoJS from 'crypto-js'

// 国际化
const { t } = useI18n()
const { useProgressSSE } = useBackgroundOptimization()

// 显示器宽度
const display = useDisplay()

// 输入参数
const props = defineProps({
  logids: Array<number>,
  items: Array<FileItem>,
  target_storage: String,
  target_path: String,
})

// 从 provide 中获取全局设置
// 全局设置
const globalSettingsStore = useGlobalSettingsStore()
const globalSettings = globalSettingsStore.globalSettings

// 当前识别类型
const mediaSource = ref(globalSettings.RECOGNIZE_SOURCE || 'themoviedb')

// 定义事件
const emit = defineEmits(['done', 'close'])

// 生成1到100季的下拉框选项
const seasonItems = ref(
  Array.from({ length: 101 }, (_, i) => i).map(item => ({
    title: `${t('dialog.subscribeEdit.seasonFormat', { number: item })}`,
    value: item,
  })),
)

// 提示框
const $toast = useToast()

// TMDB选择对话框
const mediaSelectorDialog = ref(false)

// 进度是否激活
const progressActive = ref(false)

// 整理进度条
const progressDialog = ref(false)

// 整理进度文本
const progressText = ref(t('dialog.reorganize.processing'))

// 整理进度
const progressValue = ref(0)

// 所有存储
const storages = ref<StorageConf[]>([])

// 查询存储
async function loadStorages() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Storages')

    storages.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 存储字典
const storageOptions = computed(() => {
  return storages.value.map(item => ({
    title: item.name,
    value: item.type,
  }))
})

// 标题
const dialogTitle = computed(() => {
  return t('dialog.reorganize.manualTitle')
})

// 副标题
const dialogSubtitle = computed(() => {
  if (props.items) {
    if (props.items.length > 1) return t('dialog.reorganize.multipleItemsTitle', { count: props.items.length })
    return t('dialog.reorganize.singleItemTitle', { path: props.items[0].path })
  } else if (props.logids) {
    return t('dialog.reorganize.multipleItemsTitle', { count: props.logids.length })
  }
})
// 禁用指定集数
const disableEpisodeDetail = computed(() => {
  if (props.items) {
    if (transferForm.episode_format) return false
    return !(props.items.length === 1 && props.items[0].type !== 'dir')
  }
})

// 表单
const transferForm = reactive<TransferForm>({
  fileitem: {} as FileItem,
  logid: 0,
  target_storage: props.target_storage ?? 'local',
  transfer_type: '',
  target_path: '',
  min_filesize: 0,
  scrape: false,
  from_history: false,
})

// 所有媒体库目录
const directories = ref<TransferDirectoryConf[]>([])

// 查询目录
async function loadDirectories() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Directories')
    directories.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 目的目录下拉框
const targetDirectories = computed(() => {
  const libraryDirectories = directories.value.map(item => item.library_path)
  return [...new Set(libraryDirectories)]
})

// 监听目的路径变化，配置默认值
watch(
  () => transferForm.target_path,
  async newPath => {
    if (newPath) {
      const directory = directories.value.find(item => item.library_path === newPath)
      if (directory) {
        transferForm.target_storage = directory.library_storage ?? 'local'
        transferForm.transfer_type = transferForm.transfer_type || directory.transfer_type
        transferForm.scrape = directory.scraping ?? false
        transferForm.library_category_folder = directory.library_category_folder ?? false
        transferForm.library_type_folder = directory.library_type_folder ?? false
      } else {
        transferForm.transfer_type = transferForm.transfer_type || 'copy'
        transferForm.scrape = false
        transferForm.library_category_folder = false
        transferForm.library_type_folder = false
      }
    } else {
      // 路径为空时, 恢复到`自动`条件
      transferForm.transfer_type = ''
      transferForm.library_type_folder = undefined
      transferForm.library_category_folder = undefined
    }
  },
)

// 整理文件
async function handleTransfer(item: FileItem, background: boolean = false) {
  transferForm.fileitem = item
  transferForm.logid = 0
  try {
    const result: { [key: string]: any } = await api.post(`transfer/manual?background=${background}`, transferForm)
    if (!result.success) $toast.error(result.message)
    else if (background) $toast.success(t('dialog.reorganize.successMessage', { name: item.name }))
  } catch (e) {
    console.log(e)
  }
}

// 整理日志
async function handleTransferLog(logid: number, background: boolean = false) {
  transferForm.logid = logid
  transferForm.fileitem = {} as FileItem
  try {
    const result: { [key: string]: any } = await api.post(`transfer/manual?background=${background}`, transferForm)
    if (!result.success) $toast.error(result.message)
    else if (background) $toast.success(`历史记录 ${logid} 已加入整理队列！`)
  } catch (e) {
    console.log(e)
  }
}

// 进度SSE消息处理函数
function handleProgressMessage(event: MessageEvent) {
  const progress = JSON.parse(event.data)
  if (progress) {
    progressText.value = progress.text
    progressValue.value = progress.value
  }
}

// 进度SSE连接
const progressSSE = ref<any>(null)

// 使用SSE监听加载进度
function startLoadingProgress(key: string) {
  progressText.value = t('dialog.reorganize.processing')
  progressActive.value = true

  // 如果已经有连接，先停止
  if (progressSSE.value) {
    progressSSE.value.stop()
  }

  // 计算MD5
  const keyMd5 = CryptoJS.MD5(key).toString()
  const url = `${import.meta.env.VITE_API_BASE_URL}system/progress/${keyMd5}`

  // 创建新的SSE连接
  progressSSE.value = useProgressSSE(url, handleProgressMessage, `reorganize-progress-${keyMd5}`, progressActive)

  progressSSE.value.start()
}

// 停止监听加载进度
function stopLoadingProgress() {
  progressActive.value = false
  if (progressSSE.value) {
    progressSSE.value.stop()
    progressSSE.value = null
  }
}

// 整理文件
async function transfer(background: boolean = false) {
  if (!props.logids && !props.items) return

  // 显示进度条
  progressDialog.value = true

  // 文件整理
  if (props.items) {
    for (const item of props.items) {
      if (!background) {
        // 开始监听进度
        startLoadingProgress(item.path)
      }
      await handleTransfer(item, background)
    }
  }

  // 日志整理
  if (props.logids) {
    for (const logid of props.logids) {
      await handleTransferLog(logid, background)
    }
  }

  if (!background) {
    // 停止监听进度
    stopLoadingProgress()
  }

  // 关闭进度条
  progressDialog.value = false
  // 重新加载
  emit('done')
}

onMounted(() => {
  loadDirectories()
  loadStorages()
})

onUnmounted(() => {
  stopLoadingProgress()
})
</script>

<template>
  <VDialog scrollable max-width="45rem" :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem class="py-2">
        <template #prepend> <VIcon icon="mdi-folder-move" class="me-2" /> </template>
        <VCardTitle>{{ dialogTitle }}</VCardTitle>
        <VCardSubtitle>{{ dialogSubtitle }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText>
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12" md="6">
              <VSelect
                v-model="transferForm.target_storage"
                :items="storageOptions"
                :label="t('dialog.reorganize.targetStorage')"
                :placeholder="t('dialog.reorganize.targetPathPlaceholder')"
                :hint="t('dialog.reorganize.targetStorageHint')"
                persistent-hint
                prepend-inner-icon="mdi-harddisk"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VSelect
                v-model="transferForm.transfer_type"
                :label="t('dialog.reorganize.transferType')"
                :items="transferTypeOptions"
                :hint="t('dialog.reorganize.transferTypeHint')"
                persistent-hint
                prepend-inner-icon="mdi-swap-horizontal"
              >
                <template v-slot:selection="{ item }">
                  {{ transferForm.transfer_type === '' ? t('dialog.reorganize.auto') : item.title }}
                </template>
              </VSelect>
            </VCol>
            <VCol cols="12">
              <VCombobox
                v-model="transferForm.target_path"
                :items="targetDirectories"
                :label="t('dialog.reorganize.targetPath')"
                :placeholder="t('dialog.reorganize.targetPathPlaceholder')"
                :hint="t('dialog.reorganize.targetPathHint')"
                persistent-hint
                prepend-inner-icon="mdi-folder-outline"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="6">
              <VSelect
                v-model="transferForm.type_name"
                :label="t('dialog.reorganize.mediaType')"
                :items="[
                  { title: t('dialog.reorganize.auto'), value: '' },
                  { title: t('dialog.reorganize.movie'), value: '电影' },
                  { title: t('dialog.reorganize.tv'), value: '电视剧' },
                ]"
                :hint="t('dialog.reorganize.mediaTypeHint')"
                persistent-hint
                prepend-inner-icon="mdi-movie-open"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-if="mediaSource === 'themoviedb'"
                v-model="transferForm.tmdbid"
                :disabled="transferForm.type_name === ''"
                :label="t('dialog.reorganize.tmdbId')"
                :placeholder="t('dialog.reorganize.mediaIdPlaceholder')"
                :rules="[numberValidator]"
                append-inner-icon="mdi-magnify"
                :hint="t('dialog.reorganize.mediaIdHint')"
                persistent-hint
                prepend-inner-icon="mdi-identifier"
                @click:append-inner="mediaSelectorDialog = true"
              />
              <VTextField
                v-else
                v-model="transferForm.doubanid"
                :disabled="transferForm.type_name === ''"
                :label="t('dialog.reorganize.doubanId')"
                :placeholder="t('dialog.reorganize.mediaIdPlaceholder')"
                :rules="[numberValidator]"
                append-inner-icon="mdi-magnify"
                :hint="t('dialog.reorganize.mediaIdHint')"
                persistent-hint
                prepend-inner-icon="mdi-identifier"
                @click:append-inner="mediaSelectorDialog = true"
              />
            </VCol>
          </VRow>
          <VRow v-show="transferForm.type_name === '电视剧'">
            <VCol cols="12" md="6">
              <VTextField
                v-model="transferForm.episode_group"
                :label="t('dialog.reorganize.episodeGroup')"
                :placeholder="t('dialog.reorganize.episodeGroupPlaceholder')"
                :hint="t('dialog.reorganize.episodeGroupHint')"
                persistent-hint
                prepend-inner-icon="mdi-view-list"
              />
            </VCol>
            <VCol cols="12" md="3">
              <VSelect
                v-model.number="transferForm.season"
                :label="t('dialog.reorganize.season')"
                :items="seasonItems"
                :hint="t('dialog.reorganize.seasonHint')"
                persistent-hint
                prepend-inner-icon="mdi-calendar"
              />
            </VCol>
            <VCol cols="12" md="3">
              <VTextField
                v-model="transferForm.episode_detail"
                :disabled="disableEpisodeDetail"
                :label="t('dialog.reorganize.episodeDetail')"
                :placeholder="t('dialog.reorganize.episodeDetailPlaceholder')"
                :hint="t('dialog.reorganize.episodeDetailHint')"
                persistent-hint
                prepend-inner-icon="mdi-playlist-play"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="transferForm.episode_format"
                :label="t('dialog.reorganize.episodeFormat')"
                :placeholder="t('dialog.reorganize.episodeFormatPlaceholder')"
                :hint="t('dialog.reorganize.episodeFormatHint')"
                persistent-hint
                prepend-inner-icon="mdi-format-text"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="transferForm.episode_offset"
                :label="t('dialog.reorganize.episodeOffset')"
                :placeholder="t('dialog.reorganize.episodeOffsetPlaceholder')"
                :hint="t('dialog.reorganize.episodeOffsetHint')"
                persistent-hint
                prepend-inner-icon="mdi-numeric"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="6">
              <VTextField
                v-model="transferForm.episode_part"
                :label="t('dialog.reorganize.episodePart')"
                :placeholder="t('dialog.reorganize.episodePartPlaceholder')"
                :hint="t('dialog.reorganize.episodePartHint')"
                persistent-hint
                prepend-inner-icon="mdi-file-multiple"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model.number="transferForm.min_filesize"
                :label="t('dialog.reorganize.minFileSize')"
                :rules="[numberValidator]"
                placeholder="0"
                :hint="t('dialog.reorganize.minFileSizeHint')"
                persistent-hint
                prepend-inner-icon="mdi-file-document-outline"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="6" v-if="transferForm.target_path">
              <VSwitch
                v-model="transferForm.library_type_folder"
                :label="t('dialog.reorganize.typeFolderOption')"
                :hint="t('dialog.reorganize.typeFolderHint')"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="6" v-if="transferForm.target_path">
              <VSwitch
                v-model="transferForm.library_category_folder"
                :label="t('dialog.reorganize.categoryFolderOption')"
                :hint="t('dialog.reorganize.categoryFolderHint')"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="6">
              <VSwitch
                v-model="transferForm.scrape"
                :label="t('dialog.reorganize.scrapeOption')"
                :hint="t('dialog.reorganize.scrapeHint')"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="6" v-if="props.logids">
              <VSwitch
                v-model="transferForm.from_history"
                :label="t('dialog.reorganize.fromHistoryOption')"
                :hint="t('dialog.reorganize.fromHistoryHint')"
                persistent-hint
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VCardActions class="pt-3">
        <VSpacer />
        <VBtn color="success" @click="transfer(true)" prepend-icon="mdi-plus" class="px-5">
          {{ t('dialog.reorganize.addToQueue') }}
        </VBtn>
        <VBtn @click="transfer(false)" prepend-icon="mdi-arrow-right-bold" class="px-5">
          {{ t('dialog.reorganize.reorganizeNow') }}
        </VBtn>
      </VCardActions>
    </VCard>
    <!-- 手动整理进度框 -->
    <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="progressText" :value="progressValue" />
    <!-- TMDB ID搜索框 -->
    <VDialog v-model="mediaSelectorDialog" width="40rem" scrollable max-height="85vh">
      <MediaIdSelector
        v-if="mediaSource === 'themoviedb'"
        v-model="transferForm.tmdbid"
        @close="mediaSelectorDialog = false"
        :type="mediaSource"
      />
      <MediaIdSelector
        v-else
        v-model="transferForm.doubanid"
        @close="mediaSelectorDialog = false"
        :type="mediaSource"
      />
    </VDialog>
  </VDialog>
</template>
