<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import type { FilterRuleGroup, Site } from '@/api/types'
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

// 所有站点
const allSites = ref<Site[]>([])

// 选中订阅站点
const selectedRssSites = ref<number[]>([])

// 选中的订阅规则组
const selectedFilterRuleGroup = ref([])

// 选中的洗版规则组
const selectedBestVersionRuleGroup = ref([])

// 订阅模式选择项
const subscribeModeItems = [
  { title: t('setting.subscribe.modes.auto'), value: 'spider' },
  { title: t('setting.subscribe.modes.rss'), value: 'rss' },
]

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
  { title: t('setting.subscribe.intervals.min5'), value: 5 },
  { title: t('setting.subscribe.intervals.min10'), value: 10 },
  { title: t('setting.subscribe.intervals.min20'), value: 20 },
  { title: t('setting.subscribe.intervals.min30'), value: 30 },
  { title: t('setting.subscribe.intervals.hour1'), value: 60 },
  { title: t('setting.subscribe.intervals.hour12'), value: 720 },
  { title: t('setting.subscribe.intervals.day1'), value: 1440 },
]

// 订阅搜索时间间隔选择项（小时）
const subscribeSearchIntervalItems = [
  { title: t('setting.subscribe.intervals.day1'), value: 24 },
  { title: t('setting.subscribe.intervals.day3'), value: 72 },
  { title: t('setting.subscribe.intervals.week1'), value: 168 },
]

// 系统设置项
const SystemSettings = ref<any>({
  // 基础设置
  Basic: {
    SUBSCRIBE_MODE: 'auto',
    SUBSCRIBE_SEARCH: false,
    SUBSCRIBE_SEARCH_INTERVAL: 24,
    SUBSCRIBE_RSS_INTERVAL: 30,
    LOCAL_EXISTS_SEARCH: false,
  },
})

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

    if (result1.success) $toast.success(t('setting.subscribe.saveSuccess'))
    else $toast.error(t('setting.subscribe.saveFailed'))
  } catch (error) {
    console.log(error)
  }
}

// 加载系统设置
async function loadSystemSettings() {
  try {
    const result: { [key: string]: any } = await api.get('system/env')
    if (result.success) {
      // 将API返回的值赋值给SystemSettings
      for (const sectionKey of Object.keys(SystemSettings.value) as Array<keyof typeof SystemSettings.value>) {
        Object.keys(SystemSettings.value[sectionKey]).forEach((key: string) => {
          if (result.data.hasOwnProperty(key)) (SystemSettings.value[sectionKey] as any)[key] = result.data[key]
        })
      }
    }
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存设置
async function saveSystemSetting(value: { [key: string]: any }) {
  try {
    const result: { [key: string]: any } = await api.post('system/env', value)

    if (result.success) {
      return true
    }
  } catch (error) {}
  return false
}

// 查询订阅设置
async function querySubscribeRules() {
  try {
    // 查询订阅规则组
    const result1: { [key: string]: any } = await api.get('system/setting/SubscribeFilterRuleGroups')
    if (result1.success) selectedFilterRuleGroup.value = result1.data?.value
    // 查询洗版规则组
    const result2: { [key: string]: any } = await api.get('system/setting/BestVersionFilterRuleGroups')
    if (result2.success) selectedBestVersionRuleGroup.value = result2.data?.value
  } catch (error) {
    console.log(error)
  }
}

// 保存订阅设置
async function saveSubscribeSetting() {
  try {
    const result1: { [key: string]: any } = await api.post(
      'system/setting/SubscribeFilterRuleGroups',
      selectedFilterRuleGroup.value,
    )

    const result2: { [key: string]: any } = await api.post(
      'system/setting/BestVersionFilterRuleGroups',
      selectedBestVersionRuleGroup.value,
    )

    const result3 = await saveSystemSetting(SystemSettings.value.Basic)

    if (result1.success && result2.success && result3) {
      $toast.success(t('setting.subscribe.settingsSaveSuccess'))
    } else $toast.error(t('setting.subscribe.settingsSaveFailed'))
  } catch (error) {
    console.log(error)
  }
}

async function loadPageData() {
  await Promise.all([
    querySites(),
    queryFilterRuleGroups(),
    querySelectedRssSites(),
    querySubscribeRules(),
    loadSystemSettings(),
  ])
}

onMounted(() => {
  loadPageData()
})

useSilentSettingRefresh(loadPageData, {
  active: computed(() => props.active),
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.subscribe.basicSettings') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.subscribe.basicSettingsDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="SystemSettings.Basic.SUBSCRIBE_MODE"
                  :items="subscribeModeItems"
                  :label="t('setting.subscribe.mode')"
                  :hint="t('setting.subscribe.modeHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-cog"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="SystemSettings.Basic.SUBSCRIBE_RSS_INTERVAL"
                  :items="rssIntervalItems"
                  :label="t('setting.subscribe.rssInterval')"
                  :hint="t('setting.subscribe.rssIntervalHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-timer"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VAutocomplete
                  v-model="selectedFilterRuleGroup"
                  :items="filterRuleGroupOptions"
                  chips
                  multiple
                  clearable
                  :label="t('setting.subscribe.filterRuleGroup')"
                  :hint="t('setting.subscribe.filterRuleGroupHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-filter"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VAutocomplete
                  v-model="selectedBestVersionRuleGroup"
                  :items="filterRuleGroupOptions"
                  chips
                  multiple
                  clearable
                  :label="t('setting.subscribe.bestVersionRuleGroup')"
                  :hint="t('setting.subscribe.bestVersionRuleGroupHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-star"
                />
              </VCol>
            </VRow>
            <VRow>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="SystemSettings.Basic.SUBSCRIBE_SEARCH"
                  :label="t('setting.subscribe.timedSearch')"
                  :hint="t('setting.subscribe.timedSearchHint')"
                  persistent-hint
                />
              </VCol>
              <VCol v-if="SystemSettings.Basic.SUBSCRIBE_SEARCH" cols="12" md="6">
                <VSelect
                  v-model="SystemSettings.Basic.SUBSCRIBE_SEARCH_INTERVAL"
                  :items="subscribeSearchIntervalItems"
                  :label="t('setting.subscribe.searchInterval')"
                  :hint="t('setting.subscribe.searchIntervalHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-timer"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VSwitch
                  v-model="SystemSettings.Basic.LOCAL_EXISTS_SEARCH"
                  :label="t('setting.subscribe.checkLocalMedia')"
                  :hint="t('setting.subscribe.checkLocalMediaHint')"
                  persistent-hint
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveSubscribeSetting" prepend-icon="mdi-content-save">
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
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.subscribe.subscribeSites') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.subscribe.subscribeSitesDesc') }}</VCardSubtitle>
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
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveSelectedRssSites" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <!-- 进度框 -->
</template>
