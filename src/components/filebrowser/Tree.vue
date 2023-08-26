<script lang="ts" setup>
import type { Axios } from 'axios'
import type { EndPoints, FileItem } from '@/api/types'

// 输入参数
const props = defineProps({
  icons: Object,
  storage: String,
  path: String,
  endpoints: Object as PropType<EndPoints>,
  axios: Object as PropType<Axios>,
  refreshpending: Boolean,
})

// 对外事件
const emit = defineEmits(['pathchanged', 'loading', 'refreshed'])

// 当前路径
const path = ref(props.path)

// 变量
const open = ref<string[]>([])
// 活跃的文件夹
const active = ref<string[]>([])
// 内容
const items = ref<FileItem[]>([])
// 过滤
const filter = ref('')
// 刷新状态
const refreshPending = ref(props.refreshpending || false)

// 方法
function init() {
  open.value = []
  items.value = [{
    type: 'dir',
    path: '/',
    basename: 'root',
    extension: '',
    name: 'root',
    children: [],
    size: 0,
  }]
}

// 调用API读取文件夹
async function readFolder(item: FileItem) {
  emit('loading', true)
  const url = props.endpoints?.list.url
    .replace(/{storage}/g, props.storage)
    .replace(/{path}/g, item.path)

  const config = {
    url,
    method: props.endpoints?.list.method || 'get',
  }

  const response: FileItem[] = await props.axios?.request(config) ?? []

  item.children = response.map((item: FileItem) => {
    if (item.type === 'dir')
      item.children = []

    return item
  })

  emit('loading', false)
}

// 选中变化
function activeChanged(_active: string[]) {
  console.log('Tree changePath', _active)
  active.value = _active
  let path = ''
  if (active.value.length)
    path = active.value[0]

  if (props.path !== path)
    emit('pathchanged', path)
}

// 查找文件
function findItem(path: string) {
  const stack: FileItem[] = []
  stack.push(items.value[0])
  while (stack.length > 0) {
    const node = stack.pop()
    if (node?.path === path) {
      return node
    }
    else if (node?.children && node.children.length) {
      for (const element of node.children)
        stack.push(element)
    }
  }
  return null
}

// 监听存储空间变量
watch(() => props.storage, () => {
  init()
})

// 监听路径变化
watch(
  path,
  () => {
    if (props.path) {
      active.value = [props.path]
      if (!open.value.includes(props.path))
        open.value.push(props.path)
    }
  })

// 监听 refreshPending
watch(
  refreshPending,
  async () => {
    if (refreshPending.value && props.path) {
      const item = findItem(props.path)
      if (item) {
        await readFolder(item)
        emit('refreshed')
      }
    }
  },
)

onMounted(() => {
  init()
})
</script>

<template>
  <VCard flat width="250" min-height="500" class="d-flex flex-column folders-tree-card">
    <div class="grow scroll-x">
      <VTreeview
        :open="open"
        :active="active"
        :items="items"
        :search="filter"
        :load-children="readFolder"
        item-key="path"
        item-text="basename"
        dense
        activatable
        transition
        class="folders-tree"
        @update:active="activeChanged"
      >
        <template #prepend="{ item, open }">
          <VIcon
            v-if="item.type === 'dir'"
          >
            {{ open ? 'mdi-folder-open-outline' : 'mdi-folder-outline' }}
          </VIcon>
          <VIcon v-else-if="props.icons" :icon="props.icons[item.extension.toLowerCase()] || props.icons.other" />
        </template>
        <template #label="{ item }">
          {{ item.basename }}
          <VBtn
            v-if="item.type === 'dir'"
            icon
            class="ml-1"
            @click.stop="readFolder(item)"
          >
            <VIcon class="pa-0 mdi-18px" color="grey lighten-1">
              mdi-refresh
            </VIcon>
          </VBtn>
        </template>
      </VTreeview>
    </div>
    <VDivider />
    <VToolbar
      density="compact"
    >
      <VBtn icon @click="init">
        <VIcon icon="mdi-collapse-all-outline" />
      </VBtn>
    </VToolbar>
  </VCard>
</template>

<style lang="scss" scoped>
.folders-tree-card {
    height: 100%;

    .scroll-x {
        overflow-x: auto;
    }

    ::v-deep .folders-tree {
        width: fit-content;
        min-width: 250px;

        .v-treeview-node {
            cursor: pointer;

            &:hover {
                background-color: rgba(0, 0, 0, 0.02);
            }
        }
    }
}
.v-toolbar{
  background: rgb(var(--v-table-header-background));
}
</style>
