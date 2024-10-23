<script lang="ts" setup>
import type { TransferDirectoryConf } from '@/api/types'
import { VTextField } from 'vuetify/lib/components/index.mjs'
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import { nextTick } from 'vue'

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
  width: String,
  height: String,
})

// 下载路径
const downloadPath = ref<string>('')

// 媒体库路径
const libraryPath = ref<string>('')

// 类型下拉字典
const typeItems = [
  { title: '全部', value: '' },
  { title: '电影', value: '电影' },
  { title: '电视剧', value: '电视剧' },
]

// 存储下拉字典
const storageItems = [
  { title: '本地', value: 'local' },
  { title: '阿里云盘', value: 'alipan' },
  { title: '115网盘', value: 'u115' },
  { title: 'Rclone网盘', value: 'rclone' },
]

// 自动整理方式下拉字典
const transferSourceItems = [
  { title: '不自动整理', value: '' },
  { title: '下载器监控', value: 'downloader' },
  { title: '目录监控', value: 'monitor' },
]

// 监控模式下拉字典
const MonitorModeItems = [
  { title: '性能模式', value: 'fast' },
  { title: '兼容模式', value: 'compatibility' },
]

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
    return '无可用整理方式！请先选择下载器储存与媒体库储存！'
  } else if (!props.directory.library_storage) {
    return '无可用整理方式！请先选择媒体库储存！'
  } else if (!props.directory.storage) {
    return '无可用整理方式！请先选择下载器储存！'
  } else {
    return '选择的存储没有支持的整理方法！'
  }
})

// 覆盖模式下拉字典
const overwriteModeItems = [
  { title: '从不', value: 'never' },
  { title: '总是', value: 'always' },
  { title: '按文件大小', value: 'size' },
  { title: '仅保留最新版本', value: 'latest' },
]

// 定义触发的自定义事件
const emit = defineEmits(['close', 'changed', 'update:modelValue'])

// 按钮点击
function onClose() {
  emit('close')
}

// 下载路径更新
function updateDownloadPath(value: string) {
  downloadPath.value = value
  emit('update:modelValue', {
    download: downloadPath.value,
    library: libraryPath.value,
  })
}

// 媒体库路径更新
function updateLibraryPath(value: string) {
  libraryPath.value = value
  emit('update:modelValue', {
    download: downloadPath.value,
    library: libraryPath.value,
  })
}

// 根据选中的媒体类型，获取对应的媒体类别
const getCategories = computed(() => {
  const default_value = [{ title: '全部', value: '' }]
  if (!props.categories || !props.categories[props.directory?.media_type ?? '']) return default_value
  return default_value.concat(props.categories[props.directory.media_type ?? ''])
})

// 监听 下载储存与媒体库储存 变化，重新加载整理方式下拉字典
watch(
  [() => props.directory.library_storage, () => props.directory.storage],
  ([newLibraryStorage, newStorage], [oldLibraryStorage, oldStorage]) => {
    if (newLibraryStorage !== oldLibraryStorage || newStorage !== oldStorage) {
      loadTransferTypeItems()
    }
  },
  { immediate: true },
)
</script>

<template>
  <VCard variant="tonal" :width="props.width" :height="props.height">
    <DialogCloseBtn @click="onClose" />
    <VCardItem>
      <VTextField
        v-model="props.directory.name"
        variant="underlined"
        label="别名"
        class="me-20 text-high-emphasis font-weight-bold"
      />
      <span class="absolute top-3 right-12">
        <IconBtn>
          <VIcon class="cursor-move" icon="mdi-drag" />
        </IconBtn>
      </span>
    </VCardItem>
    <VCardText>
      <VForm>
        <VRow>
          <VCol cols="6">
            <VSelect
              v-model="props.directory.media_type"
              variant="underlined"
              :items="typeItems"
              label="媒体类型"
              @update:modelValue="props.directory.media_category = ''"
            />
          </VCol>
          <VCol cols="6">
            <VSelect
              v-model="props.directory.media_category"
              variant="underlined"
              :items="getCategories"
              label="媒体类别"
            />
          </VCol>
          <VCol cols="4">
            <VSelect v-model="props.directory.storage" variant="underlined" :items="storageItems" label="下载存储" />
          </VCol>
          <VCol cols="8">
            <VPathField @update:modelValue="updateDownloadPath" :storage="props.directory.storage">
              <template #activator="{ menuprops }">
                <VTextField
                  v-model="props.directory.download_path"
                  v-bind="menuprops"
                  variant="underlined"
                  label="下载目录"
                />
              </template>
            </VPathField>
          </VCol>
          <VCol cols="6" v-if="!props.directory.media_type || props.directory.media_type === ''">
            <VSwitch v-model="props.directory.download_type_folder" label="按类型分类"></VSwitch>
          </VCol>
          <VCol cols="6" v-if="!props.directory.media_category || props.directory.media_category === ''">
            <VSwitch v-model="props.directory.download_category_folder" label="按类别分类"></VSwitch>
          </VCol>
        </VRow>
        <VDivider v-if="$props.directory.monitor_type" class="my-3 bg-primary" />
        <VRow>
          <VCol>
            <VSelect
              v-model="props.directory.monitor_type"
              variant="underlined"
              :items="transferSourceItems"
              label="自动整理"
            />
          </VCol>
        </VRow>
        <VRow v-if="$props.directory.monitor_type">
           <VCol cols="12" v-if="$props.directory.monitor_type == 'monitor'">
            <VSelect
              v-model="props.directory.monitor_mode"
              variant="underlined"
              :items="MonitorModeItems"
              label="监控模式"
            />
          </VCol>
          <VCol cols="4">
            <VSelect
              v-model="props.directory.library_storage"
              variant="underlined"
              :items="storageItems"
              label="媒体库存储"
            />
          </VCol>
          <VCol cols="8">
            <VPathField @update:modelValue="updateLibraryPath" :storage="props.directory.library_storage">
              <template #activator="{ menuprops }">
                <VTextField
                  v-model="props.directory.library_path"
                  v-bind="menuprops"
                  variant="underlined"
                  label="媒体库目录"
                />
              </template>
            </VPathField>
          </VCol>
          <VCol cols="4">
            <VSelect
              v-model="props.directory.transfer_type"
              variant="underlined"
              :items="transferTypeItems"
              label="整理方式"
              :no-data-text="computedNoDataText"
            />
          </VCol>
          <VCol cols="8">
            <VSelect
              v-model="props.directory.overwrite_mode"
              variant="underlined"
              :items="overwriteModeItems"
              label="覆盖模式"
            />
          </VCol>
          <VCol cols="6" v-if="!props.directory.media_type || props.directory.media_type === ''">
            <VSwitch v-model="props.directory.library_type_folder" label="按类型分类"></VSwitch>
          </VCol>
          <VCol cols="6" v-if="!props.directory.media_category || props.directory.media_category === ''">
            <VSwitch v-model="props.directory.library_category_folder" label="按类别分类"></VSwitch>
          </VCol>
          <VCol cols="6">
            <VSwitch v-model="props.directory.renaming" label="智能重命名"></VSwitch>
          </VCol>
          <VCol cols="6">
            <VSwitch v-model="props.directory.scraping" label="刮削元数据"></VSwitch>
          </VCol>
          <VCol cols="6">
            <VSwitch v-model="props.directory.notify" label="发送通知"></VSwitch>
          </VCol>
        </VRow>
      </VForm>
    </VCardText>
  </VCard>
</template>
