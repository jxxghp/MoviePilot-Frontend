<script setup lang="ts">
import api from '@/api'
import type { Plugin, Subscribe } from '@/api/types'
import { SystemNavMenus, UserfulMenus, PluginTabs, SettingTabs } from '@/router/menu'
import { NavMenu } from '@/@layouts/types'

// 路由
const router = useRouter()

// 定义事件
const emit = defineEmits(['close'])

// 搜索词
const searchWord = ref<string | null>(null)

// ref
const searchWordInput = ref<HTMLElement | null>(null)

// 近期搜索词条
const recentSearches = ref<string[]>([])

// 保存近期搜索到本地
function saveRecentSearches(keyword: string) {
  if (!keyword) return
  if (recentSearches.value.includes(keyword)) return
  recentSearches.value.unshift(keyword)
  localStorage.setItem('MP_RecentSearches', JSON.stringify(recentSearches.value))
}

// 从本地加载近期搜索
function loadRecentSearches() {
  const recentSearchesStr = localStorage.getItem('MP_RecentSearches')
  if (recentSearchesStr) {
    recentSearches.value = JSON.parse(recentSearchesStr)
    // 只保留最近的 5 条
    if (recentSearches.value.length > 5) {
      recentSearches.value = recentSearches.value.slice(0, 5)
    }
  }
}

// 所有菜单功能
function getMenus(): NavMenu[] {
  let menus: NavMenu[] = []
  // 导航菜单
  SystemNavMenus.forEach(
    item =>
      item &&
      menus.push({
        title: item.full_title ?? item.title,
        icon: item.icon,
        to: item.to,
        header: item.header,
        admin: item.admin,
      }),
  )
  // 设置标签页
  SettingTabs.forEach(
    item =>
      item &&
      menus.push({
        title: '设定 -> ' + item.title,
        icon: item.icon,
        to: `/setting?tab=${item.tab}`,
        header: '',
        admin: true,
        description: item.description,
      }),
  )

  return menus
}

// 匹配的菜单列表
const matchedMenuItems = computed(() => {
  if (!searchWord.value) return []
  const lowerWord = (searchWord.value as string).toLowerCase()
  const menuItems = getMenus()
  if (menuItems)
    return menuItems.filter(
      item =>
        item.title.toLowerCase().includes(lowerWord) ||
        (item.description && item.description.toLowerCase().includes(lowerWord)),
    )
  return []
})

// 所有插件（已安装）
const pluginItems = ref<Plugin[]>([])

// 获取插件列表数据
async function fetchInstalledPlugins() {
  try {
    pluginItems.value = await api.get('plugin/', {
      params: {
        state: 'installed',
      },
    })
  } catch (error) {
    console.error(error)
  }
}

// 区配的插件列表
const matchedPluginItems = computed(() => {
  if (!searchWord.value) return []
  const lowerWord = (searchWord.value as string).toLowerCase()
  return pluginItems.value.filter((item: Plugin) => {
    if (!item.plugin_name && !item.plugin_desc) return false
    return item.plugin_name?.toLowerCase().includes(lowerWord) || item.plugin_desc?.toLowerCase().includes(lowerWord)
  })
})

// 所有订阅数据
const SubscribeItems = ref<Subscribe[]>([])

// 获取电影订阅列表数据
async function fetchSubscribes() {
  try {
    SubscribeItems.value = await api.get('subscribe/')
  } catch (error) {
    console.error(error)
  }
}

// 匹配的订阅列表
const matchedSubscribeItems = computed(() => {
  if (!searchWord.value) return []
  const lowerWord = (searchWord.value as string).toLowerCase()
  return SubscribeItems.value.filter((item: Subscribe) => {
    return item.name.toLowerCase().includes(lowerWord)
  })
})

// 跳转媒体搜索页面
function searchMedia(searchType: string) {
  // 搜索类型 media/person
  if (!searchWord.value) return
  saveRecentSearches(searchWord.value)
  router.push({
    path: '/browse/media/search',
    query: {
      title: searchWord.value,
      type: searchType,
    },
  })
  emit('close')
}

// 跳转到种子搜索页面
function searchTorrent() {
  if (!searchWord.value) return
  saveRecentSearches(searchWord.value)
  router.push({
    path: '/resource',
    query: {
      keyword: searchWord.value,
      area: 'title',
    },
  })
  emit('close')
}

// 跳转到历史记录页面
function searchHistory() {
  if (!searchWord.value) return
  saveRecentSearches(searchWord.value)
  router.push({
    path: '/history',
    query: {
      search: searchWord.value,
    },
  })
  emit('close')
}

// 跳转插件页面
function showPlugin(pluginId: string) {
  router.push({
    path: `/plugins/`,
    query: {
      tab: 'installed',
      id: pluginId,
    },
  })
  emit('close')
}

// 跳转菜单页面
function goPage(to: string) {
  router.push(to)
  emit('close')
}

// 跳转订阅页面
function goSubscribe(subscribe: Subscribe) {
  if (subscribe.type === '电影') {
    router.push({
      path: '/subscribe/movie',
      query: {
        id: subscribe.id,
      },
    })
  } else {
    router.push({
      path: '/subscribe/tv',
      query: {
        id: subscribe.id,
      },
    })
  }
  emit('close')
}

onMounted(() => {
  setTimeout(() => {
    searchWordInput.value?.focus()
  }, 500)
  fetchInstalledPlugins()
  fetchSubscribes()
  loadRecentSearches()
})
</script>
<template>
  <VDialog max-width="40rem" scrollable>
    <VCard>
      <VCardItem class="pe-12">
        <VCombobox
          ref="searchWordInput"
          v-model="searchWord"
          density="compact"
          variant="plain"
          class="text-high-emphasis"
          placeholder="搜索 ..."
          @keydown.enter="searchMedia('media')"
        >
          <template #prepend>
            <VIcon icon="ri-search-line" style="opacity: 1" />
          </template>
        </VCombobox>
      </VCardItem>
      <DialogCloseBtn inner-class="absolute right-3 top-5 text-high-emphasis" @click="emit('close')" />
      <VDivider />
      <VCardText class="p-0">
        <VList lines="two" v-if="searchWord">
          <!-- 搜索结果 -->
          <VListSubheader v-if="searchWord"> 媒体 & 资源 </VListSubheader>
          <VHover>
            <template #default="hover">
              <VListItem
                prepend-icon="mdi-movie-search"
                density="compact"
                link
                v-bind="hover.props"
                @click="searchMedia('media')"
              >
                <VListItemTitle class="break-words whitespace-break-spaces">
                  搜索 <span class="font-bold">{{ searchWord }} </span> 相关的【电影、电视剧】 ...
                </VListItemTitle>
                <template #append>
                  <VIcon v-if="hover.isHovering" icon="ri-corner-down-left-line" />
                </template>
              </VListItem>
            </template>
          </VHover>
          <VHover>
            <template #default="hover">
              <VListItem prepend-icon="mdi-account-search" link v-bind="hover.props" @click="searchMedia('person')">
                <VListItemTitle class="break-words whitespace-break-spaces">
                  搜索 <span class="font-bold">{{ searchWord }}</span> 相关的【演职人员】 ...
                </VListItemTitle>
                <template #append>
                  <VIcon v-if="hover.isHovering" icon="ri-corner-down-left-line" />
                </template>
              </VListItem>
            </template>
          </VHover>
          <VHover>
            <template #default="hover">
              <VListItem prepend-icon="mdi-search-web" link v-bind="hover.props" @click="searchTorrent">
                <VListItemTitle class="break-words whitespace-break-spaces">
                  搜索 <span class="font-bold">{{ searchWord }}</span> 相关的【站点资源】 ...
                </VListItemTitle>
                <template #append>
                  <VIcon v-if="hover.isHovering" icon="ri-corner-down-left-line" />
                </template>
              </VListItem>
            </template>
          </VHover>
          <VHover>
            <template #default="hover">
              <VListItem prepend-icon="mdi-history" link v-bind="hover.props" @click="searchHistory">
                <VListItemTitle class="break-words whitespace-break-spaces">
                  搜索 <span class="font-bold">{{ searchWord }}</span> 相关的【历史记录】 ...
                </VListItemTitle>
                <template #append>
                  <VIcon v-if="hover.isHovering" icon="ri-corner-down-left-line" />
                </template>
              </VListItem>
            </template>
          </VHover>
          <VListSubheader v-if="matchedSubscribeItems.length > 0"> 订阅 </VListSubheader>
          <VHover
            v-if="matchedSubscribeItems.length > 0"
            v-for="subscribe in matchedSubscribeItems"
            :key="subscribe.id"
          >
            <template #default="hover">
              <VListItem
                :prepend-icon="`${subscribe.type === '电影' ? 'mdi-movie-roll' : 'mdi-television-classic'}`"
                density="compact"
                link
                v-bind="hover.props"
                @click="goSubscribe(subscribe)"
              >
                <VListItemTitle>
                  {{ subscribe.name }}<span v-if="subscribe.season"> 第 {{ subscribe.season }} 季</span>
                </VListItemTitle>
                <VListItemSubtitle> {{ subscribe.type }}</VListItemSubtitle>
                <template #append>
                  <VIcon v-if="hover.isHovering" icon="ri-corner-down-left-line" />
                </template>
              </VListItem>
            </template>
          </VHover>
          <VListSubheader v-if="matchedMenuItems.length > 0"> 功能 </VListSubheader>
          <VHover v-if="matchedMenuItems.length > 0" v-for="menu in matchedMenuItems" :key="menu.title">
            <template #default="hover">
              <VListItem
                :prepend-icon="menu.icon as string"
                density="compact"
                link
                v-bind="hover.props"
                @click="goPage(menu.to as string)"
              >
                <VListItemTitle>
                  {{ menu.title }}
                </VListItemTitle>
                <VListItemSubtitle v-if="menu.description"> {{ menu.description }} </VListItemSubtitle>
                <template #append>
                  <VIcon v-if="hover.isHovering" icon="ri-corner-down-left-line" />
                </template>
              </VListItem>
            </template>
          </VHover>
          <VListSubheader v-if="matchedPluginItems.length > 0"> 插件 </VListSubheader>
          <VHover v-if="matchedPluginItems.length > 0" v-for="plugin in matchedPluginItems" :key="plugin.id">
            <template #default="hover">
              <VListItem
                prepend-icon="mdi-puzzle"
                density="compact"
                link
                v-bind="hover.props"
                @click="showPlugin(plugin.id ?? '')"
              >
                <VListItemTitle> {{ plugin.plugin_name }} </VListItemTitle>
                <VListItemSubtitle> {{ plugin.plugin_desc }} </VListItemSubtitle>
                <template #append>
                  <VIcon v-if="hover.isHovering" icon="ri-corner-down-left-line" />
                </template>
              </VListItem>
            </template>
          </VHover>
        </VList>
        <div v-else>
          <!-- 默认 -->
          <VCardText>
            <VRow v-if="recentSearches.length > 0">
              <VCol cols="12">
                <p class="custom-letter-spacing text-sm text-disabled text-uppercase py-2 px-4 mb-0">最近搜索</p>
                <div class="px-3">
                  <VChip
                    v-for="(word, index) in recentSearches"
                    :key="index"
                    class="me-2 mb-1"
                    variant="tonal"
                    @click="searchWord = word"
                    label
                  >
                    {{ word }}
                  </VChip>
                </div>
              </VCol>
            </VRow>
            <VRow>
              <VCol cols="12" md="6">
                <p class="custom-letter-spacing text-sm text-disabled text-uppercase py-2 px-4 mb-0">常用功能</p>
                <VList lines="one">
                  <VHover v-for="(menu, index) in UserfulMenus" :key="index">
                    <template #default="hover">
                      <VListItem
                        :prepend-icon="menu.icon"
                        density="compact"
                        link
                        v-bind="hover.props"
                        @click="goPage(menu.to)"
                      >
                        <VListItemTitle>
                          {{ menu.title }}
                        </VListItemTitle>
                        <template #append>
                          <VIcon v-if="hover.isHovering" icon="ri-corner-down-left-line" />
                        </template>
                      </VListItem>
                    </template>
                  </VHover>
                </VList>
              </VCol>
              <VCol cols="12" md="6">
                <p class="custom-letter-spacing text-sm text-disabled text-uppercase py-2 px-4 mb-0">常用插件</p>
                <VList lines="one">
                  <VHover v-for="plugin in pluginItems.slice(0, 5)" :key="plugin.id">
                    <template #default="hover">
                      <VListItem
                        prepend-icon="mdi-puzzle"
                        density="compact"
                        link
                        v-bind="hover.props"
                        @click="showPlugin(plugin.id ?? '')"
                      >
                        <VListItemTitle> {{ plugin.plugin_name }} </VListItemTitle>
                        <template #append>
                          <VIcon v-if="hover.isHovering" icon="ri-corner-down-left-line" />
                        </template>
                      </VListItem>
                    </template>
                  </VHover>
                </VList>
              </VCol>
              <VCol cols="12" md="6"> </VCol>
              <VCol cols="12" md="6"> </VCol>
            </VRow>
          </VCardText>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>
