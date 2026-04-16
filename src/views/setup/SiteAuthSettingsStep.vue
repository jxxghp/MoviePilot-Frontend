<script lang="ts" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSetupWizard } from '@/composables/useSetupWizard'

const { t } = useI18n()
const { wizardData, authSites, validationErrors } = useSetupWizard()

const siteItems = computed(() => {
  return Object.keys(authSites.value).map(key => ({
    key,
    name: authSites.value[key].name,
    prependAvatar: authSites.value[key].icon,
  }))
})

const formFields = computed(() => {
  const site = authSites.value[wizardData.value.siteAuth.site]
  return Object.keys(site?.params || {})
    .filter(key => site.params[key]?.name && site.params[key]?.type)
    .map(key => ({
      key,
      site: wizardData.value.siteAuth.site,
      name: site.params[key].name,
      type: site.params[key].type,
      placeholder: site.params[key].placeholder,
      tooltip: site.params[key].tooltip,
    }))
})
</script>

<template>
  <VCard variant="outlined">
    <VCardText>
      <div class="text-center mb-6">
        <h3 class="text-h4 mb-2">{{ t('setupWizard.siteAuth.title') }}</h3>
        <p class="text-body-1 text-medium-emphasis">{{ t('setupWizard.siteAuth.description') }}</p>
      </div>

      <VRow>
        <VCol cols="12">
          <VAlert type="info" variant="tonal" class="mb-4">
            <VAlertTitle>{{ t('setupWizard.siteAuth.info') }}</VAlertTitle>
            {{ t('setupWizard.siteAuth.infoDesc') }}
          </VAlert>
        </VCol>

        <VCol cols="12">
          <VSwitch
            v-model="wizardData.siteAuth.auxiliaryAuthEnable"
            :label="t('setting.system.auxAuthEnable')"
            :hint="t('setting.system.auxAuthEnableHint')"
            persistent-hint
            color="primary"
          />
        </VCol>

        <VCol cols="12">
          <VSelect
            v-model="wizardData.siteAuth.site"
            :items="siteItems"
            item-value="key"
            item-title="name"
            item-props
            :label="t('dialog.userAuth.selectSite')"
            :hint="t('setupWizard.siteAuth.selectSiteHint')"
            :error="validationErrors.siteAuth.site"
            :error-messages="validationErrors.siteAuth.site ? [t('dialog.userAuth.selectSiteRequired')] : []"
            persistent-hint
            prepend-inner-icon="mdi-web"
            clearable
          />
        </VCol>

        <template v-if="wizardData.siteAuth.site">
          <VCol cols="12">
            <VAlert type="warning" variant="tonal">
              {{ t('setupWizard.siteAuth.submitHint') }}
            </VAlert>
          </VCol>

          <VCol v-for="param in formFields" :key="param.key" cols="12" md="6">
            <VTextField
              v-model="wizardData.siteAuth.params[param.site.toUpperCase() + '_' + param.key.toUpperCase()]"
              :type="param.type"
              :label="param.name"
              :placeholder="param.placeholder"
              :hint="param.tooltip"
              :error="validationErrors.siteAuth[param.site.toUpperCase() + '_' + param.key.toUpperCase()]"
              :error-messages="
                validationErrors.siteAuth[param.site.toUpperCase() + '_' + param.key.toUpperCase()]
                  ? [t('setupWizard.siteAuth.fieldRequired', { name: param.name })]
                  : []
              "
              clearable
              persistent-hint
            />
          </VCol>
        </template>
      </VRow>
    </VCardText>
  </VCard>
</template>
