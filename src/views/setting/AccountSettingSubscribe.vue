<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import type { FilterRuleGroup, Site } from '@/api/types'

// 提示框
const $toast = useToast()

// 所有站点
const allSites = ref<Site[]>([])

// 选中订阅站点
const selectedRssSites = ref<number[]>([])

// 选中的订阅规则组
const selectedFilterRuleGroup = ref([])

// 选中的洗版规则组
const selectedBestVersionRuleGroup = ref([])

// 是否开启订阅定时搜索
const enableIntervalSearch = ref(false)

// 订阅模式选择项
const subscribeModeItems = [
  { title: '自动', value: 'spider' },
  { title: '站点RSS', value: 'rss' },
]

// 选择的订阅模式
const selectedSubscribeMode = ref('spider')

// 所有规则组列表
const filterRuleGroups = ref<FilterRuleGroup[]>([])

// 过滤规则组选择项
const filterRuleGroupOptions = computed(() => {
  return filterRuleGroups.value.map(item => ({
    title: item.name,
    value: item.name,
  }))
})

// RSS运行周期选择项
const rssIntervalItems = [
  { title: '5分钟', value: 5 },
  { title: '10分钟', value: 10 },
  { title: '20分钟', value: 20 },
  { title: '半小时', value: 30 },
  { title: '1小时', value: 60 },
  { title: '12小时', value: 720 },
  { title: '1天', value: 1440 },
]

// 选择的RSS运行周期
const selectedRssInterval = ref<number>(5)

// 查询所有站点
async function querySites() {
  try {
    const data: Site[] = await api.get('site/')

    // 过滤站点，只有启用的站点才显示
    allSites.value = data.filter(item => item.is_active)
  } catch (error) {
    console.log(error)
  }
}

// 加载规则组
async function queryFilterRuleGroups() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/UserFilterRuleGroups')
    filterRuleGroups.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 查询用户选中的订阅站点
async function querySelectedRssSites() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/RssSites')

    selectedRssSites.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 保存用户选中的订阅站点
async function saveSelectedRssSites() {
  try {
    const result1: { [key: string]: any } = await api.post('system/setting/RssSites', selectedRssSites.value)

    if (result1.success) $toast.success('订阅站点保存成功')
    else $toast.error('订阅站点保存失败！')
  } catch (error) {
    console.log(error)
  }
}

// 查询订阅设置
async function querySubscribeSetting() {
  try {
    // 查询订阅搜索开关
    const result: { [key: string]: any } = await api.get('system/setting/SUBSCRIBE_SEARCH')
    if (result.success) enableIntervalSearch.value = result.data?.value
    // 查询订阅模式
    const result2: { [key: string]: any } = await api.get('system/setting/SUBSCRIBE_MODE')
    if (result2.success) selectedSubscribeMode.value = result2.data?.value
    // 查询站点RSS周期
    const result3: { [key: string]: any } = await api.get('system/setting/SUBSCRIBE_RSS_INTERVAL')
    if (result3.success) selectedRssInterval.value = result3.data?.value
    // 查询订阅规则组
    const result4: { [key: string]: any } = await api.get('system/setting/SubscribeFilterRuleGroups')
    if (result4.success) selectedFilterRuleGroup.value = result4.data?.value
    // 查询洗版规则组
    const result5: { [key: string]: any } = await api.get('system/setting/BestVersionFilterRuleGroups')
    if (result5.success) selectedBestVersionRuleGroup.value = result5.data?.value
  } catch (error) {
    console.log(error)
  }
}

// 保存订阅设置
async function saveSubscribeSetting() {
  try {
    const result1: { [key: string]: any } = await api.post(
      'system/setting/SUBSCRIBE_SEARCH',
      enableIntervalSearch.value,
    )

    const result2: { [key: string]: any } = await api.post('system/setting/SUBSCRIBE_MODE', selectedSubscribeMode.value)

    const result3: { [key: string]: any } = await api.post(
      'system/setting/SUBSCRIBE_RSS_INTERVAL',
      selectedRssInterval.value,
    )

    const result4: { [key: string]: any } = await api.post(
      'system/setting/SubscribeFilterRuleGroups',
      selectedFilterRuleGroup.value,
    )

    const result5: { [key: string]: any } = await api.post(
      'system/setting/BestVersionFilterRuleGroups',
      selectedBestVersionRuleGroup.value,
    )

    if (result1.success && result2.success && result3.success && result4.success && result5.success)
      $toast.success('订阅设置保存成功')
    else $toast.error('订阅设置保存失败！')
  } catch (error) {
    console.log(error)
  }
}

onMounted(() => {
  querySites()
  queryFilterRuleGroups()
  querySelectedRssSites()
  querySubscribeSetting()
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>订阅模式 & 规则</VCardTitle>
          <VCardSubtitle>设定订阅模式、周期等基础设置</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="selectedSubscribeMode"
                  :items="subscribeModeItems"
                  label="订阅模式"
                  hint="自动：自动爬取站点首页，站点RSS：通过站点RSS链接订阅"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="selectedRssInterval"
                  :items="rssIntervalItems"
                  label="站点RSS周期"
                  hint="设置站点RSS运行周期，在订阅模式为`站点RSS`时生效"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="selectedFilterRuleGroup"
                  :items="filterRuleGroupOptions"
                  chips
                  multiple
                  clearable
                  label="订阅优先级规则组"
                  hint="按选定的过滤规则组对订阅进行过滤"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="selectedBestVersionRuleGroup"
                  :items="filterRuleGroupOptions"
                  chips
                  multiple
                  clearable
                  label="洗版优先级规则组"
                  hint="按选定的过滤规则组对洗版订阅进行过滤"
                  persistent-hint
                />
              </VCol>
            </VRow>
            <VRow>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="enableIntervalSearch"
                  label="开启订阅定时搜索"
                  hint="每隔24小时全站搜索，以补全订阅可能漏掉的资源"
                  persistent-hint
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardText>
          <VBtn type="submit" @click="saveSubscribeSetting"> 保存 </VBtn>
        </VCardText>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>订阅站点</VCardTitle>
          <VCardSubtitle>只有选中的站点才会在订阅中使用。</VCardSubtitle>
        </VCardItem>
        <VCardText>
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
        </VCardText>
        <VCardText>
          <VBtn type="submit" @click="saveSelectedRssSites"> 保存 </VBtn>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
