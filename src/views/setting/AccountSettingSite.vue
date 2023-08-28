<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import type { Site } from '@/api/types'

// 提示框
const $toast = useToast()

// 选中搜索站点
const selectedSites = ref<number[]>([])
// 选中订阅站点
const selectedRssSites = ref<number[]>([])

// 所有站点
const allSites = ref<Site[]>([])

// 站点重置
const isConfirmResetSites = ref(false)

// 站点重置按钮文本
const resetSitesText = ref('重置站点数据')

// 站点重置按钮可用状态
const resetSitesDisabled = ref(false)

// 查询所有站点
async function querySites() {
  try {
    const data: Site[] = await api.get('site')

    // 过滤站点，只有启用的站点才显示
    allSites.value = data.filter(item => item.is_active)
    querySelectedSites()
    querySelectedRssSites()
  }
  catch (error) {
    console.log(error)
  }
}

// 查询用户选中的站点
async function querySelectedSites() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/IndexerSites')

    selectedSites.value = result.data?.value ?? []
  }
  catch (error) {
    console.log(error)
  }
}

// 保存用户选中的站点
async function saveSelectedSites() {
  try {
    // 用户名密码
    const result: { [key: string]: any } = await api.post('system/setting/IndexerSites', selectedSites.value)

    if (result.success)
      $toast.success('搜索站点保存成功')
    else
      $toast.error('搜索站点保存失败！')
  }
  catch (error) {
    console.log(error)
  }
}

// 查询用户选中的订阅站点
async function querySelectedRssSites() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/RssSites')

    selectedRssSites.value = result.data?.value ?? []
  }
  catch (error) {
    console.log(error)
  }
}

// 保存用户选中的订阅站点
async function saveSelectedRssSites() {
  try {
    const result: { [key: string]: any } = await api.post('system/setting/RssSites', selectedRssSites.value)

    if (result.success)
      $toast.success('订阅站点保存成功')
    else
      $toast.error('订阅站点保存失败！')
  }
  catch (error) {
    console.log(error)
  }
}

// 重置站点
async function resetSites() {
  try {
    resetSitesDisabled.value = true
    resetSitesText.value = '正在重置...'

    const result: { [key: string]: any } = await api.get('site/reset')
    if (result.success) {
      $toast.success('站点重置成功，请等待CookieCloud同步完成！')
      querySites()
    }
    else {
      $toast.error('站点重置失败！')
    }
    resetSitesDisabled.value = false
    resetSitesText.value = '重置站点数据'
  }
  catch (error) {
    console.log(error)
  }
}

onMounted(() => {
  querySites()
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard title="搜索站点">
        <VCardSubtitle> 只有选中的站点才会在搜索中使用</VCardSubtitle>

        <VCardItem>
          <VChipGroup v-model="selectedSites" column multiple>
            <VChip
              v-for="site in allSites"
              :key="site.id"
              :color="selectedSites.includes(site.id) ? 'primary' : ''"
              filter
              variant="outlined"
              :value="site.id"
            >
              {{ site.name }}
            </VChip>
          </VChipGroup>
        </VCardItem>

        <VCardItem>
          <VBtn type="submit" @click="saveSelectedSites">
            保存
          </VBtn>
        </VCardItem>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard title="订阅站点">
        <VCardSubtitle> 只有选中的站点才会在订阅中使用</VCardSubtitle>

        <VCardItem>
          <VChipGroup v-model="selectedRssSites" column multiple>
            <VChip
              v-for="site in allSites"
              :key="site.id"
              :color="selectedRssSites.includes(site.id) ? 'primary' : ''"
              filter
              variant="outlined"
              :value="site.id"
            >
              {{ site.name }}
            </VChip>
          </VChipGroup>
        </VCardItem>

        <VCardItem>
          <VBtn type="submit" @click="saveSelectedRssSites">
            保存
          </VBtn>
        </VCardItem>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard title="站点重置">
        <VCardText>
          <div>
            <VCheckbox v-model="isConfirmResetSites" label="确认删除所有站点数据并重新同步" />
          </div>

          <VBtn :disabled="!isConfirmResetSites || resetSitesDisabled" color="error" class="mt-3" @click="resetSites">
            {{ resetSitesText }}
          </VBtn>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
