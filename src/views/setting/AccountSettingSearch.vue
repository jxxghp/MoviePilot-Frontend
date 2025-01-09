<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import type { FilterRuleGroup, Site } from '@/api/types'

// 提示框
const $toast = useToast()

// 所有站点
const allSites = ref<Site[]>([])

// 选中订阅站点
const selectedSites = ref<number[]>([])

// 系统设置
const SystemSettings = ref<any>({
  Basic: {
    SEARCH_MULTIPLE_NAME: false,
    DOWNLOAD_SUBTITLE: false,
    AUTO_DOWNLOAD_USER: null,
    TORRENT_TAG: 'MOVIEPILOT',
  },
})

// 媒体信息数据源字典
const mediaSourcesDict = [
  {
    title: 'TheMovieDb',
    value: 'themoviedb',
  },
  {
    title: '豆瓣',
    value: 'douban',
  },
  {
    title: 'Bangumi',
    value: 'bangumi',
  },
]

// 当前选中的媒体信息数据源
const selectedMediaSource = ref([])

// 当前选中的过滤规则组
const selectedFilterGroup = ref([])

// 过滤规则组选择项
const filterRuleGroupOptions = computed(() => {
  return filterRuleGroups.value.map(item => ({
    title: item.name,
    value: item.name,
  }))
})

// 所有规则组列表
const filterRuleGroups = ref<FilterRuleGroup[]>([])

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

// 查询用户选中的站点
async function querySelectedSites() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/IndexerSites')

    selectedSites.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 保存用户选中的站点
async function saveSelectedSites() {
  try {
    // 用户名密码
    const result: { [key: string]: any } = await api.post('system/setting/IndexerSites', selectedSites.value)

    if (result.success) $toast.success('搜索站点保存成功')
    else $toast.error('搜索站点保存失败！')
  } catch (error) {
    console.log(error)
  }
}

// 调用API查询设置
async function loadSearchSetting() {
  try {
    const result1: { [key: string]: any } = await api.get('system/setting/SEARCH_SOURCE')
    if (result1.success) selectedMediaSource.value = result1.data?.value?.split(',')
    const result2: { [key: string]: any } = await api.get('system/setting/SearchFilterRuleGroups')
    if (result2.success) selectedFilterGroup.value = result2.data?.value
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

// 调用API保存设置
async function saveSearchSetting() {
  try {
    const result1: { [key: string]: any } = await api.post(
      'system/setting/SEARCH_SOURCE',
      selectedMediaSource.value.join(','),
    )

    if (!result1 || !result1.success) {
      $toast.error(`媒体搜索数据源保存失败：${result1?.message}！`)
      return
    }

    const result2: { [key: string]: any } = await api.post(
      'system/setting/SearchFilterRuleGroups',
      selectedFilterGroup.value,
    )

    const result3 = await saveSystemSetting(SystemSettings.value.Basic)

    if (result2.success && result3) {
      $toast.success('搜索基础设置保存成功')
    } else {
      $toast.error('搜索基础设置保存失败！')
    }
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

onMounted(() => {
  querySites()
  queryFilterRuleGroups()
  querySelectedSites()
  loadSearchSetting()
  loadSystemSettings()
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>基础设置</VCardTitle>
          <VCardSubtitle>设定数据源、规则组等基础信息。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VRow>
            <VCol cols="12" md="6">
              <VSelect
                v-model="selectedMediaSource"
                multiple
                clearable
                chips
                :items="mediaSourcesDict"
                label="媒体搜索数据源"
                hint="搜索媒体信息时使用的数据源以及排序"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="6">
              <VSelect
                v-model="selectedFilterGroup"
                multiple
                clearable
                chips
                :items="filterRuleGroupOptions"
                label="优先级规则组"
                hint="搜索媒体信息时按选定的过滤规则组对结果进行过滤"
                persistent-hint
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="6">
              <VTextField
                v-model="SystemSettings.Basic.TORRENT_TAG"
                label="下载任务标签"
                placeholder="MOVIEPILOT"
                hint="MoviePilot添加的下载任务标签"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="6">
              <VCombobox
                v-model="SystemSettings.Basic.AUTO_DOWNLOAD_USER"
                label="远程搜索自动下载用户名单"
                placeholder="用户ID1,用户ID2"
                hint="使用Telegram、微信等搜索时是否自动下载，使用逗号分割，设置为 all 代表所有用户自动择优下载"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="6">
              <VSwitch
                v-model="SystemSettings.Basic.SEARCH_MULTIPLE_NAME"
                label="多名称资源搜索"
                hint="使用中英文等多个名称搜索站点资源并合并搜索结果，将会增加站点访问频率"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="6">
              <VSwitch
                v-model="SystemSettings.Basic.DOWNLOAD_SUBTITLE"
                label="下载站点字幕"
                hint="检查站点资源是否有独立的字幕文件，有则自动下载"
                persistent-hint
              />
            </VCol>
          </VRow>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveSearchSetting"> 保存 </VBtn>
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
          <VCardTitle>搜索站点</VCardTitle>
          <VCardSubtitle> 只有选中的站点才会在搜索中使用。</VCardSubtitle>
        </VCardItem>
        <VCardText>
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
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveSelectedSites"> 保存 </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
