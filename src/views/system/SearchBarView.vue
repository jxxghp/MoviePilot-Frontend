<script setup lang="ts">
import api from '@/api'
import type { Plugin } from '@/api/types'

// 路由
const router = useRouter()

// 定义事件
const emit = defineEmits(['close'])

// 搜索词
const searchWord = ref(null)

// ref
const searchWordInput = ref<HTMLElement | null>(null)

// 搜索提示词列表
const searchHintList = ref<string[]>([])

// 所有菜单功能
const menuItems = ref([])

// 常用菜单功能
const commonMenuItems = ref([
  {
    title: '搜索设置',
    icon: 'mdi-magnify',
    to: 'setting?tab=search',
  },
  {
    title: '订阅设置',
    icon: 'mdi-rss',
    to: 'setting?tab=subscribe',
  },
  {
    title: '服务',
    icon: 'mdi-list-box',
    to: 'setting?tab=service',
  },
  {
    title: '词表',
    icon: 'mdi-file-word-box',
    to: 'setting?tab=words',
  },
  {
    title: '历史记录',
    icon: 'mdi-history',
    to: 'history',
  },
])

// 所有插件（已安装）
const pluginItems = ref<Plugin[]>([])

// 匹配的菜单列表
const matchedMenuItems = ref([])

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
  const lowerWord = searchWord.value?.toLowerCase()
  return pluginItems.value.filter((item: Plugin) => {
    if (!item.plugin_name && !item.plugin_desc) return false
    return item.plugin_name?.toLowerCase().includes(lowerWord) || item.plugin_desc?.toLowerCase().includes(lowerWord)
  })
})

// 跳转媒体搜索页面
function searchMedia(searchType: string) {
  // 搜索类型 media/person
  if (!searchWord.value) return
  if (!searchHintList.value.includes(searchWord.value)) searchHintList.value.push(searchWord.value)
  router.push({
    path: '/browse/media/search',
    query: {
      title: searchWord.value,
      type: searchType,
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

onMounted(() => {
  setTimeout(() => {
    searchWordInput.value?.focus()
  }, 500)
  fetchInstalledPlugins()
})
</script>
<template>
  <VDialog max-width="40rem">
    <VCard>
      <VCardText class="pe-12">
        <VCombobox
          ref="searchWordInput"
          v-model="searchWord"
          density="compact"
          variant="plain"
          class="text-high-emphasis"
          placeholder="搜索 ..."
          :items="searchHintList"
          @keydown.enter="searchMedia('media')"
        >
          <template #prepend>
            <VIcon icon="ri-search-line" style="opacity: 1" />
          </template>
        </VCombobox>
      </VCardText>
      <DialogCloseBtn inner-class="absolute right-3 top-5 text-high-emphasis" @click="emit('close')" />
      <VDivider />
      <div class="ps h-100">
        <VList lines="one" v-if="searchWord">
          <!-- 搜索结果 -->
          <VListSubheader v-if="searchWord"> 媒体 </VListSubheader>
          <VHover>
            <template #default="hover">
              <VListItem
                prepend-icon="mdi-movie-search"
                density="compact"
                link
                v-bind="hover.props"
                @click="searchMedia('media')"
              >
                <VListItemTitle>
                  搜索 <span class="font-bold">{{ searchWord }} </span> 相关的电影、电视剧
                </VListItemTitle>
                <template #append>
                  <VIcon v-if="hover.isHovering" icon="ri-corner-down-left-line" />
                </template>
              </VListItem>
            </template>
          </VHover>
          <VHover>
            <template #default="hover">
              <VListItem
                prepend-icon="mdi-account-search"
                density="compact"
                link
                v-bind="hover.props"
                @click="searchMedia('person')"
              >
                <VListItemTitle>
                  搜索 <span class="font-bold">{{ searchWord }}</span> 相关的人物
                </VListItemTitle>
                <template #append>
                  <VIcon v-if="hover.isHovering" icon="ri-corner-down-left-line" />
                </template>
              </VListItem>
            </template>
          </VHover>
          <VListSubheader v-if="matchedMenuItems.length > 0"> 功能 </VListSubheader>
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
            <VRow>
              <VCol cols="12" md="6">
                <p class="custom-letter-spacing text-sm text-disabled text-uppercase py-2 px-4 mb-0">常用功能</p>
                <VList lines="one">
                  <VHover v-for="(menu, index) in commonMenuItems" :key="index">
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
                        prepend-icon="mdi-package-variant"
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
      </div>
    </VCard>
  </VDialog>
</template>
