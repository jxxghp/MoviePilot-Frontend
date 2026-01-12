<script setup lang="ts">
import WorkflowListView from '@/views/workflow/WorkflowListView.vue'
import WorkflowShareView from '@/views/workflow/WorkflowShareView.vue'
import WorkflowAddEditDialog from '@/components/dialog/WorkflowAddEditDialog.vue'
import { useI18n } from 'vue-i18n'
import { useDynamicHeaderTab } from '@/composables/useDynamicHeaderTab'
import { getWorkflowTabs } from '@/router/i18n-menu'

// 国际化
const { t } = useI18n()

const route = useRoute()

const activeTab = ref((route.query.tab as string) || 'list')
const shareViewKey = ref(0)
const listViewKey = ref(0)

// 获取标签页
const workflowTabs = computed(() => {
  return getWorkflowTabs(t)
})

// 新增工作流对话框
const addWorkflowDialog = ref(false)

// 分享搜索词
const shareKeyword = ref('')

// 搜索分享对话框
const searchShareDialog = ref(false)

// 搜索分享激活器
const searchActivator = computed(() => '[data-menu-activator="search-btn"]')

// 搜索分享
const searchShares = () => {
  shareViewKey.value++
}

// 使用动态标签页
const { registerHeaderTab } = useDynamicHeaderTab()

// 注册动态标签页
registerHeaderTab({
  items: workflowTabs.value,
  modelValue: activeTab,
  appendButtons: [
    {
      icon: 'mdi-search',
      variant: 'text',
      color: computed(() => (shareKeyword.value ? 'primary' : 'gray')),
      class: 'settings-icon-button',
      dataAttr: 'search-btn',
      show: computed(() => activeTab.value === 'share'),
      action: () => {
        searchShareDialog.value = true
      },
    },
  ],
})

// 注册动态标签页
onMounted(() => {
  // 设置初始activeTab值
  if (!activeTab.value && workflowTabs.value.length > 0) {
    activeTab.value = workflowTabs.value[0].tab
  }
})
</script>

<template>
  <div>
    <VWindow v-model="activeTab" class="disable-tab-transition content-window" :touch="false">
      <VWindowItem value="list">
        <transition name="fade-slide" appear>
          <div>
            <WorkflowListView :key="listViewKey" />
          </div>
        </transition>
      </VWindowItem>
      <VWindowItem value="share">
        <transition name="fade-slide" appear>
          <div>
            <WorkflowShareView :keyword="shareKeyword" :key="shareViewKey" @update="listViewKey++" />
          </div>
        </transition>
      </VWindowItem>
    </VWindow>

    <!-- 新增工作流对话框 -->
    <WorkflowAddEditDialog
      v-if="addWorkflowDialog"
      v-model="addWorkflowDialog"
      @close="addWorkflowDialog = false"
      @save="addWorkflowDialog = false"
    />

    <!-- 搜索工作流分享弹窗 -->
    <Teleport to="body" v-if="searchShareDialog">
      <VMenu
        v-model="searchShareDialog"
        width="25rem"
        :close-on-content-click="false"
        :activator="searchActivator"
        location="bottom end"
      >
        <VCard>
          <VCardItem>
            <VCardTitle>
              <VIcon icon="mdi-movie-search-outline" class="mr-2" />
              {{ t('workflow.searchShares') }}
            </VCardTitle>
            <VDialogCloseBtn @click="searchShareDialog = false" />
          </VCardItem>
          <VCardText>
            <VTextField v-model="shareKeyword" :label="t('workflow.searchShares')" clearable density="comfortable">
              <template #append>
                <VBtn prepend-icon="mdi-magnify" color="primary" @click="searchShares">{{ t('common.search') }}</VBtn>
              </template>
            </VTextField>
          </VCardText>
        </VCard>
      </VMenu>
    </Teleport>
  </div>
</template>

<style scoped>
.content-window {
  margin-block-start: 0;
}
</style>
