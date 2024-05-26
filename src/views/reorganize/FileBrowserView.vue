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

// 计算公共路径
function findCommonPath(paths: string[]): string {
  let commonPath = '/'
  if (!paths || paths.length === 0) {
    commonPath = '/'
  } else if (paths.length === 1) {
    commonPath = paths[0]
    commonPath = commonPath.replace(/\\/g, '/')
  } else {
    const normalizedPaths = paths.map(path => path.replace(/\\/g, '/'))
    const splitPaths = normalizedPaths.map(path => path.split('/'))
    let commonParts: string[] = []
    for (let i = 0; i < splitPaths[0].length; i++) {
      const part = splitPaths[0][i]
      if (splitPaths.every(pathParts => pathParts[i] === part)) {
        commonParts.push(part)
      } else {
        break
      }
    }
    commonPath = commonParts.join('/')
  }

  if (!commonPath.endsWith('/')) {
    commonPath += '/'
  }

  if (commonPath.includes(':')) {
    commonPath = commonPath.replace('/', '\\')
  }

  return commonPath
}

// 查询下载目录
async function loadDownloadDirectories() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/DownloadDirectories')
    if (result.success && result.data?.value) {
      downloadDirectories.value = result.data.value
      path.value = findCommonPath(downloadDirectories.value.map(item => item.path) as string[])
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
