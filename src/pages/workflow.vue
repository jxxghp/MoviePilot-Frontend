<script setup lang="ts">
import WorkflowListView from '@/views/workflow/WorkflowListView.vue'
import WorkflowShareView from '@/views/workflow/WorkflowShareView.vue'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

// 当前标签页
const currentTab = ref(0)

// 搜索关键字
const shareKeyword = ref('')

// 分享视图刷新key
const shareViewKey = ref(0)

// 搜索分享
function searchShares() {
  shareViewKey.value++
}
</script>

<template>
  <div>
    <VTabs v-model="currentTab" class="mb-4">
      <VTab value="0">
        <VIcon icon="mdi-format-list-bulleted" class="me-2" />
        {{ t('workflow.title') }}
      </VTab>
      <VTab value="1">
        <VIcon icon="mdi-share" class="me-2" />
        {{ t('workflow.share') }}
      </VTab>
    </VTabs>

    <VWindow v-model="currentTab">
      <VWindowItem value="0">
        <WorkflowListView />
      </VWindowItem>
      <VWindowItem value="1">
        <div class="mb-4">
          <VRow>
            <VCol cols="12" md="6">
              <VTextField
                v-model="shareKeyword"
                :label="t('workflow.searchShares')"
                prepend-inner-icon="mdi-magnify"
                clearable
                @keyup.enter="searchShares"
                @click:clear="searchShares"
              />
            </VCol>
            <VCol cols="12" md="6" class="d-flex align-center">
              <VBtn @click="searchShares" prepend-icon="mdi-magnify" class="me-2">
                {{ t('workflow.searchShares') }}
              </VBtn>
            </VCol>
          </VRow>
        </div>
        <WorkflowShareView :keyword="shareKeyword" :key="shareViewKey" />
      </VWindowItem>
    </VWindow>
  </div>
</template>
