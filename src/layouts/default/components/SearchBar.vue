<script lang="ts" setup>
import * as Mousetrap from 'mousetrap'
import SearchBarDialog from '@/components/dialog/SearchBarDialog.vue'

const searchOpen = ref(false)
const searchBar = ref<InstanceType<typeof SearchBarDialog> | null>(null)

/** 打开全局搜索，并在桌面端聚焦常驻搜索输入框。 */
function openSearch() {
  searchOpen.value = true
  nextTick(() => searchBar.value?.focusSearchInput())
  return false
}

/** 关闭当前搜索浮层。 */
function closeSearch() {
  searchOpen.value = false
}

onMounted(() => {
  Mousetrap.bind(['command+k', 'ctrl+k'], openSearch)
})

onBeforeUnmount(() => {
  Mousetrap.unbind(['command+k', 'ctrl+k'])
})
</script>

<template>
  <SearchBarDialog ref="searchBar" v-model="searchOpen" show-activator @close="closeSearch" />
</template>
