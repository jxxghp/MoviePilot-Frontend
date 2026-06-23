<script lang="ts" setup>
import api from '@/api'
import useDragAndDrop from '@core/utils/workflow'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { actionStepDict } from '@/api/constants'
import { usePWA } from '@/composables/usePWA'

interface ActionItem {
  name: string
  type: string
  desc?: string
}

const display = useDisplay()
// APP
// PWA模式检测
const { appMode } = usePWA()
const { t } = useI18n()

const { onDragStart } = useDragAndDrop()

// 组件列表
const actions = ref<ActionItem[]>([])
// 侧边栏是否收起 (仅在桌面端有效)
const isSidebarCollapsed = ref(false)
// 侧边栏在移动端是否显示
const showMobileSidebar = ref(false)

// 定义emit
const emit = defineEmits(['component-click'])

// 加载组件列表
async function load_actions() {
  try {
    actions.value = await api.get('workflow/actions')
  } catch (error) {
    console.error(error)
  }
}

// 切换侧边栏收起状态
function toggleSidebar() {
  isSidebarCollapsed.value = !isSidebarCollapsed.value
}

// 切换移动端侧边栏显示状态
function toggleMobileSidebar() {
  showMobileSidebar.value = !showMobileSidebar.value
}

// 处理移动端点击组件事件
function handleComponentClick(action: ActionItem) {
  // 向父组件发送事件
  emit('component-click', action)
  // 关闭侧边栏
  showMobileSidebar.value = false
}

// 根据动作类型获取图标
function getActionIcon(type: string): string {
  const iconMap: Record<string, string> = {
    'AddSubscribeAction': 'mdi-star-plus',
    'AddDownloadAction': 'mdi-download',
    'FetchDownloadsAction': 'mdi-progress-download',
    'FetchMediasAction': 'mdi-movie-search',
    'FetchRssAction': 'mdi-rss',
    'FetchTorrentsAction': 'mdi-search-web',
    'FilterMediasAction': 'mdi-filter-check',
    'FilterTorrentsAction': 'mdi-filter-multiple',
    'ScanFileAction': 'mdi-folder-search',
    'ScrapeFileAction': 'mdi-file-find',
    'SendEventAction': 'mdi-send-check',
    'SendMessageAction': 'mdi-message-arrow-right',
    'TransferFileAction': 'mdi-file-move',
    'InvokePluginAction': 'mdi-run',
    'NoteAction': 'mdi-note-text',
  }

  return iconMap[type] || 'mdi-puzzle-outline'
}

// 计算侧边栏类名
const sidebarClasses = computed(() => {
  return {
    'sidebar-collapsed': isSidebarCollapsed.value && !display.smAndDown.value,
    'sidebar-mobile': display.smAndDown.value,
    'sidebar-mobile-open': showMobileSidebar.value && display.smAndDown.value,
  }
})

// 监听屏幕尺寸变化，自动关闭移动端侧边栏
watch(
  () => display.smAndDown.value,
  isMobile => {
    if (!isMobile) {
      showMobileSidebar.value = false
    }
  },
)

// 获取动作步骤文本
function getActionStepText(type: string | undefined) {
  if (!type) return ''
  return actionStepDict[type]
}

onMounted(() => {
  load_actions()
})
</script>

<template>
  <!-- 移动端触发按钮 -->
  <div
    v-if="display.smAndDown.value"
    class="workflow-sidebar-trigger"
    :class="appMode ? 'right-4 bottom-28' : 'right-4 bottom-4'"
    @click="toggleMobileSidebar"
  >
    <VBtn icon size="large" class="workflow-sidebar-fab">
      <VIcon :icon="showMobileSidebar ? 'mdi-close' : 'mdi-plus'" />
    </VBtn>
  </div>

  <!-- 侧边栏 -->
  <aside class="workflow-sidebar" :class="sidebarClasses">
    <div class="sidebar-container">
      <!-- 侧边栏头部 -->
      <div class="sidebar-header">
        <div class="header-content">
          <VAvatar size="36" class="workflow-logo">
            <VIcon icon="mdi-apps" />
          </VAvatar>
          <span v-if="!isSidebarCollapsed || display.smAndDown.value" class="header-title">{{
            t('workflow.components')
          }}</span>
          <IconBtn v-if="!display.smAndDown.value" @click="toggleSidebar" class="collapse-btn">
            <VIcon :icon="isSidebarCollapsed ? 'mdi-chevron-right' : 'mdi-chevron-left'" />
          </IconBtn>
        </div>
      </div>

      <!-- 组件列表 -->
      <div class="components-container">
        <div
          v-for="(action, index) in actions"
          :key="index"
          class="component-item"
          :draggable="!display.smAndDown.value"
          @dragstart="!display.smAndDown.value && onDragStart($event, action)"
          @click="display.smAndDown.value && handleComponentClick(action)"
        >
          <VCard class="component-card">
            <VAvatar size="36" class="component-avatar">
              <VIcon :icon="getActionIcon(action.type)" size="18" />
            </VAvatar>
            <div v-if="!isSidebarCollapsed || display.smAndDown.value" class="component-info">
              <div class="component-name">{{ getActionStepText(action.name) }}</div>
              <div class="component-desc">
                {{ display.smAndDown.value ? t('workflow.clickToAdd') : t('workflow.dragToCanvas') }}
              </div>
            </div>
          </VCard>
        </div>
      </div>

      <!-- 底部提示 -->
      <div class="sidebar-footer">
        <VBtn block class="drag-btn">
          <div class="btn-content">
            <VIcon v-if="isSidebarCollapsed && !display.smAndDown.value" class="footer-icon" icon="mdi-gesture-swipe" />
            <template v-else>
              <VIcon :icon="display.smAndDown.value ? 'mdi-gesture-tap' : 'mdi-gesture-swipe'" class="me-2" />
              <span>{{
                display.smAndDown.value ? t('workflow.tapComponentHint') : t('workflow.dragComponentHint')
              }}</span>
            </template>
          </div>
        </VBtn>
      </div>
    </div>
  </aside>
</template>

<style lang="scss" scoped>
@use 'sass:color';

.workflow-sidebar {
  position: absolute;
  z-index: 100;
  overflow: hidden;
  background-color: rgb(var(--v-theme-background));
  box-shadow: 0 0 15px rgba(0, 0, 0, 8%);
  inline-size: 280px;
  inset-block: 0;
  inset-inline-start: 0;
  transition: all 0.3s ease;

  &.sidebar-collapsed {
    inline-size: 70px;
  }

  &.sidebar-mobile {
    inline-size: 240px;
    transform: translateX(-100%);

    &.sidebar-mobile-open {
      transform: translateX(0);
    }
  }
}

.sidebar-container {
  display: flex;
  flex-direction: column;
  block-size: 100%;
}

.sidebar-header {
  flex-shrink: 0;
  padding: 16px;
  background-color: rgb(var(--v-theme-background));
  border-block-end: 1px solid rgba(var(--v-theme-on-background), 0.06);

  .header-content {
    position: relative;
    display: flex;
    align-items: center;
  }

  .workflow-logo {
    background-color: rgb(var(--v-theme-primary));
    color: white;
    margin-inline-end: 10px;
  }

  .header-title {
    color: rgb(var(--v-theme-on-background));
    font-size: 18px;
    font-weight: 600;
  }

  .collapse-btn {
    position: absolute;
    color: rgb(var(--v-theme-primary));
    inset-block-start: 0;
    inset-inline-end: 0;
  }
}

.components-container {
  flex: 1;
  padding: 12px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    inline-size: 5px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 10px;
    background-color: rgba(var(--v-theme-primary), 0.3);
  }
}

.component-item {
  cursor: grab;
  margin-block-end: 10px;

  &:active {
    cursor: grabbing;
  }
}

.component-card {
  display: flex;
  align-items: center;
  padding: 10px;
  background-color: rgb(var(--v-theme-surface-variant));
  transition: all 0.2s ease;

  &:hover {
    background-color: rgb(var(--v-theme-surface-variant));
    transform: translateY(-2px);
  }
}

.component-avatar {
  flex-shrink: 0;
  background-color: rgb(var(--v-theme-primary));
  color: white;
  margin-inline-end: 12px;

  .v-icon {
    color: white !important;
    opacity: 1 !important;
  }
}

.component-info {
  overflow: hidden;
  max-inline-size: calc(100% - 48px);
}

.component-name {
  overflow: hidden;
  color: rgb(var(--v-theme-on-background));
  font-size: 14px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.component-desc {
  overflow: hidden;
  color: #71717a;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-footer {
  flex-shrink: 0;
  padding: 12px;
  background-color: rgb(var(--v-theme-background));
  border-block-start: 1px solid rgba(0, 0, 0, 6%);

  .drag-btn {
    background-color: rgb(var(--v-theme-primary));
    block-size: 44px;
    color: white;
    font-weight: 500;
    letter-spacing: normal;
    text-transform: none;

    .btn-content {
      display: flex;
      align-items: center;
      justify-content: center;
      inline-size: 100%;
    }

    .footer-icon {
      font-size: 20px;
    }
  }
}

// 移动端悬浮按钮
.workflow-sidebar-trigger {
  position: fixed;
  z-index: 100;
}

.workflow-sidebar-fab {
  background-color: rgb(var(--v-theme-primary));
  box-shadow: 0 4px 10px rgba(var(--v-theme-primary), 40%);
  color: white;

  &:hover {
    background-color: color.adjust(#8c58f5, $lightness: -5%);
  }
}

.sidebar-collapsed {
  .component-card {
    justify-content: center;
    padding: 8px;
  }

  .component-avatar {
    block-size: 40px !important;
    inline-size: 40px !important;
    margin-inline-end: 0;

    .v-icon {
      font-size: 20px !important;
    }
  }

  .sidebar-footer {
    padding-block: 10px;
    padding-inline: 6px;

    .drag-btn {
      padding: 0;
      border-radius: 10px;
      block-size: 48px;
      inline-size: 100%;
      min-inline-size: 0;

      .btn-content {
        inline-size: 100%;
      }
    }
  }
}

@media (width <= 600px) {
  .component-card {
    padding: 8px;
  }

  .component-item {
    margin-block-end: 8px;
  }

  .components-container {
    padding: 8px;
  }

  .sidebar-header {
    padding: 12px;
  }

  .sidebar-footer {
    padding: 8px;

    .drag-btn {
      block-size: 40px;
    }
  }
}
</style>
