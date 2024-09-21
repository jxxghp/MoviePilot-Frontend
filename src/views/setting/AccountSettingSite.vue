<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import api from '@/api'

// 提示框
const $toast = useToast()

// 站点重置
const isConfirmResetSites = ref(false)

// 站点重置按钮文本
const resetSitesText = ref('重置站点数据')

// 站点重置按钮可用状态
const resetSitesDisabled = ref(false)

// CookieCloud设置项
const siteSetting = ref({
  COOKIECLOUD_HOST: '',
  COOKIECLOUD_KEY: '',
  COOKIECLOUD_PASSWORD: '',
  COOKIECLOUD_INTERVAL: 0,
  USER_AGENT: '',
  COOKIECLOUD_ENABLE_LOCAL: '',
  COOKIECLOUD_BLACKLIST: '',
  SITEDATA_REFRESH_INTERVAL: 0,
})

// 同步间隔下拉框
const CookieCloudIntervalItems = [
  { title: '每小时', value: 60 },
  { title: '每6小时', value: 360 },
  { title: '每12小时', value: 720 },
  { title: '每天', value: 1440 },
  { title: '每周', value: 10080 },
  { title: '每月', value: 43200 },
  { title: '永不', value: 0 },
]

// 站点数据刷新间隔
const SiteDataRefreshIntervalItems = [
  { title: '每小时', value: 1 },
  { title: '每6小时', value: 6 },
  { title: '每12小时', value: 12 },
  { title: '每天', value: 24 },
  { title: '每周', value: 168 },
  { title: '永不', value: 0 },
]

// 重置站点
async function resetSites() {
  try {
    resetSitesDisabled.value = true
    resetSitesText.value = '正在重置...'

    const result: { [key: string]: any } = await api.get('site/reset')
    if (result.success) $toast.success('站点重置成功，请等待CookieCloud同步完成！')
    else $toast.error('站点重置失败！')

    resetSitesDisabled.value = false
    resetSitesText.value = '重置站点数据'
  } catch (error) {
    console.log(error)
  }
}

// 加载站点设置
async function loadSiteSettings() {
  try {
    const result: { [key: string]: any } = await api.get('system/env')
    if (result.success) {
      const {
        COOKIECLOUD_HOST,
        COOKIECLOUD_KEY,
        COOKIECLOUD_PASSWORD,
        COOKIECLOUD_INTERVAL,
        USER_AGENT,
        COOKIECLOUD_ENABLE_LOCAL,
        COOKIECLOUD_BLACKLIST,
        SITEDATA_REFRESH_INTERVAL,
      } = result.data
      siteSetting.value = {
        COOKIECLOUD_HOST,
        COOKIECLOUD_KEY,
        COOKIECLOUD_PASSWORD,
        COOKIECLOUD_INTERVAL,
        USER_AGENT,
        COOKIECLOUD_ENABLE_LOCAL,
        COOKIECLOUD_BLACKLIST,
        SITEDATA_REFRESH_INTERVAL,
      }
    }
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存CookieCloud设置
async function saveSiteSetting() {
  try {
    const result: { [key: string]: any } = await api.post('system/env', siteSetting.value)

    if (result.success) $toast.success('保存站点设置成功')
    else $toast.error('保存站点设置失败！')
  } catch (error) {
    console.log(error)
  }
}

// 加载数据
onMounted(() => {
  loadSiteSettings()
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>站点同步</VCardTitle>
          <VCardSubtitle>从CookieCloud快速同步站点数据。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VCheckbox
                  v-model="siteSetting.COOKIECLOUD_ENABLE_LOCAL"
                  label="启用本地CookieCloud服务器"
                  hint="使用内建CookieCloud服务同步站点数据，服务地址为：http://localhost:3000/cookiecloud"
                  persistent-hint
                />
              </VCol>
            </VRow>
            <VRow>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="siteSetting.COOKIECLOUD_HOST"
                  label="服务地址"
                  placeholder="https://movie-pilot.org/cookiecloud"
                  :disabled="!!siteSetting.COOKIECLOUD_ENABLE_LOCAL"
                  hint="远端CookieCloud服务地址，格式：https://movie-pilot.org/cookiecloud"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="siteSetting.COOKIECLOUD_KEY"
                  label="用户KEY"
                  hint="CookieCloud浏览器插件生成的用户KEY"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="siteSetting.COOKIECLOUD_PASSWORD"
                  type="password"
                  label="端对端加密密码"
                  hint="CookieCloud浏览器插件生成的端对端加密密码"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="siteSetting.COOKIECLOUD_INTERVAL"
                  label="自动同步间隔"
                  :items="CookieCloudIntervalItems"
                  hint="从CookieCloud服务器自动同步站点Cookie到MoviePilot的时间间隔"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="siteSetting.COOKIECLOUD_BLACKLIST"
                  label="同步域名黑名单"
                  placeholder="多个域名,分割"
                  hint="CookieCloud同步域名黑名单，多个域名,分割"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="siteSetting.USER_AGENT"
                  label="浏览器User-Agent"
                  hint="CookieCloud插件所在的浏览器的User-Agent"
                  persistent-hint
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardText>
          <VBtn type="submit" @click="saveSiteSetting"> 保存 </VBtn>
        </VCardText>
      </VCard>
    </VCol>

    <VCol cols="12">
      <VCard title="站点数据刷新">
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="siteSetting.SITEDATA_REFRESH_INTERVAL"
                  label="站点数据刷新间隔"
                  :items="SiteDataRefreshIntervalItems"
                  hint="刷新站点用户上传下载等数据的时间间隔"
                  persistent-hint
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardText>
          <VBtn type="submit" @click="saveSiteSetting"> 保存 </VBtn>
        </VCardText>
      </VCard>
    </VCol>

    <VCol cols="12">
      <VCard title="站点重置">
        <VCardText>
          <div>
            <VCheckbox
              v-model="isConfirmResetSites"
              label="确认删除所有站点数据并重新同步。"
              hint="删除所有站点数据并重新从CookieCloud同步，操作请先清空涉及站点的相关设置。"
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
</template>
