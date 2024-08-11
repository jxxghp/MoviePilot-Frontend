<script setup lang="ts">
import { MediaServerConf } from '@/api/types'
import emby_image from '@images/logos/emby.png'
import jellyfin_image from '@images/logos/jellyfin.png'
import plex_image from '@images/logos/plex.png'

// 定义输入
const props = defineProps({
  mediaserver: {
    type: Object as PropType<MediaServerConf>,
    required: true,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'change'])

// 媒体服务器详情弹窗
const mediaServerInfoDialog = ref(false)

// 媒体服务器详情
const mediaServerInfo = ref<MediaServerConf>({
  name: '',
  type: '',
  enabled: false,
  config: {},
})

// 打开详情弹窗
function openMediaServerInfoDialog() {
  mediaServerInfo.value = props.mediaserver
  mediaServerInfoDialog.value = true
}

// 保存详情数据
function saveMediaServerInfo() {
  mediaServerInfoDialog.value = false
  emit('change', mediaServerInfo.value)
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
</script>
<template>
  <div>
    <VCard variant="tonal" @click="openMediaServerInfoDialog">
      <DialogCloseBtn @click="onClose" />
      <VCardText class="flex justify-space-between align-center gap-3">
        <div class="align-self-start">
          <div class="text-h6 mb-1">{{ mediaserver.name }}</div>
          <div class="text-body-1 mb-3"></div>
        </div>
        <VImg :src="getIcon" cover class="mt-5 me-7" max-width="4rem" />
      </VCardText>
    </VCard>
    <VDialog v-model="mediaServerInfoDialog" scrollable max-width="40rem">
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
                  v-model="mediaServerInfo.name"
                  label="名称"
                  placeholder="别名"
                  hint="媒体服务器的别名"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.EMBY_HOST"
                  label="地址"
                  placeholder="http(s)://ip:port"
                  hint="服务端地址，格式：http(s)://ip:port"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.EMBY_PLAY_HOST"
                  label="外网播放地址"
                  placeholder="http(s)://domain:port"
                  hint="跳转播放页面使用的地址，格式：http(s)://domain:port"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.EMBY_API_KEY"
                  label="API密钥"
                  hint="Emby设置->高级->API密钥中生成的密钥"
                  persistent-hint
                />
              </VCol>
            </VRow>
            <VRow v-if="mediaServerInfo.type == 'jellyfin'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.name"
                  label="名称"
                  placeholder="别名"
                  hint="媒体服务器的别名"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.JELLYFIN_HOST"
                  label="地址"
                  placeholder="http(s)://ip:port"
                  hint="服务端地址，格式：http(s)://ip:port"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.JELLYFIN_PLAY_HOST"
                  label="外网播放地址"
                  placeholder="http(s)://domain:port"
                  hint="跳转播放页面使用的地址，格式：http(s)://domain:port"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.JELLYFIN_API_KEY"
                  label="API密钥"
                  hint="Jellyfin设置->高级->API密钥中生成的密钥"
                  persistent-hint
                />
              </VCol>
            </VRow>
            <VRow v-if="mediaServerInfo.type == 'plex'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.name"
                  label="名称"
                  placeholder="别名"
                  hint="媒体服务器的别名"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.PLEX_HOST"
                  label="地址"
                  placeholder="http(s)://ip:port"
                  hint="服务端地址，格式：http(s)://ip:port"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.PLEX_PLAY_HOST"
                  label="外网播放地址"
                  placeholder="http(s)://domain:port"
                  hint="跳转播放页面使用的地址，格式：http(s)://domain:port"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.PLEX_TOKEN"
                  label="X-Plex-Token"
                  hint="浏览器F12->网络，从Plex请求URL中获取的X-Plex-Token"
                  persistent-hint
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
