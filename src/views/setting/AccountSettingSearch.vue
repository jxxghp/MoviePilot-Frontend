<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import { getApiBusinessErrorMessage } from '@/api/client'
import { listFilterRuleGroups } from '@/api/rule'
import type { FilterRuleGroup, Site } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useSilentSettingRefresh } from '@/composables/useSilentSettingRefresh'
import { useMediaSources } from '@/composables/useMediaSources'

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
const { mediaSourceItems: getMediaSourceItems } = useMediaSources()
const customMediaSourceItems = getMediaSourceItems('media')
const customMusicSourceItems = getMediaSourceItems('music')

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
const mediaSourcesDict = computed(() => [
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
  {
    title: 'AniList',
    value: 'anilist',
  },
  {
    title: 'MusicBrainz',
    value: 'musicbrainz',
  },
  {
    title: 'TheAudioDB',
    value: 'theaudiodb',
  },
  {
    title: '豆瓣音乐',
    value: 'doubanmusic',
  },
  ...customMediaSourceItems.value,
  ...customMusicSourceItems.value,
])

// 当前选中的媒体信息数据源
const selectedMediaSource = ref<string[]>([])

// 当前选中的过滤规则组
const selectedFilterGroup = ref<string[]>([])

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
    filterRuleGroups.value = await listFilterRuleGroups()
  } catch (error) {
    console.log(error)
  }
}

// 查询用户选中的站点
async function querySelectedSites() {
  try {
    const result = await api.get<{ value?: number[] }>('system/setting/public/IndexerSites')
    selectedSites.value = result.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 保存用户选中的站点
async function saveSelectedSites() {
  try {
    await api.post('system/setting/IndexerSites', selectedSites.value, { feedback: 'silent' })
    $toast.success('搜索站点保存成功')
  } catch (error) {
    console.log(error)
    $toast.error('搜索站点保存失败！')
  }
}

// 调用API查询设置
async function loadSearchSetting() {
  try {
    const result1 = await api.get<{ value?: string }>('system/setting/SEARCH_SOURCE')
    selectedMediaSource.value = result1.value?.split(',') ?? []
    const result2 = await api.get<{ value?: string[] }>('system/setting/SearchFilterRuleGroups')
    selectedFilterGroup.value = result2.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 调用API保存设置
async function saveSystemSetting(value: { [key: string]: any }) {
  try {
    await api.post('system/env', value, { feedback: 'silent' })
    return true
  } catch {
    return false
  }
  return false
}

// 调用API保存设置
async function saveSearchSetting() {
  try {
    await api.post('system/setting/SEARCH_SOURCE', selectedMediaSource.value.join(','), { feedback: 'silent' })
  } catch (error) {
    console.log(error)
    const message = getApiBusinessErrorMessage(error)
    $toast.error(message ? `媒体搜索数据源保存失败：${message}！` : '搜索基础设置保存失败！')
    return
  }

  try {
    await api.post('system/setting/SearchFilterRuleGroups', selectedFilterGroup.value, { feedback: 'silent' })
  } catch (error) {
    console.log(error)
    $toast.error('搜索基础设置保存失败！')
    return
  }

  const settingsSaved = await saveSystemSetting(SystemSettings.value.Basic)
  if (!settingsSaved) {
    $toast.error('搜索基础设置保存失败！')
    return
  }

  $toast.success('搜索基础设置保存成功')
}

// 加载系统设置
async function loadSystemSettings() {
  try {
    const result: { [key: string]: any } = await api.get('system/env')
    // 将API返回的值赋值给SystemSettings
    for (const sectionKey of Object.keys(SystemSettings.value) as Array<keyof typeof SystemSettings.value>) {
      Object.keys(SystemSettings.value[sectionKey]).forEach((key: string) => {
        if (Object.prototype.hasOwnProperty.call(result, key)) {
          Reflect.set(SystemSettings.value[sectionKey], key, result[key])
        }
      })
    }
  } catch (error) {
    console.log(error)
  }
}

async function loadPageData() {
  await Promise.all([
    querySites(),
    queryFilterRuleGroups(),
    querySelectedSites(),
    loadSearchSetting(),
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
          <VCardTitle>{{ t('setting.search.basicSettings') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.search.basicSettingsDesc') }}</VCardSubtitle>
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
                :label="t('setting.search.mediaSource')"
                :hint="t('setting.search.mediaSourceHint')"
                persistent-hint
                prepend-inner-icon="mdi-database-search"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VAutocomplete
                v-model="selectedFilterGroup"
                multiple
                clearable
                chips
                :items="filterRuleGroupOptions"
                :label="t('setting.search.filterRuleGroup')"
                :hint="t('setting.search.filterRuleGroupHint')"
                persistent-hint
                prepend-inner-icon="mdi-filter"
              />
            </VCol>
          </VRow>
          <VRow>
            <VCol cols="12" md="6">
              <VTextField
                v-model="SystemSettings.Basic.TORRENT_TAG"
                :label="t('setting.search.downloadLabel')"
                placeholder="MOVIEPILOT"
                :hint="t('setting.search.downloadLabelHint')"
                persistent-hint
                prepend-inner-icon="mdi-tag"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VCombobox
                v-model="SystemSettings.Basic.AUTO_DOWNLOAD_USER"
                :label="t('setting.search.downloadUser')"
                :placeholder="t('setting.search.downloadUserPlaceholder')"
                :hint="t('setting.search.downloadUserHint')"
                persistent-hint
                prepend-inner-icon="mdi-account"
              />
            </VCol>
            <VCol cols="12" md="6">
              <VSwitch
                v-model="SystemSettings.Basic.SEARCH_MULTIPLE_NAME"
                :label="t('setting.search.multipleNameSearch')"
                :hint="t('setting.search.multipleNameSearchHint')"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" md="6">
              <VSwitch
                v-model="SystemSettings.Basic.DOWNLOAD_SUBTITLE"
                :label="t('setting.search.downloadSubtitle')"
                :hint="t('setting.search.downloadSubtitleHint')"
                persistent-hint
              />
            </VCol>
          </VRow>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveSearchSetting" prepend-icon="mdi-content-save">
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
          <VCardTitle>{{ t('setting.search.downloadSite') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.search.downloadSiteDesc') }}</VCardSubtitle>
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
              <VBtn type="submit" @click="saveSelectedSites" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
