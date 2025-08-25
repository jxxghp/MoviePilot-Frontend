<script setup lang="ts">
import api from '@/api'
import type { Plugin } from '@/api/types'
import noImage from '@images/logos/plugin.png'
import { useI18n } from 'vue-i18n'
import { useRecentPlugins } from '@/composables/useRecentPlugins'
import PluginDataDialog from '@/components/dialog/PluginDataDialog.vue'
import { VCard } from 'vuetify/components'
import { getDominantColor } from '@/@core/utils/image'
import { disableBodyScroll, enableBodyScroll } from 'body-scroll-lock'

// 国际化
const { t } = useI18n()

// 最近访问插件管理
const { getRecentPlugins, addRecentPlugin } = useRecentPlugins()

// 输入参数
const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  pullDistance: {
    type: Number,
    default: 0,
  },
})

// 事件
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'plugin-click', plugin: Plugin): void
}>()

// 有详情页面的插件列表
const pluginsWithPage = ref<Plugin[]>([])

// 最近访问的插件列表
const recentPlugins = ref<Plugin[]>([])

// 是否加载中
const loading = ref(false)

// 各插件的图标加载状态
const pluginIconLoadError = ref<Record<string, boolean>>({})

// 各插件的背景颜色
const pluginBackgroundColors = ref<Record<string, string>>({})

// 上滑关闭配置常量
const SWIPE_CONFIG = {
  START_THRESHOLD: 10, // 开始检测上滑的最小距离
  CLOSE_THRESHOLD: 100, // 触发关闭的距离
  MAX_DRAG_DISTANCE: 1000, // 最大拖拽距离
  VELOCITY_THRESHOLD: 0.8, // 快速滑动速度阈值 (px/ms)
}

// 上滑关闭相关状态
const isDraggingToClose = ref(false)
const dragOffset = ref(0)
const startY = ref(0)
const lastY = ref(0)
const lastTime = ref(0)
const velocity = ref(0)
const startedFromBottomArea = ref(false)

// 插件弹窗相关状态
const showPluginDataDialog = ref(false)
const currentPlugin = ref<Plugin | null>(null)

// 计算显示状态
const isVisible = computed(() => {
  return props.visible
})

// 处理插件图标加载错误
function handleIconError(plugin: Plugin) {
  pluginIconLoadError.value[plugin.id] = true
}

// 处理插件图标加载完成
async function handleIconLoaded(src: string | undefined, plugin: Plugin) {
  if (!src) return

  try {
    // 创建一个临时的img元素来获取图片数据
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = async () => {
      try {
        // 从图片中提取背景色
        const backgroundColor = await getDominantColor(img)
        pluginBackgroundColors.value[plugin.id] = backgroundColor
      } catch (error) {
        // 如果提取失败，使用默认颜色
        pluginBackgroundColors.value[plugin.id] = '#28A9E1'
      }
    }
    img.onerror = () => {
      // 如果加载失败，使用默认颜色
      pluginBackgroundColors.value[plugin.id] = '#28A9E1'
    }
    img.src = src
  } catch (error) {
    // 如果提取失败，使用默认颜色
    pluginBackgroundColors.value[plugin.id] = '#28A9E1'
  }
}

// 获取插件背景颜色
function getPluginBackgroundColor(plugin: Plugin): string {
  return pluginBackgroundColors.value[plugin.id] || '#28A9E1'
}

// 计算整个组件的transform（包含拖动偏移）
const componentTransform = computed(() => {
  let baseTransform = ''
  if (props.visible) {
    baseTransform = 'translateY(0)'
  } else {
    baseTransform = 'translateY(-100%)'
  }

  // 如果正在拖动关闭，添加拖动偏移（向上拖拽为负值，让面板向上移动）
  if (isDraggingToClose.value) {
    return `${baseTransform} translateY(-${dragOffset.value}px)`
  }

  return baseTransform
})

// 计算组件透明度
const componentOpacity = computed(() => {
  return props.visible ? 1 : 0
})

// 计算插件图标路径
function getPluginIcon(plugin: Plugin): string {
  if (!plugin.plugin_icon) return noImage
  if (pluginIconLoadError.value[plugin.id]) return noImage

  // 如果是网络图片则使用代理后返回
  if (plugin?.plugin_icon?.startsWith('http'))
    return `${import.meta.env.VITE_API_BASE_URL}system/img/1?imgurl=${encodeURIComponent(
      plugin?.plugin_icon,
    )}&cache=true`

  return `./plugin_icon/${plugin?.plugin_icon}`
}

// 获取有详情页面的插件
async function fetchPluginsWithPage() {
  if (loading.value) return

  try {
    loading.value = true
    const allPlugins: Plugin[] = await api.get('plugin/', {
      params: {
        state: 'installed',
      },
    })

    // 只保留有详情页面且已启用的插件
    pluginsWithPage.value = allPlugins
      .filter(plugin => plugin.has_page)
      .sort((a, b) => {
        // 按插件名称排序
        return (a.plugin_name || '').localeCompare(b.plugin_name || '')
      })
  } catch (error) {
    console.error('获取插件列表失败:', error)
  } finally {
    loading.value = false
  }
}

// 加载最近访问的插件
function loadRecentPlugins() {
  recentPlugins.value = getRecentPlugins()
}

// 点击插件
function handlePluginClick(plugin: Plugin) {
  // 添加到最近访问列表
  addRecentPlugin(plugin)

  // 更新最近访问列表显示
  loadRecentPlugins()

  emit('plugin-click', plugin)

  // 设置当前插件并显示数据弹窗
  currentPlugin.value = plugin
  showPluginDataDialog.value = true
}

// 关闭面板
function handleClose() {
  emit('close')
}

// 关闭插件数据弹窗
function handleClosePluginDataDialog() {
  showPluginDataDialog.value = false
  currentPlugin.value = null
}

// 监听可见性变化，加载数据
watch(
  () => isVisible.value,
  visible => {
    if (visible) {
      fetchPluginsWithPage()
      loadRecentPlugins()
      // 禁用背景滚动，但允许面板内部滚动
      // 注意：参数是要允许滚动的目标元素，即面板本身
      const panelElement = document.querySelector('.plugin-quick-access')
      if (panelElement) {
        disableBodyScroll(panelElement as HTMLElement)
      }
    } else {
      // 恢复背景滚动
      const panelElement = document.querySelector('.plugin-quick-access')
      if (panelElement) {
        enableBodyScroll(panelElement as HTMLElement)
      }
    }
  },
  { immediate: true },
)

onMounted(() => {
  if (isVisible.value) {
    fetchPluginsWithPage()
    loadRecentPlugins()
  }
})

// 组件卸载时确保恢复背景滚动
onUnmounted(() => {
  const panelElement = document.querySelector('.plugin-quick-access')
  if (panelElement) {
    enableBodyScroll(panelElement as HTMLElement)
  }
})

// 处理触摸开始
function handleTouchStart(event: TouchEvent) {
  if (!props.visible) return

  const touch = event.touches[0]
  if (!touch) return

  // 检查是否从 bottom-drag-area 开始触摸
  const target = event.target as HTMLElement
  startedFromBottomArea.value = !!target.closest('.bottom-drag-area')

  // 如果触摸发生在插件网格内，不处理拖拽关闭
  if (target.closest('.plugin-grid')) {
    startedFromBottomArea.value = false
    return
  }

  startY.value = touch.clientY
  lastY.value = touch.clientY
  lastTime.value = Date.now()
  velocity.value = 0

  // 重置拖拽状态
  isDraggingToClose.value = false
  dragOffset.value = 0
}

// 处理触摸移动
function handleTouchMove(event: TouchEvent) {
  if (!props.visible) return

  const touch = event.touches[0]
  if (!touch) return

  // 只有从 bottom-drag-area 开始的触摸才处理上滑关闭
  if (!startedFromBottomArea.value) return

  // 检查当前触摸是否在插件网格内，如果是则不处理拖拽关闭
  const target = event.target as HTMLElement
  if (target.closest('.plugin-grid')) {
    return
  }

  const currentY = touch.clientY
  const currentTime = Date.now()
  const deltaY = startY.value - currentY // 向上为正值
  const timeDelta = currentTime - lastTime.value

  // 计算速度
  if (timeDelta > 0) {
    const moveDistance = lastY.value - currentY
    velocity.value = moveDistance / timeDelta
  }

  // 如果已经开始拖拽，继续拖拽
  if (isDraggingToClose.value) {
    if (deltaY >= 0) {
      // 向上拖拽，更新偏移量
      dragOffset.value = Math.min(deltaY, SWIPE_CONFIG.MAX_DRAG_DISTANCE)
      event.preventDefault()
    } else {
      // 向下拖拽，停止拖拽
      isDraggingToClose.value = false
      dragOffset.value = 0
    }
  } else {
    // 还没开始拖拽，检查是否应该开始
    if (deltaY > SWIPE_CONFIG.START_THRESHOLD) {
      isDraggingToClose.value = true
      dragOffset.value = Math.min(deltaY, SWIPE_CONFIG.MAX_DRAG_DISTANCE)
      event.preventDefault()
    }
  }

  lastY.value = currentY
  lastTime.value = currentTime
}

// 处理触摸结束
function handleTouchEnd() {
  if (!props.visible) return

  // 只有从 bottom-drag-area 开始的触摸才处理上滑关闭
  if (!startedFromBottomArea.value) return

  if (isDraggingToClose.value) {
    // 判断是否应该关闭：距离超过阈值或者快速上滑
    const shouldClose =
      dragOffset.value >= SWIPE_CONFIG.CLOSE_THRESHOLD || velocity.value >= SWIPE_CONFIG.VELOCITY_THRESHOLD

    if (shouldClose) {
      emit('close')
    }

    // 重置拖拽状态
    isDraggingToClose.value = false
    dragOffset.value = 0
  }

  // 重置所有状态
  startY.value = 0
  lastY.value = 0
  velocity.value = 0
  startedFromBottomArea.value = false
}

// 点击底部空白区域关闭
function handleBackdropClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  // 点击根容器或底部提示区域时关闭
  if (
    target.classList.contains('plugin-quick-access') ||
    target.classList.contains('footer-hint') ||
    target.classList.contains('hint-text') ||
    target.classList.contains('bottom-drag-area')
  ) {
    emit('close')
  }
}
</script>

<template>
  <VCard
    :ripple="false"
    class="plugin-quick-access"
    :class="{ 'visible': isVisible }"
    :style="{
      opacity: componentOpacity,
      transform: componentTransform,
      transition: isDraggingToClose ? 'none' : 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
    }"
    @click="handleBackdropClick"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <!-- 顶部指示器 -->
    <div class="top-indicator"></div>

    <!-- 标题栏 -->
    <div class="header">
      <div class="header-title">{{ t('plugin.quickAccess') }}</div>
      <VBtn icon variant="text" @click="handleClose" class="close-btn">
        <VIcon icon="mdi-close" />
      </VBtn>
    </div>

    <!-- 插件网格 -->
    <div class="plugin-grid">
      <!-- 加载状态 -->
      <LoadingBanner v-if="loading" />

      <!-- 最近访问 -->
      <template v-else>
        <div class="section-header">
          <div class="section-title">{{ t('plugin.recentlyUsed') }}</div>
        </div>

        <div v-if="recentPlugins.length > 0" class="recent-plugins-row">
          <div
            v-for="plugin in recentPlugins"
            :key="`recent-${plugin.id}`"
            class="plugin-item"
            @click="handlePluginClick(plugin)"
          >
            <VBadge dot :color="plugin.state ? 'success' : 'secondary'" location="top end">
              <div
                class="plugin-icon"
                :style="{
                  background: `${getPluginBackgroundColor(plugin)}`,
                }"
              >
                <VImg
                  :src="getPluginIcon(plugin)"
                  :alt="plugin.plugin_name"
                  cover
                  @error="handleIconError(plugin)"
                  @load="src => handleIconLoaded(src, plugin)"
                  class="rounded-lg"
                />
              </div>
            </VBadge>
            <div class="plugin-name">{{ plugin.plugin_name }}</div>
          </div>
        </div>

        <!-- 没有最近访问时显示"无" -->
        <div v-else class="no-recent-plugins">
          <VIcon icon="mdi-puzzle-outline" size="24" color="grey" />
        </div>

        <!-- 所有插件 -->
        <div v-if="pluginsWithPage.length > 0" class="section-header with-margin">
          <div class="section-title">{{ t('plugin.allPlugins') }}</div>
        </div>

        <div v-if="pluginsWithPage.length > 0" class="all-plugins-grid">
          <div
            v-for="plugin in pluginsWithPage"
            :key="plugin.id"
            class="plugin-item"
            @click="handlePluginClick(plugin)"
          >
            <VBadge
              dot
              :color="plugin.state ? 'success' : 'secondary'"
              location="top end"
              :offset-x="-1"
              :offset-y="-1"
            >
              <div
                class="plugin-icon"
                :style="{
                  background: `${getPluginBackgroundColor(plugin)}`,
                }"
              >
                <VImg
                  :src="getPluginIcon(plugin)"
                  :alt="plugin.plugin_name"
                  cover
                  @load="src => handleIconLoaded(src, plugin)"
                  @error="handleIconError(plugin)"
                  class="rounded-lg"
                />
              </div>
            </VBadge>
            <div class="plugin-name">{{ plugin.plugin_name }}</div>
          </div>
        </div>

        <!-- 空状态（只有在没有插件时显示） -->
        <div v-else-if="pluginsWithPage.length === 0" class="empty-state">
          <VIcon icon="mdi-puzzle-outline" size="48" color="grey" />
          <div class="empty-text">{{ t('plugin.noPluginsWithPage') }}</div>
        </div>
      </template>
    </div>

    <!-- 底部拖动区域 -->
    <div class="bottom-drag-area" @click="handleBackdropClick">
      <!-- 底部指示器 -->
      <div class="bottom-indicator">
        <div
          class="indicator-bar bottom"
          :class="{ 'dragging': isDraggingToClose }"
          :style="{
            transform: isDraggingToClose
              ? `scaleX(${Math.min(dragOffset / SWIPE_CONFIG.CLOSE_THRESHOLD, 1.5)})`
              : 'scaleX(1)',
            background: isDraggingToClose
              ? dragOffset >= SWIPE_CONFIG.CLOSE_THRESHOLD
                ? 'rgba(var(--v-theme-success), 0.8)'
                : 'rgba(var(--v-theme-primary), 0.8)'
              : 'rgba(var(--v-theme-on-surface), 0.12)',
          }"
        ></div>
      </div>
    </div>
  </VCard>

  <!-- 插件数据弹窗 -->
  <PluginDataDialog
    v-if="showPluginDataDialog && currentPlugin"
    v-model="showPluginDataDialog"
    :plugin="currentPlugin"
    :show_switch="false"
    @close="handleClosePluginDataDialog"
  />
</template>

<style lang="scss" scoped>
.plugin-quick-access {
  position: fixed;
  z-index: 9999;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  backdrop-filter: blur(32px);
  background: rgba(var(--v-theme-surface), 0.95);
  block-size: 100vh;
  block-size: 100dvh;
  inset-block-start: 0;
  inset-inline: 0;
  opacity: 0;
  padding-block: env(safe-area-inset-top) env(safe-area-inset-bottom);
  padding-inline: env(safe-area-inset-left) env(safe-area-inset-right);
  pointer-events: none;
  transform: translateY(-100%);
  transition: all 1s cubic-bezier(0.4, 0, 0.2, 1);

  &.visible {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }
}

.top-indicator {
  display: flex;
  justify-content: center;
  padding-block: 12px 8px;
  padding-inline: 0;
}

// 底部相关样式
.bottom-indicator {
  display: flex;
  justify-content: center;
  padding-block: 8px 12px;
  padding-inline: 0;

  .indicator-bar.bottom {
    border-radius: 2px;
    background: rgba(var(--v-theme-on-surface), 0.12);
    block-size: 4px;
    inline-size: 30vw;
    transform-origin: center;
    transition: all 0.2s ease;
  }
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  padding-block: 0 16px;
  padding-inline: 20px;

  .header-title {
    color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
    font-size: 20px;
    font-weight: 600;
  }

  .close-btn {
    opacity: 0.6;

    &:hover {
      background: rgba(var(--v-theme-on-surface), 0.04);
      opacity: 1;
    }
  }
}

.plugin-grid {
  display: flex;
  overflow: hidden auto;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  max-block-size: calc(100vh - 200px); // 确保有最大高度限制
  min-block-size: 0;
  -webkit-overflow-scrolling: touch;
  -ms-overflow-style: none; // IE/Edge
  overscroll-behavior: contain;
  padding-block: 24px;
  padding-inline: 20px;

  // 隐藏滚动条
  scrollbar-width: none; // Firefox
  touch-action: pan-y;
  will-change: scroll-position;

  &::-webkit-scrollbar {
    display: none; // WebKit 浏览器
  }
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-inline: 0;

  .section-title {
    color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
    font-size: 16px;
    font-weight: 600;
    white-space: nowrap;
  }
}

.no-recent-plugins {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-inline: 0;
}

.recent-plugins-row {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  padding-block: 0;
  padding-inline: 0;
}

.all-plugins-grid {
  display: grid;
  gap: 4px;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
}

.plugin-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  block-size: 120px;
  cursor: pointer;
  gap: 4px;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.04);
    transform: translateY(-2px);
  }

  &:active {
    background: rgba(var(--v-theme-on-surface), 0.08);
    transform: translateY(0);
  }
}

.plugin-icon {
  position: relative;
  display: flex;
  overflow: hidden;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 16px;
  block-size: 64px;
  inline-size: 64px;
  transition: all 0.2s ease;

  .plugin-item:hover & {
    transform: scale(1.02);
  }
}

.plugin-name {
  display: -webkit-box;
  overflow: hidden;
  flex-shrink: 0;
  -webkit-box-orient: vertical;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 12px;
  font-weight: 500;
  -webkit-line-clamp: 2;
  line-height: 1.2;
  max-block-size: 2.4em;
  text-align: center;
  word-break: break-all;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  grid-column: 1 / -1;
  padding-block: 40px;
  padding-inline: 0;

  .empty-text {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    font-size: 14px;
  }
}

.bottom-drag-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  padding-block: 8px 0;
  padding-inline: 20px;
}

@media (hover: none) and (pointer: coarse) {
  .plugin-item:hover {
    background: transparent;
    transform: none;
  }

  .plugin-item:active {
    background: rgba(var(--v-theme-on-surface), 0.08);
  }
}

// 深色模式适配
html[data-theme='dark'] .plugin-quick-access {
  background: rgba(var(--v-theme-surface), 0.9);
}
</style>
