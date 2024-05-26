<script lang="ts" setup>
import api from '@/api'
import { MediaDirectory } from '@/api/types'
import FileBrowser from '@/components/FileBrowser.vue'

const endpoints = {
  list: {
    url: '/filebrowser/list?path={path}&sort={sort}',
    method: 'get',
  },
  mkdir: {
    url: '/filebrowser/mkdir?path={path}',
    method: 'get',
  },
  delete: {
    url: '/filebrowser/delete?path={path}',
    method: 'get',
  },
  download: {
    url: '/filebrowser/download?path={path}',
    method: 'get',
  },
  image: {
    url: '/filebrowser/image?path={path}',
    method: 'get',
  },
  rename: {
    url: '/filebrowser/rename?path={path}&new_name={newname}',
    method: 'get',
  },
}

// 当前目录
const path: Ref<string | undefined> = ref()

// 下载目录列表
const downloadDirectories = ref<MediaDirectory[]>([])

// 查询下载目录
async function loadDownloadDirectories() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/DownloadDirectories')
    if (result.success && result.data?.value) {
      downloadDirectories.value = result.data.value
      if (downloadDirectories.value.length > 0) {
        path.value = downloadDirectories.value[downloadDirectories.value.length - 1].path
      } else {
        path.value = '/'
      }
    }
  } catch (error) {
    console.log(error)
  }
}

// 目录变化
function pathChanged(_path: string) {
  path.value = _path
}

onBeforeMount(loadDownloadDirectories)
</script>

<template>
  <div>
    <FileBrowser
      storages="local"
      :tree="false"
      :path="path"
      :endpoints="endpoints"
      :axios="api"
      @pathchanged="pathChanged"
    />
  </div>
</template>
