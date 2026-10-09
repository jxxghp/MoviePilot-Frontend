<script lang="ts" setup>
import type { AxiosRequestConfig } from 'axios'
import type { EndPoints, FileItem } from '@/api/types'
import type { DataApiClient } from '@/api'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useDisplay } from 'vuetify'
import { useResizeObserver } from '@vueuse/core'

const FileNewFolderDialog = defineAsyncComponent(() => import('../dialog/FileNewFolderDialog.vue'))

/** 工具栏存储选择项，由文件浏览器从存储配置映射得到。 */
interface StorageOption {
  // 存储类型对应的展示图标
  icon: string
  // 存储显示名称
  title: string
  // 存储类型标识
  value: string
}

// 输入参数
const inProps = defineProps({
  storages: Array as PropType<StorageOption[]>,
  item: {
    type: Object as PropType<FileItem>,
    required: true,
  },
  itemstack: {
    type: Array as PropType<FileItem[]>,
    required: true,
  },
  endpoints: Object as PropType<EndPoints>,
  // Axios 实例是可调用函数，运行时 prop 类型需与其实际形态一致。
  axios: {
    type: Function as PropType<DataApiClient>,
    required: true,
  },
  showTreeMenu: Boolean,
  showNewFolderButton: {
    type: Boolean,
    default: true,
  },
})

// 对外事件
const emit = defineEmits(['storagechanged', 'pathchanged', 'loading', 'foldercreated', 'tree'])

const display = useDisplay()
// 先测量完整路径，桌面仅在可用宽度不足时折叠祖先目录。
const pathRef = ref<HTMLElement | null>(null)
const pathMeasureRef = ref<HTMLElement | null>(null)
const pathOverflow = ref(false)
/** 根据完整路径的实际宽度决定是否折叠中间目录。 */
function measurePath() {
  if (pathRef.value && pathMeasureRef.value) {
    pathOverflow.value = pathMeasureRef.value.scrollWidth > pathRef.value.clientWidth
  }
}
useResizeObserver(pathRef, measurePath)
useResizeObserver(pathMeasureRef, measurePath)
watch(
  () => inProps.itemstack,
  () => nextTick(measurePath),
  { deep: true },
)
const visiblePathCount = computed(() =>
  inProps.itemstack.length > 2 && (!display.mdAndUp.value || pathOverflow.value) ? 1 : 0,
)

// 新建文件名称
const newFolderName = ref('')
let newFolderDialogController: ReturnType<typeof openSharedDialog> | null = null

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

/** 切换存储。 */
function changeStorage(code: string) {
  if (inProps.item.storage !== code) {
    emit('storagechanged', code)
  }
}

/** 路径变化。 */
function changePath(item: FileItem) {
  emit('pathchanged', item)
}

/** 返回上一级。 */
function goUp() {
  const segments = pathSegments.value ?? []
  const fileitem = inProps.itemstack[segments.length - 1]
  changePath(fileitem)
}

/** 创建目录。 */
async function mkdir() {
  emit('loading', true)
  try {
    const url = inProps.endpoints?.mkdir.url.replace(/{name}/g, encodeURIComponent(newFolderName.value))

    const config: AxiosRequestConfig<FileItem> = {
      url,
      method: inProps.endpoints?.mkdir.method || 'post',
      data: inProps.item,
      feedback: 'silent',
    }

    await inProps.axios.request<null>(config)

    newFolderDialogController?.close()
    newFolderDialogController = null
    newFolderName.value = ''
    emit('foldercreated')
  } catch (error) {
    console.error('创建目录失败:', error)
  } finally {
    emit('loading', false)
  }
}

/** 打开新建目录对话框。 */
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

onUnmounted(() => {
  newFolderDialogController?.close()
})

defineExpose({
  openNewFolderDialog,
})
</script>

<template>
  <nav class="file-browser-toolbar" :aria-label="$t('file.path')">
    <VMenu v-if="(storages?.length ?? 0) > 1">
      <template #activator="{ props }"
        ><VBtn
          v-bind="props"
          variant="text"
          color="default"
          class="file-browser-toolbar__storage"
          append-icon="mdi-chevron-down"
          :prepend-icon="storageObject?.icon"
          >{{ storageObject?.title }}</VBtn
        ></template
      >
      <VList
        ><VListItem
          v-for="storage in storages"
          :key="storage.value"
          :disabled="storage.value === storageObject?.value"
          :prepend-icon="storage.icon"
          :title="storage.title"
          @click="changeStorage(storage.value)"
        />
        <VListItem
          :title="$t('file.rootDirectory')"
          prepend-icon="mdi-home-outline"
          @click="changePath(inProps.itemstack[0])"
        />
      </VList>
    </VMenu>
    <VBtn
      v-else
      variant="text"
      color="default"
      :prepend-icon="storageObject?.icon"
      @click="changePath(inProps.itemstack[0])"
      >{{ storageObject?.title }}</VBtn
    >
    <div ref="pathRef" class="file-browser-toolbar__path">
      <div ref="pathMeasureRef" class="file-browser-toolbar__measure" aria-hidden="true" inert>
        <template v-for="entry in itemstack.slice(1)" :key="entry.path">
          <VIcon icon="mdi-chevron-right" size="18" />
          <VBtn variant="text" color="default">{{ entry.name }}</VBtn>
        </template>
      </div>
      <VMenu v-if="visiblePathCount">
        <template #activator="{ props }"
          ><VBtn v-bind="props" variant="text" color="default" :aria-label="$t('file.path')" icon="mdi-dots-horizontal"
        /></template>
        <VList
          ><VListItem
            v-for="entry in itemstack.slice(0, -visiblePathCount)"
            :key="entry.path"
            :title="entry.name"
            @click="changePath(entry)"
        /></VList>
      </VMenu>
      <template v-for="entry in itemstack.slice(visiblePathCount ? -visiblePathCount : 1)" :key="entry.path">
        <VIcon icon="mdi-chevron-right" size="18" class="text-medium-emphasis" />
        <VBtn
          variant="text"
          color="default"
          class="file-browser-toolbar__segment"
          :title="entry.name"
          @click="changePath(entry)"
          >{{ entry.name }}</VBtn
        >
      </template>
    </div>
    <IconBtn v-if="pathSegments.length > 0" :aria-label="$t('file.moveUp')" @click="goUp"
      ><VIcon icon="mdi-arrow-up-bold-outline"
    /></IconBtn>
    <VMenu v-if="showTreeMenu">
      <template #activator="{ props }"
        ><IconBtn v-bind="props" :aria-label="$t('file.directoryTree')"><VIcon icon="mdi-dots-horizontal" /></IconBtn
      ></template>
      <VList
        ><VListItem :title="$t('file.directoryTree')" prepend-icon="mdi-file-tree-outline" @click="emit('tree')"
      /></VList>
    </VMenu>
    <IconBtn v-if="showNewFolderButton" :aria-label="$t('file.newFolder')" @click="openNewFolderDialog"
      ><VIcon icon="mdi-folder-plus-outline"
    /></IconBtn>
  </nav>
</template>
<style scoped>
.file-browser-toolbar {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 0.25rem;
  min-inline-size: 0;
  margin-block-end: 1rem;
}
.file-browser-toolbar :deep(.v-btn) {
  letter-spacing: 0;
  padding-inline: 0.5rem;
}
.file-browser-toolbar__path {
  display: flex;
  flex: 1;
  align-items: center;
  min-inline-size: 0;
  overflow: hidden;
  position: relative;
}
.file-browser-toolbar__measure {
  position: absolute;
  display: flex;
  align-items: center;
  inline-size: max-content;
  visibility: hidden;
  pointer-events: none;
}
.file-browser-toolbar__measure :deep(.v-btn),
.file-browser-toolbar__path > :deep(.v-icon) {
  flex-shrink: 0;
}
.file-browser-toolbar__segment {
  min-inline-size: 0;
  flex: 0 0 auto;
  max-inline-size: 100%;
}
.file-browser-toolbar__segment:last-child {
  flex: 0 1 auto;
}
.file-browser-toolbar__segment :deep(.v-btn__content) {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-browser-toolbar__storage {
  max-inline-size: 45%;
}
.file-browser-toolbar__storage :deep(.v-btn__content) {
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (width < 960px) {
  .file-browser-toolbar {
    margin-block-end: 0.5rem;
  }
}
@media (width < 360px) {
  .file-browser-toolbar__storage {
    max-inline-size: 30%;
  }
}
</style>
