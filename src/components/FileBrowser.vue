<script lang="ts" setup>
import type { Axios } from 'axios'
import axios from 'axios'
import FileList from './filebrowser/FileList.vue'
import FileToolbar from './filebrowser/FileToolbar.vue'
import type { EndPoints } from '@/api/types'
import api from '@/api'
import AliyunAuthDialog from './dialog/AliyunAuthDialog.vue'
import { isNullOrEmptyObject } from '@/@core/utils'

// 输入参数
const props = defineProps({
  storages: String,
  storage: String,
  path: String,
  tree: Boolean,
  endpoints: Object as PropType<EndPoints>,
  axios: Object as PropType<Axios>,
  axiosconfig: Object,
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
    code: 'aliyun',
    icon: 'mdi-cloud-outline',
  },
]

const fileIcons = {
  zip: 'mdi-folder-zip-outline',
  rar: 'mdi-folder-zip-outline',
  htm: 'mdi-language-html5',
  html: 'mdi-language-html5',
  js: 'mdi-nodejs',
  json: 'mdi-file-document-outline',
  md: 'mdi-language-markdown-outline',
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
// 当前存储
const activeStorage = ref('local')
// 刷新
const refreshPending = ref(false)
// 排序
const sort = ref('name')
// axios实例
const axiosInstance = ref<Axios>()
// 阿里云盘认证对话框
const aliyunAuthDialog = ref(false)
// 阿里云盘认证参数
const aliyunParams = ref<{ [key: string]: any }>({})

// 计算属性
const storagesArray = computed(() => {
  const storageCodes = props.storages?.split(',')
  return availableStorages.filter(item => storageCodes?.includes(item.code))
})

// 方法
function loadingChanged(loading: number) {
  if (loading) loading++
  else if (loading > 0) loading--
}

// 查询阿里云token
async function loadAliyunParams() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/UserAliyunParams')
    if (result.success) {
      aliyunParams.value = result.data?.value
    }
  } catch (error) {
    console.log(error)
  }
}

// 存储切换
async function storageChanged(storage: string) {
  if (storage == 'aliyun') {
    await loadAliyunParams()
    if (isNullOrEmptyObject(aliyunParams.value)) {
      aliyunAuthDialog.value = true
      return
    }
  }
  activeStorage.value = storage
}

// 路径变化
function pathChanged(_path: string) {
  emit('pathchanged', _path)
}

// 排序变化
function sortChanged(s: string) {
  sort.value = s
  refreshPending.value = true
}

// aliyun认证完成
function aliyunAuthDone() {
  aliyunAuthDialog.value = false
  activeStorage.value = 'aliyun'
}

// 初始化
onMounted(() => {
  activeStorage.value = props.storage ?? 'local'
  axiosInstance.value = props.axios ?? axios.create(props.axiosconfig)
})
</script>

<template>
  <VCard class="mx-auto" :loading="loading > 0 || !path">
    <div v-if="path">
      <FileToolbar
        :path="path"
        :storages="storagesArray"
        :storage="activeStorage"
        :endpoints="endpoints"
        :axios="axiosInstance"
        @storagechanged="storageChanged"
        @pathchanged="pathChanged"
        @foldercreated="refreshPending = true"
        @sortchanged="sortChanged"
      />
      <FileList
        :path="path"
        :storage="activeStorage"
        :icons="fileIcons"
        :endpoints="endpoints"
        :axios="axiosInstance"
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
  <AliyunAuthDialog
    v-if="aliyunAuthDialog"
    v-model="aliyunAuthDialog"
    @close="aliyunAuthDialog = false"
    @done="aliyunAuthDone"
  />
</template>
