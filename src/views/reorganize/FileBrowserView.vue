<script lang="ts" setup>
import api from '@/api'
import { FileItem, MediaDirectory } from '@/api/types'
import FileBrowser from '@/components/FileBrowser.vue'

const endpoints = {
  list: {
    url: '/filebrowser/{storage}/list?path={path}&sort={sort}&fileid={fileid}&filetype={filetype}',
    method: 'get',
  },
  mkdir: {
    url: '/filebrowser/{storage}/mkdir?path={path}&fileid={fileid}',
    method: 'get',
  },
  delete: {
    url: '/filebrowser/{storage}/delete?path={path}&fileid={fileid}',
    method: 'get',
  },
  download: {
    url: '/filebrowser/{storage}/download?path={path}&fileid={fileid}',
    method: 'get',
  },
  image: {
    url: '/filebrowser/{storage}/image?path={path}&fileid={fileid}',
    method: 'get',
  },
  rename: {
    url: '/filebrowser/{storage}/rename?path={path}&new_name={newname}&fileid={fileid}&filetype={filetype}',
    method: 'get',
  },
}

// 当前目录
const path = ref<string>('')

// 当前fileid
const fileid = ref<string>('root')

// fileid的堆栈
const fileidstack = ref<string[]>(['root'])

// 下载目录列表
const downloadDirectories = ref<MediaDirectory[]>([])

// 计算公共路径
function findCommonPath(paths: string[]): string {
  let commonPath
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
function pathChanged(item: FileItem) {
  path.value = item.path
  fileid.value = item.fileid
  if (item.fileid == 'root') return
  if (fileidstack.value.includes(item.fileid)) {
    fileidstack.value = fileidstack.value.slice(0, fileidstack.value.indexOf(item.fileid) + 1)
  } else {
    fileidstack.value.push(item.fileid)
  }
}

onBeforeMount(loadDownloadDirectories)
</script>

<template>
  <div>
    <FileBrowser
      storages="local,aliyun"
      :tree="false"
      :path="path"
      :fileid="fileid"
      :fileidstack="fileidstack"
      :endpoints="endpoints"
      :axios="api"
      @pathchanged="pathChanged"
    />
  </div>
</template>
