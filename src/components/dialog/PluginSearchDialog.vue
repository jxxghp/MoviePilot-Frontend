<script lang="ts" setup>
import { getLogoUrl } from '@/utils/imageUtils'
import type { Plugin } from '@/api/types'
import { useDisplay } from 'vuetify'
import { useI18n } from 'vue-i18n'

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
    max-width="40rem"
    :max-height="!display.mdAndUp.value ? '' : '85vh'"
    :fullscreen="!display.mdAndUp.value"
  >
    <VCard class="mx-auto" width="100%">
      <VToolbar flat class="p-0">
        <VTextField
          v-model="searchKeyword"
          :label="t('plugin.searchPlugins')"
          single-line
          :placeholder="t('plugin.searchPlaceholder')"
          variant="solo"
          prepend-inner-icon="mdi-magnify"
          flat
          class="mx-1"
        />
      </VToolbar>
      <VDialogCloseBtn @click="closeDialog" />
      <VList v-if="plugins.length > 0" class="plugin-search-list" lines="two">
        <VVirtualScroll :items="plugins">
          <template #default="{ item }">
            <VListItem @click="emit('open-plugin', item)">
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
              <VListItemTitle>
                {{ item.plugin_name }}<span class="text-sm ms-2 mt-1 text-gray-500">v{{ item?.plugin_version }}</span>
                <VIcon v-if="item.installed" color="success" icon="mdi-check-circle" class="ms-2" size="small" />
              </VListItemTitle>
              <VListItemSubtitle>
                <VChip
                  v-for="label in pluginLabels(item.plugin_label)"
                  :key="label"
                  variant="tonal"
                  size="small"
                  class="me-1 my-1"
                  color="info"
                  label
                >
                  {{ label }}
                </VChip>
                {{ item.plugin_desc }}
              </VListItemSubtitle>
            </VListItem>
          </template>
        </VVirtualScroll>
      </VList>
    </VCard>
  </VDialog>
</template>
<style lang="scss" scoped>
.plugin-search-list {
  border-radius: 0 !important;
}
</style>
