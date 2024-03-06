<script setup lang="ts">
import api from '@/api'

// 定义所有的模块ID、名称列表
const modules = ref([
  { id: 'FileTransferModule', name: '媒体目录', state: '', errmsg: '', loading: false },
  { id: 'IndexerModule', name: '站点索引', state: '', errmsg: '', loading: false },
  { id: 'DoubanModule', name: '豆瓣', state: '', errmsg: '', loading: false },
  { id: 'TheMovieDbModule', name: 'TheMovieDb', state: '', errmsg: '', loading: false },
  { id: 'TheTvDbModule', name: 'TheTvDb', state: '', errmsg: '', loading: false },
  { id: 'FanartModule', name: 'Fanart', state: '', errmsg: '', loading: false },
  { id: 'EmbyModule', name: 'Emby', state: '', errmsg: '', loading: false },
  { id: 'JellyfinModule', name: 'Jellyfin', state: '', errmsg: '', loading: false },
  { id: 'PlexModule', name: 'Plex', state: '', errmsg: '', loading: false },
  { id: 'WechatModule', name: '微信', state: '', errmsg: '', loading: false },
  { id: 'TelegramModule', name: 'Telegram', state: '', errmsg: '', loading: false },
  { id: 'SlackModule', name: 'Slack', state: '', errmsg: '', loading: false },
  { id: 'SynologyChatModule', name: 'Synology Chat', state: '', errmsg: '', loading: false },
  { id: 'VoceChatModule', name: 'VoceChat', state: '', errmsg: '', loading: false },
  { id: 'QbittorrentModule', name: 'Qbittorrent', state: '', errmsg: '', loading: false },
  { id: 'TransmissionModule', name: 'Transmission', state: '', errmsg: '', loading: false },
])

// 调用API测试模块
async function moduleTest(index: number) {
  try {
    const target = modules.value[index]
    const moduleid = target.id
    target.loading = true
    const result: { [key: string]: any } = await api.get(`system/moduletest/${moduleid}`)
    target.loading = false
    if (result.success) {
      target.state = 'success'
      target.name = `${target.name} - 正常`
    }
    else if (result.message?.includes('模块未加载')) {
      target.state = ''
      target.name = `${target.name} - 未启用`
    }
    else {
      target.state = 'error'
      target.name = `${target.name} - 错误！`
      target.errmsg = result.message
    }
  }
  catch (error) {
    console.error(error)
  }
}
// 加载
onMounted(async () => {
  // 逐个检查所有模块
  for (let i = 0; i < modules.value.length; i++)
    await moduleTest(i)
})
</script>

<template>
  <VAlert
    v-for="(module, index) in modules"
    :key="index"
    :type="module.state"
    :title="module.name"
    class="mb-2"
    variant="tonal"
  >
    {{ module.errmsg }}
    <template #prepend>
      <VProgressCircular
        v-if="module.loading"
        indeterminate
      />
    </template>
  </VAlert>
</template>
