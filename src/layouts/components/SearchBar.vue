<script lang="ts" setup>
import * as Mousetrap from 'mousetrap'
import SearchBarDialog from '@/components/dialog/SearchBarDialog.vue'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{
    iconOnly?: boolean
  }>(),
  {
    iconOnly: false,
  },
)

const display = useDisplay()
const { t } = useI18n()

// 注册快捷键
Mousetrap.bind(['command+k', 'ctrl+k'], openSearchDialog)

/** 打开全局共享搜索弹窗。 */
function openSearchDialog() {
  openSharedDialog(SearchBarDialog, {}, {}, { closeOn: ['close', 'update:modelValue'] })
  return false
}

/** 检测操作系统是否是 Mac。 */
function isMac() {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0
}
// 计算属性：根据操作系统显示不同的按键提示
const metaKey = computed(() => (isMac() ? '⌘+K' : 'Ctrl+K'))
const showIconOnly = computed(() => props.iconOnly || !display.mdAndUp.value)
</script>

<template>
  <!-- 小屏或水平导航右侧工具区：仅显示搜索图标。 -->
  <IconBtn v-if="showIconOnly" class="search-icon-trigger" @click="openSearchDialog">
    <VIcon class="search-icon-trigger__icon" icon="mdi-magnify" />
  </IconBtn>

  <!-- 中屏及以上：胶囊搜索触发栏 -->
  <div v-else class="search-trigger" @click="openSearchDialog">
    <VIcon icon="mdi-magnify" size="30" class="search-trigger-icon" />
    <span class="search-trigger-text">{{ t('common.search') }}</span>
    <kbd class="search-trigger-kbd">{{ metaKey }}</kbd>
  </div>
</template>

<style scoped>
.search-trigger {
  display: flex;
  align-items: center;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 999px;
  background: rgba(var(--v-theme-surface), 0.44);
  block-size: 44px;
  cursor: pointer;
  gap: 12px;
  min-inline-size: 168px;
  padding-inline: 18px 10px;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease;
  user-select: none;
}

.search-trigger:hover {
  border-color: rgba(var(--v-theme-on-surface), 0.18);
  background-color: rgba(var(--v-theme-surface), 0.62);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 6%);
}

.search-trigger-icon {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 1.8rem;
}

.search-trigger-text {
  color: rgba(var(--v-theme-on-surface), 0.42);
  font-size: 1rem;
  line-height: 1;
  white-space: nowrap;
}

.search-trigger-kbd {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 8px;
  background-color: rgba(var(--v-theme-surface), 0.5);
  color: rgba(var(--v-theme-on-surface), 0.42);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1;
  margin-inline-start: 4px;
  padding-block: 6px;
  padding-inline: 8px;
}

html[data-theme='transparent'] .search-trigger,
.v-theme--transparent .search-trigger {
  backdrop-filter: none;
  background: rgba(var(--v-theme-surface), var(--transparent-opacity-light, 0.2));
}

.search-icon-trigger {
  flex: 0 0 auto;
}

.search-icon-trigger__icon {
  transform: scaleX(-1);
}
</style>
