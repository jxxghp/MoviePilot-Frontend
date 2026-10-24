<script lang="ts" setup>
import * as Mousetrap from 'mousetrap'
import SearchBarDialog from '@/components/dialog/SearchBarDialog.vue'
import { useI18n } from 'vue-i18n'
import { useNativeGlobalAction } from '@/native/registry'
import { nativeChromeActive } from '@/native/layout'

const { t } = useI18n()

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

useNativeGlobalAction({
  id: 'search',
  title: () => t('common.search'),
  icon: 'search',
  invoke: openSearch,
  panel: () => searchBar.value?.nativePanel(),
})

onMounted(() => {
  Mousetrap.bind(['command+k', 'ctrl+k'], openSearch)
})

onBeforeUnmount(() => {
  Mousetrap.unbind(['command+k', 'ctrl+k'])
})
</script>

<template>
  <SearchBarDialog ref="searchBar" v-model="searchOpen" :show-activator="!nativeChromeActive" @close="closeSearch" />
</template>
