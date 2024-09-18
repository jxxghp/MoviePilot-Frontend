<script lang="ts" setup>
import type { Axios } from 'axios'
import FileList from './filebrowser/FileList.vue'
import FileToolbar from './filebrowser/FileToolbar.vue'
import type { EndPoints, FileItem, StorageConf } from '@/api/types'

// 输入参数
const props = defineProps({
  storages: Array as PropType<StorageConf[]>,
  tree: Boolean,
  endpoints: Object as PropType<EndPoints>,
  axios: {
    type: Object as PropType<Axios>,
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
})

// 对外事件
const emit = defineEmits(['pathchanged'])

const availableStorages = [
  {
    name: '本地',
    code: 'local',
    icon: 'mdi-folder-multiple-outline',
  },
  {
    name: '阿里云盘',
    code: 'alipan',
    icon: 'mdi-cloud-outline',
  },
  {
    name: '115网盘',
    code: 'u115',
    icon: 'mdi-cloud-outline',
  },
  {
    name: 'Rclone网盘',
    code: 'rclone',
    icon: 'mdi-cloud-outline',
  },
]

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

// 加载次数
const loading = ref(0)
// 当前存储
const activeStorage = ref('local')
// 刷新
const refreshPending = ref(false)
// 排序
const sort = ref('name')

// 计算属性
const storagesArray = computed(() => {
  const storageCodes = props.storages?.map(item => item.type)
  return availableStorages.filter(item => storageCodes?.includes(item.code))
})

// 方法
function loadingChanged(loading: number) {
  if (loading) loading++
  else if (loading > 0) loading--
}

// 存储切换
async function storageChanged(storage: string) {
  activeStorage.value = storage
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
</script>

<template>
  <VCard class="mx-auto" :loading="loading > 0">
    <div v-if="activeStorage && item">
      <FileToolbar
        :item="item"
        :itemstack="itemstack"
        :storages="storagesArray"
        :storage="activeStorage"
        :endpoints="endpoints"
        :axios="axios"
        @storagechanged="storageChanged"
        @pathchanged="pathChanged"
        @foldercreated="refreshPending = true"
        @sortchanged="sortChanged"
      />
      <FileList
        :item="item"
        :storage="activeStorage"
        :icons="fileIcons"
        :endpoints="endpoints"
        :axios="axios"
        :refreshpending="refreshPending"
        :sort="sort"
        @pathchanged="pathChanged"
        @loading="loadingChanged"
        @refreshed="refreshPending = false"
        @filedeleted="refreshPending = true"
        @renamed="refreshPending = true"
      />
    </div>
  </VCard>
</template>
