<script lang="ts" setup>
import type { Axios } from 'axios'
import axios from 'axios'

import Toolbar from './filebrowser/Toolbar.vue'
import Tree from './filebrowser/Tree.vue'
import List from './filebrowser/List.vue'
import type { EndPoints } from '@/api/types'

// 输入参数
const props = defineProps({
  storages: String,
  storage: String,
  path: String,
  tree: String,
  endpoints: Object as PropType<EndPoints>,
  axios: Object as PropType<Axios>,
  axiosconfig: Object,
})

// 事件f
const emit = defineEmits(['change'])

console.log('FileBrowser Init Path', props.path)

const availableStorages = [
  {
    name: '本地',
    code: 'local',
    icon: 'mdi-folder-multiple-outline',
  },
]

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
const refreshPending = ref(true)
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
  console.log('Browser changePath', path.value)
  emit('change', path)
}

// 初始化
onBeforeMount(() => {
  activeStorage.value = props.storage ?? 'local'
  axiosInstance.value = props.axios ?? axios.create(props.axiosconfig)
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
      :endpoints="props.endpoints"
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
          @pathchanged="pathChanged"
          @loading="loadingChanged"
          @refreshed="refreshPending = false"
          @filedeleted="refreshPending = true"
        />
      </VCol>
    </VRow>
  </VCard>
</template>
