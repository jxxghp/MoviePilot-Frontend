<script setup lang="ts">
import { MediaServerConf, MediaServerLibrary, MediaStatistic } from '@/api/types'
import { useToast } from 'vue-toast-notification'
import emby_image from '@images/logos/emby.png'
import jellyfin_image from '@images/logos/jellyfin.png'
import plex_image from '@images/logos/plex.png'
import api from '@/api'

// 定义输入
const props = defineProps({
  // 单个媒体服务器
  mediaserver: {
    type: Object as PropType<MediaServerConf>,
    required: true,
  },
  // 所有媒体服务器
  mediaservers: {
    type: Array as PropType<MediaServerConf[]>,
    required: true,
  },
})

// 提示框
const $toast = useToast()

// 定义触发的自定义事件
const emit = defineEmits(['close', 'done', 'change'])

// 媒体统计数据
const infoItems = ref([
  {
    avatar: 'mdi-movie-roll',
    title: '电影',
    amount: '0',
  },
  {
    avatar: 'mdi-television-box',
    title: '电视剧',
    amount: '0',
  },
  {
    avatar: 'mdi-account',
    title: '用户',
    amount: '0',
  },
])

// 同步媒体库选项
const librariesOptions = ref<{ title: string; value: string | undefined }[]>([
  {
    title: '全部',
    value: 'all',
  },
])

// 媒体服务器详情弹窗
const mediaServerInfoDialog = ref(false)

// 媒体服务器名称
const mediaServerName = ref('')

// 媒体服务器详情
const mediaServerInfo = ref<MediaServerConf>({
  name: '',
  type: '',
  enabled: false,
  config: {},
})

// 打开详情弹窗
function openMediaServerInfoDialog() {
  loadLibrary(props.mediaserver.name)
  mediaServerInfo.value = props.mediaserver
  mediaServerName.value = props.mediaserver.name
  mediaServerInfoDialog.value = true
  if (!props.mediaserver.sync_libraries) {
    mediaServerInfo.value.sync_libraries = ['all']
  }
}

// 保存详情数据
function saveMediaServerInfo() {
  // 为空不保存，跳出警告框
  if (!mediaServerName.value) {
    $toast.error('名称不能为空，请输入后再确定')
    return
  }
  // 重名判断
  if (props.mediaservers.some(item => item.name === mediaServerName.value && item !== props.mediaserver)) {
    $toast.error(`【${mediaServerName.value}】已存在，请替换为其他名称`)
    return
  }
  // 执行保存
  mediaServerInfoDialog.value = false
  mediaServerInfo.value.name = mediaServerName.value
  emit('change', mediaServerInfo.value)
  emit('done')
}

// 根据存储类型选择图标
const getIcon = computed(() => {
  switch (props.mediaserver.type) {
    case 'emby':
      return emby_image
    case 'jellyfin':
      return jellyfin_image
    default:
      return plex_image
  }
})

// 按钮点击
function onClose() {
  emit('close')
}

// 调用API加载媒体统计数据
async function loadMediaStatistic() {
  try {
    const res: MediaStatistic = await api.get('dashboard/statistic', {
      params: {
        name: props.mediaserver.name,
      },
    })

    if (res) {
      infoItems.value = [
        {
          avatar: 'mdi-movie-roll',
          title: '电影',
          amount: res.movie_count.toLocaleString(),
        },
        {
          avatar: 'mdi-television-box',
          title: '电视剧',
          amount: res.tv_count.toLocaleString(),
        },
        {
          avatar: 'mdi-account',
          title: '用户',
          amount: res.user_count.toLocaleString(),
        },
      ]
    }
  } catch (e) {
    console.log(e)
  }
}

// 调用API查询媒体库
async function loadLibrary(server: string) {
  try {
    const result: MediaServerLibrary[] = await api.get('mediaserver/library', { params: { server } })
    if (result && result.length > 0) {
      librariesOptions.value = result.map(item => ({
        title: item.name,
        value: item.id?.toString(),
      }))
    } else {
      librariesOptions.value = []
    }
    librariesOptions.value.unshift({
      title: '全部',
      value: 'all',
    })
  } catch (e) {
    console.log(e)
  }
}

onMounted(() => {
  loadMediaStatistic()
})
</script>
<template>
  <div>
    <VCard variant="tonal" @click="openMediaServerInfoDialog">
      <DialogCloseBtn @click="onClose" />
      <VCardText class="flex justify-space-between align-center gap-3">
        <div class="align-self-start flex-1">
          <div class="text-h6 mb-1">{{ mediaserver.name }}</div>
          <div class="text-sm mt-5 flex flex-wrap">
            <span v-for="item in infoItems" :key="item.title" class="me-2 mb-1">
              <VIcon rounded :icon="item.avatar" class="me-1" />{{ item.amount }}
            </span>
          </div>
        </div>
        <VImg :src="getIcon" cover class="mt-5 me-3" max-width="3rem" min-width="3rem" />
      </VCardText>
    </VCard>
    <VDialog v-model="mediaServerInfoDialog" scrollable max-width="40rem" persistent>
      <VCard :title="`${props.mediaserver.name} - 配置`" class="rounded-t">
        <DialogCloseBtn v-model="mediaServerInfoDialog" />
        <VDivider />
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VSwitch v-model="mediaServerInfo.enabled" label="启用媒体服务器" />
              </VCol>
            </VRow>
            <VRow v-if="mediaServerInfo.type == 'emby'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerName"
                  label="名称"
                  placeholder="必填；不可与其他名称重名"
                  hint="媒体服务器的别名"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.host"
                  label="地址"
                  placeholder="http(s)://ip:port"
                  hint="服务端地址，格式：http(s)://ip:port"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.play_host"
                  label="外网播放地址"
                  placeholder="http(s)://domain:port"
                  hint="跳转播放页面使用的地址，格式：http(s)://domain:port"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.apikey"
                  label="API密钥"
                  hint="Emby设置->高级->API密钥中生成的密钥"
                  persistent-hint
                  active
                />
              </VCol>
            </VRow>
            <VRow v-if="mediaServerInfo.type == 'jellyfin'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerName"
                  label="名称"
                  placeholder="必填；不可与其他名称重名"
                  hint="媒体服务器的别名"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.host"
                  label="地址"
                  placeholder="http(s)://ip:port"
                  hint="服务端地址，格式：http(s)://ip:port"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.play_host"
                  label="外网播放地址"
                  placeholder="http(s)://domain:port"
                  hint="跳转播放页面使用的地址，格式：http(s)://domain:port"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.apikey"
                  label="API密钥"
                  hint="Jellyfin设置->高级->API密钥中生成的密钥"
                  persistent-hint
                  active
                />
              </VCol>
            </VRow>
            <VRow v-if="mediaServerInfo.type == 'plex'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerName"
                  label="名称"
                  placeholder="必填；不可与其他名称重名"
                  hint="媒体服务器的别名"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.host"
                  label="地址"
                  placeholder="http(s)://ip:port"
                  hint="服务端地址，格式：http(s)://ip:port"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.play_host"
                  label="外网播放地址"
                  placeholder="http(s)://domain:port"
                  hint="跳转播放页面使用的地址，格式：http(s)://domain:port"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.token"
                  label="X-Plex-Token"
                  hint="浏览器F12->网络，从Plex请求URL中获取的X-Plex-Token"
                  persistent-hint
                  active
                />
              </VCol>
            </VRow>
            <VRow>
              <VCol cols="12">
                <VSelect
                  v-model="mediaServerInfo.sync_libraries"
                  label="同步媒体库"
                  :items="librariesOptions"
                  chips
                  multiple
                  clearable
                  hint="只有选中的媒体库才会被同步"
                  persistent-hint
                  active
                  append-inner-icon="mdi-refresh"
                  @click:append-inner="loadLibrary(mediaServerInfo.name)"
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardActions class="pt-3">
          <VBtn @click="saveMediaServerInfo" variant="elevated" prepend-icon="mdi-content-save" class="px-5">
            确定
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
