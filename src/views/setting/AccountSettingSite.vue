<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import { useI18n } from 'vue-i18n'
import { useSilentSettingRefresh } from '@/composables/useSilentSettingRefresh'

// 国际化
const { t } = useI18n()

const props = defineProps({
  active: {
    type: Boolean,
    default: true,
  },
})

// 提示框
const $toast = useToast()

// 站点重置
const isConfirmResetSites = ref(false)

// 站点重置按钮文本
const resetSitesText = ref(t('setting.site.resetSites'))

// 站点重置按钮可用状态
const resetSitesDisabled = ref(false)

const isPasswordVisible = ref(false)

const isCookieCloudAuthHeaderVisible = ref(false)

// 站点设置默认值
const siteSetting = ref<any>({
  CookieCloud: {
    COOKIECLOUD_HOST: '',
    COOKIECLOUD_KEY: '',
    COOKIECLOUD_PASSWORD: '',
    COOKIECLOUD_AUTH_HEADER: '',
    COOKIECLOUD_INTERVAL: 0,
    COOKIECLOUD_ENABLE_LOCAL: false,
    COOKIECLOUD_BLACKLIST: '',
  },
  Site: {
    SITEDATA_REFRESH_INTERVAL: 0,
    SITE_MESSAGE: false,
    SEARCH_RESOURCE_PAGES: 1,
    BROWSER_EMULATION: 'cloakbrowser',
    FLARESOLVERR_URL: '',
  },
})

// 同步间隔下拉框
const CookieCloudIntervalItems = [
  { title: t('setting.site.syncInterval.hourly'), value: 60 },
  { title: t('setting.site.syncInterval.every6Hours'), value: 360 },
  { title: t('setting.site.syncInterval.every12Hours'), value: 720 },
  { title: t('setting.site.syncInterval.daily'), value: 1440 },
  { title: t('setting.site.syncInterval.weekly'), value: 10080 },
  { title: t('setting.site.syncInterval.monthly'), value: 43200 },
  { title: t('setting.site.syncInterval.never'), value: 0 },
]

// 站点数据刷新间隔
const SiteDataRefreshIntervalItems = [
  { title: t('setting.site.syncInterval.hourly'), value: 1 },
  { title: t('setting.site.syncInterval.every6Hours'), value: 6 },
  { title: t('setting.site.syncInterval.every12Hours'), value: 12 },
  { title: t('setting.site.syncInterval.daily'), value: 24 },
  { title: t('setting.site.syncInterval.weekly'), value: 168 },
  { title: t('setting.site.syncInterval.never'), value: 0 },
]

// 站点访问仿真方式
const BrowserEmulationItems = [
  { title: 'CloakBrowser', value: 'cloakbrowser' },
  { title: 'FlareSolverr', value: 'flaresolverr' },
]

// 重置站点
async function resetSites() {
  try {
    resetSitesDisabled.value = true
    resetSitesText.value = t('setting.site.resettingSites')

    const result: { [key: string]: any } = await api.get('site/reset')
    if (result.success) $toast.success(t('setting.site.resetSuccess'))
    else $toast.error(t('setting.site.resetFailed'))

    resetSitesDisabled.value = false
    resetSitesText.value = t('setting.site.resetSites')
  } catch (error) {
    console.log(error)
  }
}

// 加载站点设置
async function loadSiteSettings() {
  try {
    const result: { [key: string]: any } = await api.get('system/env')
    if (result.success) {
      // 将API返回的值赋值给SystemSettings
      for (const sectionKey of Object.keys(siteSetting.value) as Array<keyof typeof siteSetting.value>) {
        Object.keys(siteSetting.value[sectionKey]).forEach((key: string) => {
          if (result.data.hasOwnProperty(key)) (siteSetting.value[sectionKey] as any)[key] = result.data[key]
        })
      }
    }
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存设置
async function saveSiteSetting(value: { [key: string]: any }) {
  try {
    const result: { [key: string]: any } = await api.post('system/env', value)
    if (result.success) {
      $toast.success(t('setting.site.saveSuccess'))
    } else {
      $toast.error(t('setting.site.saveFailed'))
    }
  } catch (error) {
    console.log(error)
    $toast.error(t('setting.system.saveFailed', { message: error }))
  }
}

// 加载数据
onMounted(() => {
  loadSiteSettings()
})

useSilentSettingRefresh(loadSiteSettings, {
  active: computed(() => props.active),
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.site.siteSync') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.site.siteSyncDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VCheckbox
                  v-model="siteSetting.CookieCloud.COOKIECLOUD_ENABLE_LOCAL"
                  :label="t('setting.site.enableLocalCookieCloud')"
                  :hint="t('setting.site.enableLocalCookieCloudHint')"
                  persistent-hint
                />
              </VCol>
            </VRow>
            <VRow>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="siteSetting.CookieCloud.COOKIECLOUD_HOST"
                  :label="t('setting.site.serviceAddress')"
                  :placeholder="t('setting.site.serviceAddressPlaceholder')"
                  :disabled="siteSetting.CookieCloud.COOKIECLOUD_ENABLE_LOCAL"
                  :hint="t('setting.site.serviceAddressHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-server"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="siteSetting.CookieCloud.COOKIECLOUD_KEY"
                  :label="t('setting.site.userKey')"
                  :hint="t('setting.site.userKeyHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-key"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="siteSetting.CookieCloud.COOKIECLOUD_PASSWORD"
                  :type="isPasswordVisible ? 'text' : 'password'"
                  :append-inner-icon="isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                  @click:append-inner="isPasswordVisible = !isPasswordVisible"
                  :label="t('setting.site.e2ePassword')"
                  :hint="t('setting.site.e2ePasswordHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-lock"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="siteSetting.CookieCloud.COOKIECLOUD_AUTH_HEADER"
                  :type="isCookieCloudAuthHeaderVisible ? 'text' : 'password'"
                  :append-inner-icon="isCookieCloudAuthHeaderVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                  @click:append-inner="isCookieCloudAuthHeaderVisible = !isCookieCloudAuthHeaderVisible"
                  :label="t('setting.site.cookieCloudAuthHeader')"
                  :hint="t('setting.site.cookieCloudAuthHeaderHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-shield-key"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="siteSetting.CookieCloud.COOKIECLOUD_INTERVAL"
                  :label="t('setting.site.autoSyncInterval')"
                  :items="CookieCloudIntervalItems"
                  :hint="t('setting.site.autoSyncIntervalHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-timer"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="siteSetting.CookieCloud.COOKIECLOUD_BLACKLIST"
                  :label="t('setting.site.syncBlacklist')"
                  :placeholder="t('setting.site.syncBlacklistPlaceholder')"
                  :hint="t('setting.site.syncBlacklistHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-block-helper"
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveSiteSetting(siteSetting.CookieCloud)" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard :title="t('setting.site.siteOptions')">
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="siteSetting.Site.SITEDATA_REFRESH_INTERVAL"
                  :label="t('setting.site.siteDataRefreshInterval')"
                  :items="SiteDataRefreshIntervalItems"
                  :hint="t('setting.site.siteDataRefreshIntervalHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-refresh"
                />
              </VCol>

              <VCol cols="12" md="6">
                <VTextField
                  v-model.number="siteSetting.Site.SEARCH_RESOURCE_PAGES"
                  type="number"
                  min="1"
                  step="1"
                  :label="t('setting.site.searchResourcePages')"
                  :hint="t('setting.site.searchResourcePagesHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-file-search"
                />
              </VCol>

              <VCol cols="12" md="6">
                <VSelect
                  v-model="siteSetting.Site.BROWSER_EMULATION"
                  :items="BrowserEmulationItems"
                  :label="t('setting.site.browserEmulation')"
                  :hint="t('setting.site.browserEmulationHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-web"
                />
              </VCol>
              <VCol cols="12" md="6" v-if="siteSetting.Site.BROWSER_EMULATION == 'flaresolverr'">
                <VTextField
                  v-model="siteSetting.Site.FLARESOLVERR_URL"
                  :label="t('setting.site.flaresolverrUrl')"
                  :placeholder="'http://127.0.0.1:8191'"
                  :hint="t('setting.site.flaresolverrUrlHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-server"
                />
              </VCol>
            </VRow>
            <VRow>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="siteSetting.Site.SITE_MESSAGE"
                  :label="t('setting.site.readSiteMessage')"
                  :hint="t('setting.site.readSiteMessageHint')"
                  persistent-hint
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveSiteSetting(siteSetting.Site)" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard :title="t('setting.site.siteReset')">
        <VCardText>
          <div>
            <VCheckbox
              v-model="isConfirmResetSites"
              :label="t('setting.site.confirmReset')"
              :hint="t('setting.site.confirmResetHint')"
              persistent-hint
            />
          </div>

          <VBtn :disabled="!isConfirmResetSites || resetSitesDisabled" color="error" class="mt-3" @click="resetSites">
            {{ resetSitesText }}
          </VBtn>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <!-- 进度框 -->
</template>
