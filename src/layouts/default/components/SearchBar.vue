<script lang="ts" setup>
import * as Mousetrap from 'mousetrap'
import SearchBarDialog from '@/components/dialog/SearchBarDialog.vue'
import { useI18n } from 'vue-i18n'
import { useNativeGlobalAction } from '@/native/registry'
import { nativeChromeActive } from '@/native/layout'

const { t } = useI18n()
const router = useRouter()

const searchOpen = ref(false)
const searchBar = ref<InstanceType<typeof SearchBarDialog> | null>(null)

/** 原生搜索作为独立入口替换当前地址，业务栏目位置由导航宿主保留。 */
function openSearch() {
  if (nativeChromeActive.value && window.MoviePilotNative?.searchPageVersion === 1) {
    void router.replace('/search')
    return false
  }
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
  dataAttr: window.MoviePilotNative?.searchPageVersion === 1 ? 'native-search-page' : undefined,
  invoke: openSearch,
  panel: () =>
    window.MoviePilotNative?.searchPageVersion === 1 && router.currentRoute.value.path === '/search'
      ? searchBar.value?.nativeSearchPage()
      : searchBar.value?.nativePanel(),
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
