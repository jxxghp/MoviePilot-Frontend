<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import api from '@/api'

// 选中的下载器
const selectedDownloader = ref('')

// 选中的媒体服务器
const selectedMediaServers = ref([])

// 是否下载器监控
const downloaderMonitor = ref<boolean>(false)

// 下载器
const Downloaders = [
  {
    title: 'Qbittorrent',
    value: 'qbittorrent',
  },
  {
    title: 'Transmission',
    value: 'transmission',
  },
]

// 媒体服务器
const MediaServers = [
  {
    title: 'Emby',
    value: 'emby',
  },
  {
    title: 'Jellyfin',
    value: 'jellyfin',
  },
  {
    title: 'Plex',
    value: 'plex',
  },
]

// 提示框
const $toast = useToast()

// 调用API查询下载器设置
async function loadDownladerSetting() {
  try {
    const result1: { [key: string]: any } = await api.get('system/setting/DOWNLOADER')
    if (result1.success)
      selectedDownloader.value = result1.data?.value
    const result2: { [key: string]: any } = await api.get('system/setting/DOWNLOADER_MONITOR')
    if (result2.success)
      downloaderMonitor.value = result2.data?.value
  }
  catch (error) {
    console.log(error)
  }
}

// 调用API保存下载器设置
async function saveDownloaderSetting() {
  try {
    const result1: { [key: string]: any } = await api.post(
      'system/setting/DOWNLOADER',
      selectedDownloader.value,
    )

    const result2: { [key: string]: any } = await api.post(
      'system/setting/DOWNLOADER_MONITOR',
      downloaderMonitor.value,
    )

    if (result1.success && result2.success)
      $toast.success('保存下载器设置成功')
    else
      $toast.error('保存下载器设置失败！')
  }
  catch (error) {
    console.log(error)
  }
}

// 调用API查询媒体服务器设置
async function loadMediaServerSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/MEDIASERVER')
    if (result.success)
      selectedMediaServers.value = result.data?.value?.split(',')
  }
  catch (error) {
    console.log(error)
  }
}

// 调用API保存媒体服务器设置
async function saveMediaServerSetting() {
  try {
    const result: { [key: string]: any } = await api.post(
      'system/setting/MEDIASERVER',
      selectedMediaServers.value.join(','),
    )

    if (result.success)
      $toast.success('保存媒体服务器设置成功')
    else
      $toast.error('保存媒体服务器设置失败！')
  }
  catch (error) {
    console.log(error)
  }
}

onMounted(() => {
  loadDownladerSetting()
  loadMediaServerSetting()
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard title="下载器">
        <VCardSubtitle>只有选中的下载器才会被默认使用。</VCardSubtitle>
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="selectedDownloader"
                  :items="Downloaders"
                  label="当前使用下载器"
                />
              </VCol>
            </VRow>
            <VRow>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="downloaderMonitor"
                  label="监控下载器"
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn
                mtype="submit"
                @click="saveDownloaderSetting"
              >
                保存
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard title="媒体服务器">
        <VCardSubtitle>只有选中的媒体服务器才会被默认使用。</VCardSubtitle>
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="selectedMediaServers"
                  multiple
                  chips
                  :items="MediaServers"
                  label="当前使用媒体服务器"
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn
                mtype="submit"
                @click="saveMediaServerSetting"
              >
                保存
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
