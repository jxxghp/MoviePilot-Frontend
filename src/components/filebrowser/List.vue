<script lang="ts" setup>
import type { Axios } from 'axios'
import type { PropType } from 'vue'
import { useConfirm } from 'vuetify-use-dialog'
import axios from 'axios'
import { useToast } from 'vue-toast-notification'
import { numberValidator } from '@/@validators'
import { formatBytes } from '@core/utils/formatters'
import type { Context, EndPoints, FileItem } from '@/api/types'
import store from '@/store'
import api from '@/api'
import MediaInfoCard from '@/components/cards/MediaInfoCard.vue'

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

// 整理进度条
const progressDialog = ref(false)

// 整理进度文本
const progressText = ref('请稍候 ...')

// 整理进度
const progressValue = ref(0)

// 加载进度SSE
const progressEventSource = ref<EventSource>()

// 新名称
const newName = ref('')

// 当前名称
const currentItem = ref<FileItem>()

// 文件转移表单
const transferForm = reactive({
  path: '',
  target: '',
  tmdbid: null,
  season: null,
  type_name: '',
  transfer_type: '',
  episode_format: '',
  episode_detail: '',
  episode_part: '',
  episode_offset: null,
  min_filesize: 0,

})

// 识别结果
const nameTestResult = ref<Context>()

// 识别结果对话框
const nameTestDialog = ref(false)

// 生成1到50季的下拉框选项
const seasonItems = ref(
  Array.from({ length: 51 }, (_, i) => i).map(item => ({
    title: `第 ${item} 季`,
    value: item,
  })),
)

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
  items.value = await axiosInstance.value.request(config) ?? []
  emit('loading', false)
  loading.value = false
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
      maxWidth: '50rem',
    },
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
  if (!path)
    return
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
  if (!path)
    return ''
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

// 整理文件
async function transfer() {
  transferForm.path = currentItem.value?.path ?? ''
  // 开始整理文件
  try {
    // 关闭弹窗
    transferPopper.value = false
    // 显示进度条
    progressDialog.value = true
    // 开始监听进度
    startLoadingProgress()
    // 异步调API，结束后关闭进度条
    api.post('transfer/manual', {}, {
      params: transferForm,
    }).then((res: any) => {
      // 关闭进度条
      progressDialog.value = false
      // 停止监听进度
      stopLoadingProgress()
      // 显示结果
      if (res.success) {
        $toast.success(`${currentItem.value?.name} 整理成功！`)
        // 重新加载
        load()
      }
      else {
        $toast.error(`${currentItem.value?.name} 整理失败：${res.message}！`)
      }
    })
  }
  catch (e) {
    console.log(e)
  }
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

// 使用SSE监听加载进度
function startLoadingProgress() {
  progressText.value = '请稍候 ...'

  const token = store.state.auth.token

  progressEventSource.value = new EventSource(
    `${import.meta.env.VITE_API_BASE_URL}system/progress/filetransfer?token=${token}`,
  )
  progressEventSource.value.onmessage = (event) => {
    const progress = JSON.parse(event.data)
    if (progress) {
      progressText.value = progress.text
      progressValue.value = progress.value
    }
  }
}

// 停止监听加载进度
function stopLoadingProgress() {
  progressEventSource.value?.close()
}

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
    if (!nameTestResult.value)
      $toast.error(`${path} 识别失败！`)
    nameTestDialog.value = !!nameTestResult.value?.meta_info?.name
  }
  catch (error) {
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
  }, {
    title: '重命名',
    value: 2,
    props: {
      prependIcon: 'mdi-rename',
      click: showRenmae,
    },
  },
  {
    title: '整理',
    value: 3,
    props: {
      prependIcon: 'mdi-folder-arrow-right',
      click: showTransfer,
    },
  },
  {
    title: '删除',
    value: 4,
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
      v-if="loading"
      class="text-center flex flex-col items-center"
    >
      <VProgressCircular
        size="48"
        indeterminate
        color="primary"
      />
    </VCardText>
    <VCardText
      v-if="!path"
      class="grow d-flex justify-center align-center grey--text"
    >
      选择目录或文件
    </VCardText>
    <VCardText
      v-else-if="isFile && !isImage"
      class="text-center break-all"
    >
      <strong>{{ items[0]?.name }}</strong><br>
      大小：{{ formatBytes(items[0]?.size || 0) }}<br>
      修改时间：{{ formatTime(items[0]?.modify_time || 0) }}
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
            <IconBtn class="d-none d-sm-block" @click.stop="recognize(item.path)">
              <VIcon icon="mdi-text-recognition" />
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
            <IconBtn class="d-none d-sm-block" @click.stop="recognize(item.path)">
              <VIcon icon="mdi-text-recognition" />
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
      v-else-if="!loading"
      class="grow d-flex justify-center align-center grey--text py-5"
    >
      空目录
    </VCardText>
    <VDivider v-if="path" />
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
      />
      <VSpacer v-if="isFile" />
      <IconBtn v-if="isFile" @click="recognize(inProps.path || '')">
        <VIcon color="primary">
          mdi-text-recognition
        </VIcon>
      </IconBtn>
      <IconBtn v-if="isFile" @click="download(inProps.path || '')">
        <VIcon color="primary">
          mdi-download
        </VIcon>
      </IconBtn>
      <IconBtn v-if="!isFile" @click="load">
        <VIcon color="primary">
          mdi-refresh
        </VIcon>
      </IconBtn>
    </VToolbar>
  </VCard>
  <!-- 重命名弹窗 -->
  <VDialog
    v-model="renamePopper"
    max-width="50rem"
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
    max-width="800"
    scrollable
  >
    <template #activator="{ props }">
      <IconBtn title="整理" v-bind="props">
        <VIcon icon="mdi-folder-arrow-right-outline" />
      </IconBtn>
    </template>
    <VCard :title="`文件整理 - ${currentItem?.name}`">
      <VCardText class="pt-2">
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol
              cols="12"
              md="8"
            >
              <VTextField
                v-model="transferForm.target"
                label="目的路径"
              />
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <VSelect
                v-model="transferForm.transfer_type"
                label="整理方式"
                :items="[
                  { title: '默认', value: '' },
                  { title: '移动', value: 'move' },
                  { title: '复制', value: 'copy' },
                  { title: '硬链接', value: 'link' },
                  { title: '软链接', value: 'softlink' },
                ]"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol
              cols="12"
              md="4"
            >
              <VSelect
                v-model="transferForm.type_name"
                label="类型"
                :items="[{ title: '请选择', value: '' }, { title: '电影', value: '电影' }, { title: '电视剧', value: '电视剧' }]"
              />
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <VTextField
                v-model="transferForm.tmdbid"
                label="TMDBID"
                placeholder="留空自动识别"
                :rules="[numberValidator]"
              />
            </VCol>
            <VCol
              cols="12"
              md="4"
            >
              <VSelect
                v-show="transferForm.type_name === '电视剧'"
                v-model.number="transferForm.season"
                label="季"
                :items="seasonItems"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="8">
              <VTextField
                v-model="transferForm.episode_format"
                label="集数定位"
                placeholder="使用{ep}定位集数"
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-model="transferForm.episode_detail"
                label="指定集数"
                placeholder="起始集,终止集，如1或1,2"
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-model="transferForm.episode_part"
                label="指定Part"
                placeholder="如part1"
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-model.number="transferForm.episode_offset"
                label="集数偏移"
                placeholder="如-10"
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-model.number="transferForm.min_filesize"
                label="最小文件大小（MB）"
                :rules="[numberValidator]"
                placeholder="0"
              />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VCardActions>
        <div class="flex-grow-1" />
        <VBtn depressed @click="transferPopper = false">
          取消
        </VBtn>
        <VBtn
          @click="transfer"
        >
          开始整理
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
  <!-- 手动整理进度框 -->
  <vDialog
    v-model="progressDialog"
    :scrim="false"
    width="400"
  >
    <vCard
      color="primary"
    >
      <vCardText class="text-center">
        {{ progressText }}
        <vProgressLinear
          v-if="progressValue"
          color="white"
          class="mb-0 mt-1"
          :model-value="progressValue"
        />
      </vCardText>
    </vCard>
  </vDialog>
  <!-- 识别结果对话框 -->
  <vDialog
    v-model="nameTestDialog"
    width="800"
  >
    <vCard>
      <DialogCloseBtn @click="nameTestDialog = false" />
      <VCardItem>
        <MediaInfoCard :context="nameTestResult" />
      </VCardItem>
    </vCard>
  </vDialog>
</template>

<style lang="scss" scoped>
.v-card {
    height: 100%;
}
.v-toolbar{
  background: rgb(var(--v-table-header-background));
}
</style>
