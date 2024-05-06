<script lang="ts" setup>
import type { Axios } from 'axios'
import type { PropType } from 'vue'
import { useConfirm } from 'vuetify-use-dialog'
import axios from 'axios'
import { useToast } from 'vue-toast-notification'
import ReorganizeDialog from '../dialog/ReorganizeDialog.vue'
import { formatBytes } from '@core/utils/formatters'
import type { Context, EndPoints, FileItem } from '@/api/types'
import store from '@/store'
import api from '@/api'
import MediaInfoCard from '@/components/cards/MediaInfoCard.vue'
import ProgressDialog from '../dialog/ProgressDialog.vue'

// 输入参数
const inProps = defineProps({
  icons: Object,
  storage: String,
  path: String,
  endpoints: Object as PropType<EndPoints>,
  axios: Object as PropType<Axios>,
  refreshpending: Boolean,
  sort: String,
})

// 对外事件
const emit = defineEmits(['loading', 'pathchanged', 'refreshed', 'filedeleted', 'renamed'])

// 提示框
const $toast = useToast()

// 是否正在加载
const loading = ref(true)

// 识别进度条
const progressDialog = ref(false)

// 识别进度文本
const progressText = ref('请稍候 ...')

// 识别进度
const progressValue = ref(0)

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

// 识别结果
const nameTestResult = ref<Context>()

// 识别结果对话框
const nameTestDialog = ref(false)

// 目录过滤
const dirs = computed(() => items.value.filter(item => item.type === 'dir' && item.basename.includes(filter.value)))

// 文件过滤
const files = computed(() => items.value.filter(item => item.type === 'file' && item.basename.includes(filter.value)))

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
  loading.value = true
  emit('loading', true)
  // 参数
  const url = inProps.endpoints?.list.url
    .replace(/{storage}/g, storage.value)
    .replace(/{path}/g, encodeURIComponent(inProps.path || ''))
    .replace(/{sort}/g, inProps.sort || 'name')

  const config = {
    url,
    method: inProps.endpoints?.list.method || 'get',
  }
  // 加载数据
  items.value = (await axiosInstance.value.request(config)) ?? []
  emit('loading', false)
  loading.value = false
}

// 删除项目
async function deleteItem(item: FileItem) {
  const confirmed = await createConfirm({
    title: '确认',
    content: `是否确认删除${item.type === 'dir' ? '目录' : '文件'} ${item.basename}？`,
  })

  if (confirmed) {
    emit('loading', true)
    const url = inProps.endpoints?.delete.url
      .replace(/{storage}/g, storage.value)
      .replace(/{path}/g, encodeURIComponent(item.path))

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
  if (!path) return
  const token = store.state.auth.token
  const url_path = inProps.endpoints?.download.url
    .replace(/{storage}/g, storage.value)
    .replace(/{path}/g, encodeURIComponent(path))
  const url = `${import.meta.env.VITE_API_BASE_URL}${url_path.slice(1)}&token=${token}`
  // 下载文件
  window.open(url, '_blank')
}

// 显示图片
function getImgLink(path: string) {
  if (!path) return ''
  const token = store.state.auth.token
  const url_path = inProps.endpoints?.image.url
    .replace(/{storage}/g, storage.value)
    .replace(/{path}/g, encodeURIComponent(path))
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
    .replace(/{path}/g, encodeURIComponent(currentItem.value?.path || ''))
    .replace(/{newname}/g, encodeURIComponent(newName.value))

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

// 将文件修改时间（timestape）转换为本地时间
function formatTime(timestape: number) {
  return new Date(timestape * 1000).toLocaleString()
}

// 监听path变化
watch(
  () => inProps.path,
  async () => {
    items.value = []
    nameTestResult.value = undefined
    nameTestDialog.value = false
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

// 调用API识别
async function recognize(path: string) {
  try {
    // 显示进度条
    progressDialog.value = true
    progressText.value = `正在识别 ${path} ...`
    progressValue.value = 0
    nameTestResult.value = await api.get('media/recognize_file', {
      params: {
        path,
      },
    })
    // 关闭进度条
    progressDialog.value = false
    if (!nameTestResult.value) $toast.error(`${path} 识别失败！`)
    nameTestDialog.value = !!nameTestResult.value?.meta_info?.name
  } catch (error) {
    console.error(error)
  }
}

// 调用API刮削
async function scrape(path: string) {
  try {
    // 显示进度条
    progressDialog.value = true
    progressText.value = `正在刮削 ${path} ...`
    const result: { [key: string]: any } = await api.get('media/scrape', {
      params: {
        path,
      },
    })
    // 关闭进度条
    progressDialog.value = false
    if (!result.success) $toast.error(result.message)
    else $toast.success(`${path}削刮完成！`)
  } catch (error) {
    console.error(error)
  }
}
// 弹出菜单
const dropdownItems = ref([
  {
    title: '识别',
    value: 1,
    props: {
      prependIcon: 'mdi-text-recognition',
      click: (_item: FileItem) => {
        recognize(_item.path || '')
      },
    },
  },
  {
    title: '刮削',
    value: 2,
    props: {
      prependIcon: 'mdi-auto-fix',
      click: (_item: FileItem) => {
        scrape(_item.path || '')
      },
    },
  },
  {
    title: '重命名',
    value: 3,
    props: {
      prependIcon: 'mdi-rename',
      click: showRenmae,
    },
  },
  {
    title: '整理',
    value: 4,
    props: {
      prependIcon: 'mdi-folder-arrow-right',
      click: showTransfer,
    },
  },
  {
    title: '删除',
    value: 5,
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
    <VToolbar v-if="!loading" density="compact" flat color="gray">
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
        rounded="0"
      />
      <VSpacer v-if="isFile" />
      <IconBtn v-if="isFile" @click="recognize(inProps.path || '')">
        <VIcon color="primary"> mdi-text-recognition </VIcon>
      </IconBtn>
      <IconBtn v-if="isFile" @click="download(inProps.path || '')">
        <VIcon color="primary"> mdi-download </VIcon>
      </IconBtn>
      <IconBtn v-if="!isFile" @click="load">
        <VIcon color="primary"> mdi-refresh </VIcon>
      </IconBtn>
    </VToolbar>
    <VCardText v-if="loading" class="text-center flex flex-col items-center">
      <VProgressCircular size="48" indeterminate color="primary" />
    </VCardText>
    <VCardText v-if="!path" class="grow d-flex justify-center align-center grey--text"> 选择目录或文件 </VCardText>
    <VCardText v-else-if="isFile && !isImage" class="text-center break-all">
      <strong>{{ items[0]?.name }}</strong
      ><br />
      大小：{{ formatBytes(items[0]?.size || 0) }}<br />
      修改时间：{{ formatTime(items[0]?.modify_time || 0) }}
    </VCardText>
    <VCardText v-else-if="isFile && isImage" class="grow d-flex justify-center align-center">
      <VImg :src="getImgLink(path)" max-width="100%" max-height="100%" />
    </VCardText>
    <VCardText v-else-if="dirs.length || files.length" class="p-0">
      <VList subheader>
        <VVirtualScroll class="virtual-scroll-div" :items="[...dirs, ...files]">
          <template #default="{ item }">
            <VHover>
              <template #default="hover">
                <VListItem v-bind="hover.props" class="px-3 pe-1" @click="changePath(item.path)">
                  <template #prepend>
                    <VIcon
                      v-if="inProps.icons && item.extension"
                      :icon="inProps.icons[item.extension.toLowerCase()] || inProps.icons?.other"
                    />
                    <VIcon v-else icon="mdi-folder-outline" />
                  </template>
                  <VListItemTitle v-text="item.name" />
                  <VListItemSubtitle v-if="item.size">
                    {{ formatBytes(item.size) }}
                  </VListItemSubtitle>
                  <template #append>
                    <IconBtn class="d-sm-none">
                      <VIcon icon="mdi-dots-vertical" />
                      <VMenu activator="parent" close-on-content-click>
                        <VList>
                          <VListItem
                            v-for="(menu, i) in dropdownItems"
                            :key="i"
                            variant="plain"
                            :base-color="menu.props.color"
                            @click="menu.props.click(item)"
                          >
                            <template #prepend>
                              <VIcon :icon="menu.props.prependIcon" />
                            </template>
                            <VListItemTitle v-text="menu.title" />
                          </VListItem>
                        </VList>
                      </VMenu>
                    </IconBtn>
                    <span v-if="hover.isHovering" class="flex">
                      <VTooltip text="识别">
                        <template #activator="{ props }">
                          <IconBtn v-bind="props" class="d-none d-sm-block" @click.stop="recognize(item.path)">
                            <VIcon icon="mdi-text-recognition" />
                          </IconBtn>
                        </template>
                      </VTooltip>
                      <VTooltip text="刮削">
                        <template #activator="{ props }">
                          <IconBtn v-bind="props" class="d-none d-sm-block" @click.stop="scrape(item.path)">
                            <VIcon icon="mdi-auto-fix" />
                          </IconBtn>
                        </template>
                      </VTooltip>
                      <VTooltip text="重命名">
                        <template #activator="{ props }">
                          <IconBtn v-bind="props" class="d-none d-sm-block" @click.stop="showRenmae(item)">
                            <VIcon icon="mdi-rename" />
                          </IconBtn>
                        </template>
                      </VTooltip>
                      <VTooltip text="整理">
                        <template #activator="{ props }">
                          <IconBtn v-bind="props" class="d-none d-sm-block" @click.stop="showTransfer(item)">
                            <VIcon icon="mdi-folder-arrow-right" />
                          </IconBtn>
                        </template>
                      </VTooltip>
                      <VTooltip text="删除">
                        <template #activator="{ props }">
                          <IconBtn v-bind="props" class="d-none d-sm-block" @click.stop="deleteItem(item)">
                            <VIcon icon="mdi-delete-outline" color="error" />
                          </IconBtn>
                        </template>
                      </VTooltip>
                    </span>
                  </template>
                </VListItem>
              </template>
            </VHover>
          </template>
        </VVirtualScroll>
      </VList>
    </VCardText>
    <VCardText v-else-if="filter" class="grow d-flex justify-center align-center grey--text py-5">
      没有目录或文件
    </VCardText>
    <VCardText v-else-if="!loading" class="grow d-flex justify-center align-center grey--text py-5"> 空目录 </VCardText>
  </VCard>
  <!-- 重命名弹窗 -->
  <VDialog v-if="renamePopper" v-model="renamePopper" max-width="50rem">
    <VCard title="重命名">
      <VCardText>
        <VTextField v-model="newName" label="名称" />
      </VCardText>
      <VCardActions>
        <VBtn depressed @click="renamePopper = false"> 取消 </VBtn>
        <VSpacer />
        <VBtn :disabled="!newName" depressed variant="tonal" @click="rename"> 重命名 </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
  <!-- 文件整理弹窗 -->
  <ReorganizeDialog
    v-if="transferPopper"
    v-model="transferPopper"
    :path="currentItem?.path"
    @done="
      () => {
        transferPopper = false
        load()
      }
    "
    @close="transferPopper = false"
  />
  <!-- 进度框 -->
  <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="progressText" :value="progressValue" />
  <!-- 识别结果对话框 -->
  <VDialog v-if="nameTestDialog" v-model="nameTestDialog" width="50rem">
    <VCard>
      <DialogCloseBtn @click="nameTestDialog = false" />
      <VCardItem>
        <MediaInfoCard :context="nameTestResult" />
      </VCardItem>
    </VCard>
  </VDialog>
</template>

<style lang="scss" scoped>
.v-card {
  block-size: 100%;
}

.v-toolbar {
  background: rgb(var(--v-table-header-background));
}

.virtual-scroll-div {
  block-size: calc(100vh - 14rem);
}

@media (width <= 768px) {
  .virtual-scroll-div {
    block-size: calc(100vh - 17rem);
  }
}
</style>
