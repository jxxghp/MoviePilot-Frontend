<script lang="ts" setup>
import type { Axios } from 'axios'
import axios from 'axios'

import Toolbar from './filebrowser/Toolbar.vue'
import Tree from './filebrowser/Tree.vue'
import List from './filebrowser/List.vue'

// 输入参数
const props = defineProps({
  storages: String,
  storage: String,
  path: String,
  tree: String,
  endpoints: Object,
  axios: Object as PropType<Axios>,
  axiosConfig: Object,
  maxUploadFilesCount: Number,
  maxUploadFileSize: Number,
})

// 事件
const emit = defineEmits(['change'])

const availableStorages = [
  {
    name: '本地',
    code: 'local',
    icon: 'mdi-folder-multiple-outline',
  },
]

const endpoints = {
  list: { url: '/filebrowser/list?path={path}', method: 'get' },
  mkdir: { url: '/filebrowser/mkdir?path={path}', method: 'post' },
  delete: { url: '/filebrowser/delete?path={path}', method: 'post' },
}

const fileIcons = {
  zip: 'mdi-folder-zip-outline',
  rar: 'mdi-folder-zip-outline',
  htm: 'mdi-language-html5',
  html: 'mdi-language-html5',
  js: 'mdi-nodejs',
  json: 'mdi-json',
  md: 'mdi-markdown',
  pdf: 'mdi-file-pdf',
  png: 'mdi-file-image',
  jpg: 'mdi-file-image',
  jpeg: 'mdi-file-image',
  mp4: 'mdi-filmstrip',
  mkv: 'mdi-filmstrip',
  avi: 'mdi-filmstrip',
  wmv: 'mdi-filmstrip',
  mov: 'mdi-filmstrip',
  txt: 'mdi-file-document-outline',
  xls: 'mdi-file-excel',
  other: 'mdi-file-outline',
}

// 加载次数
const loading = ref(0)
// 当前路径
const path = ref(props.path)
// 当前存储
const activeStorage = ref('local')
// 刷新
const refreshPending = ref(false)
// axios实例
const axiosInstance = ref<Axios>()

// 计算属性
const storagesArray = computed(() => {
  const storageCodes = props.storages?.split(',')
  return availableStorages.filter(item => storageCodes?.includes(item.code))
})

// 方法
function loadingChanged(loading: number) {
  if (loading)
    loading++
  else if (loading > 0)
    loading--
}

function storageChanged(storage: string) {
  activeStorage.value = storage
}

function pathChanged(_path: string) {
  path.value = _path
  emit('change', path)
}

// 初始化
onMounted(() => {
  activeStorage.value = props.storage ?? 'local'
  axiosInstance.value = props.axios ?? axios.create(props.axiosConfig)
  if (!path.value)
    pathChanged('/')
})
</script>

<template>
  <VCard class="mx-auto" :loading="loading > 0">
    <Toolbar
      :path="path"
      :storages="storagesArray"
      :storage="activeStorage"
      :endpoints="endpoints"
      :axios="axiosInstance"
      @storagechanged="storageChanged"
      @pathchanged="pathChanged"
      @foldercreated="refreshPending = true"
    />
    <VRow no-gutters>
      <VCol v-if="tree" sm="auto" class="d-none d-md-block">
        <Tree
          :path="path"
          :storage="activeStorage"
          :icons="fileIcons"
          :endpoints="endpoints"
          :axios="axiosInstance"
          :refreshpending="refreshPending"
          @pathchanged="pathChanged"
          @loading="loadingChanged"
          @refreshed="refreshPending = false"
        />
      </VCol>
      <VDivider v-if="tree" vertical />
      <VCol>
        <List
          :path="path"
          :storage="activeStorage"
          :icons="fileIcons"
          :endpoints="endpoints"
          :axios="axiosInstance"
          :refreshpending="refreshPending"
          @path-changed="pathChanged"
          @loading="loadingChanged"
          @refreshed="refreshPending = false"
          @file-deleted="refreshPending = true"
        />
      </VCol>
    </VRow>
  </VCard>
</template>
