<script lang="ts" setup>
import FileList from './FileList.vue'
import FileToolbar from './FileToolbar.vue'
import FileNavigator from './FileNavigator.vue'
import type { EndPoints, FileItem, StorageConf } from '@/api/types'
import { storageIconDict } from '@/api/constants'
import type { AxiosInstance } from 'axios'
import { useDynamicButton } from '@/composables/useDynamicButton'
import { usePWA } from '@/composables/usePWA'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'

// LocalStorage keys
const SORT_KEY = 'fileBrowser.sort'
const SHOW_TREE_KEY = 'fileBrowser.showDirTree'
const NAV_WIDTH_KEY = 'fileBrowser.navigatorWidth'

// 输入参数
const props = defineProps({
  storages: Array as PropType<StorageConf[]>,
  tree: Boolean,
  endpoints: Object as PropType<EndPoints>,
  axios: {
    type: Object as PropType<AxiosInstance>,
    required: true,
  },
  axiosconfig: Object,
  item: {
    type: Object as PropType<FileItem>,
    required: true,
  },
  itemstack: {
    type: Array as PropType<FileItem[]>,
    default: () => [],
  },
  active: {
    type: Boolean,
    default: true,
  },
})

// 对外事件
const emit = defineEmits(['pathchanged'])
const route = useRoute()
const { appMode } = usePWA()
const userStore = useUserStore()
const canManage = computed(() =>
  hasPermission(buildUserPermissionContext(userStore.superUser, userStore.permissions), 'manage'),
)
const toolbarRef = ref<InstanceType<typeof FileToolbar> | null>(null)

const fileIcons = {
  // 压缩包
  zip: 'mdi-folder-zip-outline',
  rar: 'mdi-folder-zip-outline',
  bak: 'mdi-folder-zip-outline',
  tar: 'mdi-folder-zip-outline',
  gz: 'mdi-folder-zip-outline',
  bz2: 'mdi-folder-zip-outline',
  // 开发
  htm: 'mdi-language-html5',
  html: 'mdi-language-html5',
  vue: 'mdi-vuejs',
  js: 'mdi-nodejs',
  ts: 'mdi-language-typescript',
  json: 'mdi-file-document-outline',
  css: 'mdi-language-css3',
  scss: 'mdi-language-css3',
  less: 'mdi-language-css3',
  php: 'mdi-language-php',
  py: 'mdi-language-python',
  java: 'mdi-language-java',
  go: 'mdi-language-go',
  c: 'mdi-language-c',
  cpp: 'mdi-language-cpp',
  h: 'mdi-language-c',
  cs: 'mdi-language-csharp',
  sql: 'mdi-database',
  sh: 'mdi-language-bash',
  bat: 'mdi-language-bash',
  ps1: 'mdi-language-powershell',
  // markdown
  md: 'mdi-language-markdown-outline',
  markdown: 'mdi-language-markdown-outline',
  // 图片
  png: 'mdi-file-png-box',
  jpg: 'mdi-file-jpg-box',
  jpeg: 'mdi-file-jpg-box',
  gif: 'mdi-file-gif-box',
  bmp: 'mdi-file-image-box',
  webp: 'mdi-file-image-box',
  ico: 'mdi-file-image-box',
  svg: 'mdi-file-image-box',
  // 视频
  mp4: 'mdi-filmstrip',
  mkv: 'mdi-filmstrip',
  avi: 'mdi-filmstrip',
  wmv: 'mdi-filmstrip',
  mov: 'mdi-filmstrip',
  flv: 'mdi-filmstrip',
  rmvb: 'mdi-filmstrip',
  // 文档
  txt: 'mdi-file-document-outline',
  env: 'mdi-file-cog-outline',
  yml: 'mdi-file-cog-outline',
  yaml: 'mdi-file-cog-outline',
  conf: 'mdi-file-cog-outline',
  log: 'mdi-file-document-outline',
  csv: 'mdi-file-delimited',
  // office
  xls: 'mdi-file-excel',
  xlsx: 'mdi-file-excel',
  doc: 'mdi-file-word',
  docx: 'mdi-file-word',
  ppt: 'mdi-file-powerpoint',
  pptx: 'mdi-file-powerpoint',
  pdf: 'mdi-file-pdf',
  // 音频
  mp2: 'mdi-music',
  mp3: 'mdi-music',
  m4a: 'mdi-music',
  wma: 'mdi-music',
  aac: 'mdi-music',
  ogg: 'mdi-music',
  flac: 'mdi-music',
  wav: 'mdi-music',
  // 字体
  ttf: 'mdi-format-font',
  otf: 'mdi-format-font',
  woff: 'mdi-format-font',
  woff2: 'mdi-format-font',
  eot: 'mdi-format-font',
  // 字幕
  srt: 'mdi-subtitles-outline',
  ass: 'mdi-subtitles-outline',
  sub: 'mdi-subtitles-outline',
  // 其他
  other: 'mdi-file-outline',
}

function openNewFolderDialog() {
  toolbarRef.value?.openNewFolderDialog()
}

const showFloatingNewFolderAction = computed(() => route.path === '/filemanager' && canManage.value)

useDynamicButton({
  icon: 'mdi-folder-plus-outline',
  onClick: openNewFolderDialog,
  permission: 'manage',
  show: computed(() => appMode.value && showFloatingNewFolderAction.value),
})

// 加载次数
const loading = ref(0)

// 刷新
const refreshPending = ref(false)
// 排序 - 从localStorage恢复
const sort = ref(localStorage.getItem(SORT_KEY) || 'name')

// 是否显示目录树 - 从localStorage恢复
const showDirTree = ref(localStorage.getItem(SHOW_TREE_KEY) === 'true')

// 拖动分隔条相关 - 从localStorage恢复宽度
const navigatorWidth = ref(parseInt(localStorage.getItem(NAV_WIDTH_KEY) || '280'))
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartWidth = ref(0)

watch(sort, val => {
  localStorage.setItem(SORT_KEY, val)
})

watch(showDirTree, val => {
  localStorage.setItem(SHOW_TREE_KEY, String(val))
})

watch(navigatorWidth, val => {
  localStorage.setItem(NAV_WIDTH_KEY, String(val))
})

// 计算属性
const storagesArray = computed(() => {
  return props.storages?.map(item => ({
    title: item.name,
    value: item.type,
    icon: storageIconDict[item.type] ?? 'mdi-server-network-outline',
  }))
})

// 方法
function loadingChanged(isLoading: number) {
  if (isLoading) loading.value++
  else if (loading.value > 0) loading.value--
}

// 存储切换
async function storageChanged(storage: string) {
  emit('pathchanged', { storage: storage, path: '/', fileid: 'root' })
}

// 路径变化
function pathChanged(item: FileItem) {
  emit('pathchanged', item)
}

// 排序变化
function sortChanged(s: string) {
  sort.value = s
  refreshPending.value = true
}

// 切换目录树
function switchDirTree(state: boolean) {
  showDirTree.value = state
}

// 文件列表
const fileListItems = ref<FileItem[]>([])

// 文件列表数据更新
function fileListUpdated(items: FileItem[]) {
  fileListItems.value = items
}

// 阻止选择事件
function preventSelect(event: Event) {
  event.preventDefault()
  return false
}

// 拖动分隔条相关方法
function startDrag(event: MouseEvent) {
  event.preventDefault() // 阻止默认行为
  event.stopPropagation() // 阻止事件冒泡

  isDragging.value = true
  dragStartX.value = event.clientX
  dragStartWidth.value = navigatorWidth.value

  document.addEventListener('mousemove', handleDrag, { passive: false })
  document.addEventListener('mouseup', stopDrag, { passive: false })
  document.addEventListener('selectstart', preventSelect) // 阻止选择开始

  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  ;(document.body.style as any).webkitUserSelect = 'none' // Safari兼容
  ;(document.body.style as any).mozUserSelect = 'none' // Firefox兼容
}

function handleDrag(event: MouseEvent) {
  if (!isDragging.value) return

  event.preventDefault() // 阻止默认行为

  const deltaX = event.clientX - dragStartX.value
  const newWidth = dragStartWidth.value + deltaX

  // 设置最小和最大宽度限制
  const minWidth = 200
  const maxWidth = window.innerWidth * 0.6

  navigatorWidth.value = Math.max(minWidth, Math.min(maxWidth, newWidth))
}

function stopDrag() {
  isDragging.value = false
  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('selectstart', preventSelect)

  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  ;(document.body.style as any).webkitUserSelect = ''
  ;(document.body.style as any).mozUserSelect = ''
}
</script>

<template>
  <div class="mx-auto overflow-hidden" :loading="loading > 0">
    <div v-if="item">
      <FileToolbar
        ref="toolbarRef"
        :sort="sort"
        :item="item"
        :itemstack="itemstack"
        :storages="storagesArray"
        :endpoints="endpoints"
        :axios="axios"
        :show-new-folder-button="!showFloatingNewFolderAction"
        @storagechanged="storageChanged"
        @pathchanged="pathChanged"
        @foldercreated="refreshPending = true"
        @sortchanged="sortChanged"
      />
      <div class="flex">
        <FileNavigator
          v-if="showDirTree"
          :storage="item.storage"
          :currentPath="item.path"
          :items="fileListItems"
          :endpoints="endpoints"
          :axios="axios"
          :style="{ width: `${navigatorWidth}px`, minWidth: `${navigatorWidth}px` }"
          @navigate="pathChanged"
        />
        <!-- 拖动分隔条 -->
        <div v-if="showDirTree" class="divider" :class="{ 'divider-dragging': isDragging }" @mousedown="startDrag">
          <div class="divider-line"></div>
          <VIcon class="divider-icon" size="small">mdi-drag-vertical</VIcon>
        </div>
        <FileList
          :item="item"
          :icons="fileIcons"
          :endpoints="endpoints"
          :axios="axios"
          :refreshpending="refreshPending"
          :sort="sort"
          :showTree="showDirTree"
          :active="active"
          :style="{ flex: 1 }"
          @pathchanged="pathChanged"
          @loading="loadingChanged"
          @refreshed="refreshPending = false"
          @filedeleted="refreshPending = true"
          @renamed="refreshPending = true"
          @items-updated="fileListUpdated"
          @switch-tree="switchDirTree"
        />
      </div>
    </div>
  </div>

  <Teleport to="body" v-if="!appMode && showFloatingNewFolderAction">
    <div class="compact-fab-stack">
      <VFab
        icon="mdi-folder-plus-outline"
        color="primary"
        appear
        class="compact-fab compact-fab--primary"
        @click="openNewFolderDialog"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.divider {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: transparent;
  cursor: col-resize;
  inline-size: 1px;
  transition: background-color 0.2s ease;
  user-select: none;
}

.divider:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.08);
}

.divider-dragging {
  background-color: rgba(var(--v-theme-primary), 0.12) !important;
}

.divider-line {
  background-color: rgba(var(--v-theme-outline), 0.3);
  block-size: 100%;
  inline-size: 1px;
  transition: background-color 0.2s ease;
  user-select: none;
}

.divider-dragging .divider-line {
  background-color: rgb(var(--v-theme-primary)) !important;
}

.divider:hover .divider-line {
  background-color: rgba(var(--v-theme-primary), 0.8);
}

.divider-icon {
  position: absolute;
  z-index: 1;
  padding: 2px;
  border-radius: 2px;
  background-color: rgba(var(--v-theme-surface), 0.9);
  color: rgba(var(--v-theme-on-surface-variant), 0.6);
  opacity: 0;
  pointer-events: none;
  transition: all 0.2s ease;
}

.divider-dragging .divider-icon {
  background-color: rgba(var(--v-theme-surface), 0.95);
  color: rgb(var(--v-theme-primary));
  opacity: 1;
}

.divider:hover .divider-icon {
  color: rgba(var(--v-theme-primary), 0.9);
  opacity: 1;
}
</style>
