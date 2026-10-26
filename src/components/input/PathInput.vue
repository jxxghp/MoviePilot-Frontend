<script setup lang="ts">
import api from '@/api'
import { FileItem } from '@/api/types'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/** 目录树的续载节点记录其所属目录，不作为真实路径提交。 */
interface DirectoryNode extends FileItem {
  children?: DirectoryNode[]
  moreFor?: string
}

const props = defineProps({
  modelValue: {
    type: String,
    default: '/',
  },
  root: {
    type: String,
    default: '/',
  },
  storage: {
    type: String,
    default: 'local',
  },
})

const emit = defineEmits(['update:modelValue'])

const menuVisible = ref(false)

const treeItems = ref<DirectoryNode[]>([
  {
    name: '/',
    path: props.root,
    children: [],
    type: 'dir',
    basename: props.root,
    storage: props.storage,
  },
])

const activedDirs = ref<FileItem[]>([])

const openedDirs = ref<FileItem[]>([])
const nextPages = new Map<string, number>()
const pendingPaths = new Set<string>()

/** 每次只加载一页子项，使用续载节点保留后续目录的访问入口。 */
async function fetchDirs(value: unknown) {
  if (!isFileItem(value)) return
  const node = value
  const root = treeItems.value[0]
  const item = node.moreFor ? findPath(treeItems.value[0], node.moreFor) : node
  if (!item || pendingPaths.has(item.path)) return
  const page = nextPages.get(item.path) ?? 1
  pendingPaths.add(item.path)
  try {
    const data = await api.post<FileItem[]>(
      '/storage/list',
      { ...item, children: undefined, moreFor: undefined },
      {
        params: { page, count: 200, sort: 'name' },
      },
    )
    if (root !== treeItems.value[0]) return
    const children: DirectoryNode[] = [
      ...(item.children ?? []).filter(child => !child.moreFor),
      ...data.filter(i => i.type === 'dir'),
    ]
    if (data.length === 200) {
      nextPages.set(item.path, page + 1)
      children.push({
        type: 'dir',
        storage: item.storage,
        path: `__more__${item.path}`,
        name: t('common.loadMore'),
        moreFor: item.path,
        children: [],
      })
    } else {
      nextPages.delete(item.path)
    }
    item.children = children
  } catch (err) {
    console.warn(err)
  } finally {
    if (root === treeItems.value[0]) pendingPaths.delete(item.path)
  }
}

/** 在已加载的目录节点中查找路径。 */
function findPath(item: DirectoryNode, path: string): DirectoryNode | null {
  if (item.path === path) {
    return item
  }
  if (item.children) {
    for (const child of item.children) {
      const res = findPath(child, path)
      if (res) {
        return res
      }
    }
  }
  return null
}

/** 逐级定位现有路径；目标不在首屏时按需续载所在目录。 */
async function expandDirs(path: string) {
  // 分割路径
  const paths = path.split('/').filter(i => i)
  // 展开根目录
  const root_item = treeItems.value[0]
  await fetchDirs(root_item)
  openedDirs.value.push(root_item)
  // 逐级展开
  let currentPath = '/'
  let parent = root_item
  for (const p of paths) {
    currentPath += `${p}/`
    // 查询当前目录
    let item = findPath(root_item, currentPath)
    while (!item && nextPages.has(parent.path)) {
      const previousPage = nextPages.get(parent.path)
      await fetchDirs(parent)
      item = findPath(root_item, currentPath)
      if (nextPages.get(parent.path) === previousPage) break
    }
    if (!item) {
      break
    }
    // 加载子目录
    if (item.children?.length === 0) {
      await fetchDirs(item)
    }
    // 打开当前目录
    if (!openedDirs.value.includes(item) && path != currentPath) {
      openedDirs.value.push(item)
    }
    // 选中当前目录
    if (path == currentPath) {
      activedDirs.value = [item]
    }
    parent = item
  }
}

// 当前选中项
const selectedPath = computed(() => {
  if (activedDirs.value.length > 0) {
    return activedDirs.value[0].path
  }
  return ''
})

/** 校验树事件是否携带可定位的节点。 */
function isFileItem(value: unknown): value is DirectoryNode {
  return typeof value === 'object' && value !== null && 'path' in value && 'type' in value
}

/** 续载节点只触发下一页查询，真实目录才更新输入值。 */
function activateDir({ id }: { id: unknown }) {
  const item = isFileItem(id) ? id : typeof id === 'string' ? findPath(treeItems.value[0], id) : null

  if (!item || item.type !== 'dir') return
  if (item.moreFor) {
    void fetchDirs(item)
    return
  }

  activedDirs.value = [item]
}

watch(activedDirs, newVal => {
  if (!newVal.length || (newVal[0] as DirectoryNode).moreFor) return

  emit('update:modelValue', selectedPath.value)
})

watch(
  () => menuVisible.value,
  async visible => {
    if (visible) {
      nextPages.clear()
      pendingPaths.clear()
      treeItems.value = [
        {
          name: '/',
          path: props.root,
          children: [],
          type: 'dir',
          basename: props.root,
          storage: props.storage,
        },
      ]
      openedDirs.value = []
      activedDirs.value = []
      await expandDirs(props.modelValue)
    }
  },
)

watch(
  () => props.storage,
  async newVal => {
    nextPages.clear()
    pendingPaths.clear()
    treeItems.value = [
      {
        name: '/',
        path: props.root,
        children: [],
        type: 'dir',
        basename: props.root,
        storage: newVal,
      },
    ]
    activedDirs.value = []
    openedDirs.value = []
  },
)
</script>

<template>
  <div>
    <VMenu v-model="menuVisible" :close-on-content-click="false" content-class="cursor-default">
      <template v-slot:activator="{ props }">
        <slot name="activator" :menuprops="props" />
      </template>
      <VTreeview
        v-model:activated="activedDirs"
        v-model:opened="openedDirs"
        :items="treeItems"
        :load-children="fetchDirs"
        item-key="path"
        item-title="name"
        item-value="path"
        activatable
        return-object
        max-height="20rem"
        open-on-click
        expand-icon="mdi-folder"
        collapse-icon="mdi-folder-open"
        @click:open="activateDir"
      />
    </VMenu>
  </div>
</template>
