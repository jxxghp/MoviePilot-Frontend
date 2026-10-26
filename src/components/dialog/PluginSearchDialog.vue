<script lang="ts" setup>
import { getLogoUrl } from '@/utils/imageUtils'
import type { Plugin } from '@/api/types'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'
import { useWindowSize } from '@vueuse/core'

const props = defineProps({
  keyword: {
    type: String,
    default: '',
  },
  modelValue: {
    type: Boolean,
    default: true,
  },
  plugins: {
    type: Array as PropType<Plugin[]>,
    default: () => [],
  },
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'open-plugin', plugin: Plugin): void
  (event: 'update:keyword', value: string): void
  (event: 'update:modelValue', value: boolean): void
}>()

const { t } = useI18n()
const display = useDisplay()
// 随软键盘和浏览器工具栏变化收窄弹窗高度，列表只使用当前可见区域。
const { height: viewportHeight } = useWindowSize({ type: 'visual' })
const pluginIconLoaded = ref<Record<string, boolean>>({})

const dialogVisible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const searchKeyword = computed({
  get: () => props.keyword,
  set: value => emit('update:keyword', value),
})

// 返回插件图标地址，并在远程图标失败后回退到默认图标。
function pluginIcon(item: Plugin) {
  if (pluginIconLoaded.value[item.id || '0'] === false) return getLogoUrl('plugin')
  if (item?.plugin_icon?.startsWith('http')) {
    return `${import.meta.env.VITE_API_BASE_URL}system/img/1?imgurl=${encodeURIComponent(item?.plugin_icon)}&cache=true`
  }

  return `./plugin_icon/${item?.plugin_icon}`
}

// 标记指定插件图标加载失败。
function pluginIconError(item: Plugin) {
  pluginIconLoaded.value[item.id || '0'] = false
}

// 获取插件标签列表。
function pluginLabels(label: string | undefined) {
  if (!label) return []
  return label.split(',')
}

// 关闭搜索弹窗并通知共享弹窗 Host 回收实例。
function closeDialog() {
  emit('close')
  emit('update:modelValue', false)
}
</script>

<template>
  <VDialog
    v-model="dialogVisible"
    scrollable
    class="plugin-search-overlay"
    max-width="40rem"
    :max-height="display.mdAndUp.value ? Math.round(viewportHeight * 0.85) : viewportHeight"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard class="plugin-search-dialog">
      <VCardItem class="plugin-search-header" data-native-dialog-header>
        <VCardTitle data-native-dialog-title>{{ t('plugin.searchPlugins') }}</VCardTitle>
      </VCardItem>
      <VDialogCloseBtn @click="closeDialog" />
      <VDivider />
      <VCardText class="flex-grow-0 flex-shrink-0 px-4 py-3">
        <VTextField
          v-model="searchKeyword"
          :aria-label="t('plugin.searchPlugins')"
          :mobile-layout="false"
          single-line
          :placeholder="t('plugin.searchPlaceholder')"
          variant="solo"
          density="compact"
          prepend-inner-icon="mdi-magnify"
          flat
          autofocus
          hide-details
          class="plugin-search-input"
        />
      </VCardText>
      <VCardText class="plugin-search-results pa-0">
        <VList v-if="plugins.length > 0" class="plugin-search-list">
          <VVirtualScroll :items="plugins" class="plugin-search-scroll">
            <template #default="{ item }">
              <VListItem class="plugin-search-result" @click="emit('open-plugin', item)">
                <template #prepend>
                  <VAvatar>
                    <VImg :src="pluginIcon(item)" @error="pluginIconError(item)">
                      <template #placeholder>
                        <div class="w-full h-full">
                          <VSkeletonLoader class="object-cover aspect-w-1 aspect-h-1" />
                        </div>
                      </template>
                    </VImg>
                  </VAvatar>
                </template>
                <div class="plugin-search-result-heading">
                  <VListItemTitle class="plugin-search-result-name">{{ item.plugin_name }}</VListItemTitle>
                  <span class="plugin-search-result-version text-caption text-medium-emphasis">
                    v{{ item.plugin_version }}
                  </span>
                  <VIcon v-if="item.installed" color="success" icon="mdi-check-circle" size="small" />
                </div>
                <p class="plugin-search-result-description text-body-2 text-medium-emphasis">{{ item.plugin_desc }}</p>
                <div v-if="item.plugin_label" class="plugin-search-result-labels">
                  <VChip
                    v-for="label in pluginLabels(item.plugin_label)"
                    :key="label"
                    variant="tonal"
                    size="small"
                    color="info"
                    label
                  >
                    {{ label }}
                  </VChip>
                </div>
              </VListItem>
            </template>
          </VVirtualScroll>
        </VList>
        <div v-else class="plugin-search-empty text-medium-emphasis">{{ t('plugin.noMatchingContent') }}</div>
      </VCardText>
    </VCard>
  </VDialog>
</template>
<style lang="scss" scoped>
.plugin-search-dialog {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  min-inline-size: 0;
  max-inline-size: 100%;
}

.plugin-search-input {
  min-inline-size: 0;
}

.plugin-search-results,
.plugin-search-list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
  min-inline-size: 0;
}

.plugin-search-list {
  padding-block: 0;
  border-radius: 0 !important;
}

.plugin-search-scroll {
  overflow-x: hidden;
  flex: 1 1 auto;
  min-block-size: 0;
}

.plugin-search-result {
  align-items: start;
  padding-block: 12px;
  padding-inline: 16px;
}

.plugin-search-result-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  min-inline-size: 0;
}

.plugin-search-result-name {
  flex: 0 1 auto;
  white-space: normal;
  overflow-wrap: anywhere;
}

.plugin-search-result-version {
  flex: 0 0 auto;
}

.plugin-search-result-description {
  display: -webkit-box;
  overflow: hidden;
  margin-block: 4px 0;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.plugin-search-result-labels {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-block-start: 6px;

  .v-chip {
    max-inline-size: 100%;
  }
}

.plugin-search-empty {
  padding: 32px 16px;
  text-align: center;
}
</style>
