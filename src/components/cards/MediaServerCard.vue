<script setup lang="ts">
import { MediaServerConf, MediaServerLibrary, MediaStatistic } from '@/api/types'
import { useToast } from 'vue-toastification'
import { getLogoUrl } from '@/utils/imageUtils'
import api from '@/api'
import { cloneDeep } from 'lodash-es'
import { useI18n } from 'vue-i18n'
import { mediaServerDict } from '@/api/constants'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 获取i18n实例
const { t } = useI18n()

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
    title: t('mediaType.movie'),
    amount: '0',
  },
  {
    avatar: 'mdi-television-box',
    title: t('mediaType.tv'),
    amount: '0',
  },
  {
    avatar: 'mdi-account',
    title: t('common.user'),
    amount: '0',
  },
])

// 同步媒体库选项
const librariesOptions = ref<{ title: string; value: string | undefined }[]>([
  {
    title: t('common.all'),
    value: 'all',
  },
])

const ugreenScanModeOptions = computed(() => [
  { title: t('mediaserver.scanModeOptions.newAndModified'), value: 'new_and_modified' },
  { title: t('mediaserver.scanModeOptions.supplementMissing'), value: 'supplement_missing' },
  { title: t('mediaserver.scanModeOptions.fullOverride'), value: 'full_override' },
])

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
  loadLibrary(props.mediaserver.name)
  // 深复制
  mediaServerInfo.value = cloneDeep(props.mediaserver)
  if (mediaServerInfo.value.type === 'ugreen') {
    mediaServerInfo.value.config = mediaServerInfo.value.config || {}
    if (!mediaServerInfo.value.config.scan_mode) {
      mediaServerInfo.value.config.scan_mode = 'supplement_missing'
    }
    if (mediaServerInfo.value.config.verify_ssl === undefined) {
      mediaServerInfo.value.config.verify_ssl = true
    }
  }
  mediaServerInfoDialog.value = true
  if (!props.mediaserver.sync_libraries) {
    mediaServerInfo.value.sync_libraries = ['all']
  }
}

// 保存详情数据
function saveMediaServerInfo() {
  // 为空不保存，跳出警告框
  if (!mediaServerInfo.value.name) {
    $toast.error(t('common.nameRequired'))
    return
  }
  // 重名判断
  if (props.mediaservers.some(item => item.name === mediaServerInfo.value.name && item !== props.mediaserver)) {
    $toast.error(t('common.nameExists', { name: mediaServerInfo.value.name }))
    return
  }
  // 执行保存
  mediaServerInfoDialog.value = false
  emit('change', mediaServerInfo.value, props.mediaserver.name)
  emit('done')
}

// 根据存储类型选择图标
const getIcon = computed(() => {
  switch (props.mediaserver.type) {
    case 'emby':
      return getLogoUrl('emby')
    case 'jellyfin':
      return getLogoUrl('jellyfin')
    case 'trimemedia':
      return getLogoUrl('trimemedia')
    case 'ugreen':
      return getLogoUrl('ugreen')
    case 'plex':
      return getLogoUrl('plex')
    default:
      return getLogoUrl('mediaserver')
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
          title: t('mediaType.movie'),
          amount: res.movie_count.toLocaleString(),
        },
        {
          avatar: 'mdi-television-box',
          title: t('mediaType.tv'),
          amount: res.tv_count.toLocaleString(),
        },
        {
          avatar: 'mdi-account',
          title: t('common.user'),
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
      title: t('common.all'),
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
      <VDialogCloseBtn @click="onClose" />
      <VCardText class="flex justify-space-between align-center gap-3">
        <div class="align-self-start flex-1">
          <div class="text-h6 mb-1">{{ mediaserver.name }}</div>
          <div v-if="mediaServerDict[mediaserver.type] && mediaserver.enabled" class="text-sm mt-5 flex flex-wrap">
            <span v-for="item in infoItems" :key="item.title" class="me-2 mb-1">
              <VIcon rounded :icon="item.avatar" class="me-1" />{{ item.amount }}
            </span>
          </div>
          <div v-else-if="!mediaServerDict[mediaserver.type]" class="text-sm mt-5 flex flex-wrap">
            <span class="me-2 mb-1">自定义媒体服务器</span>
          </div>
        </div>
        <VImg :src="getIcon" class="mt-8 me-3 max-h-12" max-width="3rem" min-width="3rem" />
      </VCardText>
    </VCard>

    <VDialog
      v-if="mediaServerInfoDialog"
      v-model="mediaServerInfoDialog"
      scrollable
      max-width="40rem"
      :fullscreen="!display.mdAndUp.value"
    >
      <VCard>
        <VCardItem class="py-2">
          <template #prepend>
            <VIcon icon="mdi-cog" class="me-2" />
          </template>
          <VCardTitle>{{ t('common.config') }}</VCardTitle>
          <VCardSubtitle>{{ props.mediaserver.name }}</VCardSubtitle>
        </VCardItem>
        <VDialogCloseBtn v-model="mediaServerInfoDialog" />
        <VDivider />
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VSwitch v-model="mediaServerInfo.enabled" :label="t('mediaserver.enableMediaServer')" />
              </VCol>
            </VRow>
            <VRow v-if="mediaServerInfo.type == 'emby'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.name"
                  :label="t('common.name')"
                  :placeholder="t('mediaserver.nameRequired')"
                  :hint="t('mediaserver.serverAlias')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.host"
                  :label="t('mediaserver.host')"
                  :placeholder="t('mediaserver.hostPlaceholder')"
                  :hint="t('mediaserver.hostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-server"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.play_host"
                  :label="t('mediaserver.playHost')"
                  :placeholder="t('mediaserver.playHostPlaceholder')"
                  :hint="t('mediaserver.playHostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-play-network"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.username"
                  :label="t('mediaserver.username')"
                  :hint="t('mediaserver.usernameHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-account"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.apikey"
                  :label="t('mediaserver.apiKey')"
                  :hint="t('mediaserver.embyApiKeyHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-key"
                />
              </VCol>
              <VCol cols="12">
                <VAutocomplete
                  v-model="mediaServerInfo.sync_libraries"
                  :label="t('mediaserver.syncLibraries')"
                  :items="librariesOptions"
                  chips
                  multiple
                  clearable
                  :hint="t('mediaserver.syncLibrariesHint')"
                  persistent-hint
                  active
                  append-inner-icon="mdi-refresh"
                  prepend-inner-icon="mdi-library"
                  @click:append-inner="loadLibrary(mediaServerInfo.name)"
                />
              </VCol>
            </VRow>
            <VRow v-else-if="mediaServerInfo.type == 'jellyfin'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.name"
                  :label="t('common.name')"
                  :placeholder="t('mediaserver.nameRequired')"
                  :hint="t('mediaserver.serverAlias')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.host"
                  :label="t('mediaserver.host')"
                  :placeholder="t('mediaserver.hostPlaceholder')"
                  :hint="t('mediaserver.hostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-server"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.play_host"
                  :label="t('mediaserver.playHost')"
                  :placeholder="t('mediaserver.playHostPlaceholder')"
                  :hint="t('mediaserver.playHostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-play-network"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.apikey"
                  :label="t('mediaserver.apiKey')"
                  :hint="t('mediaserver.jellyfinApiKeyHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-key"
                />
              </VCol>
              <VCol cols="12">
                <VAutocomplete
                  v-model="mediaServerInfo.sync_libraries"
                  :label="t('mediaserver.syncLibraries')"
                  :items="librariesOptions"
                  chips
                  multiple
                  clearable
                  :hint="t('mediaserver.syncLibrariesHint')"
                  persistent-hint
                  active
                  append-inner-icon="mdi-refresh"
                  prepend-inner-icon="mdi-library"
                  @click:append-inner="loadLibrary(mediaServerInfo.name)"
                />
              </VCol>
            </VRow>
            <VRow v-else-if="mediaServerInfo.type == 'trimemedia'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.name"
                  :label="t('common.name')"
                  :placeholder="t('mediaserver.nameRequired')"
                  :hint="t('mediaserver.serverAlias')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.host"
                  :label="t('mediaserver.host')"
                  :placeholder="t('mediaserver.hostPlaceholder')"
                  :hint="t('mediaserver.hostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-server"
                />
              </VCol>
              <VCol cols="12">
                <VTextField
                  v-model="mediaServerInfo.config.play_host"
                  :label="t('mediaserver.playHost')"
                  :placeholder="t('mediaserver.playHostPlaceholder')"
                  :hint="t('mediaserver.playHostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-play-network"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.username"
                  :label="t('mediaserver.username')"
                  active
                  prepend-inner-icon="mdi-account"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  type="password"
                  v-model="mediaServerInfo.config.password"
                  :label="t('mediaserver.password')"
                  active
                  prepend-inner-icon="mdi-lock"
                />
              </VCol>
              <VCol cols="12">
                <VAutocomplete
                  v-model="mediaServerInfo.sync_libraries"
                  :label="t('mediaserver.syncLibraries')"
                  :items="librariesOptions"
                  chips
                  multiple
                  clearable
                  :hint="t('mediaserver.syncLibrariesHint')"
                  persistent-hint
                  active
                  append-inner-icon="mdi-refresh"
                  prepend-inner-icon="mdi-library"
                  @click:append-inner="loadLibrary(mediaServerInfo.name)"
                />
              </VCol>
            </VRow>
            <VRow v-else-if="mediaServerInfo.type == 'ugreen'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.name"
                  :label="t('common.name')"
                  :placeholder="t('mediaserver.nameRequired')"
                  :hint="t('mediaserver.serverAlias')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.host"
                  :label="t('mediaserver.host')"
                  :placeholder="t('mediaserver.hostPlaceholder')"
                  :hint="t('mediaserver.hostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-server"
                />
              </VCol>
              <VCol cols="12">
                <VTextField
                  v-model="mediaServerInfo.config.play_host"
                  :label="t('mediaserver.playHost')"
                  :placeholder="t('mediaserver.playHostPlaceholder')"
                  :hint="t('mediaserver.playHostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-play-network"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.username"
                  :label="t('mediaserver.username')"
                  active
                  prepend-inner-icon="mdi-account"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  type="password"
                  v-model="mediaServerInfo.config.password"
                  :label="t('mediaserver.password')"
                  active
                  prepend-inner-icon="mdi-lock"
                />
              </VCol>
              <VCol cols="12">
                <VAutocomplete
                  v-model="mediaServerInfo.sync_libraries"
                  :label="t('mediaserver.syncLibraries')"
                  :items="librariesOptions"
                  chips
                  multiple
                  clearable
                  :hint="t('mediaserver.syncLibrariesHint')"
                  persistent-hint
                  active
                  append-inner-icon="mdi-refresh"
                  prepend-inner-icon="mdi-library"
                  @click:append-inner="loadLibrary(mediaServerInfo.name)"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="mediaServerInfo.config.scan_mode"
                  :label="t('mediaserver.scanMode')"
                  :items="ugreenScanModeOptions"
                  :hint="t('mediaserver.scanModeHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-radar"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="mediaServerInfo.config.verify_ssl"
                  :label="t('mediaserver.verifySsl')"
                  :hint="t('mediaserver.verifySslHint')"
                  persistent-hint
                  color="primary"
                  inset
                />
              </VCol>
            </VRow>
            <VRow v-else-if="mediaServerInfo.type == 'plex'">
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.name"
                  :label="t('common.name')"
                  :placeholder="t('mediaserver.nameRequired')"
                  :hint="t('mediaserver.serverAlias')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.host"
                  :label="t('mediaserver.host')"
                  :placeholder="t('mediaserver.hostPlaceholder')"
                  :hint="t('mediaserver.hostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-server"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.play_host"
                  :label="t('mediaserver.playHost')"
                  :placeholder="t('mediaserver.playHostPlaceholder')"
                  :hint="t('mediaserver.playHostHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-play-network"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.config.token"
                  :label="t('mediaserver.plexToken')"
                  :hint="t('mediaserver.plexTokenHint')"
                  persistent-hint
                  active
                  prepend-inner-icon="mdi-key"
                />
              </VCol>
              <VCol cols="12">
                <VAutocomplete
                  v-model="mediaServerInfo.sync_libraries"
                  :label="t('mediaserver.syncLibraries')"
                  :items="librariesOptions"
                  chips
                  multiple
                  clearable
                  :hint="t('mediaserver.syncLibrariesHint')"
                  persistent-hint
                  active
                  append-inner-icon="mdi-refresh"
                  prepend-inner-icon="mdi-library"
                  @click:append-inner="loadLibrary(mediaServerInfo.name)"
                />
              </VCol>
            </VRow>
            <VRow v-else>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="mediaServerInfo.type"
                  :label="t('mediaserver.type')"
                  :hint="t('mediaserver.customTypeHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-cog"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  :label="t('common.name')"
                  :hint="t('mediaserver.nameRequired')"
                  persistent-hint
                  prepend-inner-icon="mdi-label"
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardActions class="pt-3">
          <VBtn @click="saveMediaServerInfo" prepend-icon="mdi-content-save" class="px-5">
            {{ t('common.confirm') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
