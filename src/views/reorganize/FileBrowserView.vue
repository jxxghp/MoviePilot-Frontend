<script lang="ts" setup>
import api from '@/api'
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

// 读取下载目录
const path: Ref<string | undefined> = ref()

// 调用API，加载当前系统环境设置
function loadSystemSettings(): Promise<string> {
  return new Promise((resolve, reject) => {
    api
      .get('system/env')
      .then((result: any) => {
        let path = '/'
        if (result.success)
          path = result.data?.DOWNLOAD_PATH || '/'

        if (!path.endsWith('/'))
          path += '/'

        resolve(path)
      })
      .catch(error => reject(error))
  })
}

function pathChanged(_path: string) {
  path.value = _path
}

onMounted(() => {
  loadSystemSettings()
    .then((res) => {
      path.value = res
    })
    .catch((error) => {
      console.error(error)
      path.value = '/'
    })
})
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
