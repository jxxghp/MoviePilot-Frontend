<script setup lang="ts">
import api from '@/api'
import type { Plugin } from '@/api/types'
import { getLogoUrl } from '@/utils/imageUtils'
import { useI18n } from 'vue-i18n'
import { useRecentPlugins } from '@/composables/useRecentPlugins'
import { openSharedDialog } from '@/composables/useSharedDialog'
import PluginDataDialog from '@/components/dialog/PluginDataDialog.vue'
import { getDominantColor } from '@/@core/utils/image'

// 国际化
const { t } = useI18n()

// 插件面板记录与常用插件管理
const { getRecentPlugins, addRecentPlugin, getPinnedPluginIds, togglePinnedPlugin } = useRecentPlugins()

// 输入参数
const props = defineProps<{
  visible: boolean
}>()

// 事件
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'plugin-click', plugin: Plugin): void
}>()

// 有详情页面的插件列表
const pluginsWithPage = ref<Plugin[]>([])

// 最近访问的插件列表
const recentPlugins = ref<Plugin[]>([])

// 用户固定的常用插件 ID
const pinnedPluginIds = ref<string[]>([])

// 搜索关键词
const searchKeyword = ref('')

// 是否处于常用插件编辑状态
const isEditingFavorites = ref(false)

// 是否加载中
const loading = ref(false)

// 各插件的图标加载状态
const pluginIconLoadError = ref<Record<string, boolean>>({})

// 各插件的背景颜色
const pluginBackgroundColors = ref<Record<string, string>>({})

// 底部抽屉的双向可见状态，允许遮罩层和 Esc 主动关闭。
const sheetVisible = computed({
  get: () => props.visible,
  set: value => {
    if (!value) handleClose()
  },
})

// 当前搜索关键词
const normalizedSearchKeyword = computed(() => searchKeyword.value.trim().toLocaleLowerCase())

// 是否正在搜索
const hasSearchKeyword = computed(() => normalizedSearchKeyword.value.length > 0)

// 已安装且可打开的插件 ID，用于清理历史记录中已经失效的入口。
const availablePluginIds = computed(() => new Set(pluginsWithPage.value.map(plugin => plugin.id)))

// 固定的常用插件
const pinnedPlugins = computed(() => {
  const pluginMap = new Map(pluginsWithPage.value.map(plugin => [plugin.id, plugin]))

  return pinnedPluginIds.value
    .map(pluginId => pluginMap.get(pluginId))
    .filter((plugin): plugin is Plugin => Boolean(plugin))
})

// 匹配搜索结果的插件
const filteredPlugins = computed(() => pluginsWithPage.value.filter(matchesPlugin))

// 匹配搜索结果的最近插件
const filteredRecentPlugins = computed(() =>
  recentPlugins.value
    .filter(plugin => availablePluginIds.value.has(plugin.id))
    .filter(plugin => !pinnedPluginIds.value.includes(plugin.id))
    .filter(matchesPlugin),
)

// 处理插件图标加载错误
function handleIconError(plugin: Plugin) {
  pluginIconLoadError.value[plugin.id] = true
}

// 处理插件图标加载完成
async function handleIconLoaded(src: string | undefined, plugin: Plugin) {
  if (!src) return

  try {
    // 创建临时图片获取插件主色，避免列表卡片在加载时出现突兀的空白背景。
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = async () => {
      try {
        pluginBackgroundColors.value[plugin.id] = await getDominantColor(img)
      } catch (error) {
        pluginBackgroundColors.value[plugin.id] = '#28A9E1'
      }
    }
    img.onerror = () => {
      pluginBackgroundColors.value[plugin.id] = '#28A9E1'
    }
    img.src = src
  } catch (error) {
    pluginBackgroundColors.value[plugin.id] = '#28A9E1'
  }
}

// 获取插件背景颜色
function getPluginBackgroundColor(plugin: Plugin): string {
  return pluginBackgroundColors.value[plugin.id] || '#28A9E1'
}

// 计算插件图标路径
function getPluginIcon(plugin: Plugin): string {
  if (!plugin.plugin_icon) return getLogoUrl('plugin')
  if (pluginIconLoadError.value[plugin.id]) return getLogoUrl('plugin')

  // 网络图片统一经过后端代理，避免跨域导致主色提取失败。
  if (plugin.plugin_icon.startsWith('http')) {
    return `${import.meta.env.VITE_API_BASE_URL}system/img/1?imgurl=${encodeURIComponent(
      plugin.plugin_icon,
    )}&cache=true`
  }

  return `./plugin_icon/${plugin.plugin_icon}`
}

// 判断插件是否匹配当前搜索关键词。
function matchesPlugin(plugin: Plugin): boolean {
  const keyword = normalizedSearchKeyword.value
  if (!keyword) return true

  return [plugin.plugin_name, plugin.id].some(value => value?.toLocaleLowerCase().includes(keyword))
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

    // 只保留已安装且提供详情页面的插件。
    pluginsWithPage.value = allPlugins
      .filter(plugin => plugin.has_page)
      .sort((a, b) => (a.plugin_name || '').localeCompare(b.plugin_name || ''))
  } catch (error) {
    console.error('获取插件列表失败:', error)
  } finally {
    loading.value = false
  }
}

// 加载最近访问和常用插件
function loadPluginAccessState() {
  recentPlugins.value = getRecentPlugins()
  pinnedPluginIds.value = getPinnedPluginIds()
}

// 切换插件固定状态
function togglePluginPin(plugin: Plugin) {
  if (!plugin.id) return

  pinnedPluginIds.value = togglePinnedPlugin(plugin.id)
}

// 判断插件是否已固定
function isPinned(plugin: Plugin): boolean {
  return Boolean(plugin.id && pinnedPluginIds.value.includes(plugin.id))
}

// 打开插件面板
function handlePluginClick(plugin: Plugin) {
  addRecentPlugin(plugin)
  loadPluginAccessState()

  emit('plugin-click', plugin)

  openSharedDialog(
    PluginDataDialog,
    {
      plugin,
      show_switch: false,
    },
    {},
    { closeOn: ['close', 'update:modelValue'] },
  )
}

// 关闭面板并清理本次搜索状态。
function handleClose() {
  searchKeyword.value = ''
  isEditingFavorites.value = false
  emit('close')
}

// 监听可见性变化，打开时刷新插件与访问记录。
watch(
  () => props.visible,
  visible => {
    if (!visible) return

    searchKeyword.value = ''
    isEditingFavorites.value = false
    loadPluginAccessState()
    void fetchPluginsWithPage()
  },
  { immediate: true },
)
</script>

<template>
  <VBottomSheet
    v-model="sheetVisible"
    inset
    scroll-strategy="block"
    content-class="plugin-quick-access-sheet"
    :scrim="true"
  >
    <VCard
      :ripple="false"
      class="plugin-quick-access app-surface-square app-surface-flat app-surface-borderless"
      role="dialog"
      :aria-label="t('plugin.quickAccess')"
    >
      <div class="sheet-handle" aria-hidden="true"><span></span></div>

      <div class="header">
        <div class="header-copy">
          <div class="header-title">{{ t('plugin.quickAccess') }}</div>
        </div>
        <div class="header-actions">
          <VBtn
            v-if="pluginsWithPage.length > 0"
            class="edit-btn"
            icon
            variant="text"
            size="small"
            :aria-label="t(isEditingFavorites ? 'plugin.doneEditingFavorites' : 'plugin.editFavorites')"
            :title="t(isEditingFavorites ? 'plugin.doneEditingFavorites' : 'plugin.editFavorites')"
            :aria-pressed="isEditingFavorites"
            @click="isEditingFavorites = !isEditingFavorites"
          >
            <VIcon :icon="isEditingFavorites ? 'mdi-check' : 'mdi-tune-variant'" />
          </VBtn>
          <VBtn icon variant="text" class="close-btn" :aria-label="t('common.close')" @click="handleClose">
            <VIcon icon="mdi-close" />
          </VBtn>
        </div>
      </div>

      <div class="search-wrap">
        <VTextField
          v-model="searchKeyword"
          class="plugin-search"
          variant="solo-filled"
          density="comfortable"
          hide-details
          clearable
          prepend-inner-icon="mdi-magnify"
          :placeholder="t('plugin.quickAccessSearchPlaceholder')"
          :aria-label="t('plugin.quickAccessSearchPlaceholder')"
        />
      </div>

      <div class="plugin-grid">
        <LoadingBanner v-if="loading" />

        <template v-else>
          <section v-if="!hasSearchKeyword" class="plugin-section" :aria-label="t('plugin.favorites')">
            <div class="section-header">
              <div class="section-heading">
                <div class="section-title">{{ t('plugin.favorites') }}</div>
                <span class="section-count">{{ pinnedPlugins.length }}</span>
              </div>
            </div>

            <div v-if="pinnedPlugins.length > 0" class="plugin-grid-row">
              <div v-for="plugin in pinnedPlugins" :key="`favorite-${plugin.id}`" class="plugin-tile-wrapper">
                <button
                  type="button"
                  class="plugin-item app-surface-shape"
                  :aria-label="plugin.plugin_name"
                  @click="handlePluginClick(plugin)"
                >
                  <VBadge dot :color="plugin.state ? 'success' : 'secondary'" location="top end">
                    <div class="plugin-icon" :style="{ background: getPluginBackgroundColor(plugin) }">
                      <VImg
                        :src="getPluginIcon(plugin)"
                        :alt="plugin.plugin_name"
                        cover
                        class="rounded-lg"
                        @error="handleIconError(plugin)"
                        @load="src => handleIconLoaded(src, plugin)"
                      />
                    </div>
                  </VBadge>
                  <div class="plugin-name">{{ plugin.plugin_name }}</div>
                </button>
                <VBtn
                  v-if="isEditingFavorites"
                  icon
                  size="x-small"
                  variant="tonal"
                  color="primary"
                  class="pin-btn"
                  :aria-label="t('plugin.unpinPlugin', { name: plugin.plugin_name })"
                  @click.stop="togglePluginPin(plugin)"
                >
                  <VIcon icon="mdi-star" size="16" />
                </VBtn>
              </div>
            </div>

            <div v-else class="favorites-empty">
              <VIcon icon="mdi-star-outline" size="22" />
              <span>{{ t('plugin.favoritesHint') }}</span>
            </div>
          </section>

          <section v-if="!hasSearchKeyword && filteredRecentPlugins.length > 0" class="plugin-section">
            <div class="section-header">
              <div class="section-heading">
                <div class="section-title">{{ t('plugin.recentlyUsed') }}</div>
                <span class="section-count">{{ filteredRecentPlugins.length }}</span>
              </div>
            </div>

            <div class="plugin-grid-row">
              <div v-for="plugin in filteredRecentPlugins" :key="`recent-${plugin.id}`" class="plugin-tile-wrapper">
                <button
                  type="button"
                  class="plugin-item app-surface-shape"
                  :aria-label="plugin.plugin_name"
                  @click="handlePluginClick(plugin)"
                >
                  <VBadge dot :color="plugin.state ? 'success' : 'secondary'" location="top end">
                    <div class="plugin-icon" :style="{ background: getPluginBackgroundColor(plugin) }">
                      <VImg
                        :src="getPluginIcon(plugin)"
                        :alt="plugin.plugin_name"
                        cover
                        class="rounded-lg"
                        @error="handleIconError(plugin)"
                        @load="src => handleIconLoaded(src, plugin)"
                      />
                    </div>
                  </VBadge>
                  <div class="plugin-name">{{ plugin.plugin_name }}</div>
                </button>
                <VBtn
                  v-if="isEditingFavorites"
                  icon
                  size="x-small"
                  variant="tonal"
                  :color="isPinned(plugin) ? 'primary' : undefined"
                  class="pin-btn"
                  :aria-label="
                    t(isPinned(plugin) ? 'plugin.unpinPlugin' : 'plugin.pinPlugin', { name: plugin.plugin_name })
                  "
                  @click.stop="togglePluginPin(plugin)"
                >
                  <VIcon :icon="isPinned(plugin) ? 'mdi-star' : 'mdi-star-outline'" size="16" />
                </VBtn>
              </div>
            </div>
          </section>

          <section class="plugin-section">
            <div class="section-header">
              <div class="section-heading">
                <div class="section-title">{{ t('plugin.allPlugins') }}</div>
                <span class="section-count">{{ filteredPlugins.length }}</span>
              </div>
            </div>

            <div v-if="filteredPlugins.length > 0" class="plugin-grid-row all-plugins-grid">
              <div v-for="plugin in filteredPlugins" :key="plugin.id" class="plugin-tile-wrapper">
                <button
                  type="button"
                  class="plugin-item app-surface-shape"
                  :aria-label="plugin.plugin_name"
                  @click="handlePluginClick(plugin)"
                >
                  <VBadge
                    dot
                    :color="plugin.state ? 'success' : 'secondary'"
                    location="top end"
                    :offset-x="-1"
                    :offset-y="-1"
                  >
                    <div class="plugin-icon" :style="{ background: getPluginBackgroundColor(plugin) }">
                      <VImg
                        :src="getPluginIcon(plugin)"
                        :alt="plugin.plugin_name"
                        cover
                        class="rounded-lg"
                        @load="src => handleIconLoaded(src, plugin)"
                        @error="handleIconError(plugin)"
                      />
                    </div>
                  </VBadge>
                  <div class="plugin-name">{{ plugin.plugin_name }}</div>
                </button>
                <VBtn
                  v-if="isEditingFavorites"
                  icon
                  size="x-small"
                  variant="tonal"
                  :color="isPinned(plugin) ? 'primary' : undefined"
                  class="pin-btn"
                  :aria-label="
                    t(isPinned(plugin) ? 'plugin.unpinPlugin' : 'plugin.pinPlugin', { name: plugin.plugin_name })
                  "
                  @click.stop="togglePluginPin(plugin)"
                >
                  <VIcon :icon="isPinned(plugin) ? 'mdi-star' : 'mdi-star-outline'" size="16" />
                </VBtn>
              </div>
            </div>

            <div v-else class="empty-state">
              <VIcon icon="mdi-magnify-close" size="42" />
              <div class="empty-text">
                {{ hasSearchKeyword ? t('plugin.noMatchingContent') : t('plugin.noPluginsWithPage') }}
              </div>
            </div>
          </section>
        </template>
      </div>
    </VCard>
  </VBottomSheet>
</template>

<style lang="scss" scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

:deep(.plugin-quick-access-sheet) {
  inline-size: min(100%, 720px);
  max-block-size: min(84dvh, 720px);
  margin-inline: auto;
}

:deep(.plugin-quick-access-sheet > .v-card) {
  max-block-size: min(84dvh, 720px);
}

.plugin-quick-access {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  background: rgba(var(--v-theme-surface), 0.98);
  min-block-size: min(38rem, 84dvh);
  padding-block-end: env(safe-area-inset-bottom);
}

.sheet-handle {
  display: flex;
  justify-content: center;
  padding-block: 10px 4px;
}

.sheet-handle span {
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.2);
  block-size: 4px;
  inline-size: 2.25rem;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  padding-block: 0 14px;
  padding-inline: 20px;
}

.header-copy {
  min-inline-size: 0;
}

.header-title {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 20px;
  font-weight: 700;
  line-height: 1.25;
}

.header-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;
}

.edit-btn {
  min-inline-size: auto;
  padding-inline: 8px;
}

.close-btn {
  opacity: 0.72;

  &:hover {
    opacity: 1;
  }
}

.search-wrap {
  padding-block: 14px 4px;
  padding-inline: 20px;
}

.plugin-search {
  :deep(.v-field) {
    border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
    border-radius: 14px;
    background: rgba(var(--v-theme-on-surface), 0.045);
    box-shadow: none;
  }

  :deep(.v-field__input) {
    min-block-size: 42px;
  }
}

.plugin-grid {
  display: flex;
  overflow-y: auto;
  flex: 1;
  flex-direction: column;
  gap: 22px;
  min-block-size: 0;
  overscroll-behavior: contain;
  padding-block: 14px 20px;
  padding-inline: 20px;
  scrollbar-width: none;
  touch-action: pan-y;
}

.plugin-grid::-webkit-scrollbar {
  display: none;
}

.plugin-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-heading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-inline-size: 0;
}

.section-title {
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
}

.section-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 11px;
  font-weight: 600;
  min-block-size: 20px;
  min-inline-size: 20px;
  padding-inline: 6px;
}

.plugin-grid-row {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
}

.plugin-tile-wrapper {
  position: relative;
  min-inline-size: 0;
}

.plugin-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  cursor: pointer;
  inline-size: 100%;
  min-block-size: 98px;
  padding-block: 10px;
  padding-inline: 4px;
  text-align: center;
  transition:
    background 140ms ease,
    transform 140ms ease;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.06);
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
  }

  &:active {
    background: rgba(var(--v-theme-on-surface), 0.1);
    transform: translateY(0);
  }
}

.plugin-icon {
  display: flex;
  overflow: hidden;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 15px;
  block-size: 56px;
  inline-size: 56px;
  padding: 4px;
}

.plugin-name {
  display: -webkit-box;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font-size: 12px;
  font-weight: 500;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  line-height: 1.2;
  max-block-size: 2.4em;
  text-align: center;
  word-break: break-word;
}

.pin-btn {
  position: absolute;
  z-index: 1;
  // 将编辑控件固定在左上角，避免遮住插件图标右上角的运行状态徽标。
  inset-block-start: 3px;
  inset-inline-start: 2px;
  border: 1px solid rgba(var(--v-theme-surface), 0.72);
}

.favorites-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.16);
  border-radius: 14px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 13px;
  min-block-size: 54px;
  padding-block: 12px;
  padding-inline: 14px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  padding-block: 36px;
  padding-inline: 12px;
  text-align: center;
}

.empty-text {
  font-size: 14px;
}

@media (width <= 420px) {
  .header {
    padding-inline: 16px;
  }

  .search-wrap,
  .plugin-grid {
    padding-inline: 16px;
  }

  .plugin-grid-row {
    gap: 6px;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .plugin-item {
    min-block-size: 92px;
  }

  .plugin-icon {
    block-size: 52px;
    inline-size: 52px;
  }
}

@media (hover: none) and (pointer: coarse) {
  .plugin-item:hover {
    background: transparent;
    transform: none;
  }

  .plugin-item:active {
    background: rgba(var(--v-theme-on-surface), 0.1);
  }
}
</style>
