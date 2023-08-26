<script lang="ts" setup>
import api from '@/api'
import type { Setting } from '@/api/types'
import FileBrowser from '@/components/FileBrowser.vue'

const endpoints = {
  list: { url: '/filebrowser/list?path={path}', method: 'get' },
  mkdir: { url: '/filebrowser/mkdir?path={path}', method: 'get' },
  delete: { url: '/filebrowser/delete?path={path}', method: 'get' },
  download: { url: '/filebrowser/download?path={path}', method: 'get' },
  image: { url: '/filebrowser/image?path={path}', method: 'get' },
  rename: { url: '/filebrowser/rename?path={path}&new_name={newname}', method: 'get' },
}

// 读取下载目录
const systemEnv: Setting = inject('systemEnv') ?? {
  DOWNLOAD_PATH: '/',
}

if (systemEnv?.DOWNLOAD_PATH && !systemEnv.DOWNLOAD_PATH?.endsWith('/'))
  systemEnv.DOWNLOAD_PATH += '/'
</script>

<template>
  <div>
    <FileBrowser storages="local" :tree="false" :path="systemEnv?.DOWNLOAD_PATH" :endpoints="endpoints" :axios="api" />
  </div>
</template>
