<script setup lang="ts">
import api from '@/api'
import { DownloaderConf } from '@/api/types'
import DownloadingListView from '@/views/reorganize/DownloadingListView.vue'
import router from '@/router'

const route = useRoute()
const activeTab = ref(route.query.tab)

// 下载器
const downloaders = ref<DownloaderConf[]>([])

// 调用API查询下载器设置
async function loadDownloaderSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Downloaders')
    if (result.data?.value && result.data.value.length > 0) {
      downloaders.value = result.data?.value ?? []
      if (!activeTab.value) activeTab.value = downloaders.value[0].name
    }
  } catch (error) {
    console.log(error)
  }
}

function jumpTab(tab: string) {
  router.push('/subscribe/movie?tab=' + tab)
}

onMounted(() => {
  loadDownloaderSetting()
})
</script>

<template>
  <div>
    <VTabs v-model="activeTab">
      <VTab v-for="item in downloaders" :value="item.name" @to="jumpTab(item.name)">
        <span class="mx-5">{{ item.name }}</span>
      </VTab>
    </VTabs>

    <VWindow v-model="activeTab" class="mt-5 disable-tab-transition" :touch="false">
      <VWindowItem v-for="item in downloaders" :value="item.name">
        <transition name="fade-slide" appear>
          <DownloadingListView :name="item.name" />
        </transition>
      </VWindowItem>
    </VWindow>
  </div>
</template>
