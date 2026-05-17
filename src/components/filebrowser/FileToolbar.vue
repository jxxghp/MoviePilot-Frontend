<script lang="ts" setup>
import type { AxiosRequestConfig, AxiosInstance } from 'axios'
import type { EndPoints, FileItem } from '@/api/types'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { openSharedDialog } from '@/composables/useSharedDialog'

const FileNewFolderDialog = defineAsyncComponent(() => import('../dialog/FileNewFolderDialog.vue'))

// 国际化
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

// 输入参数
const inProps = defineProps({
  storages: Array as PropType<any[]>,
  item: {
    type: Object as PropType<FileItem>,
    required: true,
  },
  itemstack: {
    type: Array as PropType<FileItem[]>,
    required: true,
  },
  endpoints: Object as PropType<EndPoints>,
  axios: {
    type: Object as PropType<AxiosInstance>,
    required: true,
  },
  sort: {
    type: String,
    default: 'name',
  },
  showNewFolderButton: {
    type: Boolean,
    default: true,
  },
})

// 对外事件
const emit = defineEmits(['storagechanged', 'pathchanged', 'loading', 'foldercreated', 'sortchanged'])

// 新建文件名称
const newFolderName = ref('')
let newFolderDialogController: ReturnType<typeof openSharedDialog> | null = null

// 调整排序方式
function changeSort() {
  const newSort = inProps.sort === 'name' ? 'time' : 'name'
  emit('sortchanged', newSort)
}

// 计算PATH面包屑
const pathSegments = computed(() => {
  let path_str = ''
  const isFolder = inProps.item.path?.endsWith('/')
  const segments = inProps.item.path?.split('/').filter(item => item)
  return (
    segments?.map((item, index) => {
      path_str += item + (index < segments.length - 1 || isFolder ? '/' : '')
      return {
        name: item,
        path: path_str,
      }
    }) ?? []
  )
})

// 当前存储
const storageObject = computed(() => {
  return inProps.storages?.find(item => item.value === inProps.item.storage)
})

// 切换存储
function changeStorage(code: string) {
  if (inProps.item.storage!== code) {
    emit('storagechanged', code)
  }
}

// 路径变化
function changePath(item: FileItem) {
  emit('pathchanged', item)
}

// 返回上一级
function goUp() {
  const segments = pathSegments.value ?? []
  const fileitem = inProps.itemstack[segments.length - 1]
  changePath(fileitem)
}

// 创建目录
async function mkdir() {
  emit('loading', true)
  const url = inProps.endpoints?.mkdir.url.replace(/{name}/g, newFolderName.value)

  const config: AxiosRequestConfig<FileItem> = {
    url,
    method: inProps.endpoints?.mkdir.method || 'post',
    data: inProps.item,
  }

  // 调API
  await inProps.axios.request(config)

  newFolderDialogController?.close()
  newFolderDialogController = null
  newFolderName.value = ''
  emit('loading', false)

  // 通知重新加载
  emit('foldercreated')
}

function openNewFolderDialog() {
  newFolderName.value = ''
  newFolderDialogController = openSharedDialog(
    FileNewFolderDialog,
    { name: newFolderName.value },
    {
      create: mkdir,
      'update:name': (value: string) => {
        newFolderName.value = value
        newFolderDialogController?.updateProps({ name: value })
      },
    },
    { closeOn: ['close'] },
  )
}

// 计算排序图标
const sortIcon = computed(() => {
  if (inProps.sort === 'time') return 'mdi-sort-clock-ascending-outline'
  else return 'mdi-sort-alphabetical-ascending'
})

onUnmounted(() => {
  newFolderDialogController?.close()
})

defineExpose({
  openNewFolderDialog,
})
</script>

<template>
  <VToolbar flat dense class="rounded-t-lg border-b overflow-hidden">
    <VToolbarItems class="overflow-hidden">
      <VMenu v-if="storages?.length || 0 > 1" offset-y>
        <template #activator="{ props }">
          <VBtn v-bind="props">
            <VIcon icon="mdi-arrow-down-drop-circle-outline" />
          </VBtn>
        </template>
        <VList>
          <VListItem
            v-for="(item, index) in storages"
            :key="index"
            :disabled="item.value === storageObject?.value"
            @click="changeStorage(item.value)"
          >
            <template #prepend>
              <VIcon :icon="item.icon" />
            </template>
            <VListItemTitle>{{ item.title }}</VListItemTitle>
          </VListItem>
        </VList>
      </VMenu>
      <VBtn variant="text" :input-value="item.path === '/'" class="px-1" @click="changePath(inProps.itemstack[0])">
        <VIcon :icon="storageObject?.icon" class="mr-2" />
        {{ storageObject?.title }}
      </VBtn>
      <template v-for="(segment, index) in pathSegments" :key="index">
        <VBtn
          v-if="display.mdAndUp.value"
          variant="text"
          :input-value="index === pathSegments.length - 1"
          class="px-1"
          @click="changePath(inProps.itemstack[index + 1])"
        >
          <VIcon icon=" mdi-chevron-right" />
          {{ segment.name }}
        </VBtn>
      </template>
    </VToolbarItems>
    <div class="flex-grow-1" />
    <IconBtn @click="changeSort">
      <VIcon :icon="sortIcon" />
    </IconBtn>
    <IconBtn v-if="pathSegments.length > 0" @click="goUp">
      <VIcon icon="mdi-arrow-up-bold-outline" />
    </IconBtn>
    <IconBtn v-if="showNewFolderButton" @click="openNewFolderDialog">
      <VIcon icon="mdi-folder-plus-outline" />
    </IconBtn>
  </VToolbar>
</template>
