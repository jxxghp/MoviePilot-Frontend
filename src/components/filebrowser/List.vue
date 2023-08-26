<script lang="ts" setup>
import type { Axios } from 'axios'
import type { PropType } from 'vue'
import { useConfirm } from 'vuetify-use-dialog'
import axios from 'axios'
import { formatBytes } from '@core/utils/formatters'
import type { EndPoints, FileItem } from '@/api/types'
import store from '@/store'

// 输入参数
const inProps = defineProps({
  icons: Object,
  storage: String,
  path: String,
  endpoints: Object as PropType<EndPoints>,
  axios: Object as PropType<Axios>,
  refreshpending: Boolean,
})

// 对外事件
const emit = defineEmits(['loading', 'pathchanged', 'refreshed', 'filedeleted', 'renamed'])

// 确认框
const createConfirm = useConfirm()

// 存储空间类型
const storage = ref(inProps.storage ?? '')

// axios实例
const axiosInstance = ref<Axios>(inProps.axios ?? axios)

// 内容列表
const items = ref<FileItem[]>([])

// 过滤条件
const filter = ref('')

// 重命名弹窗
const renamePopper = ref(false)

// 整理弹窗
const transferPopper = ref(false)

// 新名称
const newName = ref('')

// 当前名称
const currentItem = ref<FileItem>()

// TODO 文件转移表单
const transferForm = ref({

})

// 目录过滤
const dirs = computed(() =>
  items.value.filter(item => item.type === 'dir' && item.basename.includes(filter.value)),
)

// 文件过滤
const files = computed(() =>
  items.value.filter(item => item.type === 'file' && item.basename.includes(filter.value)),
)

// 是否目录
const isDir = computed(() => inProps.path?.endsWith('/'))

// 是否文件
const isFile = computed(() => !isDir.value)

// 是否为图片文件
const isImage = computed(() => {
  const ext = inProps.path?.split('.').pop()?.toLowerCase()
  return ['png', 'jpg', 'jpeg', 'gif', 'bmp'].includes(ext ?? '')
})

// 调API加载内容
async function load() {
  emit('loading', true)
  if (isDir.value) {
    const url = inProps.endpoints?.list.url
      .replace(/{storage}/g, storage.value)
      .replace(/{path}/g, inProps.path)

    const config = {
      url,
      method: inProps.endpoints?.list.method || 'get',
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
    const url = inProps.endpoints?.delete.url
      .replace(/{storage}/g, storage.value)
      .replace(/{path}/g, item.path)

    const config = {
      url,
      method: inProps.endpoints?.delete.method || 'post',
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
  const url_path = inProps.endpoints?.download.url
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
  const url_path = inProps.endpoints?.image.url
    .replace(/{storage}/g, storage.value)
    .replace(/{path}/g, path)
  return `${import.meta.env.VITE_API_BASE_URL}${url_path.slice(1)}&token=${token}`
}

// 显示重命名弹窗
function showRenmae(item: FileItem) {
  currentItem.value = item
  newName.value = item.name
  renamePopper.value = true
}

// 重命名
async function rename() {
  emit('loading', true)
  const url = inProps.endpoints?.rename.url
    .replace(/{storage}/g, inProps.storage)
    .replace(/{path}/g, currentItem.value?.path)
    .replace(/{newname}/g, newName.value)

  const config = {
    url,
    method: inProps.endpoints?.mkdir.method || 'post',
  }

  // 调API
  await inProps.axios?.request(config)

  renamePopper.value = false
  newName.value = ''
  emit('loading', false)

  // 通知重新加载
  emit('renamed')
}

// 显示整理对话框
function showTransfer(item: FileItem) {
  currentItem.value = item
  transferPopper.value = true
}

// 整理文件
function transfer() {
  // TODO 整理文件
}

// 监听path变化
watch(
  () => inProps.path,
  async () => {
    items.value = []
    await load()
  },
)

// 监听refreshPending变化
watch(
  () => inProps.refreshpending,
  async () => {
    if (inProps.refreshpending) {
      await load()
      emit('refreshed')
    }
  },
)

// 弹出菜单
const dropdownItems = ref([
  {
    title: '重命名',
    value: 1,
    props: {
      prependIcon: 'mdi-rename',
      click: showRenmae,
    },
  },
  {
    title: '整理',
    value: 2,
    props: {
      prependIcon: 'mdi-folder-arrow-right',
      click: showTransfer,
    },
  },
  {
    title: '删除',
    value: 3,
    props: {
      prependIcon: 'mdi-delete-outline',
      color: 'error',
      click: deleteItem,
    },
  },
])

onMounted(() => {
  load()
})
</script>

<template>
  <VCard class="d-flex flex-column">
    <VCardText
      v-if="!path"
      class="grow d-flex justify-center align-center grey--text"
    >
      选择目录或文件
    </VCardText>
    <VCardText
      v-else-if="isFile && !isImage"
      class="grow d-flex justify-center align-center break-all"
    >
      文件: {{ path }}<br>
    </VCardText>
    <VCardText
      v-else-if="isFile && isImage"
      class="grow d-flex justify-center align-center"
    >
      <VImg :src="getImgLink(path)" max-width="100%" max-height="100%" />
    </VCardText>
    <VCardText v-else-if="dirs.length || files.length" class="p-0">
      <VList v-if="dirs.length" subheader>
        <VListSubheader>目录</VListSubheader>
        <VListItem
          v-for="(item, index) in dirs"
          :key="index"
          class="px-3 pe-1"
          @click="changePath(item.path)"
        >
          <template #prepend>
            <VIcon icon="mdi-folder-outline" />
          </template>
          <VListItemTitle v-text="item.name" />
          <template #append>
            <IconBtn class="d-sm-none">
              <VIcon
                icon="mdi-dots-vertical"
              />
              <VMenu
                activator="parent"
                close-on-content-click
              >
                <VList>
                  <VListItem
                    v-for="(menu, i) in dropdownItems"
                    :key="i"
                    variant="plain"
                    :base-color="menu.props.color"
                    @click.stop="menu.props.click(item)"
                  >
                    <template #prepend>
                      <VIcon :icon="menu.props.prependIcon" />
                    </template>
                    <VListItemTitle v-text="menu.title" />
                  </VListItem>
                </VList>
              </VMenu>
            </IconBtn>
            <IconBtn class="d-none d-sm-block" @click.stop="showRenmae(item)">
              <VIcon icon="mdi-rename" />
            </IconBtn>
            <IconBtn class="d-none d-sm-block" @click.stop="showTransfer(item)">
              <VIcon icon="mdi-folder-arrow-right" />
            </IconBtn>
            <IconBtn class="d-none d-sm-block" @click.stop="deleteItem(item)">
              <VIcon icon="mdi-delete-outline" />
            </IconBtn>
          </template>
        </VListItem>
      </VList>
      <VDivider v-if="dirs.length && files.length" />
      <VList v-if="files.length" subheader>
        <VListSubheader>文件</VListSubheader>
        <VListItem
          v-for="(item, index) in files"
          :key="index"
          class="pl-3 pe-1"
          @click="changePath(item.path)"
        >
          <template #prepend>
            <VIcon v-if="inProps.icons" :icon="inProps.icons[item.extension.toLowerCase()] || inProps.icons?.other" />
          </template>

          <VListItemTitle v-text="item.name" />
          <VListItemSubtitle> {{ formatBytes(item.size) }}</VListItemSubtitle>

          <template #append>
            <IconBtn class="d-sm-none">
              <VIcon
                icon="mdi-dots-vertical"
              />
              <VMenu
                activator="parent"
                close-on-content-click
              >
                <VList>
                  <VListItem
                    v-for="(menu, i) in dropdownItems"
                    :key="i"
                    variant="plain"
                    :base-color="menu.props.color"
                    @click.stop="menu.props.click(item)"
                  >
                    <template #prepend>
                      <VIcon :icon="menu.props.prependIcon" />
                    </template>
                    <VListItemTitle v-text="menu.title" />
                  </VListItem>
                </VList>
              </VMenu>
            </IconBtn>
            <IconBtn class="d-none d-sm-block" @click.stop="showRenmae(item)">
              <VIcon icon="mdi-rename" />
            </IconBtn>
            <IconBtn class="d-none d-sm-block" @click.stop="showTransfer(item)">
              <VIcon icon="mdi-folder-arrow-right" />
            </IconBtn>
            <IconBtn class="d-none d-sm-block" @click.stop="deleteItem(item)">
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
      <VBtn v-if="isFile" @click="download(inProps.path || '')">
        <VIcon>mdi-download</VIcon>
      </VBtn>
      <VBtn v-if="!isFile" @click="load">
        <VIcon>mdi-refresh</VIcon>
      </VBtn>
    </VToolbar>
  </VCard>
  <!-- 重命名弹窗 -->
  <VDialog
    v-model="renamePopper"
    max-width="600"
  >
    <template #activator="{ props }">
      <IconBtn title="重命名" v-bind="props">
        <VIcon icon="mdi-rename-outline" />
      </IconBtn>
    </template>
    <VCard title="重命名">
      <VCardText>
        <VTextField v-model="newName" label="名称" />
      </VCardText>
      <VCardActions>
        <div class="flex-grow-1" />
        <VBtn depressed @click="renamePopper = false">
          取消
        </VBtn>
        <VBtn
          :disabled="!newName"
          depressed
          @click="rename"
        >
          重命名
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
  <!-- 文件整理弹窗 -->
  <VDialog
    v-model="transferPopper"
    max-width="600"
  >
    <template #activator="{ props }">
      <IconBtn title="整理" v-bind="props">
        <VIcon icon="mdi-folder-arrow-right-outline" />
      </IconBtn>
    </template>
    <VCard title="文件整理">
      <VCardText />
      <VCardActions>
        <div class="flex-grow-1" />
        <VBtn depressed @click="transferPopper = false">
          取消
        </VBtn>
        <VBtn
          :disabled="!newName"
          depressed
          @click="transfer"
        >
          开始整理
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.v-card {
    height: 100%;
}
.v-toolbar{
  background: rgb(var(--v-table-header-background));
}
</style>
