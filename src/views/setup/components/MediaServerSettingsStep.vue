<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useSetupWizard } from '@/composables/useSetupWizard'

const { t } = useI18n()
const { wizardData, selectMediaServer } = useSetupWizard()
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
                  @click="selectMediaServer('emby')"
                >
                  <VCardText class="text-center">
                    <VImg
                      src="/src/assets/images/logos/emby.png"
                      height="48"
                      width="48"
                      class="mx-auto mb-2"
                    />
                    <div class="text-h6">Emby</div>
                  </VCardText>
                </VCard>
              </VCol>
              <VCol cols="12" md="3">
                <VCard
                  :color="wizardData.mediaServer.type === 'jellyfin' ? 'primary' : 'default'"
                  :variant="wizardData.mediaServer.type === 'jellyfin' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectMediaServer('jellyfin')"
                >
                  <VCardText class="text-center">
                    <VImg
                      src="/src/assets/images/logos/jellyfin.png"
                      height="48"
                      width="48"
                      class="mx-auto mb-2"
                    />
                    <div class="text-h6">Jellyfin</div>
                  </VCardText>
                </VCard>
              </VCol>
              <VCol cols="12" md="3">
                <VCard
                  :color="wizardData.mediaServer.type === 'plex' ? 'primary' : 'default'"
                  :variant="wizardData.mediaServer.type === 'plex' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectMediaServer('plex')"
                >
                  <VCardText class="text-center">
                    <VImg
                      src="/src/assets/images/logos/plex.png"
                      height="48"
                      width="48"
                      class="mx-auto mb-2"
                    />
                    <div class="text-h6">Plex</div>
                  </VCardText>
                </VCard>
              </VCol>
              <VCol cols="12" md="3">
                <VCard
                  :color="wizardData.mediaServer.type === 'trimemedia' ? 'primary' : 'default'"
                  :variant="wizardData.mediaServer.type === 'trimemedia' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectMediaServer('trimemedia')"
                >
                  <VCardText class="text-center">
                    <VImg
                      src="/src/assets/images/logos/trimemedia.png"
                      height="48"
                      width="48"
                      class="mx-auto mb-2"
                    />
                    <div class="text-h6">飞牛影视</div>
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
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-label"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.config.host"
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
                      :hint="t('mediaserver.embyApiKeyHint')"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-key"
                    />
                  </VCol>
                  <VCol cols="12">
                    <VAutocomplete
                      v-model="wizardData.mediaServer.sync_libraries"
                      :label="t('mediaserver.syncLibraries')"
                      :items="[]"
                      chips
                      multiple
                      clearable
                      :hint="t('mediaserver.syncLibrariesHint')"
                      persistent-hint
                      active
                      append-inner-icon="mdi-refresh"
                      prepend-inner-icon="mdi-library"
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
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-label"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.config.host"
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
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-key"
                    />
                  </VCol>
                  <VCol cols="12">
                    <VAutocomplete
                      v-model="wizardData.mediaServer.sync_libraries"
                      :label="t('mediaserver.syncLibraries')"
                      :items="[]"
                      chips
                      multiple
                      clearable
                      :hint="t('mediaserver.syncLibrariesHint')"
                      persistent-hint
                      active
                      append-inner-icon="mdi-refresh"
                      prepend-inner-icon="mdi-library"
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
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-label"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.config.host"
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
                      active
                      prepend-inner-icon="mdi-account"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      type="password"
                      v-model="wizardData.mediaServer.config.password"
                      :label="t('mediaserver.password')"
                      active
                      prepend-inner-icon="mdi-lock"
                    />
                  </VCol>
                  <VCol cols="12">
                    <VAutocomplete
                      v-model="wizardData.mediaServer.sync_libraries"
                      :label="t('mediaserver.syncLibraries')"
                      :items="[]"
                      chips
                      multiple
                      clearable
                      :hint="t('mediaserver.syncLibrariesHint')"
                      persistent-hint
                      active
                      append-inner-icon="mdi-refresh"
                      prepend-inner-icon="mdi-library"
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
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-label"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.mediaServer.config.host"
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
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-key"
                    />
                  </VCol>
                  <VCol cols="12">
                    <VAutocomplete
                      v-model="wizardData.mediaServer.sync_libraries"
                      :label="t('mediaserver.syncLibraries')"
                      :items="[]"
                      chips
                      multiple
                      clearable
                      :hint="t('mediaserver.syncLibrariesHint')"
                      persistent-hint
                      active
                      append-inner-icon="mdi-refresh"
                      prepend-inner-icon="mdi-library"
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
  box-shadow: 0 4px 12px rgba(0, 0, 0, 15%);
  transform: translateY(-2px);
}

.cursor-pointer:active {
  transform: translateY(0);
}

/* 选中状态的样式 */
.v-card--variant-tonal.v-theme--light {
  background-color: rgb(var(--v-theme-primary), 0.12);
}

.v-card--variant-tonal.v-theme--dark {
  background-color: rgb(var(--v-theme-primary), 0.2);
}
</style>