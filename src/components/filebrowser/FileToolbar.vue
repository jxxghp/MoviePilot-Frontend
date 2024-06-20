<script lang="ts" setup>
import type { Axios, AxiosRequestConfig } from 'axios'
import type { EndPoints, FileItem } from '@/api/types'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 输入参数
const inProps = defineProps({
  storages: Array as PropType<any[]>,
  storage: String,
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
    type: Object as PropType<Axios>,
    required: true,
  },
})

// 对外事件
const emit = defineEmits(['storagechanged', 'pathchanged', 'loading', 'foldercreated', 'sortchanged'])

// 新建文件夹名称
const newFolderPopper = ref(false)

// 新建文件名称
const newFolderName = ref('')

// 排序方式
const sort = ref('name')

// 调整排序方式
function changeSort() {
  if (sort.value === 'name') sort.value = 'time'
  else sort.value = 'name'

  emit('sortchanged', sort.value)
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
  return inProps.storages?.find(item => item.code === inProps.storage)
})

// 切换存储
function changeStorage(code: string) {
  if (inProps.storage !== code) {
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
  const url = inProps.endpoints?.mkdir.url
    .replace(/{storage}/g, inProps.storage)
    .replace(/{name}/g, newFolderName.value)

  const config: AxiosRequestConfig<FileItem> = {
    url,
    method: inProps.endpoints?.mkdir.method || 'post',
    data: inProps.item,
  }

  // 调API
  await inProps.axios.request(config)

  newFolderPopper.value = false
  newFolderName.value = ''
  emit('loading', false)

  // 通知重新加载
  emit('foldercreated')
}

// 计算排序图标
const sortIcon = computed(() => {
  if (sort.value === 'time') return 'mdi-sort-clock-ascending-outline'
  else return 'mdi-sort-alphabetical-ascending'
})
</script>

<template>
  <VToolbar flat dense>
    <VToolbarItems class="overflow-hidden">
      <VMenu v-if="inProps.storages?.length || 0 > 1" offset-y>
        <template #activator="{ props }">
          <VBtn v-bind="props">
            <VIcon icon="mdi-arrow-down-drop-circle-outline" />
          </VBtn>
        </template>
        <VList>
          <VListItem
            v-for="(item, index) in storages"
            :key="index"
            :disabled="item.code === storageObject?.code"
            @click="changeStorage(item.code)"
          >
            <template #prepend>
              <Icon :icon="item.icon" />
            </template>
            <VListItemTitle>{{ item.name }}</VListItemTitle>
          </VListItem>
        </VList>
      </VMenu>
      <VBtn variant="text" :input-value="item.path === '/'" class="px-1" @click="changePath(inProps.itemstack[0])">
        <VIcon :icon="storageObject?.icon" class="mr-2" />
        {{ storageObject?.name }}
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
    <VTooltip text="调整排序">
      <template #activator="{ props }">
        <IconBtn v-bind="props" @click="changeSort">
          <VIcon :icon="sortIcon" />
        </IconBtn>
      </template>
    </VTooltip>
    <VTooltip text="返回上一级" v-if="pathSegments.length > 0">
      <template #activator="{ props }">
        <IconBtn v-bind="props" @click="goUp">
          <VIcon icon="mdi-arrow-up-bold-outline" />
        </IconBtn>
      </template>
    </VTooltip>
    <VDialog v-model="newFolderPopper" max-width="50rem">
      <template #activator="{ props }">
        <IconBtn v-bind="props">
          <VTooltip text="新建文件夹">
            <template #activator="{ props: _props }">
              <VIcon v-bind="_props" icon="mdi-folder-plus-outline" />
            </template>
          </VTooltip>
        </IconBtn>
      </template>
      <VCard title="新建文件夹">
        <DialogCloseBtn @click="newFolderPopper = false" />
        <VDivider />
        <VCardText>
          <VTextField v-model="newFolderName" label="名称" />
        </VCardText>
        <VCardActions>
          <div class="flex-grow-1" />
          <VBtn :disabled="!newFolderName" variant="elevated" @click="mkdir" prepend-icon="mdi-check" class="px-5 me-3">
            新建
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </VToolbar>
</template>
