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

// 当前选中的目录
const selectedDir = ref<string>('')

// 目录列表
const treeItems = ref<FileItem[]>([
  {
    name: props.root,
    path: props.root,
    children: [],
    type: '',
    basename: props.root,
    extension: '',
    size: 0,
    modify_time: 0,
  },
])

// 拉取子目录
async function fetchDirs(item: any) {
  return api
    .get('/filebrowser/listdir?path=' + item.path)
    .then((data: any) => {
      item.children.push(...data)
    })
    .catch(err => console.warn(err))
}

// 监听目录变化
watch(activedDirs, newVal => {
  if (!newVal.length) return
  selectedDir.value = newVal[0]
  emit('update:modelValue', newVal[0])
})

onMounted(() => {
  fetchDirs(treeItems.value[0])
})
</script>

<template>
  <VMenu>
    <template v-slot:activator="{ props }">
      <VTextField v-model="selectedDir" label="路径" variant="underlined" v-bind="props"></VTextField>
    </template>
    <VTreeview
      v-model:activated="activedDirs"
      v-model:opened="openedDirs"
      :items="treeItems"
      :load-children="fetchDirs"
      density="compact"
      item-key="path"
      item-title="name"
      item-value="path"
      item-type="unknown"
      activatable
      open-on-click
      transition
      return-object
      max-height="20rem"
      selectable
      class="cursor-pointer"
    >
    </VTreeview>
  </VMenu>
</template>
