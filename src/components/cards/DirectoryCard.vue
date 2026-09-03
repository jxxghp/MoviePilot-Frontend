<script lang="ts" setup>
import type { StorageConf, TransferDirectoryConf } from '@/api/types'
import type { ClassificationCategory } from '@/api/mediaClassification'
import { manageStorage } from '@/api/manage'
import { nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { storageRemoteDict } from '@/api/constants'

const DEFAULT_DIRECTORY_ACCENT_RGB = '141, 81, 249'
const STORAGE_ACCENT_COLOR_MAP = {
  local: '#FFB400',
  alipan: '#00A7F2',
  u115: '#17B26A',
  rclone: '#6675FF',
  alist: '#12B8D7',
  alistgo: '#1BA0D8',
  smb: '#3B82F6',
}

// 国际化
const { t } = useI18n()
const downloadAccentRgb = ref(DEFAULT_DIRECTORY_ACCENT_RGB)
const libraryAccentRgb = ref(DEFAULT_DIRECTORY_ACCENT_RGB)

// 输入参数
const props = defineProps({
  type: String, // download/library
  directory: {
    type: Object as PropType<TransferDirectoryConf>,
    required: true, // 必填参数
  },
  categories: {
    type: Array as PropType<readonly ClassificationCategory[]>,
    default: () => [],
  },
  storages: {
    type: Array as PropType<StorageConf[]>,
    required: true,
  },
  width: String,
  height: String,
})

// 卡版是否折叠状态
const isCollapsed = ref(true)

// 类型下拉字典
const typeItems = computed(() => [
  { title: t('common.all'), value: '' },
  { title: t('mediaType.movie'), value: '电影' },
  { title: t('mediaType.tv'), value: '电视剧' },
  { title: t('mediaType.music'), value: '音乐' },
])

// 计算资源存储字典（整理方式为下载器时不能为远程存储）
const resourceStorageOptions = computed(() => {
  return props.storages
    .filter(item => !storageRemoteDict[item.type] || props.directory.monitor_type !== 'downloader')
    .map(item => ({
      title: item.name,
      value: item.type,
    }))
})

// 存储字典
const libraryStorageOptions = computed(() => {
  return props.storages.map(item => ({
    title: item.name,
    value: item.type,
  }))
})

// 自动整理方式下拉字典
const transferSourceItems = computed(() => [
  { title: t('directory.noTransfer'), value: '' },
  { title: t('directory.downloaderMonitor'), value: 'downloader' },
  { title: t('directory.directoryMonitor'), value: 'monitor' },
  { title: t('directory.manualTransfer'), value: 'manual' },
])

/** 判断存储类型是否具备预设强调色。 */
function hasKnownStorageType(storageType?: string): storageType is keyof typeof STORAGE_ACCENT_COLOR_MAP {
  return !!storageType && Object.prototype.hasOwnProperty.call(STORAGE_ACCENT_COLOR_MAP, storageType)
}

/** 将十六进制颜色转换为 CSS RGB 通道字符串。 */
function hexToRgbString(hexColor: string) {
  const normalizedColor = hexColor.replace('#', '')
  const colorValue = Number.parseInt(normalizedColor, 16)

  if (Number.isNaN(colorValue) || normalizedColor.length !== 6) return DEFAULT_DIRECTORY_ACCENT_RGB

  return `${(colorValue >> 16) & 255}, ${(colorValue >> 8) & 255}, ${colorValue & 255}`
}

/** 根据自定义存储序号选取离散的强调色。 */
function getCustomStoragePaletteColor(storageType?: string) {
  const customStorageIndex = Math.max(Number(storageType?.match(/\d+$/)?.[0] ?? 1) - 1, 0)
  const customStorageColors = ['#F97316', '#8B5CF6', '#06B6D4', '#84CC16', '#EC4899', '#14B8A6']

  return customStorageColors[customStorageIndex % customStorageColors.length]
}

/** 获取指定存储类型在目录卡片中使用的强调色。 */
function getStorageAccentColor(storageType?: string) {
  if (hasKnownStorageType(storageType)) return STORAGE_ACCENT_COLOR_MAP[storageType]

  // 自定义存储没有固定品牌图标，使用离散调色板，保证连续 custom1/custom2 也能明显区分。
  return getCustomStoragePaletteColor(storageType)
}

// 目录卡片用下载存储和媒体库存储两端的图标主色生成轻渐变，体现整理链路的两个存储端点。
const directoryAccentStyle = computed(() => ({
  '--app-card-accent-rgb': downloadAccentRgb.value,
  '--app-card-accent-end-rgb': libraryAccentRgb.value,
}))

/** 根据目录两端的存储类型刷新卡片强调色。 */
function updateDirectoryAccentColors() {
  const downloadStorage = props.directory.storage
  const libraryStorage = props.directory.library_storage || props.directory.storage

  downloadAccentRgb.value = hexToRgbString(getStorageAccentColor(downloadStorage))
  libraryAccentRgb.value = hexToRgbString(getStorageAccentColor(libraryStorage))
}

// 监控模式下拉字典
const MonitorModeItems = computed(() => [
  { title: t('directory.performanceMode'), value: 'fast' },
  { title: t('directory.compatibilityMode'), value: 'compatibility' },
])

// 整理方式下拉字典
const transferTypeItems = ref<{ title: string; value: string }[]>([])

// 调用API查询支持的整理方式
async function loadTransferTypeItems() {
  // 参数不全时不查询
  if (!props.directory.library_storage || !props.directory.storage) return
  try {
    // 下载器储存整理方法
    const storage_res = await manageStorage<{ transtype?: Record<string, string> }>(
      props.directory.storage,
      'support_transtype',
    )
    const storage_transtype = storage_res?.transtype
    // 媒体库储存整理方法
    const library_storage_res = await manageStorage<{ transtype?: Record<string, string> }>(
      props.directory.library_storage,
      'support_transtype',
    )
    const library_storage_transtype = library_storage_res?.transtype
    // 为空终止
    if (!library_storage_transtype || !storage_transtype) return
    // 取并集
    const transtype: { [key: string]: string } = {}
    Object.keys(storage_transtype).forEach(key => {
      if (key in library_storage_transtype) {
        transtype[key] = storage_transtype[key]
      }
    })
    // 非空时设置整理方式下拉字典
    if (transtype && Object.keys(transtype).length > 0) {
      transferTypeItems.value = Object.keys(transtype).map(key => ({
        title: transtype[key],
        value: key,
      }))
      // 如果整理方式下拉字典不为空，且当前值不在新的transferTypeItems里，则设置整理方式为第一个
      if (
        transferTypeItems.value.length > 0 &&
        !transferTypeItems.value.find(item => item.value === props.directory.transfer_type)
      ) {
        nextTick(() => {
          props.directory.transfer_type = transferTypeItems.value[0].value
        })
      }
      // 如果整理方式下拉字典为空，清空整理方式
      if (transferTypeItems.value.length === 0) {
        props.directory.transfer_type = ''
      }
    } else {
      // 无可用整理方式，清除已选值
      transferTypeItems.value = []
      props.directory.transfer_type = ''
    }
  } catch (e) {
    console.log(e)
  }
}

// 整理方式无数据提示
const computedNoDataText = computed(() => {
  if (!props.directory.library_storage && !props.directory.storage) {
    return t('directory.pleaseSelectStorage')
  } else if (!props.directory.library_storage) {
    return t('directory.pleaseSelectLibraryStorage')
  } else if (!props.directory.storage) {
    return t('directory.pleaseSelectDownloadStorage')
  } else {
    return t('directory.noSupportedTransferType')
  }
})

// 覆盖模式下拉字典
const overwriteModeItems = computed(() => [
  { title: t('directory.never'), value: 'never' },
  { title: t('directory.always'), value: 'always' },
  { title: t('directory.byFileSize'), value: 'size' },
  { title: t('directory.keepLatestOnly'), value: 'latest' },
])

// 定义触发的自定义事件
const emit = defineEmits(['close', 'changed', 'update:modelValue'])

// 按钮点击
function onClose() {
  emit('close')
}

/** 返回分类的服务端规范路径文本。 */
function categoryPath(category: ClassificationCategory): string {
  return category.path.join('/')
}

// 目录只能选择当前媒体类型下仍启用的稳定分类。
const categoryItems = computed(() => [
  { title: t('common.all'), value: '' },
  ...props.categories
    .filter(category => category.enabled && category.media_type === props.directory.media_type)
    .map(category => ({
      title: `${category.name} · ${categoryPath(category)} · ${category.id}`,
      value: category.id,
    })),
])

const selectedCategory = computed(() => {
  const categoryId = props.directory.media_category_id?.trim()
  if (!categoryId) return undefined
  return props.categories.find(category => category.id === categoryId)
})

const legacyCategoryMatches = computed(() => {
  if (props.directory.media_category_id || !props.directory.media_category || !props.directory.media_type) return []
  return props.categories.filter(
    category =>
      category.media_type === props.directory.media_type && categoryPath(category) === props.directory.media_category,
  )
})

// 无法自动迁移的旧路径保留原值；稳定 ID 的失效状态则必须显式修复。
const categoryDiagnostic = computed(() => {
  const categoryId = props.directory.media_category_id?.trim()
  if (categoryId) {
    if (!selectedCategory.value) {
      return {
        type: 'error' as const,
        message: t('setting.directory.classification.categoryMissing', { id: categoryId }),
      }
    }
    if (!selectedCategory.value.enabled) {
      return {
        type: 'error' as const,
        message: t('setting.directory.classification.categoryDisabled', { id: categoryId }),
      }
    }
    if (!props.directory.media_type || selectedCategory.value.media_type !== props.directory.media_type) {
      return {
        type: 'error' as const,
        message: t('setting.directory.classification.mediaTypeMismatch', {
          categoryType: selectedCategory.value.media_type,
          directoryType: props.directory.media_type || t('common.all'),
        }),
      }
    }
    return null
  }

  if (!props.directory.media_category) return null
  if (legacyCategoryMatches.value.length > 1) {
    return {
      type: 'warning' as const,
      message: t('setting.directory.classification.legacyAmbiguous', { path: props.directory.media_category }),
    }
  }
  if (legacyCategoryMatches.value.length === 0) {
    return {
      type: 'warning' as const,
      message: t('setting.directory.classification.legacyUnresolved', { path: props.directory.media_category }),
    }
  }
  return null
})

/** 切换媒体类型时清除不再具备类型语义的稳定 ID 和路径快照。 */
function onMediaTypeChanged(value: string | null): void {
  // 该卡片沿用现有约定，直接维护父页面传入的目录草稿。
  // eslint-disable-next-line vue/no-mutating-props
  props.directory.media_type = value ?? ''
  props.directory.media_category_id = null
  props.directory.media_category = ''
}

/** 更新稳定分类选择；路径快照等待保存后的服务端规范化回读。 */
function onMediaCategoryChanged(value: string | null): void {
  const nextCategoryId = value?.trim() || null
  if (nextCategoryId === (props.directory.media_category_id?.trim() || null)) return
  // eslint-disable-next-line vue/no-mutating-props
  props.directory.media_category_id = nextCategoryId
  props.directory.media_category = ''
}

// 旧路径只按同媒体类型的完整规范路径唯一精确匹配，不进行名称、末级或模糊推断。
watch(
  [
    () => props.directory.media_category_id,
    () => props.directory.media_category,
    () => props.directory.media_type,
    () => props.categories,
  ],
  () => {
    if (props.directory.media_category_id || legacyCategoryMatches.value.length !== 1) return
    // eslint-disable-next-line vue/no-mutating-props
    props.directory.media_category_id = legacyCategoryMatches.value[0].id
  },
  { immediate: true, deep: true },
)

// 监听 资源存储与媒体库储存 变化，重新加载整理方式下拉字典
watch(
  [() => props.directory.library_storage, () => props.directory.storage],
  ([newLibraryStorage, newStorage], [oldLibraryStorage, oldStorage]) => {
    if (newLibraryStorage !== oldLibraryStorage || newStorage !== oldStorage) {
      loadTransferTypeItems()
    }
  },
  { immediate: true },
)

// 存储类型切换后主动重新提取图标色，避免图片缓存导致 load 事件不触发。
watch(
  [() => props.directory.storage, () => props.directory.library_storage],
  () => {
    updateDirectoryAccentColors()
  },
  { immediate: true },
)

// 媒体类别和类型变更非空时，将按类型分类和按类别分类置为false
watch(
  [() => props.directory.media_type, () => props.directory.media_category_id],
  ([newMediaType, newMediaCategoryId], [oldMediaType, oldMediaCategoryId]) => {
    if (newMediaType && newMediaType !== oldMediaType) {
      props.directory.download_type_folder = false
      props.directory.library_type_folder = false
    }
    if (newMediaCategoryId && newMediaCategoryId !== oldMediaCategoryId) {
      props.directory.download_category_folder = false
      props.directory.library_category_folder = false
    }
  },
)

// 监听monitor_type变化，如果为downloader则设置为本地
watch(
  () => props.directory.monitor_type,
  newMonitorType => {
    if (newMonitorType === 'downloader') {
      props.directory.storage = 'local'
    }
  },
)
</script>

<template>
  <VCard
    variant="tonal"
    class="app-card-shell app-card-colorful"
    :style="directoryAccentStyle"
    :width="props.width"
    :height="props.height"
  >
    <VDialogCloseBtn @click="onClose" />
    <VCardItem>
      <VTextField
        v-model="props.directory.name"
        variant="underlined"
        :label="t('directory.alias')"
        mobile-control-width="65%"
        class="me-20 text-high-emphasis font-weight-bold"
      />
      <span class="app-card-top-action absolute top-3 right-12">
        <IconBtn @click.stop>
          <VIcon class="cursor-move" icon="mdi-drag" />
        </IconBtn>
      </span>
    </VCardItem>
    <VCardText v-if="!isCollapsed">
      <VForm>
        <VRow>
          <VCol cols="12" sm="6">
            <VAutocomplete
              :model-value="props.directory.media_type"
              variant="underlined"
              :items="typeItems"
              :label="t('directory.mediaType')"
              mobile-control-width="65%"
              @update:model-value="onMediaTypeChanged"
            />
          </VCol>
          <VCol cols="12" sm="6">
            <VAutocomplete
              data-testid="directory-category-select"
              :model-value="props.directory.media_category_id || ''"
              variant="underlined"
              :items="categoryItems"
              :label="t('setting.directory.classification.categoryLabel')"
              mobile-control-width="65%"
              @update:model-value="onMediaCategoryChanged"
            />
          </VCol>
          <VCol cols="12">
            <VTextField
              data-testid="directory-category-path"
              :model-value="props.directory.media_category || ''"
              variant="underlined"
              :label="t('setting.directory.classification.snapshotLabel')"
              :hint="
                props.directory.media_category_id && !props.directory.media_category
                  ? t('setting.directory.classification.snapshotPending')
                  : undefined
              "
              persistent-hint
              readonly
            />
            <VAlert
              v-if="categoryDiagnostic"
              data-testid="directory-category-diagnostic"
              :type="categoryDiagnostic.type"
              variant="tonal"
              density="compact"
              class="mt-2"
            >
              {{ categoryDiagnostic.message }}
            </VAlert>
          </VCol>
          <VCol cols="4">
            <VAutocomplete
              v-model="props.directory.storage"
              variant="underlined"
              :items="resourceStorageOptions"
              :label="t('directory.resourceStorage')"
              mobile-control-width="65%"
            />
          </VCol>
          <VCol cols="8">
            <VPathField
              v-model="props.directory.download_path"
              :storage="props.directory.storage"
              variant="underlined"
              :label="t('directory.resourceDirectory')"
              mobile-control-width="65%"
            />
          </VCol>
          <VCol cols="6" v-if="!props.directory.media_type || props.directory.media_type === ''">
            <VSwitch
              v-model="props.directory.download_type_folder"
              :label="t('directory.sortByType')"
              mobile-control-width="65%"
            ></VSwitch>
          </VCol>
          <VCol cols="6" v-if="!props.directory.media_category || props.directory.media_category === ''">
            <VSwitch
              v-model="props.directory.download_category_folder"
              :label="t('directory.sortByCategory')"
              mobile-control-width="65%"
            ></VSwitch>
          </VCol>
        </VRow>
        <VDivider v-if="$props.directory.monitor_type" class="my-3 bg-primary" />
        <VRow>
          <VCol>
            <VSelect
              v-model="props.directory.monitor_type"
              variant="underlined"
              :items="transferSourceItems"
              :label="t('directory.autoTransfer')"
              mobile-control-width="65%"
            />
          </VCol>
        </VRow>
        <VRow v-if="$props.directory.monitor_type">
          <VCol cols="12" v-if="$props.directory.monitor_type == 'monitor'">
            <VSelect
              v-model="props.directory.monitor_mode"
              variant="underlined"
              :items="MonitorModeItems"
              :label="t('directory.monitorMode')"
              mobile-control-width="65%"
            />
          </VCol>
          <VCol cols="4">
            <VAutocomplete
              v-model="props.directory.library_storage"
              variant="underlined"
              :items="libraryStorageOptions"
              :label="t('directory.libraryStorage')"
              mobile-control-width="65%"
            />
          </VCol>
          <VCol cols="8">
            <VPathField
              v-model="props.directory.library_path"
              :storage="props.directory.library_storage"
              variant="underlined"
              :label="t('directory.libraryDirectory')"
              mobile-control-width="65%"
            />
          </VCol>
          <VCol cols="4">
            <VSelect
              v-model="props.directory.transfer_type"
              variant="underlined"
              :items="transferTypeItems"
              :label="t('directory.transferType')"
              :no-data-text="computedNoDataText"
              mobile-control-width="65%"
            />
          </VCol>
          <VCol cols="8">
            <VSelect
              v-model="props.directory.overwrite_mode"
              variant="underlined"
              :items="overwriteModeItems"
              :label="t('directory.overwriteMode')"
              mobile-control-width="65%"
            />
          </VCol>
          <VCol cols="6" v-if="!props.directory.media_type || props.directory.media_type === ''">
            <VSwitch
              v-model="props.directory.library_type_folder"
              :label="t('directory.sortByType')"
              mobile-control-width="65%"
            ></VSwitch>
          </VCol>
          <VCol cols="6" v-if="!props.directory.media_category || props.directory.media_category === ''">
            <VSwitch
              v-model="props.directory.library_category_folder"
              :label="t('directory.sortByCategory')"
              mobile-control-width="65%"
            ></VSwitch>
          </VCol>
          <VCol cols="6">
            <VSwitch
              v-model="props.directory.renaming"
              :label="t('directory.smartRename')"
              mobile-control-width="65%"
            ></VSwitch>
          </VCol>
          <VCol cols="6">
            <VSwitch
              v-model="props.directory.scraping"
              :label="t('directory.scrapingMetadata')"
              mobile-control-width="65%"
            ></VSwitch>
          </VCol>
          <VCol cols="6">
            <VSwitch
              v-model="props.directory.notify"
              :label="t('directory.sendNotification')"
              mobile-control-width="65%"
            ></VSwitch>
          </VCol>
        </VRow>
      </VForm>
    </VCardText>
    <VCardActions class="text-center py-0">
      <VSpacer />
      <VBtn
        data-testid="directory-card-toggle"
        :icon="isCollapsed ? 'mdi-chevron-down' : 'mdi-chevron-up'"
        @click.stop="isCollapsed = !isCollapsed"
      />
      <VSpacer />
    </VCardActions>
  </VCard>
</template>

<style scoped>
:deep(.app-responsive-input) {
  min-block-size: 3rem;
  padding-block: 0.375rem;
}
</style>
