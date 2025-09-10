<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { useSetupWizard } from '@/composables/useSetupWizard'

const { t } = useI18n()
const { wizardData, selectDownloader } = useSetupWizard()
</script>

<template>
  <VCard variant="outlined">
    <VCardText>
      <div class="text-center mb-6">
        <h3 class="text-h4 mb-2">{{ t('setupWizard.downloader.title') }}</h3>
        <p class="text-body-1 text-medium-emphasis">{{ t('setupWizard.downloader.description') }}</p>
      </div>
      <VRow>
        <VCol cols="12">
          <VAlert type="info" variant="tonal" class="mb-4">
            <VAlertTitle>{{ t('setupWizard.downloader.info') }}</VAlertTitle>
            {{ t('setupWizard.downloader.infoDesc') }}
          </VAlert>
        </VCol>

        <!-- 下载器选择 -->
        <VCol cols="12">
          <div class="mb-4">
            <h4 class="text-h6 mb-4">{{ t('setupWizard.downloader.type') }}</h4>
            <VRow>
              <VCol cols="12" md="6">
                <VCard
                  :color="wizardData.downloader.type === 'qbittorrent' ? 'primary' : 'default'"
                  :variant="wizardData.downloader.type === 'qbittorrent' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectDownloader('qbittorrent')"
                >
                  <VCardText class="text-center">
                    <VImg
                      src="/src/assets/images/logos/qbittorrent.png"
                      height="48"
                      width="48"
                      class="mx-auto mb-2"
                    />
                    <div class="text-h6">qBittorrent</div>
                  </VCardText>
                </VCard>
              </VCol>
              <VCol cols="12" md="6">
                <VCard
                  :color="wizardData.downloader.type === 'transmission' ? 'primary' : 'default'"
                  :variant="wizardData.downloader.type === 'transmission' ? 'tonal' : 'outlined'"
                  class="cursor-pointer"
                  @click="selectDownloader('transmission')"
                >
                  <VCardText class="text-center">
                    <VImg
                      src="/src/assets/images/logos/transmission.png"
                      height="48"
                      width="48"
                      class="mx-auto mb-2"
                    />
                    <div class="text-h6">Transmission</div>
                  </VCardText>
                </VCard>
              </VCol>
            </VRow>
          </div>
        </VCol>

        <!-- 下载器配置 -->
        <VCol v-if="wizardData.downloader.type" cols="12">
          <VCard>
            <VCardText>
              <VForm>
                <VRow v-if="wizardData.downloader.type === 'qbittorrent'">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.downloader.name"
                      :label="t('downloader.name')"
                      :placeholder="t('downloader.nameRequired')"
                      :hint="t('downloader.name')"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-label"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.downloader.config.host"
                      :label="t('downloader.host')"
                      placeholder="http(s)://ip:port"
                      :hint="t('downloader.host')"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-server"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.downloader.config.username"
                      :label="t('downloader.username')"
                      :hint="t('downloader.username')"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-account"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.downloader.config.password"
                      type="password"
                      :label="t('downloader.password')"
                      :hint="t('downloader.password')"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-lock"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VSwitch
                      v-model="wizardData.downloader.config.category"
                      :label="t('downloader.category')"
                      :hint="t('downloader.category')"
                      persistent-hint
                      active
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VSwitch
                      v-model="wizardData.downloader.config.sequentail"
                      :label="t('downloader.sequentail')"
                      :hint="t('downloader.sequentail')"
                      persistent-hint
                      active
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VSwitch
                      v-model="wizardData.downloader.config.force_resume"
                      :label="t('downloader.force_resume')"
                      :hint="t('downloader.force_resume')"
                      persistent-hint
                      active
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VSwitch
                      v-model="wizardData.downloader.config.first_last_piece"
                      :label="t('downloader.first_last_piece')"
                      :hint="t('downloader.first_last_piece')"
                      persistent-hint
                      active
                    />
                  </VCol>
                </VRow>
                <VRow v-else-if="wizardData.downloader.type === 'transmission'">
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.downloader.name"
                      :label="t('downloader.name')"
                      :placeholder="t('downloader.nameRequired')"
                      :hint="t('downloader.name')"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-label"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.downloader.config.host"
                      :label="t('downloader.host')"
                      placeholder="http(s)://ip:port"
                      :hint="t('downloader.host')"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-server"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.downloader.config.username"
                      :label="t('downloader.username')"
                      :hint="t('downloader.username')"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-account"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.downloader.config.password"
                      type="password"
                      :label="t('downloader.password')"
                      :hint="t('downloader.password')"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-lock"
                    />
                  </VCol>
                </VRow>
                <VRow v-else>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.downloader.type"
                      :label="t('downloader.type')"
                      :hint="t('downloader.customTypeHint')"
                      persistent-hint
                      active
                      prepend-inner-icon="mdi-cog"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="wizardData.downloader.name"
                      :label="t('downloader.name')"
                      :hint="t('downloader.nameRequired')"
                      persistent-hint
                      active
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