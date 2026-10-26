<script lang="ts" setup>
import type { PropType } from 'vue'
import type { FileItem } from '@/api/types'
import type { AxiosRequestConfig } from 'axios'
import type { DataApiClient } from '@/api'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

type TreeRow =
  | { type: 'root'; key: string; level: number }
  | { type: 'loading'; key: string; path: string; level: number }
  | { type: 'more'; key: string; path: string; level: number }
  | { type: 'directory'; key: string; dir: FileItem; level: number }

// 输入参数
const props = defineProps({
  storage: {
    type: String,
    required: true,
  },
  currentPath: {
    type: String,
    default: '/',
  },
  items: {
    type: Array as PropType<FileItem[]>,
    default: () => [],
  },
  endpoints: Object,
  // Axios 实例是可调用函数，运行时 prop 类型需与其实际形态一致。
  axios: {
    type: Function as PropType<DataApiClient>,
    required: true,
  },
})

// 对外事件
const emit = defineEmits(['navigate'])

// 树形节点缓存
const treeCache = ref<{ [key: string]: FileItem[] }>({})

// 展开的文件夹
const expandedFolders = ref<string[]>([])

// 是否正在加载
const loading = ref<{ [key: string]: boolean }>({})
const nextPages = ref<Record<string, number>>({})

// 存储切换后丢弃缓存与在途结果，同一路径不代表同一个存储目录。
let storageGeneration = 0
watch(
  () => props.storage,
  () => {
    storageGeneration += 1
    treeCache.value = {}
    expandedFolders.value = []
    loading.value = {}
    nextPages.value = {}
  },
  { flush: 'sync' },
)
onUnmounted(() => {
  storageGeneration += 1
})

/** 对齐目录尾部分隔符，匹配缓存中保留完整存储身份的文件项。 */
function directoryPath(path: string) {
  let end = path.length
  while (end > 1 && path[end - 1] === '/') {
    if (end === 3 && path[0] !== '/' && path[1] === ':') break
    end -= 1
  }
  return path.slice(0, end) || '/'
}

/** 点击目录，同时传递树中已知的祖先标识供面包屑返回使用。 */
function handleFolderClick(item: FileItem) {
  if (item.storage !== props.storage) return
  const targetPath = directoryPath(item.path)
  const ancestors = new Map<string, FileItem>()
  Object.values(treeCache.value)
    .flat()
    .forEach(directory => {
      const path = directoryPath(directory.path)
      const prefix = path.endsWith('/') ? path : `${path}/`
      if (directory.storage === item.storage && (targetPath === path || targetPath.startsWith(prefix))) {
        ancestors.set(path, directory)
      }
    })
  ancestors.set(targetPath, item)
  const lineage = [...ancestors.values()].sort((left, right) => left.path.length - right.path.length)
  if (lineage.length > 1) emit('navigate', item, lineage)
  else emit('navigate', item)
}

/** 切换文件夹展开状态。 */
async function toggleFolder(path: string) {
  path = directoryPath(path)
  const index = expandedFolders.value.indexOf(path)
  if (index >= 0) {
    // 折叠文件夹
    expandedFolders.value.splice(index, 1)
  } else {
    // 展开文件夹
    expandedFolders.value.push(path)
    // 如果缓存中没有此目录内容，加载它
    if (!treeCache.value[path]) {
      await loadSubdirectories(path)
    }
  }
}

/** 判断文件夹是否展开。 */
function isFolderExpanded(path: string) {
  return expandedFolders.value.includes(directoryPath(path))
}

/** 渲染文件夹图标。 */
function renderFolderIcon(isExpanded: boolean) {
  if (isExpanded) {
    return 'mdi-folder-open'
  }
  return 'mdi-folder'
}

/** 加载子目录。 */
async function loadSubdirectories(path: string, append = false) {
  path = directoryPath(path)
  // 如果已经在加载中或已有缓存，跳过
  if (loading.value[path] || (!append && treeCache.value[path])) return
  const storage = props.storage
  const page = append ? (nextPages.value[path] ?? 1) : 1

  const generation = storageGeneration
  // 标记为加载中
  loading.value[path] = true

  try {
    // 云盘目录可能要求 fileid/drive_id；优先沿用列表返回的真实身份。
    const directoryItem: FileItem = Object.values(treeCache.value)
      .flat()
      .find(item => item.storage === storage && directoryPath(item.path) === directoryPath(path)) ?? {
      storage,
      type: 'dir',
      name: path.split('/').filter(Boolean).pop() || '/',
      path,
    }

    // 调用API加载目录内容
    const url = props.endpoints?.list.url.replace(/{sort}/g, 'name')

    const config: AxiosRequestConfig<FileItem> = {
      url,
      method: props.endpoints?.list.method || 'get',
      data: directoryItem,
      params: { page, count: 200 },
    }

    const result = await props.axios?.request<FileItem[]>(config)
    if (generation === storageGeneration && result && Array.isArray(result)) {
      // 过滤出目录项
      const dirs = result.filter(item => item.type === 'dir')

      // 缓存目录内容
      const previous = append ? (treeCache.value[path] ?? []) : []
      treeCache.value[path] = Array.from(new Map([...previous, ...dirs].map(item => [item.path, item])).values())
      if (result.length === 200) nextPages.value[path] = page + 1
      else delete nextPages.value[path]
    }
  } catch (error) {
    console.error('加载目录失败:', path, error)
  } finally {
    // 取消加载状态
    if (generation === storageGeneration) loading.value[path] = false
  }
}

/** 初始加载根目录。 */
async function loadRootDirectories() {
  await loadSubdirectories('/')
}

// 监听当前路径变化，自动展开当前路径
watch(
  () => props.currentPath,
  async newPath => {
    if (!newPath) return
    const generation = storageGeneration

    // 如果当前路径不是根目录，自动展开父目录
    if (newPath !== '/') {
      const parts = newPath.split('/').filter(p => p)
      let currentPath = newPath.startsWith('/') ? '/' : ''

      // 展开到当前路径的每一层
      for (const part of parts) {
        if (generation !== storageGeneration) return
        currentPath += (currentPath && !currentPath.endsWith('/') ? '/' : '') + part
        if (currentPath.length === 2 && currentPath[1] === ':') currentPath += '/'

        // 如果该路径未展开，则展开它
        if (!expandedFolders.value.includes(currentPath)) {
          expandedFolders.value.push(currentPath)

          // 确保子目录已加载
          if (!treeCache.value[currentPath]) {
            await loadSubdirectories(currentPath)
          }
        }

        if (generation !== storageGeneration) return
        // 如果有上一级目录，确保它已加载
        let parentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/'
        if (parentPath.length === 2 && parentPath[1] === ':') parentPath += '/'
        if (parentPath === currentPath) parentPath = '/'
        if (!treeCache.value[parentPath]) {
          await loadSubdirectories(parentPath)
        }
      }
    }
  },
  { immediate: true },
)

// 监听目录变化，缓存当前目录的内容
watch(
  () => props.items,
  newItems => {
    if (newItems) {
      // 过滤出目录项
      const dirs = newItems.filter(item => item.type === 'dir')

      // 缓存当前目录内容
      const path = directoryPath(props.currentPath || '/')
      treeCache.value[path] = dirs
      if (newItems.length > 0 && newItems.length % 200 === 0) nextPages.value[path] = newItems.length / 200 + 1
      else delete nextPages.value[path]
    }
  },
  { immediate: true },
)

// 可用的根目录列表
const rootDirectories = computed(() => {
  return treeCache.value['/'] || []
})

// 只生成当前可见的目录行，避免折叠/隐藏节点继续留在 DOM 中
const visibleTreeRows = computed<TreeRow[]>(() => {
  const rows: TreeRow[] = [{ type: 'root', key: 'root', level: 0 }]

  if (loading.value['/']) {
    rows.push({ type: 'loading', key: 'loading:/', path: '/', level: 0 })
    return rows
  }

  rootDirectories.value.forEach(dir => addVisibleDirectoryRows(dir, 0, rows))
  if (nextPages.value['/']) rows.push({ type: 'more', key: 'more:/', path: '/', level: 0 })

  return rows
})

/** 将展开的目录及其续载入口投影为虚拟列表行。 */
function addVisibleDirectoryRows(dir: FileItem, level: number, rows: TreeRow[]) {
  const path = directoryPath(dir.path || '')

  rows.push({
    type: 'directory',
    key: path || `${level}:${dir.name}`,
    dir,
    level,
  })

  if (!path || !isFolderExpanded(path)) {
    return
  }

  if (loading.value[path]) {
    rows.push({
      type: 'loading',
      key: `loading:${path}`,
      path,
      level: level + 1,
    })
    return
  }

  treeCache.value[path]?.forEach(child => addVisibleDirectoryRows(child, level + 1, rows))
  if (nextPages.value[path]) rows.push({ type: 'more', key: `more:${path}`, path, level: level + 1 })
}

/** 按目录层级计算缩进，保持虚拟列表行高固定。 */
function getTreeRowStyle(level: number) {
  return {
    paddingInlineStart: level > 0 ? `${16 + level * 12}px` : undefined,
  }
}

// 组件挂载时初始加载
onMounted(async () => {
  await loadRootDirectories()
})
</script>

<template>
  <nav class="file-navigator" :aria-label="t('file.directoryTree')">
    <VVirtualScroll :items="visibleTreeRows" :item-height="32" class="tree-container">
      <template #default="{ item }">
        <div
          v-if="item.type === 'root'"
          :key="item.key"
          class="tree-item root-item"
          :class="{ 'active': currentPath === '/' }"
          @click="
            handleFolderClick({
              storage: storage,
              type: 'dir',
              name: '/',
              path: '/',
            })
          "
        >
          <div class="folder-content">
            <VIcon icon="mdi-home" class="me-2" color="primary" />
            <span>{{ t('file.rootDirectory') }}</span>
          </div>
        </div>

        <div
          v-else-if="item.type === 'loading'"
          :key="item.key"
          class="tree-loading"
          :style="getTreeRowStyle(item.level)"
        >
          <VProgressCircular indeterminate size="14" color="primary" class="ma-2" />
          <span class="text-caption">
            {{ item.path === '/' ? t('file.loadingDirectoryStructure') : t('common.loading') }}
          </span>
        </div>

        <VBtn
          v-else-if="item.type === 'more'"
          variant="text"
          :style="getTreeRowStyle(item.level)"
          @click="loadSubdirectories(item.path, true)"
        >
          {{ t('common.loadMore') }}
        </VBtn>
        <div
          v-else
          :key="item.key"
          class="tree-item"
          :class="{ 'active': currentPath === item.dir.path }"
          :style="getTreeRowStyle(item.level)"
        >
          <div class="folder-toggle" @click.stop="toggleFolder(item.dir.path || '')">
            <VProgressCircular
              v-if="loading[directoryPath(item.dir.path || '')]"
              indeterminate
              size="14"
              width="2"
              color="primary"
            />
            <VIcon
              v-else
              size="small"
              :icon="isFolderExpanded(item.dir.path || '') ? 'mdi-chevron-down' : 'mdi-chevron-right'"
            />
          </div>
          <div class="folder-content" @click.stop="handleFolderClick(item.dir)">
            <VIcon
              size="small"
              :icon="renderFolderIcon(isFolderExpanded(item.dir.path || ''))"
              :color="currentPath === item.dir.path ? 'primary' : undefined"
              class="me-1"
            />
            <span class="folder-name">
              {{ item.dir.name }}
            </span>
          </div>
        </div>
      </template>
    </VVirtualScroll>
  </nav>
</template>

<style lang="scss" scoped>
.file-navigator {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  flex-shrink: 0;
  min-block-size: 0;
  block-size: 100%;

  inline-size: 240px;
  max-inline-size: 100%;
}

// 移动端弹层自己定义尺寸，不依赖其它组件样式的加载顺序。
.file-navigator.file-navigator--sheet {
  inline-size: 100%;
  block-size: min(65dvh, 32rem);
}

.navigator-header {
  display: flex;
  align-items: center;
  border-block-end: 1px solid rgba(0, 0, 0, 8%);
  padding-block: 12px;
  padding-inline: 16px;
}

.tree-container {
  flex: 1;
  min-block-size: 0;
}

.tree-item-container {
  inline-size: 100%;
}

.tree-item {
  display: flex;
  box-sizing: border-box;
  align-items: center;
  cursor: pointer;
  max-inline-size: 100%;
  min-inline-size: 100%;
  transition: background-color 0.2s ease;

  &:hover {
    border-radius: var(--app-control-radius);
    background-color: var(--app-grouped-list-hover-background);
  }

  &.active {
    border-radius: var(--app-control-radius);
    background-color: var(--app-grouped-list-active-background);
  }
}

.folder-toggle {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  block-size: 16px;
  inline-size: 16px;
  margin-inline-end: 4px;
  padding-block: 6px;
  padding-inline: 12px 0;
}

.folder-content {
  display: flex;
  overflow: hidden;
  flex: 1;
  align-items: center;
  min-inline-size: 0;
  padding-block: 6px;
  padding-inline: 8px 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.root-item {
  font-weight: 500;
}

.folder-name {
  display: inline-block;
  overflow: hidden;
  max-inline-size: 150px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subdirectory-container {
  inline-size: 100%;
}

.tree-loading {
  display: flex;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  padding-block: 4px;
  padding-inline: 16px;
}

.pl-8 {
  padding-inline-start: 20px !important;
}
</style>
