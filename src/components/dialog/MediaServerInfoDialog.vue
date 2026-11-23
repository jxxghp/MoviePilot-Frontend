<script setup lang="ts">
import api from '@/api'
import type { MediaServerConf, MediaServerLibrary } from '@/api/types'
import { cloneDeep } from 'lodash-es'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 显示器宽度
const display = useDisplay()

// 获取i18n实例
const { t } = useI18n()

// 定义输入
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  mediaserver: {
    type: Object as PropType<MediaServerConf>,
    required: true,
  },
  mediaservers: {
    type: Array as PropType<MediaServerConf[]>,
    required: true,
  },
  defaultSyncInterval: {
    type: Number,
    default: null,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close', 'done', 'change'])

// 提示框
const $toast = useToast()

// 媒体服务器详情弹窗
const mediaServerInfoDialog = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 媒体服务器详情
const mediaServerInfo = ref<MediaServerConf>({
  name: '',
  type: '',
  enabled: false,
  config: {},
})

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

// 绿联影视连接模式：支持显式选择 NAS 内部接口、媒体库服务，并兼容历史 auto 配置。
type UgreenConnectionMode = 'internal' | 'media_service' | 'auto'

const ugreenConnectionMode = computed<UgreenConnectionMode>(() => {
  const raw = String(mediaServerInfo.value.config?.mode || '')
    .trim()
    .toLowerCase()
  if (raw === 'media_service' || raw === 'media-server' || raw === 'media_server' || raw === 'emby') {
    return 'media_service'
  }
  if (raw === 'internal' || raw === 'ugreen') {
    return 'internal'
  }
  return 'auto'
})

const isUgreenMediaServiceMode = computed(() => ugreenConnectionMode.value === 'media_service')

const ugreenModeCards = computed(() => [
  {
    value: 'internal' as const,
    icon: 'mdi-account-key-outline',
    title: t('mediaserver.ugreenMode.internalTitle'),
    badge: t('mediaserver.ugreenMode.internalBadge'),
    description: t('mediaserver.ugreenMode.internalDesc'),
  },
  {
    value: 'media_service' as const,
    icon: 'mdi-television-play',
    title: t('mediaserver.ugreenMode.mediaServiceTitle'),
    badge: t('mediaserver.ugreenMode.mediaServiceBadge'),
    description: t('mediaserver.ugreenMode.mediaServiceDesc'),
  },
])

const ugreenGuideText = computed(() => {
  if (ugreenConnectionMode.value === 'media_service') {
    return t('mediaserver.ugreenMode.mediaServiceGuide')
  }
  if (ugreenConnectionMode.value === 'auto') {
    return t('mediaserver.ugreenMode.autoGuide')
  }
  return t('mediaserver.ugreenMode.internalGuide')
})

const ugreenHostPlaceholder = computed(() =>
  isUgreenMediaServiceMode.value
    ? t('mediaserver.ugreenMode.mediaServiceHostPlaceholder')
    : t('mediaserver.ugreenMode.internalHostPlaceholder'),
)

const ugreenHostHint = computed(() =>
  isUgreenMediaServiceMode.value
    ? t('mediaserver.ugreenMode.mediaServiceHostHint')
    : t('mediaserver.ugreenMode.internalHostHint'),
)

const ugreenUsernameLabel = computed(() =>
  isUgreenMediaServiceMode.value
    ? t('mediaserver.ugreenMode.mediaServiceUsernameLabel')
    : t('mediaserver.ugreenMode.internalUsernameLabel'),
)

const ugreenUsernameHint = computed(() =>
  isUgreenMediaServiceMode.value
    ? t('mediaserver.ugreenMode.mediaServiceUsernameHint')
    : t('mediaserver.ugreenMode.internalUsernameHint'),
)

const ugreenPasswordLabel = computed(() =>
  isUgreenMediaServiceMode.value
    ? t('mediaserver.ugreenMode.mediaServicePasswordLabel')
    : t('mediaserver.ugreenMode.internalPasswordLabel'),
)

const ugreenPasswordHint = computed(() =>
  isUgreenMediaServiceMode.value
    ? t('mediaserver.ugreenMode.mediaServicePasswordHint')
    : t('mediaserver.ugreenMode.internalPasswordHint'),
)

// 绿联 9443 端口在局域网常见自签名证书，开启校验时向用户展示醒目提示。
const showUgreenSelfSignedSslHint = computed(() => {
  if (mediaServerInfo.value.type !== 'ugreen' || !mediaServerInfo.value.config?.verify_ssl) {
    return false
  }
  const host = String(mediaServerInfo.value.config?.host || '')
    .trim()
    .toLowerCase()
  return isUgreenMediaServiceMode.value || host.startsWith('https://') || host.includes(':9443')
})

/** 切换绿联影视的连接方式卡片。 */
function selectUgreenConnectionMode(mode: 'internal' | 'media_service') {
  mediaServerInfo.value.config = mediaServerInfo.value.config || {}
  mediaServerInfo.value.config.mode = mode
}

/** 初始化媒体服务器编辑表单数据。 */
function initializeMediaServerInfo() {
  loadLibrary(props.mediaserver.name)
  mediaServerInfo.value = cloneDeep(props.mediaserver)
  if (mediaServerInfo.value.type === 'ugreen') {
    mediaServerInfo.value.config = mediaServerInfo.value.config || {}
    if (!mediaServerInfo.value.config.scan_mode) {
      mediaServerInfo.value.config.scan_mode = 'supplement_missing'
    }
    if (!mediaServerInfo.value.config.mode) {
      // 新建绿联服务默认引导选择显式模式；已有地址但未设 mode 的旧配置保留 auto 兼容。
      mediaServerInfo.value.config.mode = mediaServerInfo.value.config.host ? 'auto' : 'internal'
    }
    if (mediaServerInfo.value.config.verify_ssl === undefined) {
      mediaServerInfo.value.config.verify_ssl = true
    }
  }
  if (mediaServerInfo.value.type === 'plex') {
    mediaServerInfo.value.config = mediaServerInfo.value.config || {}
    if (mediaServerInfo.value.config.timeout === undefined || mediaServerInfo.value.config.timeout === null) {
      mediaServerInfo.value.config.timeout = 30
    }
  }
  if (!props.mediaserver.sync_libraries) {
    mediaServerInfo.value.sync_libraries = ['all']
  }
}

/** 保存媒体服务器编辑结果并通知父级刷新。 */
function saveMediaServerInfo() {
  if (!mediaServerInfo.value.name) {
    $toast.error(t('mediaserver.nameRequired'))
    return
  }
  if (props.mediaservers.some(item => item.name === mediaServerInfo.value.name && item !== props.mediaserver)) {
    $toast.error(t('mediaserver.nameExists', { name: mediaServerInfo.value.name }))
    return
  }
  mediaServerInfoDialog.value = false
  emit('change', mediaServerInfo.value, props.mediaserver.name)
  emit('done')
}

/** 调用 API 查询指定媒体服务器的媒体库列表。 */
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
  initializeMediaServerInfo()
})
</script>

<template>
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
            <VCol cols="12" md="6">
              <VTextField
                v-model.number="mediaServerInfo.sync_interval"
                type="number"
                min="0"
                step="1"
                clearable
                :label="t('mediaserver.syncInterval')"
                :hint="t('mediaserver.syncIntervalHint', { interval: props.defaultSyncInterval ?? 6 })"
                persistent-hint
                suffix="h"
                prepend-inner-icon="mdi-sync"
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
          <VRow v-else-if="mediaServerInfo.type == 'zspace'">
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
            <VCol cols="6">
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
                type="password"
                v-model="mediaServerInfo.config.password"
                :label="t('mediaserver.password')"
                :hint="t('mediaserver.passwordHint')"
                persistent-hint
                active
                prepend-inner-icon="mdi-lock"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model.number="mediaServerInfo.sync_interval"
                type="number"
                min="0"
                step="1"
                clearable
                :label="t('mediaserver.syncInterval')"
                :hint="t('mediaserver.syncIntervalHint', { interval: props.defaultSyncInterval ?? 6 })"
                persistent-hint
                suffix="h"
                prepend-inner-icon="mdi-sync"
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
            <VCol cols="12" md="6">
              <VTextField
                v-model.number="mediaServerInfo.sync_interval"
                type="number"
                min="0"
                step="1"
                clearable
                :label="t('mediaserver.syncInterval')"
                :hint="t('mediaserver.syncIntervalHint', { interval: props.defaultSyncInterval ?? 6 })"
                persistent-hint
                suffix="h"
                prepend-inner-icon="mdi-sync"
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
            <VCol cols="6">
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
                type="password"
                v-model="mediaServerInfo.config.password"
                :label="t('mediaserver.password')"
                :hint="t('mediaserver.passwordHint')"
                persistent-hint
                active
                prepend-inner-icon="mdi-lock"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                type="password"
                v-model="mediaServerInfo.config.access_code"
                :label="t('mediaserver.accessCode')"
                :hint="t('mediaserver.accessCodeHint')"
                persistent-hint
                active
                prepend-inner-icon="mdi-shield-key"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model.number="mediaServerInfo.sync_interval"
                type="number"
                min="0"
                step="1"
                clearable
                :label="t('mediaserver.syncInterval')"
                :hint="t('mediaserver.syncIntervalHint', { interval: props.defaultSyncInterval ?? 6 })"
                persistent-hint
                suffix="h"
                prepend-inner-icon="mdi-sync"
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
          <VRow v-else-if="mediaServerInfo.type == 'navidrome'">
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
                type="password"
                v-model="mediaServerInfo.config.password"
                :label="t('mediaserver.password')"
                :hint="t('mediaserver.passwordHint')"
                persistent-hint
                active
                prepend-inner-icon="mdi-lock"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model.number="mediaServerInfo.sync_interval"
                type="number"
                min="0"
                step="1"
                clearable
                :label="t('mediaserver.syncInterval')"
                :hint="t('mediaserver.syncIntervalHint', { interval: props.defaultSyncInterval ?? 6 })"
                persistent-hint
                suffix="h"
                prepend-inner-icon="mdi-sync"
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
            <VCol cols="12">
              <div class="text-subtitle-2 font-weight-medium mb-2">
                {{ t('mediaserver.ugreenMode.sectionTitle') }}
              </div>
              <VRow dense role="radiogroup" :aria-label="t('mediaserver.ugreenMode.sectionTitle')">
                <VCol v-for="option in ugreenModeCards" :key="option.value" cols="12" sm="6">
                  <VCard
                    role="radio"
                    tabindex="0"
                    :aria-checked="ugreenConnectionMode === option.value"
                    :variant="ugreenConnectionMode === option.value ? 'tonal' : 'outlined'"
                    :color="ugreenConnectionMode === option.value ? 'primary' : undefined"
                    class="h-100 cursor-pointer pa-3"
                    @click="selectUgreenConnectionMode(option.value)"
                    @keydown.enter.prevent="selectUgreenConnectionMode(option.value)"
                    @keydown.space.prevent="selectUgreenConnectionMode(option.value)"
                  >
                    <div class="d-flex align-center justify-space-between ga-2 mb-1">
                      <div class="d-flex align-center ga-2 min-w-0">
                        <VIcon :icon="option.icon" size="20" />
                        <span class="text-body-2 font-weight-semibold text-high-emphasis">
                          {{ option.title }}
                        </span>
                      </div>
                      <VChip
                        size="x-small"
                        :color="ugreenConnectionMode === option.value ? 'primary' : 'default'"
                        :variant="ugreenConnectionMode === option.value ? 'flat' : 'tonal'"
                        class="flex-shrink-0"
                      >
                        {{ option.badge }}
                      </VChip>
                    </div>
                    <div class="text-caption text-medium-emphasis">
                      {{ option.description }}
                    </div>
                  </VCard>
                </VCol>
              </VRow>
              <VAlert
                :type="ugreenConnectionMode === 'auto' ? 'warning' : 'info'"
                variant="tonal"
                density="compact"
                class="mt-3"
              >
                {{ ugreenGuideText }}
              </VAlert>
            </VCol>
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
                :placeholder="ugreenHostPlaceholder"
                :hint="ugreenHostHint"
                persistent-hint
                active
                prepend-inner-icon="mdi-server"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model="mediaServerInfo.config.username"
                :label="ugreenUsernameLabel"
                :hint="ugreenUsernameHint"
                persistent-hint
                active
                prepend-inner-icon="mdi-account"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                type="password"
                v-model="mediaServerInfo.config.password"
                :label="ugreenPasswordLabel"
                :hint="ugreenPasswordHint"
                persistent-hint
                active
                prepend-inner-icon="mdi-lock"
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
                v-model.number="mediaServerInfo.sync_interval"
                type="number"
                min="0"
                step="1"
                clearable
                :label="t('mediaserver.syncInterval')"
                :hint="t('mediaserver.syncIntervalHint', { interval: props.defaultSyncInterval ?? 6 })"
                persistent-hint
                suffix="h"
                prepend-inner-icon="mdi-sync"
              />
            </VCol>
            <VCol v-if="!isUgreenMediaServiceMode" cols="12" md="6">
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
                :hint="
                  showUgreenSelfSignedSslHint
                    ? t('mediaserver.verifySslSelfSignedWarning')
                    : t('mediaserver.verifySslHint')
                "
                persistent-hint
                :color="showUgreenSelfSignedSslHint ? 'warning' : 'primary'"
                inset
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
            <VCol cols="12" md="6">
              <VTextField
                v-model.number="mediaServerInfo.config.timeout"
                type="number"
                min="1"
                step="1"
                :label="t('mediaserver.plexTimeout')"
                :hint="t('mediaserver.plexTimeoutHint')"
                persistent-hint
                active
                suffix="s"
                prepend-inner-icon="mdi-timer-outline"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model.number="mediaServerInfo.sync_interval"
                type="number"
                min="0"
                step="1"
                clearable
                :label="t('mediaserver.syncInterval')"
                :hint="t('mediaserver.syncIntervalHint', { interval: props.defaultSyncInterval ?? 6 })"
                persistent-hint
                suffix="h"
                prepend-inner-icon="mdi-sync"
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
          <VRow v-else-if="mediaServerInfo.type == 'mediavault'">
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
                :hint="t('mediaserver.vyoHostHint')"
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
                :hint="t('mediaserver.vyoApiKeyHint')"
                persistent-hint
                active
                prepend-inner-icon="mdi-key"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VTextField
                v-model.number="mediaServerInfo.sync_interval"
                type="number"
                min="0"
                step="1"
                clearable
                :label="t('mediaserver.syncInterval')"
                :hint="t('mediaserver.syncIntervalHint', { interval: props.defaultSyncInterval ?? 6 })"
                persistent-hint
                suffix="h"
                prepend-inner-icon="mdi-sync"
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
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn color="primary" variant="flat" @click="saveMediaServerInfo" prepend-icon="mdi-content-save" class="px-5">
          {{ t('common.confirm') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
