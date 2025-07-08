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

const activeTab = ref((route.query.tab as string) || '')
const shareViewKey = ref(0)

// 获取标签页
const workflowTabs = computed(() => {
  return getWorkflowTabs()
})

// 新增工作流对话框
const addWorkflowDialog = ref(false)

// 工作流列表刷新key
const workflowListKey = ref(0)

// 分享搜索词
const shareKeyword = ref('')

// 搜索分享
const searchShares = () => {
  shareViewKey.value++
}

// VMenu activator选择器
const searchActivator = computed(() => '[data-menu-activator="search-btn"]')

// 使用动态标签页
const { registerHeaderTab } = useDynamicHeaderTab()

// 注册动态标签页
registerHeaderTab({
  items: workflowTabs.value,
  modelValue: activeTab,
  appendButtons: [
    {
      icon: 'mdi-movie-search-outline',
      variant: 'text',
      color: computed(() => (shareKeyword.value ? 'primary' : 'gray')),
      class: 'settings-icon-button',
      dataAttr: 'search-btn',
      action: () => {
        // 这里可以添加搜索弹窗逻辑
        console.log('Search workflow shares')
      },
      show: computed(() => activeTab.value === 'share'),
    },
    {
      icon: 'mdi-plus',
      variant: 'text',
      color: 'gray',
      class: 'settings-icon-button',
      action: () => {
        addWorkflowDialog.value = true
      },
      show: computed(() => activeTab.value === 'list'),
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
            <WorkflowListView />
          </div>
        </transition>
      </VWindowItem>
      <VWindowItem value="share">
        <transition name="fade-slide" appear>
          <div>
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
  </div>
</template>

<style scoped>
.content-window {
  margin-block-start: 0;
}
</style>
