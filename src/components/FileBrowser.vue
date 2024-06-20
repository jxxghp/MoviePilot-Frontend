<script lang="ts" setup>
import type { Axios } from 'axios'
import FileList from './filebrowser/FileList.vue'
import FileToolbar from './filebrowser/FileToolbar.vue'
import type { EndPoints, FileItem } from '@/api/types'
import api from '@/api'
import AliyunAuthDialog from './dialog/AliyunAuthDialog.vue'
import U115AuthDialog from './dialog/U115AuthDialog.vue'
import { isNullOrEmptyObject } from '@/@core/utils'

// 输入参数
const props = defineProps({
  storages: String,
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
  itemstack: Array as PropType<FileItem[]>,
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
  {
    name: '115网盘',
    code: 'u115',
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
// 阿里云盘认证对话框
const aliyunAuthDialog = ref(false)
// 阿里云盘用户信息
const aliyunUserInfo = ref<{ [key: string]: any }>({})
// 115网盘认证对话框
const u115AuthDialog = ref(false)
// 115网盘用户信息
const u115UserInfo = ref<{ [key: string]: any }>({})

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

// 查询阿里云
async function loadAliyunUserInfo() {
  try {
    const result: { [key: string]: any } = await api.get('aliyun/userinfo')
    if (result.success) {
      aliyunUserInfo.value = result
    }
  } catch (error) {
    console.log(error)
  }
}

// 查询115
async function loadU115UserInfo() {
  try {
    const result: { [key: string]: any } = await api.get('u115/storage')
    if (result.success) {
      u115UserInfo.value = result
    }
  } catch (error) {
    console.log(error)
  }
}

// 存储切换
async function storageChanged(storage: string) {
  if (storage == 'aliyun') {
    await loadAliyunUserInfo()
    if (isNullOrEmptyObject(aliyunUserInfo.value)) {
      aliyunAuthDialog.value = true
      return
    }
  } else if (storage == 'u115') {
    await loadU115UserInfo()
    if (isNullOrEmptyObject(u115UserInfo.value)) {
      u115AuthDialog.value = true
      return
    }
  }
  activeStorage.value = storage
  emit('pathchanged', { path: '/', fileid: 'root' })
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

// aliyun认证完成
function aliyunAuthDone() {
  aliyunAuthDialog.value = false
  activeStorage.value = 'aliyun'
}

// u115认证完成
function u115AuthDone() {
  u115AuthDialog.value = false
  activeStorage.value = 'u115'
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
  <AliyunAuthDialog
    v-if="aliyunAuthDialog"
    v-model="aliyunAuthDialog"
    @close="aliyunAuthDialog = false"
    @done="aliyunAuthDone"
  />
  <U115AuthDialog v-if="u115AuthDialog" v-model="u115AuthDialog" @close="u115AuthDialog = false" @done="u115AuthDone" />
</template>
