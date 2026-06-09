<script setup lang="ts">
import { debounce } from 'lodash-es'
import WorkflowListView from '@/views/workflow/WorkflowListView.vue'
import WorkflowShareView from '@/views/workflow/WorkflowShareView.vue'
import { useI18n } from 'vue-i18n'
import { useDynamicHeaderTab } from '@/composables/useDynamicHeaderTab'
import { useDynamicButton } from '@/composables/useDynamicButton'
import { usePWA } from '@/composables/usePWA'
import { getWorkflowTabs } from '@/router/i18n-menu'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'

// 国际化
const { t } = useI18n()

const route = useRoute()
const { appMode } = usePWA()
const userStore = useUserStore()
const canManage = computed(() =>
  hasPermission(buildUserPermissionContext(userStore.superUser, userStore.permissions), 'manage'),
)

const activeTab = ref((route.query.tab as string) || 'list')
const workflowListViewRef = ref<InstanceType<typeof WorkflowListView> | null>(null)

// 获取标签页
const workflowTabs = computed(() => {
  return getWorkflowTabs(t)
})

// 分享搜索词
const shareKeyword = ref('')
const shareKeywordInput = ref('')

// 搜索分享对话框
const searchShareDialog = ref(false)

// 搜索分享激活器
const searchActivator = computed(() => '[data-menu-activator="share-filter-btn"]')

function openAddWorkflowDialog() {
  workflowListViewRef.value?.openAddDialog()
}

function refreshWorkflowList() {
  workflowListViewRef.value?.refresh()
}

const shareKeywordUpdater = debounce((keyword: string) => {
  shareKeyword.value = keyword.trim()
}, 300)

watch(shareKeywordInput, newKeyword => {
  shareKeywordUpdater(newKeyword || '')
})

watch(activeTab, newTab => {
  if (newTab !== 'share') {
    searchShareDialog.value = false
  }
})

onUnmounted(() => {
  shareKeywordUpdater.cancel()
})

useDynamicButton({
  icon: 'mdi-plus',
  onClick: openAddWorkflowDialog,
  permission: 'manage',
  show: computed(() => appMode.value && activeTab.value === 'list'),
})

// 使用动态标签页
const { registerHeaderTab } = useDynamicHeaderTab()

// 注册动态标签页
registerHeaderTab({
  items: workflowTabs,
  modelValue: activeTab,
  appendButtons: [
    {
      icon: 'mdi-filter-multiple-outline',
      variant: 'text',
      color: computed(() => (shareKeywordInput.value ? 'primary' : 'gray')),
      class: 'settings-icon-button',
      dataAttr: 'share-filter-btn',
      permission: 'manage',
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
            <WorkflowListView ref="workflowListViewRef" />
          </div>
        </transition>
      </VWindowItem>
      <VWindowItem value="share">
        <transition name="fade-slide" appear>
          <div>
            <WorkflowShareView :keyword="shareKeyword" @update="refreshWorkflowList" />
          </div>
        </transition>
      </VWindowItem>
    </VWindow>

    <!-- 搜索工作流分享弹窗 -->
    <Teleport to="body" v-if="searchShareDialog">
      <VMenu
        v-model="searchShareDialog"
        :close-on-content-click="false"
        :activator="searchActivator"
        location="bottom end"
      >
        <VCard min-width="260" max-width="320">
          <div class="pa-3">
            <VTextField
              v-model="shareKeywordInput"
              :placeholder="t('workflow.searchShares')"
              prepend-inner-icon="mdi-magnify"
              density="compact"
              variant="outlined"
              hide-details
              clearable
            />
          </div>
        </VCard>
      </VMenu>
    </Teleport>

    <Teleport to="body" v-if="!appMode && route.path === '/workflow' && activeTab === 'list' && canManage">
      <div class="compact-fab-stack">
        <VFab
          icon="mdi-plus"
          color="primary"
          appear
          class="compact-fab compact-fab--primary"
          @click="openAddWorkflowDialog"
        />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.content-window {
  margin-block-start: 0;
}
</style>
