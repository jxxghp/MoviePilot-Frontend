<script setup lang="ts">
import api from '@/api'
import { FileItem } from '@/api/types'
import { VTreeview } from 'vuetify/labs/VTreeview'

// 输入变量为默认路径
const props = defineProps({
  root: {
    type: String,
    default: '/',
    required: true,
  },
})

// update:modelValue 事件
const emit = defineEmits(['update:modelValue'])

// 激活的目录
const activedDirs = ref<string[]>([])

// 打开的目录
const openedDirs = ref<string[]>([])

// 目录列表
const treeItems = ref<FileItem[]>([
  {
    name: '/',
    path: props.root,
    children: [],
    type: '',
    basename: props.root,
    extension: '',
    size: 0,
    modify_time: 0,
    fileid: '',
    parent_fileid: '',
  },
])

// 拉取子目录
async function fetchDirs(item: any) {
  return api
    .get('/local/listdir?path=' + item.path)
    .then((data: any) => {
      item.children.push(...data)
    })
    .catch(err => console.warn(err))
}

// 获取选择的目录路径
const selectedPath = computed(() => {
  if (activedDirs.value.length > 0) {
    return activedDirs.value[0]
  }
  return ''
})

// 监听目录变化
watch(activedDirs, newVal => {
  if (!newVal.length) return
  emit('update:modelValue', selectedPath)
})

onMounted(() => {
  fetchDirs(treeItems.value[0])
})
</script>

<template>
  <VMenu :close-on-content-click="false" content-class="cursor-default">
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
      item-type="unknown"
      activatable
      return-object
      max-height="20rem"
      expand-icon="mdi-folder"
      collapse-icon="mdi-folder-open"
    >
    </VTreeview>
  </VMenu>
</template>
