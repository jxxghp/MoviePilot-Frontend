<script lang="ts" setup>
import * as Mousetrap from 'mousetrap'
import SearchBarDialog from '@/components/dialog/SearchBarDialog.vue'
import { openSharedDialog } from '@/composables/useSharedDialog'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

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
</script>

<template>
  <!-- 小屏：仅图标按钮 -->
  <IconBtn v-if="!display.mdAndUp.value" @click="openSearchDialog">
    <VIcon icon="mdi-magnify" />
  </IconBtn>

  <!-- 中屏及以上：胶囊搜索触发栏 -->
  <div v-else class="search-trigger" @click="openSearchDialog">
    <VIcon icon="mdi-magnify" size="18" class="search-trigger-icon" />
    <span class="search-trigger-text">{{ t('common.search') }}</span>
    <kbd class="search-trigger-kbd">{{ metaKey }}</kbd>
  </div>
</template>

<style scoped>
.search-trigger {
  display: flex;
  align-items: center;
  border: 1.5px solid rgba(var(--v-theme-primary), 0.6);
  border-radius: 22px;
  block-size: 36px;
  cursor: pointer;
  gap: 8px;
  padding-inline: 12px;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease;
  user-select: none;
}

.search-trigger:hover {
  border-color: rgb(var(--v-theme-primary));
  background-color: rgba(var(--v-theme-on-surface), 0.06);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 4%);
}

.search-trigger-icon {
  flex-shrink: 0;
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.search-trigger-text {
  color: rgba(var(--v-theme-on-surface), 0.4);
  font-size: 13.5px;
  line-height: 1;
  white-space: nowrap;
}

.search-trigger-kbd {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 5px;
  background-color: rgba(var(--v-theme-on-surface), 0.04);
  color: rgba(var(--v-theme-on-surface), 0.4);
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  margin-inline-start: 4px;
  padding-block: 3px;
  padding-inline: 5px;
}
</style>
