<script lang="ts" setup>
import api from '@/api'
import { FileItem, StorageConf, TransferDirectoryConf } from '@/api/types'
import FileBrowser from '@/components/FileBrowser.vue'

const endpoints = {
  list: {
    url: '/storage/list?sort={sort}',
    method: 'post',
  },
  mkdir: {
    url: '/storage/mkdir?name={name}',
    method: 'post',
  },
  delete: {
    url: '/storage/delete',
    method: 'post',
  },
  download: {
    url: '/storage/download',
    method: 'post',
  },
  image: {
    url: '/storage/image',
    method: 'post',
  },
  rename: {
    url: '/storage/rename?new_name={newname}',
    method: 'post',
  },
}

// 所有存储
const storages = ref<StorageConf[]>([])

// 查询存储
async function loadStorages() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Storages')

    storages.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 当前文件项
const operItem = ref<FileItem>({
  storage: 'local',
  type: 'dir',
  name: '/',
  path: '/',
  fileid: 'root',
})

// fileid的堆栈
const itemstack = ref<FileItem[]>([
  {
    storage: 'local',
    type: 'dir',
    name: '/',
    path: '/',
    fileid: 'root',
  },
])

// 下载目录列表
const downloadDirectories = ref<TransferDirectoryConf[]>([])

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
    commonPath = commonPath.replace('\\', '/')
  }

  return commonPath
}

// 查询下载目录
async function loadDownloadDirectories() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Directories')
    if (result.success && result.data?.value) {
      downloadDirectories.value = result.data.value
      const path = findCommonPath(downloadDirectories.value.map(item => item.download_path) as string[])
      const name = path.split('/').filter(Boolean).pop() ?? ''
      operItem.value = {
        storage: 'local',
        type: 'dir',
        name: name,
        path: path,
      }
      // 将初始数据拆分到堆栈中
      const paths = path.split('/').filter(Boolean)
      paths.map((name, index) => {
        const path = '/' + paths.slice(0, index + 1).join('/') + '/'
        itemstack.value.push({
          storage: 'local',
          type: 'dir',
          name: name,
          path: path,
        })
      })
    }
  } catch (error) {
    console.log(error)
  }
}

// 目录变化
function pathChanged(item: FileItem) {
  operItem.value = item
  if (item.path == '/') {
    itemstack.value = [
      {
        storage: item.storage,
        type: 'dir',
        name: '/',
        path: '/',
        fileid: item.fileid || 'root',
      },
    ]
    return
  }
  const index = itemstack.value.findIndex(i => i.path === item.path)
  if (index >= 0) {
    itemstack.value = itemstack.value.slice(0, index + 1)
  } else {
    itemstack.value.push(item)
  }
}

// 加载初始目录
onBeforeMount(loadDownloadDirectories)

onMounted(() => {
  loadStorages()
})
</script>

<template>
  <div>
    <FileBrowser
      :storages="storages"
      :tree="false"
      :itemstack="itemstack"
      :endpoints="endpoints"
      :axios="api"
      :item="operItem"
      @pathchanged="pathChanged"
    />
  </div>
</template>
