<script setup lang="ts">
import type { Plugin } from '@/api/types'
import VersionHistory from '@/components/misc/VersionHistory.vue'
import { useI18n } from 'vue-i18n'

// 多语言
const { t } = useI18n()

// 输入参数
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: true,
  },
  plugin: {
    type: Object as PropType<Plugin>,
    required: true,
  },
  showUpdateAction: {
    type: Boolean,
    default: false,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close', 'update'])

// 弹窗显示状态
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

/** 触发插件更新操作。 */
function handleUpdate() {
  emit('update')
}
</script>

<template>
  <VDialog v-if="visible" v-model="visible" width="600" max-height="85vh" scrollable>
    <VCard :title="t('plugin.updateHistoryTitle', { name: props.plugin?.plugin_name })">
      <VDialogCloseBtn v-model="visible" />
      <VDivider />
      <VersionHistory :history="props.plugin?.history" />
      <template v-if="props.showUpdateAction">
        <VDivider />
        <VCardItem>
          <VBtn @click="handleUpdate" block>
            <template #prepend>
              <VIcon icon="mdi-arrow-up-circle-outline" />
            </template>
            {{ t('plugin.updateToLatest') }}
          </VBtn>
        </VCardItem>
      </template>
    </VCard>
  </VDialog>
</template>
