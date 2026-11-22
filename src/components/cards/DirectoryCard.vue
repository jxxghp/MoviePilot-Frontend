<script lang="ts" setup>
import type { StorageConf, TransferDirectoryConf } from '@/api/types'
import type { ClassificationCategory } from '@/api/mediaClassification'
import { manageStorage } from '@/api/manage'
import { formatClassificationCategoryOptionTitle } from '@/utils/mediaClassification'
import { nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

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

// 监控方式不决定存储位置，两端路径均可从已配置存储中选择。
const storageOptions = computed(() => {
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

/** 提取存储类型末尾的连续数字序号，避免回溯正则。 */
function extractTrailingIndex(storageType?: string): number {
  if (!storageType) return 1
  let end = storageType.length
  while (end > 0 && storageType.charCodeAt(end - 1) >= 48 && storageType.charCodeAt(end - 1) <= 57) {
    end -= 1
  }
  const digits = storageType.slice(end)
  return digits ? Number(digits) : 1
}

/** 根据自定义存储序号选取离散的强调色。 */
function getCustomStoragePaletteColor(storageType?: string) {
  const customStorageIndex = Math.max(extractTrailingIndex(storageType) - 1, 0)
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

/** 查询目录两端共同支持的整理方式，并同步当前选择。 */
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

/** 通知父页面移除当前目录卡片。 */
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
      title: formatClassificationCategoryOptionTitle(category, { pathSeparator: '/' }),
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
  if (nextCategoryId) {
    props.directory.download_category_folder = false
    props.directory.library_category_folder = false
  }
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

// 媒体类型变更时清除旧类型目录开关；旧分类路径自动关联 ID 不应改动目录布局。
watch(
  () => props.directory.media_type,
  (newMediaType, oldMediaType) => {
    if (newMediaType && newMediaType !== oldMediaType) {
      props.directory.download_type_folder = false
      props.directory.library_type_folder = false
    }
  },
)

/** 根据存储类型值返回用户可读的存储名称。 */
function getStorageName(storageType?: string): string {
  if (!storageType) return t('directory.pleaseSelectStorage')
  return props.storages.find(item => item.type === storageType)?.name || storageType
}

// 目录折叠摘要所需的展示标签：媒体范围、整理方式与启用的自动化能力。
const mediaScopeLabel = computed(() => {
  const typeLabel =
    typeItems.value.find(item => item.value === (props.directory.media_type || ''))?.title ||
    props.directory.media_type ||
    t('common.all')
  const categoryLabel = selectedCategory.value?.name || props.directory.media_category
  return categoryLabel ? `${typeLabel} · ${categoryLabel}` : typeLabel
})

const monitorModeLabel = computed(() => {
  return (
    transferSourceItems.value.find(item => item.value === (props.directory.monitor_type || ''))?.title ||
    t('directory.noTransfer')
  )
})

const transferTypeLabel = computed(() => {
  if (!props.directory.transfer_type) return ''
  return (
    transferTypeItems.value.find(item => item.value === props.directory.transfer_type)?.title ||
    props.directory.transfer_type
  )
})

const featureBadges = computed(() => {
  if (!props.directory.monitor_type) return []
  const items: Array<{ key: string; icon: string; title: string }> = []
  if (props.directory.renaming) {
    items.push({ key: 'renaming', icon: 'mdi-rename-box', title: t('directory.smartRename') })
  }
  if (props.directory.scraping) {
    items.push({ key: 'scraping', icon: 'mdi-image-outline', title: t('directory.scrapingMetadata') })
  }
  if (props.directory.notify) {
    items.push({ key: 'notify', icon: 'mdi-bell-outline', title: t('directory.sendNotification') })
  }
  return items
})

const sourceStorageLabel = computed(() => getStorageName(props.directory.storage))
const targetStorageLabel = computed(() => getStorageName(props.directory.library_storage))

/** 切换目录卡片展开与折叠状态。 */
function toggleCollapsed() {
  isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <VCard
    variant="flat"
    class="app-card-shell app-card-colorful mp-setting-card mp-dir-card"
    :class="{ 'mp-setting-card--interactive': isCollapsed }"
    :style="directoryAccentStyle"
    :width="props.width"
    :height="props.height"
  >
    <div class="mp-setting-card__header mp-dir-card__header" @click="isCollapsed ? toggleCollapsed() : undefined">
      <div class="mp-setting-card__icon mp-setting-card__icon--tinted" aria-hidden="true">
        <VIcon :icon="props.directory.monitor_type ? 'mdi-folder-move-outline' : 'mdi-folder-outline'" size="22" />
      </div>
      <div class="mp-setting-card__heading">
        <div class="mp-setting-card__title-row">
          <span class="mp-setting-card__title" :title="props.directory.name || t('settingCard.unnamedDirectory')">
            {{ props.directory.name || t('settingCard.unnamedDirectory') }}
          </span>
          <span
            v-if="categoryDiagnostic"
            class="mp-setting-card__badge"
            :class="
              categoryDiagnostic.type === 'error' ? 'mp-setting-card__badge--error' : 'mp-setting-card__badge--warning'
            "
            :title="categoryDiagnostic.message"
          >
            <VIcon icon="mdi-alert-circle-outline" size="12" />
          </span>
        </div>
        <div class="mp-setting-card__subtitle">
          <span class="mp-setting-card__badge mp-setting-card__badge--accent">{{ mediaScopeLabel }}</span>
          <span
            class="mp-setting-card__badge"
            :class="props.directory.monitor_type ? 'mp-setting-card__badge--primary' : 'mp-setting-card__badge--muted'"
          >
            {{ monitorModeLabel }}
          </span>
        </div>
      </div>
      <div class="mp-setting-card__actions">
        <IconBtn class="mp-setting-card__action cursor-move" :aria-label="t('settingCard.dragSort')" @click.stop>
          <VIcon class="cursor-move" icon="mdi-drag" />
        </IconBtn>
        <IconBtn
          data-testid="directory-card-toggle"
          class="mp-setting-card__action"
          :aria-label="isCollapsed ? t('settingCard.expand') : t('settingCard.collapse')"
          @click.stop="toggleCollapsed"
        >
          <VIcon :icon="isCollapsed ? 'mdi-chevron-down' : 'mdi-chevron-up'" />
        </IconBtn>
        <VDialogCloseBtn inner-class="mp-setting-card__action mp-setting-card__action--danger" @click="onClose" />
      </div>
    </div>

    <!-- 折叠态展示下载存储到媒体库存储的路径流向与关键整理能力，无需展开即可核对配置。 -->
    <div v-if="isCollapsed" class="mp-dir-card__summary" @click="toggleCollapsed">
      <div class="mp-dir-route">
        <div class="mp-dir-route__row">
          <span class="mp-dir-route__storage">{{ sourceStorageLabel }}</span>
          <span
            class="mp-dir-route__path"
            :class="{ 'mp-dir-route__path--empty': !props.directory.download_path }"
            :title="props.directory.download_path || t('settingCard.unsetPath')"
          >
            {{ props.directory.download_path || t('settingCard.unsetPath') }}
          </span>
        </div>
        <template v-if="props.directory.monitor_type">
          <div class="mp-dir-route__connector" aria-hidden="true">
            <VIcon icon="mdi-arrow-down" size="13" />
          </div>
          <div class="mp-dir-route__row">
            <span class="mp-dir-route__storage">{{ targetStorageLabel }}</span>
            <span
              class="mp-dir-route__path"
              :class="{ 'mp-dir-route__path--empty': !props.directory.library_path }"
              :title="props.directory.library_path || t('settingCard.unsetPath')"
            >
              {{ props.directory.library_path || t('settingCard.unsetPath') }}
            </span>
          </div>
        </template>
      </div>
    </div>

    <div v-if="isCollapsed" class="mp-setting-card__dock" @click="toggleCollapsed">
      <div class="mp-setting-card__chips">
        <span v-if="transferTypeLabel" class="mp-setting-card__chip">
          <VIcon icon="mdi-swap-horizontal" size="12" class="shrink-0" />
          <span>{{ transferTypeLabel }}</span>
        </span>
        <span
          v-for="badge in featureBadges"
          :key="badge.key"
          class="mp-setting-card__chip mp-dir-card__feature-chip"
          :title="badge.title"
        >
          <VIcon :icon="badge.icon" size="13" />
        </span>
        <span v-if="!transferTypeLabel && featureBadges.length === 0" class="mp-setting-card__muted">
          {{ monitorModeLabel }}
        </span>
      </div>
      <span class="mp-dir-card__expand-hint">
        {{ t('settingCard.expand') }}
        <VIcon class="mp-setting-card__chevron" icon="mdi-chevron-right" size="15" />
      </span>
    </div>

    <!-- 展开态分区编辑目录别名、源目录与目标媒体库设置。 -->
    <VCardText v-if="!isCollapsed" class="mp-dir-card__body">
      <VForm>
        <VRow dense>
          <VCol cols="12">
            <VTextField
              v-model="props.directory.name"
              variant="underlined"
              :label="t('directory.alias')"
              mobile-control-width="65%"
              class="text-high-emphasis font-weight-bold"
            />
          </VCol>
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
        </VRow>

        <div class="mp-dir-section">
          <div class="mp-dir-section__title">
            <VIcon icon="mdi-folder-outline" size="15" />
            <span>{{ t('settingCard.sourceSection') }}</span>
          </div>
          <VRow dense>
            <VCol cols="4">
              <VAutocomplete
                v-model="props.directory.storage"
                variant="underlined"
                :items="storageOptions"
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
              />
            </VCol>
            <VCol cols="6" v-if="!props.directory.media_category_id && !props.directory.media_category">
              <VSwitch
                v-model="props.directory.download_category_folder"
                :label="t('directory.sortByCategory')"
                mobile-control-width="65%"
              />
            </VCol>
          </VRow>
        </div>

        <div class="mp-dir-section">
          <div class="mp-dir-section__title">
            <VIcon icon="mdi-folder-play-outline" size="15" />
            <span>{{ t('settingCard.targetSection') }}</span>
          </div>
          <VRow dense>
            <VCol cols="12">
              <VSelect
                v-model="props.directory.monitor_type"
                variant="underlined"
                :items="transferSourceItems"
                :label="t('directory.autoTransfer')"
                mobile-control-width="65%"
              />
            </VCol>
          </VRow>
          <VRow v-if="props.directory.monitor_type" dense>
            <VCol cols="12" v-if="props.directory.monitor_type == 'monitor'">
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
                :items="storageOptions"
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
              />
            </VCol>
            <VCol cols="6">
              <VSwitch
                v-model="props.directory.library_category_folder"
                :label="t('directory.sortByCategory')"
                mobile-control-width="65%"
              />
            </VCol>
            <VCol cols="6">
              <VSwitch
                v-model="props.directory.renaming"
                :label="t('directory.smartRename')"
                mobile-control-width="65%"
              />
            </VCol>
            <VCol cols="6">
              <VSwitch
                v-model="props.directory.scraping"
                :label="t('directory.scrapingMetadata')"
                mobile-control-width="65%"
              />
            </VCol>
            <VCol cols="6">
              <VSwitch
                v-model="props.directory.notify"
                :label="t('directory.sendNotification')"
                mobile-control-width="65%"
              />
            </VCol>
          </VRow>
        </div>
      </VForm>
    </VCardText>

    <button v-if="!isCollapsed" type="button" class="mp-dir-card__collapse-bar" @click.stop="toggleCollapsed">
      <VIcon icon="mdi-chevron-up" size="16" />
      <span>{{ t('settingCard.collapse') }}</span>
    </button>
  </VCard>
</template>

<style scoped>
/* 目录卡片可独立展开，不能继承 app-card-shell 的 100% 拉伸高度，避免同行折叠卡片被拉长留白。 */
.mp-dir-card {
  block-size: auto !important;
}

.mp-dir-card__header {
  flex: 0 0 auto;
  padding-block-end: 0.625rem;
}

.mp-dir-card__summary {
  padding-block: 0 0.75rem;
  padding-inline: 0.9375rem;
}

.mp-dir-route {
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--mp-border-subtle, rgba(128, 128, 128, 0.08));
  border-radius: 10px;
  background: var(--app-card-chip-bg);
  gap: 0.25rem;
}

.mp-dir-route__row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-inline-size: 0;
}

.mp-dir-route__storage {
  flex: 0 0 auto;
  border: 1px solid var(--app-card-chip-border);
  border-radius: 5px;
  background: var(--app-card-icon-bg);
  color: var(--mp-fg, rgb(var(--v-theme-on-surface)));
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.25;
  padding-block: 0.0625rem;
  padding-inline: 0.375rem;
  white-space: nowrap;
}

.mp-dir-route__path {
  overflow: hidden;
  flex: 1 1 auto;
  color: var(--mp-muted-fg, rgba(var(--v-theme-on-surface), 0.78));
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
  line-height: 1.3;
  min-inline-size: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-dir-route__path--empty {
  font-family: inherit;
  opacity: 0.58;
}

.mp-dir-route__connector {
  display: inline-flex;
  align-items: center;
  color: rgba(var(--app-card-accent-rgb), 0.75);
  padding-inline-start: 0.25rem;
}

.mp-dir-card__feature-chip {
  padding-inline: 0.3125rem;
}

.mp-dir-card__expand-hint {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  color: var(--mp-muted-fg, rgba(var(--v-theme-on-surface), 0.58));
  font-size: 0.75rem;
  font-weight: 500;
  gap: 0.125rem;
  white-space: nowrap;
}

.mp-dir-card__body {
  border-block-start: 1px solid var(--mp-border-subtle, rgba(128, 128, 128, 0.08));
  padding-block: 0.75rem 0.875rem;
  padding-inline: 0.9375rem;
}

.mp-dir-section {
  border-block-start: 1px solid var(--mp-border-subtle, rgba(128, 128, 128, 0.08));
  margin-block-start: 0.625rem;
  padding-block-start: 0.75rem;
}

.mp-dir-section__title {
  display: flex;
  align-items: center;
  color: var(--mp-muted-fg, rgba(var(--v-theme-on-surface), 0.7));
  font-size: 0.75rem;
  font-weight: 600;
  gap: 0.375rem;
  margin-block-end: 0.375rem;
}

.mp-dir-card__collapse-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: var(--app-card-dock-bg);
  block-size: 2.25rem;
  border-block-start: 1px solid var(--mp-border-subtle, rgba(128, 128, 128, 0.08));
  color: var(--mp-muted-fg, rgba(var(--v-theme-on-surface), 0.72));
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 500;
  gap: 0.25rem;
  inline-size: 100%;
  transition:
    background-color 0.16s ease,
    color 0.16s ease;
}

.mp-dir-card__collapse-bar:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: var(--mp-fg, rgb(var(--v-theme-on-surface)));
}

:deep(.app-responsive-input) {
  min-block-size: 3rem;
  padding-block: 0.375rem;
}
</style>
