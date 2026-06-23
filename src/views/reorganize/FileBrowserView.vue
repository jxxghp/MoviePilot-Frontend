<script lang="ts" setup>
import api from '@/api'
import { FileItem, StorageConf, TransferDirectoryConf } from '@/api/types'
import FileBrowser from '@/components/filebrowser/FileBrowser.vue'

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
const storageTypes = computed(() => storages.value.map(s => s.type))

// 当前文件项
const operItem = ref<FileItem | undefined>(undefined)

// fileid的堆栈
const itemstack = ref<FileItem[]>([])

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

const STORAGE_KEY = 'fileBrowserView.activeStorage'

interface BrowserInitialParams {
  storage: string
  path: string
  name: string
}
// determine which entry to select initially
function determineBrowserInitialParams(downloadDirectories: TransferDirectoryConf[]): BrowserInitialParams {
  const isAvailable = (storage: string) => storageTypes.value.includes(storage)
  const buckets = downloadDirectories.reduce<Map<string, string[]>>((dict, item) => {
    // filter out directories whose storage is not available
    if (!isAvailable(item.storage)) {
      return dict
    }
    if (item.download_path == undefined) {
      return dict
    }
    if (!dict.has(item.storage)) {
      dict.set(item.storage, [item.download_path])
    } else {
      dict.get(item.storage)!.push(item.download_path)
    }
    return dict
  }, new Map())

  const cachedStorage = localStorage.getItem(STORAGE_KEY) || ''
  // if no download directories are configured, fall back to cached storage or first available storage
  if (buckets.size === 0) {
    return {
      storage: isAvailable(cachedStorage) ? cachedStorage : storageTypes.value[0] || 'local',
      path: '/',
      name: '/',
    }
  }
  let selectedEntry: [string, string[]]
  if (cachedStorage && buckets.has(cachedStorage)) {
    selectedEntry = [cachedStorage, buckets.get(cachedStorage)!]
  } else {
    // if no storage selected previously, use the most populous one
    selectedEntry = Array.from(buckets.entries()).reduce((prev, curr) => {
      return curr[1].length > prev[1].length ? curr : prev
    })
  }

  const path = findCommonPath(selectedEntry[1])
  return {
    storage: selectedEntry[0],
    path,
    name: path.split('/').filter(Boolean).pop() ?? '',
  }
}

// 查询下载目录
async function loadDownloadDirectories() {
  try {
    // fetch available storages
    const storageResult: { [key: string]: any } = await api.get('system/setting/public/Storages')
    storages.value = storageResult.data?.value ?? []

    const result: { [key: string]: any } = await api.get('system/setting/public/Directories')
    if (result.success && result.data?.value) {
      const { storage, path, name } = determineBrowserInitialParams(result.data.value)
      // operItem初始化
      operItem.value = {
        type: 'dir',
        storage,
        name: name,
        path: path,
      }
      // itemstack初始化
      itemstack.value = [
        {
          storage: storage,
          type: 'dir',
          name: '/',
          path: '/',
          fileid: 'root',
        },
      ]
      // 将初始数据拆分到堆栈中
      const paths = path.split('/').filter(Boolean)
      paths.map((name, index) => {
        const path = '/' + paths.slice(0, index + 1).join('/') + '/'
        itemstack.value.push({
          storage,
          type: 'dir',
          name,
          path,
        })
      })
    }
  } catch (error) {
    console.log(error)
  }
}

// 目录变化
function pathChanged(item: FileItem) {
  // save storage to localStorage
  if (item.storage !== operItem.value?.storage) {
    localStorage.setItem(STORAGE_KEY, item.storage)
  }

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
onMounted(loadDownloadDirectories)
</script>

<template>
  <div class="file-browser-view app-surface-static">
    <FileBrowser
      v-if="operItem"
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

<style lang="scss" scoped>
.file-browser-view {
  position: relative;
  overflow: hidden;
  block-size: 100%;
}
</style>
