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

/** 初始化媒体服务器编辑表单数据。 */
function initializeMediaServerInfo() {
  loadLibrary(props.mediaserver.name)
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
  if (!props.mediaserver.sync_libraries) {
    mediaServerInfo.value.sync_libraries = ['all']
  }
}

/** 保存媒体服务器编辑结果并通知父级刷新。 */
function saveMediaServerInfo() {
  if (!mediaServerInfo.value.name) {
    $toast.error(t('common.nameRequired'))
    return
  }
  if (props.mediaservers.some(item => item.name === mediaServerInfo.value.name && item !== props.mediaserver)) {
    $toast.error(t('common.nameExists', { name: mediaServerInfo.value.name }))
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
                  persistent-hint
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
        <VCardActions class="app-dialog-actions">
          <VSpacer />
          <VBtn
            color="primary"
            variant="flat"
            @click="saveMediaServerInfo"
            prepend-icon="mdi-content-save"
            class="px-5"
          >
            {{ t('common.confirm') }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
</template>
