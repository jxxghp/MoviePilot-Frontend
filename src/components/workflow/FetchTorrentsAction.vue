<script setup lang="ts">
import api from '@/api'
import { Site } from '@/api/types'
import { Handle, Position } from '@vue-flow/core'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps({
  id: {
    type: String,
    required: true,
  },
  data: {
    type: Object,
    required: true,
  },
})

// 电影/电视剧下拉框
const typeOptions = ref([
  {
    title: t('mediaType.movie'),
    value: '电影',
  },
  {
    title: t('mediaType.tv'),
    value: '电视剧',
  },
  {
    title: t('mediaType.music'),
    value: '音乐',
  },
])

// 搜索方式下拉框
const searchOptions = ref([
  {
    title: t('workflow.fetchTorrents.searchOptions.name'),
    value: 'keyword',
  },
  {
    title: t('workflow.fetchTorrents.searchOptions.mediaList'),
    value: 'media',
  },
])

// 站点数据列表
const siteList = ref<Site[]>([])

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

// 站点选项
const siteOptions = computed(() => {
  return siteList.value.map(item => {
    return {
      title: item.name,
      value: item.id,
    }
  })
})

onMounted(() => {
  loadSites()
})
</script>
<template>
  <div>
    <VCard max-width="20rem">
      <Handle id="edge_in" type="target" :position="Position.Left" />
      <VCardItem>
        <template v-slot:prepend>
          <VAvatar>
            <VIcon icon="mdi-search-web" size="x-large"></VIcon>
          </VAvatar>
        </template>
        <VCardTitle>{{ t('workflow.fetchTorrents.title') }}</VCardTitle>
        <VCardSubtitle>{{ t('workflow.fetchTorrents.subtitle') }}</VCardSubtitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <VRow>
          <VCol cols="12">
            <VSelect
              v-model="data.search_type"
              :label="t('workflow.fetchTorrents.searchType')"
              :items="searchOptions"
              outlined
              dense
            />
          </VCol>
        </VRow>
        <VRow v-if="data.search_type === 'keyword'">
          <VCol cols="6">
            <VTextField v-model="data.name" :label="t('workflow.fetchTorrents.name')" outlined dense />
          </VCol>
          <VCol cols="6">
            <VTextField v-model="data.year" :label="t('workflow.fetchTorrents.year')" outlined dense />
          </VCol>
          <VCol cols="6">
            <VSelect
              v-model="data.type"
              :label="t('workflow.fetchTorrents.type')"
              :items="typeOptions"
              outlined
              dense
            />
          </VCol>
          <VCol cols="6">
            <VTextField
              v-model="data.season"
              type="number"
              :label="t('workflow.fetchTorrents.season')"
              outlined
              dense
            />
          </VCol>
        </VRow>
        <VRow>
          <VCol cols="12">
            <VSelect
              v-model="data.sites"
              :label="t('workflow.fetchTorrents.sites')"
              :items="siteOptions"
              chips
              multiple
              outlined
              dense
              clearable
            />
          </VCol>
        </VRow>
        <VRow v-if="data.search_type === 'keyword'">
          <VCol cols="12">
            <VSwitch v-model="data.match_media" :label="t('workflow.fetchTorrents.matchMedia')" />
          </VCol>
        </VRow>
      </VCardText>
      <Handle id="edge_out" type="source" :position="Position.Right" />
    </VCard>
  </div>
</template>
