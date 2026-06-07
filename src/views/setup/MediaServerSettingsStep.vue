<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useSetupWizard } from '@/composables/useSetupWizard'
import api from '@/api'
import { getLogoUrl } from '@/utils/imageUtils'

const { t } = useI18n()
const { wizardData, selectMediaServer, validationErrors } = useSetupWizard()

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

function ensureUgreenConfig() {
  if (wizardData.value.mediaServer.type !== 'ugreen') return
  wizardData.value.mediaServer.config = wizardData.value.mediaServer.config || {}
  if (!wizardData.value.mediaServer.config.scan_mode) {
    wizardData.value.mediaServer.config.scan_mode = 'supplement_missing'
  }
  if (wizardData.value.mediaServer.config.verify_ssl === undefined) {
    wizardData.value.mediaServer.config.verify_ssl = true
  }
}

// 调用API查询媒体库
async function loadLibrary(server: string) {
  try {
    console.log('Loading library for server:', server)
    const result: any[] = await api.get('mediaserver/library', { params: { server } })
    if (result && result.length > 0) {
      librariesOptions.value = result.map(item => ({
        title: item.name,
        value: item.id?.toString(),
      }))
      console.log('Loaded libraries:', librariesOptions.value)
    } else {
      librariesOptions.value = []
      console.log('No libraries found')
    }
    librariesOptions.value.unshift({
      title: t('common.all'),
      value: 'all',
    })
  } catch (e) {
    console.log('Error loading library:', e)
  }
}

// 选择媒体服务器并自动加载媒体库
async function selectMediaServerWithLibrary(type: string) {
  selectMediaServer(type)
  ensureUgreenConfig()
  // 如果选择了媒体服务器类型，自动加载媒体库
  if (type && wizardData.value.mediaServer.name) {
    await loadLibrary(wizardData.value.mediaServer.name)
  }
}

// 组件挂载时检查是否需要加载媒体库
onMounted(async () => {
  ensureUgreenConfig()
  // 如果已经有媒体服务器配置，自动加载媒体库
  if (wizardData.value.mediaServer.type && wizardData.value.mediaServer.name) {
    await loadLibrary(wizardData.value.mediaServer.name)
  }
})

// 监听媒体服务器配置变化，自动加载媒体库
watch(
  () => [wizardData.value.mediaServer.type, wizardData.value.mediaServer.name],
  async ([type, name]) => {
    ensureUgreenConfig()
    console.log('Media server changed:', { type, name })
    if (type && name) {
      await loadLibrary(name)
    }
  },
  { immediate: true },
)
</script>

<template>
  <VCard variant="outlined">
    <VCardText>
      <div class="text-center mb-6">
        <h3 class="text-h4 mb-2">{{ t('setupWizard.mediaServer.title') }}</h3>
        <p class="text-body-1 text-medium-emphasis">{{ t('setupWizard.mediaServer.description') }}</p>
      </div>
      <VRow>
        <VCol cols="12">
          <VAlert type="info" variant="tonal" class="mb-4">
            <VAlertTitle>{{ t('setupWizard.mediaServer.info') }}</VAlertTitle>
            {{ t('setupWizard.mediaServer.infoDesc') }}
          </VAlert>
        </VCol>

        <!-- 媒体服务器选择 -->
        <VCol cols="12">
          <div class="mb-4">
            <h4 class="text-h6 mb-4">{{ t('setupWizard.mediaServer.type') }}</h4>
            <VRow>
              <VCol cols="12" md="3">
                <VCard
                  :color="wizardData.mediaServer.type === 'emby' ? 'primary' : 'default'"
                  :variant="wizardData.mediaServer.type === 'emby' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectMediaServerWithLibrary('emby')"
                >
                  <VCardText class="text-center">
                    <VImg :src="getLogoUrl('emby')" height="48" width="48" class="mx-auto mb-2" />
                    <div class="text-h6">Emby</div>
                  </VCardText>
                </VCard>
              </VCol>
              <VCol cols="12" md="3">
                <VCard
                  :color="wizardData.mediaServer.type === 'zspace' ? 'primary' : 'default'"
                  :variant="wizardData.mediaServer.type === 'zspace' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectMediaServerWithLibrary('zspace')"
                >
                  <VCardText class="text-center">
                    <VImg :src="getLogoUrl('zspace')" height="48" width="48" class="mx-auto mb-2" />
                    <div class="text-h6">极影视</div>
                  </VCardText>
                </VCard>
              </VCol>
              <VCol cols="12" md="3">
                <VCard
                  :color="wizardData.mediaServer.type === 'jellyfin' ? 'primary' : 'default'"
                  :variant="wizardData.mediaServer.type === 'jellyfin' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectMediaServerWithLibrary('jellyfin')"
                >
                  <VCardText class="text-center">
                    <VImg :src="getLogoUrl('jellyfin')" height="48" width="48" class="mx-auto mb-2" />
                    <div class="text-h6">Jellyfin</div>
                  </VCardText>
                </VCard>
              </VCol>
              <VCol cols="12" md="3">
                <VCard
                  :color="wizardData.mediaServer.type === 'plex' ? 'primary' : 'default'"
                  :variant="wizardData.mediaServer.type === 'plex' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectMediaServerWithLibrary('plex')"
                >
                  <VCardText class="text-center">
                    <VImg :src="getLogoUrl('plex')" height="48" width="48" class="mx-auto mb-2" />
                    <div class="text-h6">Plex</div>
                  </VCardText>
                </VCard>
              </VCol>
              <VCol cols="12" md="3">
                <VCard
                  :color="wizardData.mediaServer.type === 'trimemedia' ? 'primary' : 'default'"
                  :variant="wizardData.mediaServer.type === 'trimemedia' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectMediaServerWithLibrary('trimemedia')"
                >
                  <VCardText class="text-center">
                    <VImg :src="getLogoUrl('trimemedia')" height="48" width="48" class="mx-auto mb-2" />
                    <div class="text-h6">飞牛影视</div>
                  </VCardText>
                </VCard>
              </VCol>
              <VCol cols="12" md="3">
                <VCard
                  :color="wizardData.mediaServer.type === 'ugreen' ? 'primary' : 'default'"
                  :variant="wizardData.mediaServer.type === 'ugreen' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectMediaServerWithLibrary('ugreen')"
                >
                  <VCardText class="text-center">
                    <VImg :src="getLogoUrl('ugreen')" height="48" width="48" class="mx-auto mb-2" />
                    <div class="text-h6">绿联影视</div>
                  </VCardText>
                </VCard>
              </VCol>
            </VRow>
          </div>
        </VCol>

        <!-- 媒体服务器配置 -->
        <VCol v-if="wizardData.mediaServer.type" cols="12">
          <VCard>
            <VCardText>
              <VForm>
                <VRow v-if="wizardData.mediaServer.type === 'emby'">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.name"
                      :label="t('common.name')"
                      :placeholder="t('mediaserver.nameRequired')"
                      :hint="t('mediaserver.serverAlias')"
                      :error="validationErrors.mediaServer.name"
                      :error-messages="validationErrors.mediaServer.name ? [t('mediaserver.nameRequired')] : []"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-label"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.config.host"
                      :label="t('mediaserver.host')"
                      :placeholder="t('mediaserver.hostPlaceholder')"
                      :hint="t('mediaserver.hostHint')"
                      :error="validationErrors.mediaServer.host"
                      :error-messages="validationErrors.mediaServer.host ? [t('mediaserver.hostRequired')] : []"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-server"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.config.play_host"
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
                      v-model="wizardData.mediaServer.config.username"
                      :label="t('mediaserver.username')"
                      :hint="t('mediaserver.usernameHint')"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-account"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.config.apikey"
                      :label="t('mediaserver.apiKey')"
                      :hint="t('mediaserver.embyApiKeyHint')"
                      :error="validationErrors.mediaServer.apikey"
                      :error-messages="validationErrors.mediaServer.apikey ? [t('mediaserver.apiKeyRequired')] : []"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-key"
                      required
                    />
                  </VCol>
                  <VCol cols="12">
                    <VAutocomplete
                      v-model="wizardData.mediaServer.sync_libraries"
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
                      @click:append-inner="loadLibrary(wizardData.mediaServer.name)"
                    />
                  </VCol>
                </VRow>
                <VRow v-else-if="wizardData.mediaServer.type === 'zspace'">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.name"
                      :label="t('common.name')"
                      :placeholder="t('mediaserver.nameRequired')"
                      :hint="t('mediaserver.serverAlias')"
                      :error="validationErrors.mediaServer.name"
                      :error-messages="validationErrors.mediaServer.name ? [t('mediaserver.nameRequired')] : []"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-label"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.config.host"
                      :label="t('mediaserver.host')"
                      :placeholder="t('mediaserver.hostPlaceholder')"
                      :hint="t('mediaserver.hostHint')"
                      :error="validationErrors.mediaServer.host"
                      :error-messages="validationErrors.mediaServer.host ? [t('mediaserver.hostRequired')] : []"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-server"
                      required
                    />
                  </VCol>
                  <VCol cols="12">
                    <VTextField
                      v-model="wizardData.mediaServer.config.play_host"
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
                      v-model="wizardData.mediaServer.config.username"
                      :label="t('mediaserver.username')"
                      :hint="t('mediaserver.usernameHint')"
                      :error="validationErrors.mediaServer.username"
                      :error-messages="validationErrors.mediaServer.username ? [t('mediaserver.usernameRequired')] : []"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-account"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      type="password"
                      v-model="wizardData.mediaServer.config.password"
                      :label="t('mediaserver.password')"
                      :error="validationErrors.mediaServer.password"
                      :error-messages="validationErrors.mediaServer.password ? [t('mediaserver.passwordRequired')] : []"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-lock"
                      required
                    />
                  </VCol>
                  <VCol cols="12">
                    <VAutocomplete
                      v-model="wizardData.mediaServer.sync_libraries"
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
                      @click:append-inner="loadLibrary(wizardData.mediaServer.name)"
                    />
                  </VCol>
                </VRow>
                <VRow v-else-if="wizardData.mediaServer.type === 'jellyfin'">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.name"
                      :label="t('common.name')"
                      :placeholder="t('mediaserver.nameRequired')"
                      :hint="t('mediaserver.serverAlias')"
                      :error="validationErrors.mediaServer.name"
                      :error-messages="validationErrors.mediaServer.name ? [t('mediaserver.nameRequired')] : []"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-label"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.config.host"
                      :label="t('mediaserver.host')"
                      :placeholder="t('mediaserver.hostPlaceholder')"
                      :hint="t('mediaserver.hostHint')"
                      :error="validationErrors.mediaServer.host"
                      :error-messages="validationErrors.mediaServer.host ? [t('mediaserver.hostRequired')] : []"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-server"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.config.play_host"
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
                      v-model="wizardData.mediaServer.config.apikey"
                      :label="t('mediaserver.apiKey')"
                      :hint="t('mediaserver.jellyfinApiKeyHint')"
                      :error="validationErrors.mediaServer.apikey"
                      :error-messages="validationErrors.mediaServer.apikey ? [t('mediaserver.apiKeyRequired')] : []"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-key"
                      required
                    />
                  </VCol>
                  <VCol cols="12">
                    <VAutocomplete
                      v-model="wizardData.mediaServer.sync_libraries"
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
                      @click:append-inner="loadLibrary(wizardData.mediaServer.name)"
                    />
                  </VCol>
                </VRow>
                <VRow v-else-if="wizardData.mediaServer.type === 'trimemedia'">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.name"
                      :label="t('common.name')"
                      :placeholder="t('mediaserver.nameRequired')"
                      :hint="t('mediaserver.serverAlias')"
                      :error="validationErrors.mediaServer.name"
                      :error-messages="validationErrors.mediaServer.name ? [t('mediaserver.nameRequired')] : []"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-label"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.config.host"
                      :label="t('mediaserver.host')"
                      :placeholder="t('mediaserver.hostPlaceholder')"
                      :hint="t('mediaserver.hostHint')"
                      :error="validationErrors.mediaServer.host"
                      :error-messages="validationErrors.mediaServer.host ? [t('mediaserver.hostRequired')] : []"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-server"
                      required
                    />
                  </VCol>
                  <VCol cols="12">
                    <VTextField
                      v-model="wizardData.mediaServer.config.play_host"
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
                      v-model="wizardData.mediaServer.config.username"
                      :label="t('mediaserver.username')"
                      :error="validationErrors.mediaServer.username"
                      :error-messages="validationErrors.mediaServer.username ? [t('mediaserver.usernameRequired')] : []"
                      active
                      prepend-inner-icon="mdi-account"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      type="password"
                      v-model="wizardData.mediaServer.config.password"
                      :label="t('mediaserver.password')"
                      :error="validationErrors.mediaServer.password"
                      :error-messages="validationErrors.mediaServer.password ? [t('mediaserver.passwordRequired')] : []"
                      active
                      prepend-inner-icon="mdi-lock"
                      required
                    />
                  </VCol>
                  <VCol cols="12">
                    <VAutocomplete
                      v-model="wizardData.mediaServer.sync_libraries"
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
                      @click:append-inner="loadLibrary(wizardData.mediaServer.name)"
                    />
                  </VCol>
                </VRow>
                <VRow v-else-if="wizardData.mediaServer.type === 'ugreen'">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.name"
                      :label="t('common.name')"
                      :placeholder="t('mediaserver.nameRequired')"
                      :hint="t('mediaserver.serverAlias')"
                      :error="validationErrors.mediaServer.name"
                      :error-messages="validationErrors.mediaServer.name ? [t('mediaserver.nameRequired')] : []"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-label"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.config.host"
                      :label="t('mediaserver.host')"
                      :placeholder="t('mediaserver.hostPlaceholder')"
                      :hint="t('mediaserver.hostHint')"
                      :error="validationErrors.mediaServer.host"
                      :error-messages="validationErrors.mediaServer.host ? [t('mediaserver.hostRequired')] : []"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-server"
                      required
                    />
                  </VCol>
                  <VCol cols="12">
                    <VTextField
                      v-model="wizardData.mediaServer.config.play_host"
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
                      v-model="wizardData.mediaServer.config.username"
                      :label="t('mediaserver.username')"
                      :error="validationErrors.mediaServer.username"
                      :error-messages="validationErrors.mediaServer.username ? [t('mediaserver.usernameRequired')] : []"
                      active
                      prepend-inner-icon="mdi-account"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      type="password"
                      v-model="wizardData.mediaServer.config.password"
                      :label="t('mediaserver.password')"
                      :error="validationErrors.mediaServer.password"
                      :error-messages="validationErrors.mediaServer.password ? [t('mediaserver.passwordRequired')] : []"
                      active
                      prepend-inner-icon="mdi-lock"
                      required
                    />
                  </VCol>
                  <VCol cols="12">
                    <VAutocomplete
                      v-model="wizardData.mediaServer.sync_libraries"
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
                      @click:append-inner="loadLibrary(wizardData.mediaServer.name)"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VSelect
                      v-model="wizardData.mediaServer.config.scan_mode"
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
                      v-model="wizardData.mediaServer.config.verify_ssl"
                      :label="t('mediaserver.verifySsl')"
                      :hint="t('mediaserver.verifySslHint')"
                      persistent-hint
                      color="primary"
                      inset
                    />
                  </VCol>
                </VRow>
                <VRow v-else-if="wizardData.mediaServer.type === 'plex'">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.name"
                      :label="t('common.name')"
                      :placeholder="t('mediaserver.nameRequired')"
                      :hint="t('mediaserver.serverAlias')"
                      :error="validationErrors.mediaServer.name"
                      :error-messages="validationErrors.mediaServer.name ? [t('mediaserver.nameRequired')] : []"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-label"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.config.host"
                      :label="t('mediaserver.host')"
                      :placeholder="t('mediaserver.hostPlaceholder')"
                      :hint="t('mediaserver.hostHint')"
                      :error="validationErrors.mediaServer.host"
                      :error-messages="validationErrors.mediaServer.host ? [t('mediaserver.hostRequired')] : []"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-server"
                      required
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.config.play_host"
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
                      v-model="wizardData.mediaServer.config.token"
                      :label="t('mediaserver.plexToken')"
                      :hint="t('mediaserver.plexTokenHint')"
                      :error="validationErrors.mediaServer.token"
                      :error-messages="validationErrors.mediaServer.token ? [t('mediaserver.tokenRequired')] : []"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-key"
                      required
                    />
                  </VCol>
                  <VCol cols="12">
                    <VAutocomplete
                      v-model="wizardData.mediaServer.sync_libraries"
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
                      @click:append-inner="loadLibrary(wizardData.mediaServer.name)"
                    />
                  </VCol>
                </VRow>
                <VRow v-else>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.type"
                      :label="t('mediaserver.type')"
                      :hint="t('mediaserver.customTypeHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-cog"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.name"
                      :label="t('common.name')"
                      :hint="t('mediaserver.nameRequired')"
                      persistent-hint
                      prepend-inner-icon="mdi-label"
                    />
                  </VCol>
                </VRow>
              </VForm>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>
    </VCardText>
  </VCard>
</template>

<style scoped>
.cursor-pointer {
  cursor: pointer;
  transition: all 0.2s ease;
}

.cursor-pointer:hover {
  transform: translateY(-2px);
}

.cursor-pointer:active {
  transform: translateY(0);
}

/* 选中状态的样式 */
.v-card--variant-tonal.v-theme--light {
  border: 2px solid rgb(var(--v-theme-primary));
  background-color: rgb(var(--v-theme-primary), 0.12);
}

.v-card--variant-tonal.v-theme--dark {
  border: 2px solid rgb(var(--v-theme-primary));
  background-color: rgb(var(--v-theme-primary), 0.2);
}
</style>
