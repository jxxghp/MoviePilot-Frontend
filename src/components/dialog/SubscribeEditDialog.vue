<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import { numberValidator } from '@/@validators'
import api from '@/api'
import type { DownloaderConf, FilterRuleGroup, Site, Subscribe, TransferDirectoryConf } from '@/api/types'
import { useDisplay } from 'vuetify'
import { useConfirm } from '@/composables/useConfirm'
import { useI18n } from 'vue-i18n'
import { qualityOptions, resolutionOptions, effectOptions } from '@/api/constants'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'
import { formatSeason } from '@/@core/utils/formatters'
// i18n
const { t } = useI18n()
const userStore = useUserStore()
const canAdmin = computed(() =>
  hasPermission(buildUserPermissionContext(userStore.superUser, userStore.permissions), 'admin'),
)

// 显示器宽度
const display = useDisplay()

// 确认框
const createConfirm = useConfirm()

// 输入参数
const props = defineProps({
  subid: Number,
  default: Boolean,
  type: String,
})

// 定义触发的自定义事件
const emit = defineEmits(['remove', 'save', 'close'])

const activeTab = ref('basic')

// 站点数据列表
const siteList = ref<Site[]>([])

// 下载目录列表
const downloadDirectories = ref<TransferDirectoryConf[]>([])

// 站点选择下载框
const selectSitesOptions = ref<{ [key: number]: string }[]>([])

// 所有规则组列表
const filterRuleGroups = ref<FilterRuleGroup[]>([])

// 订阅编辑表单
const subscribeForm = ref<Subscribe>({
  id: props.subid ?? 0,
  name: '',
  year: '',
  type: '',
  tmdbid: 0,
  state: '',
  last_update: '',
  username: '',
  sites: [],
  best_version: undefined,
  best_version_full: undefined,
  current_priority: 0,
  downloader: '',
  date: '',
  show_edit_dialog: false,
  episode_group: '',
})

// 提示框
const $toast = useToast()

// 下载器选项
const downloaderOptions = ref<{ title: string; value: string }[]>([])

// 所有剧集组
const episodeGroups = ref<{ [key: string]: any }[]>([])

// 剧集组选项
const episodeGroupOptions = computed(() => {
  return (episodeGroups.value as { id: number; name: string; group_count: number; episode_count: number }[]).map(
    item => {
      return {
        title: item.name,
        subtitle: `${item.group_count} 季 • ${item.episode_count} 集`,
        value: item.id,
      }
    },
  )
})

// 生成1到100季的下拉框选项
const seasonItems = ref(
  Array.from({ length: 101 }, (_, i) => i).map(item => ({
    title: t('dialog.subscribeEdit.seasonFormat', { number: item }),
    value: item,
  })),
)

function getSubscribeDisplayName() {
  const name = subscribeForm.value.name || ''
  const season = subscribeForm.value.season
  if (season === null || season === undefined) return name
  return `${name} ${formatSeason(season.toString())}`
}

// 剧集组选项属性
function episodeGroupItemProps(item: { title: string; subtitle: string }) {
  return {
    title: item.title,
    subtitle: item.subtitle,
  }
}

// 查询所有剧集组
async function getEpisodeGroups() {
  if (!subscribeForm.value.tmdbid) {
    console.warn('tmdbid is not set or is empty')
    return
  }
  try {
    episodeGroups.value = await api.get(`media/groups/${subscribeForm.value.tmdbid}`)
  } catch (error) {
    console.error(error)
  }
}

async function loadDownloaderSetting() {
  try {
    const downloaders: DownloaderConf[] = await api.get('download/clients')
    downloaderOptions.value = [
      { title: t('common.default'), value: '' },
      ...downloaders.map((item: { name: any }) => ({
        title: item.name,
        value: item.name,
      })),
    ]
  } catch (error) {
    console.error('加载下载器设置失败:', error)
  }
}

// 加载规则组
async function queryFilterRuleGroups() {
  if (!canAdmin.value) return

  try {
    const result: { [key: string]: any } = await api.get('system/setting/UserFilterRuleGroups')
    filterRuleGroups.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 过滤规则组选择项
const filterRuleGroupOptions = computed(() => {
  return filterRuleGroups.value.map(item => ({
    title: item.name,
    value: item.name,
  }))
})

// 调用API修改订阅
async function updateSubscribeInfo() {
  try {
    const result: { [key: string]: any } = await api.put('subscribe/', subscribeForm.value)
    // 提示
    if (result.success) {
      $toast.success(`${getSubscribeDisplayName()} 更新成功！`)
      // 通知父组件刷新
      emit('save')
    } else {
      $toast.error(`${getSubscribeDisplayName()} 更新失败：${result.message}！`)
    }
  } catch (e) {
    console.log(e)
  }
}

// 设置用户设置的默认订阅规则
async function saveDefaultSubscribeConfig() {
  if (!canAdmin.value) return

  try {
    let subscribe_config_url = ''
    if (props.type === '电影') subscribe_config_url = 'system/setting/DefaultMovieSubscribeConfig'
    else subscribe_config_url = 'system/setting/DefaultTvSubscribeConfig'

    const result: { [key: string]: any } = await api.post(subscribe_config_url, subscribeForm.value)
    if (result.success) $toast.success(`${props.type}订阅默认规则保存成功`)
    else $toast.error(`${props.type}订阅默认规则保存失败！`)

    // 通知父组件刷新
    emit('save')
  } catch (error) {
    console.log(error)
  }
}

// 查询用户设置的默认订阅规则
async function queryDefaultSubscribeConfig() {
  try {
    let subscribe_config_url = ''
    if (props.type === '电影') subscribe_config_url = 'system/setting/public/DefaultMovieSubscribeConfig'
    else subscribe_config_url = 'system/setting/public/DefaultTvSubscribeConfig'

    const result: { [key: string]: any } = await api.get(subscribe_config_url)

    if (result.data.value) subscribeForm.value = result.data?.value ?? ''
  } catch (error) {
    console.log(error)
  }
}

// 获取站点列表数据
async function loadSites() {
  try {
    const data: Site[] = await api.get('site/rss')

    // 过滤站点，只有启用的站点才显示
    siteList.value = data.filter(item => item.is_active)
  } catch (error) {
    console.error(error)
  }
}

// 获取站点列表选择框数据
async function getSiteList() {
  // 加载订阅站点列表
  if (!siteList.value.length) await loadSites()

  const maps = siteList.value.map(item => {
    return {
      title: item.name,
      value: item.id,
    }
  })

  selectSitesOptions.value = maps.flat()
}

// 获取订阅信息
async function getSubscribeInfo() {
  try {
    const result: Subscribe = await api.get(`subscribe/${props.subid}`)
    subscribeForm.value = result
    subscribeForm.value.best_version = subscribeForm.value.best_version === 1
    subscribeForm.value.best_version_full = subscribeForm.value.best_version_full === 1
    subscribeForm.value.search_imdbid = subscribeForm.value.search_imdbid === 1
    // 加载剧集组
    if (subscribeForm.value.type == '电视剧') getEpisodeGroups()
  } catch (e) {
    console.log(e)
  }
}

// 删除订阅
async function removeSubscribe() {
  const isConfirmed = await createConfirm({
    title: t('common.confirm'),
    content: t('dialog.subscribeEdit.cancelSubscribeConfirm'),
  })

  if (!isConfirmed) return
  try {
    const result: { [key: string]: any } = await api.delete(`subscribe/${props.subid}`)

    if (result.success) {
      $toast.success(`订阅 ${getSubscribeDisplayName()} 已取消！`)
      // 通知父组件刷新
      emit('remove')
    }
  } catch (e) {
    console.log(e)
  }
}

// 查询下载目录
async function loadDownloadDirectories() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/public/Directories')
    if (result.success && result.data?.value) {
      downloadDirectories.value = result.data.value
    }
  } catch (error) {
    console.log(error)
  }
}

// 保存目录下拉框
const targetDirectories = computed(() => {
  // 去重后的下载目录
  return downloadDirectories.value.map(item => item.download_path)
})

// 仅电视剧订阅支持全集洗版，电影保持原有洗版逻辑
const isTvSubscribe = computed(() => props.type === '电视剧' || subscribeForm.value.type === '电视剧')

watch(
  () => subscribeForm.value.best_version,
  bestVersion => {
    if (!bestVersion) subscribeForm.value.best_version_full = false
  },
)

onMounted(() => {
  queryFilterRuleGroups()
  loadDownloadDirectories()
  getSiteList()
  loadDownloaderSetting()
  if (props.subid) getSubscribeInfo()
  if (props.default) queryDefaultSubscribeConfig()
})
</script>

<template>
  <VDialog scrollable max-width="45rem" :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem class="py-2">
        <VDialogCloseBtn @click="emit('close')" />
        <template #prepend>
          <VIcon icon="mdi-clipboard-list-outline" class="me-2" />
        </template>
        <VCardTitle>
          {{ props.default ? t('dialog.subscribeEdit.titleDefault') : t('dialog.subscribeEdit.titleEdit') }}
        </VCardTitle>
        <VCardSubtitle v-if="!props.default">
          {{ getSubscribeDisplayName() }}
        </VCardSubtitle>
        <VCardSubtitle v-else>
          {{ props.type }}
        </VCardSubtitle>
      </VCardItem>
      <VCardText>
        <VForm @submit.prevent="() => {}">
          <VTabs v-model="activeTab" show-arrows>
            <VTab value="basic">
              <div>{{ t('dialog.subscribeEdit.tabs.basic') }}</div>
            </VTab>
            <VTab value="advance">
              <div>{{ t('dialog.subscribeEdit.tabs.advance') }}</div>
            </VTab>
          </VTabs>
          <VWindow v-model="activeTab" class="mt-5 disable-tab-transition" :touch="false">
            <VWindowItem value="basic">
              <div>
                <VRow v-if="!props.default">
                  <VCol cols="12" md="4">
                    <VTextField
                      v-model="subscribeForm.keyword"
                      :label="t('dialog.subscribeEdit.searchKeyword')"
                      :hint="t('dialog.subscribeEdit.searchKeywordHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-magnify"
                    />
                  </VCol>
                  <VCol v-if="subscribeForm.type === '电视剧'" cols="12" md="4">
                    <VTextField
                      v-model="subscribeForm.total_episode"
                      :label="t('dialog.subscribeEdit.totalEpisode')"
                      :rules="[numberValidator]"
                      :hint="t('dialog.subscribeEdit.totalEpisodeHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-playlist-play"
                    />
                  </VCol>
                  <VCol v-if="subscribeForm.type === '电视剧'" cols="12" md="4">
                    <VTextField
                      v-model="subscribeForm.start_episode"
                      :label="t('dialog.subscribeEdit.startEpisode')"
                      :rules="[numberValidator]"
                      :hint="t('dialog.subscribeEdit.startEpisodeHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-play-circle-outline"
                    />
                  </VCol>
                </VRow>
                <VRow>
                  <VCol cols="12" md="4">
                    <VAutocomplete
                      v-model="subscribeForm.quality"
                      :label="t('dialog.subscribeEdit.quality')"
                      :items="qualityOptions"
                      :hint="t('dialog.subscribeEdit.qualityHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-quality-high"
                    />
                  </VCol>
                  <VCol cols="12" md="4">
                    <VAutocomplete
                      v-model="subscribeForm.resolution"
                      :label="t('dialog.subscribeEdit.resolution')"
                      :items="resolutionOptions"
                      :hint="t('dialog.subscribeEdit.resolutionHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-monitor"
                    />
                  </VCol>
                  <VCol cols="12" md="4">
                    <VAutocomplete
                      v-model="subscribeForm.effect"
                      :label="t('dialog.subscribeEdit.effect')"
                      :items="effectOptions"
                      :hint="t('dialog.subscribeEdit.effectHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-auto-fix"
                    />
                  </VCol>
                </VRow>
                <VRow>
                  <VCol cols="12">
                    <VAutocomplete
                      v-model="subscribeForm.sites"
                      :items="selectSitesOptions"
                      chips
                      :label="t('dialog.subscribeEdit.subscribeSites')"
                      multiple
                      clearable
                      :hint="t('dialog.subscribeEdit.subscribeSitesHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-web"
                    />
                  </VCol>
                </VRow>
                <VRow>
                  <VCol cols="12" md="6">
                    <VAutocomplete
                      v-model="subscribeForm.downloader"
                      :items="downloaderOptions"
                      :label="t('dialog.subscribeEdit.downloader')"
                      :hint="t('dialog.subscribeEdit.downloaderHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-download"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VCombobox
                      v-model="subscribeForm.save_path"
                      :items="targetDirectories"
                      :label="t('dialog.subscribeEdit.savePath')"
                      :hint="t('dialog.subscribeEdit.savePathHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-folder"
                    />
                  </VCol>
                </VRow>
                <VRow>
                  <VCol cols="12" md="4">
                    <VSwitch
                      v-model="subscribeForm.best_version"
                      :label="t('dialog.subscribeEdit.bestVersion')"
                      :hint="t('dialog.subscribeEdit.bestVersionHint')"
                      persistent-hint
                    />
                  </VCol>
                  <VCol v-if="isTvSubscribe && subscribeForm.best_version" cols="12" md="4">
                    <VSwitch
                      v-model="subscribeForm.best_version_full"
                      :label="t('dialog.subscribeEdit.bestVersionFull')"
                      :hint="t('dialog.subscribeEdit.bestVersionFullHint')"
                      persistent-hint
                    />
                  </VCol>
                  <VCol cols="12" md="4">
                    <VSwitch
                      v-model="subscribeForm.search_imdbid"
                      :label="t('dialog.subscribeEdit.searchImdbid')"
                      :hint="t('dialog.subscribeEdit.searchImdbidHint')"
                      persistent-hint
                    />
                  </VCol>
                  <VCol v-if="props.default" cols="12" md="4">
                    <VSwitch
                      v-model="subscribeForm.show_edit_dialog"
                      :label="t('dialog.subscribeEdit.showEditDialog')"
                      :hint="t('dialog.subscribeEdit.showEditDialogHint')"
                      persistent-hint
                    />
                  </VCol>
                </VRow>
              </div>
            </VWindowItem>
            <VWindowItem value="advance">
              <div>
                <VRow>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="subscribeForm.include"
                      :label="t('dialog.subscribeEdit.include')"
                      :hint="t('dialog.subscribeEdit.includeHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-plus-circle-outline"
                    />
                  </VCol>
                  <VCol cols="12" md="6">
                    <VTextField
                      v-model="subscribeForm.exclude"
                      :label="t('dialog.subscribeEdit.exclude')"
                      :hint="t('dialog.subscribeEdit.excludeHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-minus-circle-outline"
                    />
                  </VCol>
                </VRow>
                <VRow>
                  <VCol cols="12">
                    <VAutocomplete
                      v-model="subscribeForm.filter_groups"
                      :items="filterRuleGroupOptions"
                      chips
                      multiple
                      clearable
                      :label="t('dialog.subscribeEdit.filterGroups')"
                      :hint="t('dialog.subscribeEdit.filterGroupsHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-filter"
                    />
                  </VCol>
                  <VCol v-if="!props.default && subscribeForm.type === '电视剧'" cols="12" md="6">
                    <VAutocomplete
                      v-model="subscribeForm.episode_group"
                      :items="episodeGroupOptions"
                      :item-props="episodeGroupItemProps"
                      :label="t('dialog.subscribeEdit.episodeGroup')"
                      :hint="t('dialog.subscribeEdit.episodeGroupHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-view-list"
                    />
                  </VCol>
                  <VCol v-if="!props.default && subscribeForm.type === '电视剧'" cols="12" md="6">
                    <VAutocomplete
                      v-model="subscribeForm.season"
                      :items="seasonItems"
                      :label="t('dialog.subscribeEdit.season')"
                      :hint="t('dialog.subscribeEdit.seasonHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-calendar"
                    />
                  </VCol>
                  <VCol cols="12" v-if="!props.default">
                    <VTextField
                      v-model="subscribeForm.media_category"
                      :label="t('dialog.subscribeEdit.mediaCategory')"
                      :hint="t('dialog.subscribeEdit.mediaCategoryHint')"
                      persistent-hint
                      prepend-inner-icon="mdi-tag"
                    />
                  </VCol>
                </VRow>
                <VRow v-if="!props.default">
                  <VCol cols="12">
                    <VTextarea
                      v-model="subscribeForm.custom_words"
                      :label="t('dialog.subscribeEdit.customWords')"
                      :hint="t('dialog.subscribeEdit.customWordsHint')"
                      persistent-hint
                      :placeholder="t('dialog.subscribeEdit.customWordsPlaceholder')"
                      prepend-inner-icon="mdi-text"
                    />
                  </VCol>
                </VRow>
              </div>
            </VWindowItem>
          </VWindow>
        </VForm>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VBtn v-if="!props.default" color="error" variant="tonal" @click="removeSubscribe">
          {{ t('dialog.subscribeEdit.cancelSubscribe') }}
        </VBtn>
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          @click=";`${props.default ? saveDefaultSubscribeConfig() : updateSubscribeInfo()}`"
          prepend-icon="mdi-content-save"
          class="px-5"
        >
          {{ t('dialog.subscribeEdit.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
