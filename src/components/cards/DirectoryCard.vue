<script lang="ts" setup>
import type { StorageConf, TransferDirectoryConf } from '@/api/types'
import api from '@/api'
import { nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { storageRemoteDict } from '@/api/constants'
import { getCardAccentRgbFromImage } from '@/composables/useCardAccentColor'
import storage_png from '@images/misc/storage.png'
import alipan_png from '@images/misc/alipan.webp'
import u115_png from '@images/misc/u115.png'
import rclone_png from '@images/misc/rclone.png'
import alist_png from '@images/misc/openlist.svg'
import smb_png from '@images/misc/smb.png'

const DEFAULT_DIRECTORY_ACCENT_RGB = '145, 85, 253'
const STORAGE_ICON_MAP = {
  local: storage_png,
  alipan: alipan_png,
  u115: u115_png,
  rclone: rclone_png,
  alist: alist_png,
  smb: smb_png,
}

const STORAGE_FALLBACK_COLOR_MAP = {
  local: '#FFB400',
  alipan: '#00A7F2',
  u115: '#17B26A',
  rclone: '#6675FF',
  alist: '#12B8D7',
  smb: '#3B82F6',
}

// 国际化
const { t } = useI18n()
const downloadAccentRgb = ref(DEFAULT_DIRECTORY_ACCENT_RGB)
const libraryAccentRgb = ref(DEFAULT_DIRECTORY_ACCENT_RGB)
let accentUpdateToken = 0

// 输入参数
const props = defineProps({
  type: String, // download/library
  directory: {
    type: Object as PropType<TransferDirectoryConf>,
    required: true, // 必填参数
  },
  categories: {
    type: Object as PropType<{ [key: string]: any }>,
    required: true,
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

function hasKnownStorageType(storageType?: string): storageType is keyof typeof STORAGE_ICON_MAP {
  return !!storageType && Object.prototype.hasOwnProperty.call(STORAGE_ICON_MAP, storageType)
}

function getStorageIcon(storageType?: string) {
  return hasKnownStorageType(storageType) ? STORAGE_ICON_MAP[storageType] : storage_png
}

function hexToRgbString(hexColor: string) {
  const normalizedColor = hexColor.replace('#', '')
  const colorValue = Number.parseInt(normalizedColor, 16)

  if (Number.isNaN(colorValue) || normalizedColor.length !== 6) return DEFAULT_DIRECTORY_ACCENT_RGB

  return `${(colorValue >> 16) & 255}, ${(colorValue >> 8) & 255}, ${colorValue & 255}`
}

function rgbToHex(value: number) {
  return Math.round(value).toString(16).padStart(2, '0')
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const normalizedSaturation = saturation / 100
  const normalizedLightness = lightness / 100
  const chroma = (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation
  const secondComponent = chroma * (1 - Math.abs(((hue / 60) % 2) - 1))
  const lightnessMatch = normalizedLightness - chroma / 2
  let red = 0
  let green = 0
  let blue = 0

  if (hue < 60) [red, green, blue] = [chroma, secondComponent, 0]
  else if (hue < 120) [red, green, blue] = [secondComponent, chroma, 0]
  else if (hue < 180) [red, green, blue] = [0, chroma, secondComponent]
  else if (hue < 240) [red, green, blue] = [0, secondComponent, chroma]
  else if (hue < 300) [red, green, blue] = [secondComponent, 0, chroma]
  else [red, green, blue] = [chroma, 0, secondComponent]

  return `#${rgbToHex((red + lightnessMatch) * 255)}${rgbToHex((green + lightnessMatch) * 255)}${rgbToHex((blue + lightnessMatch) * 255)}`
}

function getStableStorageColor(storageType?: string) {
  const source = storageType || 'custom'
  let hash = 0

  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(31, hash) + source.charCodeAt(index)
  }

  return hslToHex(Math.abs(hash) % 360, 66, 54)
}

function getStorageFallbackColor(storageType?: string) {
  if (hasKnownStorageType(storageType)) return STORAGE_FALLBACK_COLOR_MAP[storageType]

  // 自定义存储没有固定品牌图标，按类型生成稳定颜色，保证切换 custom1/custom2 时也有变化。
  return getStableStorageColor(storageType)
}

// 目录卡片用下载存储和媒体库存储两端的图标主色生成轻渐变，体现整理链路的两个存储端点。
const directoryAccentStyle = computed(() => ({
  '--app-card-accent-rgb': downloadAccentRgb.value,
  '--app-card-accent-end-rgb': libraryAccentRgb.value,
}))

function loadStorageIconImage(storageType?: string) {
  return new Promise<HTMLImageElement | null>(resolve => {
    if (typeof Image === 'undefined') {
      resolve(null)
      return
    }

    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = getStorageIcon(storageType)

    if (image.complete) resolve(image)
  })
}

async function getStorageAccentRgb(storageType?: string) {
  const fallbackColor = getStorageFallbackColor(storageType)

  if (!hasKnownStorageType(storageType)) return hexToRgbString(fallbackColor)

  const image = await loadStorageIconImage(storageType)

  return getCardAccentRgbFromImage(image, fallbackColor)
}

async function updateDirectoryAccentColors() {
  const currentToken = ++accentUpdateToken
  const downloadStorage = props.directory.storage
  const libraryStorage = props.directory.library_storage || props.directory.storage

  downloadAccentRgb.value = hexToRgbString(getStorageFallbackColor(downloadStorage))
  libraryAccentRgb.value = hexToRgbString(getStorageFallbackColor(libraryStorage))

  const [downloadRgb, libraryRgb] = await Promise.all([
    getStorageAccentRgb(downloadStorage),
    getStorageAccentRgb(libraryStorage),
  ])

  if (currentToken !== accentUpdateToken) return

  downloadAccentRgb.value = downloadRgb
  libraryAccentRgb.value = libraryRgb
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
    const storage_res = await api.get(`storage/transtype/${props.directory.storage}`)
    const storage_transtype = (storage_res as any).transtype
    // 媒体库储存整理方法
    const library_storage_res = await api.get(`storage/transtype/${props.directory.library_storage}`)
    const library_storage_transtype = (library_storage_res as any).transtype
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

// 根据选中的媒体类型，获取对应的媒体类别
const getCategories = computed(() => {
  const default_value = [{ title: t('common.all'), value: '' }]
  if (!props.categories || !props.categories[props.directory?.media_type ?? '']) return default_value
  return default_value.concat(props.categories[props.directory.media_type ?? ''])
})

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
  [() => props.directory.media_type, () => props.directory.media_category],
  ([newMediaType, newMediaCategory], [oldMediaType, oldMediaCategory]) => {
    if (newMediaType && newMediaType !== oldMediaType) {
      props.directory.download_type_folder = false
      props.directory.library_type_folder = false
    }
    if (newMediaCategory && newMediaCategory !== oldMediaCategory) {
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
          <VCol cols="6">
            <VAutocomplete
              v-model="props.directory.media_type"
              variant="underlined"
              :items="typeItems"
              :label="t('directory.mediaType')"
              @update:modelValue="props.directory.media_category = ''"
            />
          </VCol>
          <VCol cols="6">
            <VAutocomplete
              v-model="props.directory.media_category"
              variant="underlined"
              :items="getCategories"
              :label="t('directory.mediaCategory')"
            />
          </VCol>
          <VCol cols="4">
            <VAutocomplete
              v-model="props.directory.storage"
              variant="underlined"
              :items="resourceStorageOptions"
              :label="t('directory.resourceStorage')"
            />
          </VCol>
          <VCol cols="8">
            <VPathField
              v-model="props.directory.download_path"
              :storage="props.directory.storage"
              variant="underlined"
              :label="t('directory.resourceDirectory')"
            />
          </VCol>
          <VCol cols="6" v-if="!props.directory.media_type || props.directory.media_type === ''">
            <VSwitch v-model="props.directory.download_type_folder" :label="t('directory.sortByType')"></VSwitch>
          </VCol>
          <VCol cols="6" v-if="!props.directory.media_category || props.directory.media_category === ''">
            <VSwitch
              v-model="props.directory.download_category_folder"
              :label="t('directory.sortByCategory')"
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
            />
          </VCol>
          <VCol cols="4">
            <VAutocomplete
              v-model="props.directory.library_storage"
              variant="underlined"
              :items="libraryStorageOptions"
              :label="t('directory.libraryStorage')"
            />
          </VCol>
          <VCol cols="8">
            <VPathField
              v-model="props.directory.library_path"
              :storage="props.directory.library_storage"
              variant="underlined"
              :label="t('directory.libraryDirectory')"
            />
          </VCol>
          <VCol cols="4">
            <VSelect
              v-model="props.directory.transfer_type"
              variant="underlined"
              :items="transferTypeItems"
              :label="t('directory.transferType')"
              :no-data-text="computedNoDataText"
            />
          </VCol>
          <VCol cols="8">
            <VSelect
              v-model="props.directory.overwrite_mode"
              variant="underlined"
              :items="overwriteModeItems"
              :label="t('directory.overwriteMode')"
            />
          </VCol>
          <VCol cols="6" v-if="!props.directory.media_type || props.directory.media_type === ''">
            <VSwitch v-model="props.directory.library_type_folder" :label="t('directory.sortByType')"></VSwitch>
          </VCol>
          <VCol cols="6" v-if="!props.directory.media_category || props.directory.media_category === ''">
            <VSwitch v-model="props.directory.library_category_folder" :label="t('directory.sortByCategory')"></VSwitch>
          </VCol>
          <VCol cols="6">
            <VSwitch v-model="props.directory.renaming" :label="t('directory.smartRename')"></VSwitch>
          </VCol>
          <VCol cols="6">
            <VSwitch v-model="props.directory.scraping" :label="t('directory.scrapingMetadata')"></VSwitch>
          </VCol>
          <VCol cols="6">
            <VSwitch v-model="props.directory.notify" :label="t('directory.sendNotification')"></VSwitch>
          </VCol>
        </VRow>
      </VForm>
    </VCardText>
    <VCardActions class="text-center py-0">
      <VSpacer />
      <VBtn :icon="isCollapsed ? 'mdi-chevron-down' : 'mdi-chevron-up'" @click.stop="isCollapsed = !isCollapsed" />
      <VSpacer />
    </VCardActions>
  </VCard>
</template>
