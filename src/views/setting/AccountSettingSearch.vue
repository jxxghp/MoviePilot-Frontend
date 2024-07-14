<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import api from '@/api'
import type { Site } from '@/api/types'

// 提示框
const $toast = useToast()

// 所有站点
const allSites = ref<Site[]>([])

// 选中订阅站点
const selectedSites = ref<number[]>([])

// 包含与排除规则
const defaultFilterRules = ref({
  include: '',
  exclude: '',
  min_seeders: 0,
  min_seeders_time: 0,
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

// 保存用户设置的规则
async function saveCustomFilters() {}

// 查询所有站点
async function querySites() {
  try {
    const data: Site[] = await api.get('site/')

    // 过滤站点，只有启用的站点才显示
    allSites.value = data.filter(item => item.is_active)
    querySelectedSites()
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

// 调用API查询下载器设置
async function loadSearchSetting() {
  try {
    const result1: { [key: string]: any } = await api.get('system/setting/SEARCH_SOURCE')
    if (result1.success) selectedMediaSource.value = result1.data?.value?.split(',')
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存设置
async function saveSearchSetting() {
  try {
    const result: { [key: string]: any } = await api.post(
      'system/setting/SEARCH_SOURCE',
      selectedMediaSource.value.join(','),
    )

    if (result.success) {
      $toast.success('保存媒体数据源设置成功')
    } else {
      $toast.error('保存媒体数据源设置失败！')
    }
  } catch (error) {
    console.log(error)
  }
}

onMounted(() => {
  querySites()
  loadSearchSetting()
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>数据源 & 规则</VCardTitle>
          <VCardSubtitle>设定数据源、规则组等基础信息。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VRow>
            <VCol cols="12" md="6">
              <VSelect
                v-model="selectedMediaSource"
                multiple
                chips
                :items="mediaSourcesDict"
                label="媒体数据源"
                hint="搜索媒体信息时使用的数据源以及排序"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="6">
              <VSelect
                v-model="selectedFilterGroup"
                multiple
                chips
                :items="[]"
                label="过滤规则组"
                hint="搜索媒体信息时按选定的过滤规则组对结果进行过滤"
                persistent-hint
              />
            </VCol>
          </VRow>
        </VCardText>
        <VCardText>
          <VBtn type="submit" @click="saveSearchSetting"> 保存 </VBtn>
        </VCardText>
      </VCard>
    </VCol>
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
          <VBtn type="submit" @click="saveSelectedSites"> 保存 </VBtn>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
