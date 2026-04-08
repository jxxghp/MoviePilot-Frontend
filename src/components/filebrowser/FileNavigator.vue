<script lang="ts" setup>
import type { PropType } from 'vue'
import type { FileItem } from '@/api/types'
import { useDisplay } from 'vuetify'
import type { AxiosRequestConfig, AxiosInstance } from 'axios'
import { useI18n } from 'vue-i18n'
import { usePWA } from '@/composables/usePWA'
import { useAvailableHeight } from '@/composables/useAvailableHeight'

// 国际化
const { t } = useI18n()

const display = useDisplay()

const { appMode } = usePWA()

// 计算列表可用高度
// componentOffset = FileToolbar(48) = 48
const { availableHeight } = useAvailableHeight(48, 300)

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
  axios: {
    type: Object as PropType<AxiosInstance>,
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

// 点击目录
function handleFolderClick(item: FileItem) {
  emit('navigate', item)
}

// 切换文件夹展开状态
async function toggleFolder(path: string) {
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

// 判断文件夹是否展开
function isFolderExpanded(path: string) {
  return expandedFolders.value.includes(path)
}

// 渲染文件夹图标
function renderFolderIcon(isExpanded: boolean) {
  if (isExpanded) {
    return 'mdi-folder-open'
  }
  return 'mdi-folder'
}

// 加载子目录
async function loadSubdirectories(path: string) {
  // 如果已经在加载中或已有缓存，跳过
  if (loading.value[path] || treeCache.value[path]) return

  // 标记为加载中
  loading.value[path] = true

  try {
    // 构建假的文件项以加载目录内容
    const fakeItem: FileItem = {
      storage: props.storage,
      type: 'dir',
      name: path.split('/').pop() || '/',
      path: path,
    }

    // 调用API加载目录内容
    const url = props.endpoints?.list.url.replace(/{sort}/g, 'name')

    const config: AxiosRequestConfig<FileItem> = {
      url,
      method: props.endpoints?.list.method || 'get',
      data: fakeItem,
    }

    const result = (await props.axios?.request(config))
    if (result && Array.isArray(result)) {
      // 过滤出目录项
      const dirs = result.filter(item => item.type === 'dir')

      // 缓存目录内容
      treeCache.value[path] = dirs
    }
  } catch (error) {
    console.error('加载目录失败:', path, error)
  } finally {
    // 取消加载状态
    loading.value[path] = false
  }
}

// 初始加载根目录
async function loadRootDirectories() {
  await loadSubdirectories('/')
}

// 检索所有目录节点
function getAllDirectories() {
  const allDirs: { dir: FileItem; level: number; parentPath: string }[] = []

  // 添加根目录的子目录
  if (treeCache.value['/']) {
    treeCache.value['/'].forEach(dir => {
      allDirs.push({ dir, level: 0, parentPath: '/' })
      addSubdirectories(dir.path || '', 1, allDirs)
    })
  }

  return allDirs
}

// 递归添加子目录
function addSubdirectories(
  parentPath: string,
  level: number,
  result: { dir: FileItem; level: number; parentPath: string }[],
) {
  if (treeCache.value[parentPath]) {
    treeCache.value[parentPath].forEach(dir => {
      result.push({ dir, level, parentPath })
      if (isFolderExpanded(dir.path || '')) {
        addSubdirectories(dir.path || '', level + 1, result)
      }
    })
  }
}

// 监听当前路径变化，自动展开当前路径
watch(
  () => props.currentPath,
  async newPath => {
    if (!newPath) return

    // 如果当前路径不是根目录，自动展开父目录
    if (newPath !== '/') {
      const parts = newPath.split('/').filter(p => p)
      let currentPath = ''

      // 展开到当前路径的每一层
      for (const part of parts) {
        currentPath += '/' + part

        // 如果该路径未展开，则展开它
        if (!expandedFolders.value.includes(currentPath)) {
          expandedFolders.value.push(currentPath)

          // 确保子目录已加载
          if (!treeCache.value[currentPath]) {
            await loadSubdirectories(currentPath)
          }
        }

        // 如果有上一级目录，确保它已加载
        const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/'
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
      treeCache.value[props.currentPath || '/'] = dirs
    }
  },
  { immediate: true },
)

// 是否为移动端
const isMobile = computed(() => {
  return display.smAndDown.value
})

// 可用的根目录列表
const rootDirectories = computed(() => {
  return treeCache.value['/'] || []
})

// 扁平化的目录树
const flattenedDirectories = computed(() => {
  return getAllDirectories()
})

// 检查路径是否为指定目录的子目录或后代
function isChildOrDescendant(path: string, ancestorPath: string) {
  if (!path || !ancestorPath) return false
  if (ancestorPath === '/') return true

  // 确保路径以斜杠结尾，便于比较
  const normalizedPath = path.endsWith('/') ? path : path + '/'
  const normalizedAncestorPath = ancestorPath.endsWith('/') ? ancestorPath : ancestorPath + '/'

  // 检查路径是否以祖先路径开头，但不是祖先路径本身
  return normalizedPath.startsWith(normalizedAncestorPath) && normalizedPath !== normalizedAncestorPath
}

// 计算目录相对于其祖先的缩进级别
function getIndentLevel(path: string, ancestorPath: string) {
  if (!path || !ancestorPath) return 0

  // 根目录特殊处理
  if (ancestorPath === '/') {
    return path.split('/').filter(p => p).length - 1
  }

  // 计算路径中斜杠的数量差异
  const pathParts = path.split('/').filter(p => p).length
  const ancestorParts = ancestorPath.split('/').filter(p => p).length

  return pathParts - ancestorParts
}

// 组件挂载时初始加载
onMounted(async () => {
  await loadRootDirectories()
})

</script>

<template>
  <VCard class="file-navigator rounded-e-0 rounded-t-0" v-if="!isMobile" :height="`${availableHeight}px`">
    <div class="tree-container">
      <!-- 根目录项 -->
      <div
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
      <!-- 加载根目录 -->
      <div v-if="loading['/']" class="tree-loading">
        <VProgressCircular indeterminate size="24" color="primary" class="ma-2" />
        <span>{{ t('file.loadingDirectoryStructure') }}</span>
      </div>

      <!-- 目录树结构 -->
      <template v-else>
        <!-- 一级目录(根目录下的目录) -->
        <div v-for="directory in rootDirectories" :key="directory.path" class="tree-item-container">
          <!-- 目录项 -->
          <div class="tree-item" :class="{ 'active': currentPath === directory.path }">
            <div class="folder-toggle" @click.stop="toggleFolder(directory.path || '')">
              <VProgressCircular
                v-if="loading[directory.path || '']"
                indeterminate
                size="14"
                width="2"
                color="primary"
              />
              <VIcon
                v-else
                size="small"
                :icon="isFolderExpanded(directory.path || '') ? 'mdi-chevron-down' : 'mdi-chevron-right'"
              />
            </div>
            <div class="folder-content" @click.stop="handleFolderClick(directory)">
              <VIcon
                size="small"
                :icon="renderFolderIcon(isFolderExpanded(directory.path || ''))"
                :color="currentPath === directory.path ? 'primary' : 'amber-darken-1'"
                class="me-1"
              />
              <span class="folder-name">
                {{ directory.name }}
              </span>
            </div>
          </div>

          <!-- 子目录容器 - 如果该目录被展开，显示其所有子目录 -->
          <div v-if="isFolderExpanded(directory.path || '')">
            <!-- 加载中状态 -->
            <div v-if="loading[directory.path || '']" class="tree-loading pl-8">
              <VProgressCircular indeterminate size="14" color="primary" class="ma-2" />
              <span class="text-caption">{{ t('common.loading') }}</span>
            </div>

            <!-- 所有层级的子目录列表 -->
            <div v-else>
              <!-- 遍历所有扁平化的目录列表，查找对应层级的目录 -->
              <div
                v-for="item in flattenedDirectories"
                :key="item.dir.path"
                v-show="isChildOrDescendant(item.dir.path || '', directory.path || '')"
                class="tree-item"
                :class="{ 'active': currentPath === item.dir.path }"
                :style="{ paddingLeft: 16 + getIndentLevel(item.dir.path || '', directory.path || '') * 12 + 'px' }"
              >
                <!-- 展开/折叠按钮 -->
                <div class="folder-toggle" @click.stop="toggleFolder(item.dir.path || '')">
                  <VProgressCircular
                    v-if="loading[item.dir.path || '']"
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

                <!-- 文件夹图标和名称 -->
                <div class="folder-content" @click.stop="handleFolderClick(item.dir)">
                  <VIcon
                    size="small"
                    :icon="renderFolderIcon(isFolderExpanded(item.dir.path || ''))"
                    :color="currentPath === item.dir.path ? 'primary' : 'amber-darken-1'"
                    class="me-1"
                  />
                  <span class="folder-name">
                    {{ item.dir.name }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </VCard>
</template>

<style lang="scss" scoped>
.file-navigator {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  flex-shrink: 0;
  background: rgb(var(--v-table-header-background));
  block-size: 100%;
  border-end-start-radius: 12px;
  inline-size: 240px;
}

.navigator-header {
  display: flex;
  align-items: center;
  border-block-end: 1px solid rgba(0, 0, 0, 8%);
  padding-block: 12px;
  padding-inline: 16px;
}

.tree-container {
  overflow: hidden auto;
  flex: 1;
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
    background-color: rgba(var(--v-theme-primary), 0.05);
  }

  &.active {
    background-color: rgba(var(--v-theme-primary), 0.08);
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
