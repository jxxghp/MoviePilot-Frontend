<script lang="ts" setup>
import type { Axios } from 'axios'
import type { PropType } from 'vue'
import { useConfirm } from 'vuetify-use-dialog'
import axios from 'axios'
import { formatBytes } from '@core/utils/formatters'
import type { EndPoints, FileItem } from '@/api/types'
import store from '@/store'

// 输入参数
const props = defineProps({
  icons: Object,
  storage: String,
  path: String,
  endpoints: Object as PropType<EndPoints>,
  axios: Object as PropType<Axios>,
  refreshpending: Boolean,
})

// 对外事件
const emit = defineEmits(['loading', 'pathchanged', 'refreshed', 'filedeleted'])

// 确认框
const createConfirm = useConfirm()

// axios实例
const axiosInstance = ref<Axios>(props.axios ?? axios)

// 内容列表
const items = ref<FileItem[]>([])

// 过滤条件
const filter = ref('')

// 存储空间类型
const storage = ref(props.storage ?? '')

// 目录过滤
const dirs = computed(() =>
  items.value.filter(item => item.type === 'dir' && item.basename.includes(filter.value)),
)

// 文件过滤
const files = computed(() =>
  items.value.filter(item => item.type === 'file' && item.basename.includes(filter.value)),
)

// 是否目录
const isDir = computed(() => props.path?.endsWith('/'))

// 是否文件
const isFile = computed(() => !isDir.value)

// 是否为图片文件
const isImage = computed(() => {
  const ext = props.path?.split('.').pop()?.toLowerCase()
  return ['png', 'jpg', 'jpeg', 'gif', 'bmp'].includes(ext ?? '')
})

// 调API加载内容
async function load() {
  emit('loading', true)
  if (isDir.value) {
    const url = props.endpoints?.list.url
      .replace(/{storage}/g, storage.value)
      .replace(/{path}/g, props.path)

    const config = {
      url,
      method: props.endpoints?.list.method || 'get',
    }
    // 加载数据
    items.value = await axiosInstance.value.request(config) ?? []
  }
  emit('loading', false)
}

// 删除项目
async function deleteItem(item: FileItem) {
  const confirmed = await createConfirm({
    title: '确认',
    content: `是否确认删除${
                item.type === 'dir' ? '目录' : '文件'
            } ${item.basename}？`,
    confirmationText: '确认',
    cancellationText: '取消',
    dialogProps: {
      maxWidth: 600,
    },
  })

  if (confirmed) {
    emit('loading', true)
    const url = props.endpoints?.delete.url
      .replace(/{storage}/g, storage.value)
      .replace(/{path}/g, item.path)

    const config = {
      url,
      method: props.endpoints?.delete.method || 'post',
    }

    await axiosInstance.value.request(config)
    emit('filedeleted')
    emit('loading', false)
    // 重新加载
    load()
  }
}

// 切换路径
function changePath(_path: string) {
  emit('pathchanged', _path)
}

// 新窗口中下载文件
function download(path: string) {
  if (!path)
    return
  const token = store.state.auth.token
  const url_path = props.endpoints?.download.url
    .replace(/{storage}/g, storage.value)
    .replace(/{path}/g, path)
  const url = `${import.meta.env.VITE_API_BASE_URL}${url_path.slice(1)}&token=${token}`
  // 下载文件
  window.open(url, '_blank')
}

// 显示图片
function getImgLink(path: string) {
  if (!path)
    return ''
  const token = store.state.auth.token
  const url_path = props.endpoints?.image.url
    .replace(/{storage}/g, storage.value)
    .replace(/{path}/g, path)
  return `${import.meta.env.VITE_API_BASE_URL}${url_path.slice(1)}&token=${token}`
}

// 转移文件
function transfer(item: FileItem) {
  // TODO 转移文件
}

// 监听path变化
watch(
  () => props.path,
  async () => {
    items.value = []
    await load()
  },
)

// 监听refreshPending变化
watch(
  () => props.refreshpending,
  async () => {
    if (props.refreshpending) {
      await load()
      emit('refreshed')
    }
  },
)

onMounted(() => {
  load()
})
</script>

<template>
  <VCard flat tile min-height="380" class="d-flex flex-column">
    <VCardText
      v-if="!path"
      class="grow d-flex justify-center align-center grey--text"
    >
      选择目录或文件
    </VCardText>
    <VCardText
      v-else-if="isFile && !isImage"
      class="grow d-flex justify-center align-center"
    >
      文件: {{ path }}<br>
    </VCardText>
    <VCardText
      v-else-if="isFile && isImage"
      class="grow d-flex justify-center align-center"
    >
      <VImg :src="getImgLink(path)" cover max-width="100%" max-height="100%" />
    </VCardText>
    <VCardText v-else-if="dirs.length || files.length" class="grow">
      <VList v-if="dirs.length" subheader max-height="300">
        <VListSubheader>目录</VListSubheader>
        <VListItem
          v-for="(item, index) in dirs"
          :key="index"
          class="pl-2"
          @click="changePath(item.path)"
        >
          <template #prepend>
            <VIcon icon="mdi-folder-outline" />
          </template>
          <VListItemTitle v-text="item.name" />
          <template #append>
            <IconBtn @click.stop="transfer(item)">
              <VIcon icon="mdi-folder-arrow-right" />
            </IconBtn>
            <IconBtn @click.stop="deleteItem(item)">
              <VIcon icon="mdi-delete-outline" />
            </IconBtn>
          </template>
        </VListItem>
      </VList>
      <VDivider v-if="dirs.length && files.length" />
      <VList v-if="files.length" subheader max-height="300">
        <VListSubheader>文件</VListSubheader>
        <VListItem
          v-for="(item, index) in files"
          :key="index"
          class="pl-2"
          @click="changePath(item.path)"
        >
          <template #prepend>
            <VIcon v-if="props.icons" :icon="props.icons[item.extension.toLowerCase()] || props.icons?.other" />
          </template>

          <VListItemTitle v-text="item.name" />
          <VListItemSubtitle> {{ formatBytes(item.size) }}</VListItemSubtitle>

          <template #append>
            <IconBtn @click.stop="transfer(item)">
              <VIcon icon="mdi-folder-arrow-right" />
            </IconBtn>
            <IconBtn @click.stop="deleteItem(item)">
              <VIcon icon="mdi-delete-outline" />
            </IconBtn>
          </template>
        </VListItem>
      </VList>
    </VCardText>
    <VCardText
      v-else-if="filter"
      class="grow d-flex justify-center align-center grey--text py-5"
    >
      没有目录或文件
    </VCardText>
    <VCardText
      v-else
      class="grow d-flex justify-center align-center grey--text py-5"
    >
      空目录
    </VCardText>
    <VDivider v-if="path" />
    <VToolbar density="compact" flat color="gray">
      <VTextField
        v-if="!isFile"
        v-model="filter"
        hide-details
        flat
        density="compact"
        variant="solo-filled"
        placeholder="搜索 ..."
        prepend-inner-icon="mdi-filter-outline"
        class="me-2"
      />
      <VSpacer v-if="isFile" />
      <VBtn v-if="isFile" @click="download(props.path || '')">
        <VIcon>mdi-download</VIcon>
      </VBtn>
      <VBtn v-if="!isFile" @click="load">
        <VIcon>mdi-refresh</VIcon>
      </VBtn>
    </VToolbar>
  </VCard>
</template>

<style lang="scss" scoped>
.v-card {
    height: 100%;
}
.v-toolbar{
  background: rgb(var(--v-table-header-background));
}
</style>
