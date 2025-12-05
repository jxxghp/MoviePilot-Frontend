<script lang="ts" setup>
import type { AxiosRequestConfig } from 'axios'
import type { EndPoints, FileItem } from '@/api/types'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

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
    type: Function,
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
    <!-- 新建文件夹 -->
    <VDialog v-model="newFolderPopper" max-width="35rem">
      <template #activator="{ props }">
        <IconBtn>
          <VIcon v-bind="props" icon="mdi-folder-plus-outline" />
        </IconBtn>
      </template>
      <VCard>
        <VCardItem>
          <template #prepend>
            <VIcon icon="mdi-folder-plus-outline" class="me-2" />
          </template>
          <VCardTitle>{{ t('file.newFolder') }}</VCardTitle>
        </VCardItem>
        <VDialogCloseBtn @click="newFolderPopper = false" />
        <VDivider />
        <VCardText>
          <VTextField v-model="newFolderName" :label="t('common.name')" prepend-inner-icon="mdi-format-text" />
        </VCardText>
        <VCardActions>
          <div class="flex-grow-1" />
          <VBtn :disabled="!newFolderName" @click="mkdir" prepend-icon="mdi-folder-plus" class="px-5 me-3">
            {{ t('common.create') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </VToolbar>
</template>
