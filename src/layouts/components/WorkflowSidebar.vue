<script lang="ts" setup>
import api from '@/api'
import useDragAndDrop from '@core/utils/workflow'
import { useDisplay } from 'vuetify'

interface ActionItem {
  name: string;
  type: string;
  desc?: string;
}

const display = useDisplay()
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
    'FetchMedias': 'mdi-movie-search',
    'FetchRss': 'mdi-rss-box',
    'FetchDownloads': 'mdi-download-network',
    'FilterMedias': 'mdi-filter-variant',
    'DownloadTorrent': 'mdi-download-circle',
    'TransferFile': 'mdi-folder-move',
    'ScrapeFile': 'mdi-file-find-outline',
    'AddSubscribe': 'mdi-star-plus',
    'SendMessage': 'mdi-message-alert',
    'RunCommand': 'mdi-console-line'
  }
  
  return iconMap[type] || 'mdi-puzzle-outline'
}

// 计算侧边栏类名
const sidebarClasses = computed(() => {
  return {
    'sidebar-collapsed': isSidebarCollapsed.value && !display.smAndDown.value,
    'sidebar-mobile': display.smAndDown.value,
    'sidebar-mobile-open': showMobileSidebar.value && display.smAndDown.value
  }
})

// 监听屏幕尺寸变化，自动关闭移动端侧边栏
watch(() => display.smAndDown.value, (isMobile) => {
  if (!isMobile) {
    showMobileSidebar.value = false
  }
})

onMounted(() => {
  load_actions()
})
</script>

<template>
  <!-- 移动端触发按钮 -->
  <div v-if="display.smAndDown.value" class="workflow-sidebar-trigger" @click="toggleMobileSidebar">
    <VBtn 
      icon 
      size="large" 
      class="workflow-sidebar-fab"
    >
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
            <VIcon icon="mdi-puzzle" />
          </VAvatar>
          <span v-if="!isSidebarCollapsed || display.smAndDown.value" class="header-title">动作组件</span>
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
          <div class="component-card">
            <VAvatar size="36" class="component-avatar">
              <VIcon :icon="getActionIcon(action.type)" size="18" />
            </VAvatar>
            <div v-if="!isSidebarCollapsed || display.smAndDown.value" class="component-info">
              <div class="component-name">{{ action.name }}</div>
              <div class="component-desc">{{ display.smAndDown.value ? '点击添加' : '拖动到画布' }}</div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 底部提示 -->
      <div class="sidebar-footer">
        <VBtn block class="drag-btn">
          <div class="btn-content">
            <VIcon v-if="isSidebarCollapsed && !display.smAndDown.value" 
                  class="footer-icon" 
                  icon="mdi-gesture-swipe" />
            <template v-else>
              <VIcon :icon="display.smAndDown.value ? 'mdi-touch' : 'mdi-gesture-swipe'" class="me-2" />
              <span>{{ display.smAndDown.value ? '点击组件添加到画布' : '拖动组件到画布' }}</span>
            </template>
          </div>
        </VBtn>
      </div>
    </div>
  </aside>
</template>

<style lang="scss" scoped>
.workflow-sidebar {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 280px;
  z-index: 100;
  overflow: hidden;
  box-shadow: 0 0 15px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
  background-color: #f5f5f7;
  
  &.sidebar-collapsed {
    width: 70px;
  }
  
  &.sidebar-mobile {
    transform: translateX(-100%);
    width: 240px;
    
    &.sidebar-mobile-open {
      transform: translateX(0);
    }
  }
}

.sidebar-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  flex-shrink: 0;
  background-color: #fff;
  
  .header-content {
    display: flex;
    align-items: center;
    position: relative;
  }
  
  .workflow-logo {
    background-color: #8c58f5;
    color: white;
    margin-right: 10px;
  }
  
  .header-title {
    font-size: 18px;
    font-weight: 600;
    color: #1a1a1a;
  }
  
  .collapse-btn {
    position: absolute;
    right: 0;
    top: 0;
    color: #8c58f5;
  }
}

.components-container {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  
  &::-webkit-scrollbar {
    width: 5px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background-color: rgba(140, 88, 245, 0.3);
    border-radius: 10px;
  }
}

.component-item {
  margin-bottom: 10px;
  cursor: grab;
  
  &:active {
    cursor: grabbing;
  }
}

.component-card {
  display: flex;
  align-items: center;
  padding: 10px;
  border-radius: 12px;
  background-color: #e4e4e7;
  transition: all 0.2s ease;
  
  &:hover {
    background-color: #d4d4d8;
    transform: translateY(-2px);
  }
}

.component-avatar {
  background-color: #8c58f5;
  margin-right: 12px;
  flex-shrink: 0;
  color: white;
  
  .v-icon {
    color: white !important;
    opacity: 1 !important;
  }
}

.component-info {
  overflow: hidden;
  max-width: calc(100% - 48px);
}

.component-name {
  font-weight: 500;
  font-size: 14px;
  color: #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.component-desc {
  font-size: 12px;
  color: #71717a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-footer {
  padding: 12px;
  background-color: #fff;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  flex-shrink: 0;
  
  .drag-btn {
    color: white;
    font-weight: 500;
    text-transform: none;
    letter-spacing: normal;
    height: 44px;
    background-color: #8c58f5;
    
    &:hover {
      background-color: darken(#8c58f5, 5%);
    }
    
    .btn-content {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .footer-icon {
      font-size: 20px;
    }
  }
}

// 移动端悬浮按钮
.workflow-sidebar-trigger {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 100;
}

.workflow-sidebar-fab {
  background-color: #8c58f5;
  color: white;
  box-shadow: 0 4px 10px rgba(140, 88, 245, 0.4);
  
  &:hover {
    background-color: darken(#8c58f5, 5%);
  }
}

.sidebar-collapsed {
  .component-card {
    justify-content: center;
    padding: 8px;
  }
  
  .component-avatar {
    margin-right: 0;
    width: 40px !important;
    height: 40px !important;
    
    .v-icon {
      font-size: 20px !important;
    }
  }
  
  .sidebar-footer {
    padding: 10px 6px;
    
    .drag-btn {
      min-width: 0;
      width: 100%;
      height: 48px;
      border-radius: 10px;
      padding: 0;
      
      .btn-content {
        width: 100%;
      }
    }
  }
}

@media (max-width: 600px) {
  .component-card {
    padding: 8px;
  }
  
  .component-item {
    margin-bottom: 8px;
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
      height: 40px;
    }
  }
}
</style>
