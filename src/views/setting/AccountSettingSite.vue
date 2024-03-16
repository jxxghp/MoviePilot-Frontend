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

// 种子优先规则
const selectedTorrentPriority = ref<string>('seeder')

// CookieCloud设置项
const cookieCloudSetting = ref({
  COOKIECLOUD_HOST: '',
  COOKIECLOUD_KEY: '',
  COOKIECLOUD_PASSWORD: '',
  COOKIECLOUD_INTERVAL: 0,
  USER_AGENT: '',
  COOKIECLOUD_ENABLE_LOCAL: '',
})

// 种子优先规则下拉框
const TorrentPriorityItems = [
  { title: '站点优先', value: 'site' },
  { title: '做种数优先', value: 'seeder' },
]

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

// 重置站点
async function resetSites() {
  try {
    resetSitesDisabled.value = true
    resetSitesText.value = '正在重置...'

    const result: { [key: string]: any } = await api.get('site/reset')
    if (result.success)
      $toast.success('站点重置成功，请等待CookieCloud同步完成！')

    else
      $toast.error('站点重置失败！')

    resetSitesDisabled.value = false
    resetSitesText.value = '重置站点数据'
  }
  catch (error) {
    console.log(error)
  }
}

// 查询种子优先规则
async function queryTorrentPriority() {
  try {
    const result: { [key: string]: any } = await api.get(
      'system/setting/TorrentsPriority',
    )

    selectedTorrentPriority.value = result.data?.value
  }
  catch (error) {
    console.log(error)
  }
}

// 保存种子优先规则
async function saveTorrentPriority() {
  try {
    // 用户名密码
    const result: { [key: string]: any } = await api.post(
      'system/setting/TorrentsPriority',
      selectedTorrentPriority.value,
    )

    if (result.success)
      $toast.success('优先规则保存成功')
    else
      $toast.error('优先规则保存失败！')
  }
  catch (error) {
    console.log(error)
  }
}

// 加载CookieCloud设置
async function loadCookieCloudSettings() {
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
      } = result.data
      cookieCloudSetting.value = {
        COOKIECLOUD_HOST,
        COOKIECLOUD_KEY,
        COOKIECLOUD_PASSWORD,
        COOKIECLOUD_INTERVAL,
        USER_AGENT,
        COOKIECLOUD_ENABLE_LOCAL,
      }
    }
  }
  catch (error) {
    console.log(error)
  }
}

// 调用API保存CookieCloud设置
async function saveCookieCloudetting() {
  try {
    const result: { [key: string]: any } = await api.post(
      'system/env',
      cookieCloudSetting.value,
    )

    if (result.success)
      $toast.success('保存站点同步设置成功')
    else
      $toast.error('保存站点同步设置失败！')
  }
  catch (error) {
    console.log(error)
  }
}

// 加载数据
onMounted(() => {
  queryTorrentPriority()
  loadCookieCloudSettings()
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard title="站点同步">
        <VCardSubtitle> 从CookieCloud快速同步站点数据。 </VCardSubtitle>
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="12">
                <VCheckbox v-model="cookieCloudSetting.COOKIECLOUD_ENABLE_LOCAL" label="是否启用本地CookieCloud服务器，启用后将停用远程服务器，并开启地址 http://localhost:3000/cookiecloud/ 作为CookieCloud服务器" />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="cookieCloudSetting.COOKIECLOUD_HOST"
                  label="远程CookieCloud服务器地址"
                  placeholder="https://movie-pilot.org/cookiecloud"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="cookieCloudSetting.COOKIECLOUD_KEY"
                  label="用户KEY"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="cookieCloudSetting.COOKIECLOUD_PASSWORD"
                  type="password"
                  label="端对端加密密码"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="cookieCloudSetting.COOKIECLOUD_INTERVAL"
                  label="自动同步间隔"
                  :items="CookieCloudIntervalItems"
                />
              </VCol>
              <VCol cols="12">
                <VTextField
                  v-model="cookieCloudSetting.USER_AGENT"
                  label="浏览器User-Agent"
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardItem>
          <VBtn
            type="submit"
            @click="saveCookieCloudetting"
          >
            保存
          </VBtn>
        </VCardItem>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard title="下载优先规则">
        <VCardSubtitle> 按站点或做种数量优先下载。 </VCardSubtitle>
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="selectedTorrentPriority"
                  :items="TorrentPriorityItems"
                  label="当前使用下载优先规则"
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardItem>
          <VBtn
            type="submit"
            @click="saveTorrentPriority"
          >
            保存
          </VBtn>
        </VCardItem>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard title="站点重置">
        <VCardText>
          <div>
            <VCheckbox v-model="isConfirmResetSites" label="确认删除所有站点数据并重新同步。" />
          </div>

          <VBtn :disabled="!isConfirmResetSites || resetSitesDisabled" color="error" class="mt-3" @click="resetSites">
            {{ resetSitesText }}
          </VBtn>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
