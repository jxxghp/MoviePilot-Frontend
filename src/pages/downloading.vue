<script setup lang="ts">
import api from '@/api'
import { DownloaderConf } from '@/api/types'
import DownloadingListView from '@/views/reorganize/DownloadingListView.vue'
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useI18n } from 'vue-i18n'
import { useDynamicHeaderTab } from '@/composables/useDynamicHeaderTab'
import { useKeepAliveRefresh } from '@/composables/useKeepAliveRefresh'

// 国际化
const { t } = useI18n()

const route = useRoute()
const activeTab = ref<string>((route.query.tab as string) || '')

// 下载器
const downloaders = ref<DownloaderConf[]>([])

// 下载器字典
const downloaderItems = computed(() => {
  return downloaders.value.map(item => ({
    title: item.name,
    tab: item.name,
  }))
})

// 使用动态标签页
const { registerHeaderTab } = useDynamicHeaderTab()

// 调用API查询下载器设置
async function loadDownloaderSetting() {
  try {
    downloaders.value = await api.get('download/clients')
    if (downloaders.value && downloaders.value.length > 0 && !activeTab.value)
      activeTab.value = downloaders.value[0].name
  } catch (error) {
    console.log(error)
  }
}

// 注册动态标签页
const registerTabs = () => {
  if (downloaderItems.value.length > 0) {
    registerHeaderTab({
      items: downloaderItems,
      modelValue: activeTab,
    })
  }
}

onMounted(async () => {
  await loadDownloaderSetting()
  registerTabs()
})

useKeepAliveRefresh(async () => {
  await loadDownloaderSetting()
  registerTabs()
})
</script>

<template>
  <div v-if="downloaders.length > 0">
    <VWindow v-model="activeTab" class="disable-tab-transition" :touch="false">
      <VWindowItem v-for="item in downloaders" :key="item.name" :value="item.name">
        <transition name="fade-slide" appear>
          <div>
            <DownloadingListView :name="item.name" :active="activeTab === item.name" />
          </div>
        </transition>
      </VWindowItem>
    </VWindow>
  </div>
  <NoDataFound
    v-else
    error-code="404"
    :error-title="t('downloading.noDownloader')"
    :error-description="t('downloading.configureDownloader')"
  />
</template>
