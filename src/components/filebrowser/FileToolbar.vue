<script lang="ts" setup>
import type { Axios } from 'axios'
import type { EndPoints } from '@/api/types'

// 输入参数
const inProps = defineProps({
  storages: Array as PropType<any[]>,
  storage: String,
  path: String,
  endpoints: Object as PropType<EndPoints>,
  axios: Object as PropType<Axios>,
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
  if (sort.value === 'name')
    sort.value = 'time'
  else
    sort.value = 'name'

  emit('sortchanged', sort.value)
}

// 计算PATH面包屑
const pathSegments = computed(() => {
  let path_str = ''
  const isFolder = inProps.path?.endsWith('/')
  const segments = inProps.path?.split('/').filter(item => item)

  return segments?.map((item, index) => {
    path_str += item + ((index < segments.length - 1 || isFolder) ? '/' : '')
    return {
      name: item,
      path: path_str,
    }
  }) ?? []
})

const storageObject = computed(() => {
  return inProps.storages?.find(item => item.code === inProps.storage)
})

// 切换存储
function changeStorage(code: string) {
  if (inProps.storage !== code) {
    emit('storagechanged', code)
    emit('pathchanged', '')
  }
}

// 路径变化
function changePath(_path: string) {
  emit('pathchanged', _path)
}

// 返回上一级
function goUp() {
  const segments = pathSegments.value ?? []
  const path = segments?.length === 1 ? '/' : segments[segments.length - 2].path
  changePath(path)
}

// 创建目录
async function mkdir() {
  emit('loading', true)
  const url = inProps.endpoints?.mkdir.url
    .replace(/{storage}/g, inProps.storage)
    .replace(/{path}/g, encodeURIComponent(inProps.path + newFolderName.value))

  const config = {
    url,
    method: inProps.endpoints?.mkdir.method || 'post',
  }

  // 调API
  await inProps.axios?.request(config)

  newFolderPopper.value = false
  newFolderName.value = ''
  emit('loading', false)

  // 通知重新加载
  emit('foldercreated')
}

// 计算排序图标
const sortIcon = computed(() => {
  if (sort.value === 'time')
    return 'mdi-sort-clock-ascending-outline'
  else
    return 'mdi-sort-alphabetical-ascending'
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
      <VBtn variant="text" :input-value="path === '/'" class="px-1" @click="changePath('/')">
        <VIcon :icon="storageObject?.icon" class="mr-2" />
        {{ storageObject?.name }}
      </VBtn>
      <template v-for="(segment, index) in pathSegments" :key="index">
        <VBtn
          variant="text"
          :input-value="index === pathSegments.length - 1"
          class="px-1 d-none d-md-block"
          @click="changePath(segment.path)"
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
    <VDialog
      v-model="newFolderPopper"
      max-width="50rem"
    >
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
        <VCardText>
          <VTextField v-model="newFolderName" label="名称" />
        </VCardText>
        <VCardActions>
          <div class="flex-grow-1" />
          <VBtn depressed @click="newFolderPopper = false">
            取消
          </VBtn>
          <VBtn
            :disabled="!newFolderName"
            depressed
            variant="tonal"
            @click="mkdir"
          >
            新建
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </VToolbar>
</template>
