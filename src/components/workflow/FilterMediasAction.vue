<script setup lang="ts">
import api from '@/api'
import { Handle, Position } from '@vue-flow/core'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
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

// 二级分类策略
const mediaCategories = ref<{ [key: string]: any }>({})

// 调用API查询自动分类配置
async function loadMediaCategories() {
  try {
    mediaCategories.value = await api.get('media/category')
  } catch (error) {
    console.log(error)
  }
}

onMounted(() => {
  loadMediaCategories()
})
</script>
<template>
  <div>
    <VCard max-width="20rem">
      <Handle id="edge_in" type="target" :position="Position.Left" />
      <VCardItem>
        <template v-slot:prepend>
          <VAvatar>
            <VIcon icon="mdi-filter-check" size="x-large"></VIcon>
          </VAvatar>
        </template>
        <VCardTitle>{{ t('workflow.filterMedias.title') }}</VCardTitle>
        <VCardSubtitle>{{ t('workflow.filterMedias.subtitle') }}</VCardSubtitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <VRow>
          <VCol cols="12">
            <VSelect v-model="data.type" :label="t('workflow.filterMedias.type')" :items="typeOptions" outlined dense />
          </VCol>
          <VCol cols="6">
            <VTextField v-model="data.year" :label="t('workflow.filterMedias.year')" outlined dense />
          </VCol>
          <VCol cols="6">
            <VTextField v-model="data.vote" type="number" :label="t('workflow.filterMedias.vote')" outlined dense />
          </VCol>
        </VRow>
      </VCardText>
      <Handle id="edge_out" type="source" :position="Position.Right" />
    </VCard>
  </div>
</template>
