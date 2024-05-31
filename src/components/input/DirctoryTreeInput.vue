<script setup lang="ts">
import api from '@/api'
import { VTreeview } from 'vuetify/labs/VTreeview'

// 激活的目录
const activedDirs = ref<string[]>([])

// 打开的目录
const openedDirs = ref<string[]>([])

// 目录列表
const items = ref([
  {
    name: '/',
    path: '/',
    children: [],
  },
])

const itemList = computed(() => {
  return [
    {
      name: '/',
      path: '/',
      children: items.value,
    },
  ]
})

// 拉取子目录
async function fetchDirs(item: any) {
  return api
    .get('/filebrowser/listdir?path=' + item.path)
    .then(res => res)
    .then((data: any) => {
      item.children.push(...data)
    })
    .catch(err => console.warn(err))
}
</script>

<template>
  <VTreeview
    v-model:activated="activedDirs"
    v-model:opened="openedDirs"
    :items="items"
    :load-children="fetchDirs"
    density="compact"
    item-key="path"
    item-title="name"
    item-value="path"
    activatable
    open-on-click
    transition
  >
  </VTreeview>
</template>
