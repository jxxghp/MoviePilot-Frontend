<script setup lang="ts">
import api from '@/api'
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

const loading = ref(false)
const loadError = ref('')
const pluginDetail = ref<Plugin | null>(null)

// 弹窗显示状态
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

const resolvedPlugin = computed(() => pluginDetail.value ?? props.plugin)

const resolvedHistory = computed(() => resolvedPlugin.value?.history || {})

const hasHistory = computed(() => Object.keys(resolvedHistory.value).length > 0)

async function loadPluginHistory() {
  if (!props.plugin?.id) {
    pluginDetail.value = null
    loadError.value = ''
    return
  }

  loading.value = true
  loadError.value = ''

  try {
    pluginDetail.value = await api.get(`plugin/history/${props.plugin.id}`, {
      params: {
        force: true,
      },
    })
  } catch (error) {
    pluginDetail.value = null
    loadError.value = t('plugin.updateHistoryLoadFailed')
    console.error(error)
  } finally {
    loading.value = false
  }
}

/** 触发插件更新操作。 */
function handleUpdate() {
  emit('update')
}

watch(
  () => [visible.value, props.plugin?.id],
  ([isVisible]) => {
    if (isVisible) loadPluginHistory()
  },
  { immediate: true },
)
</script>

<template>
  <VDialog v-if="visible" v-model="visible" width="600" max-height="85vh" scrollable>
    <VCard :title="t('plugin.updateHistoryTitle', { name: resolvedPlugin?.plugin_name })">
      <VDialogCloseBtn v-model="visible" />
      <VDivider />
      <div v-if="loading" class="plugin-version-history-dialog__loading">
        <VProgressCircular indeterminate color="primary" />
      </div>
      <VCardText v-else-if="loadError && !hasHistory">
        <VAlert type="warning" variant="tonal" density="compact" :text="loadError" />
      </VCardText>
      <VCardText v-else-if="!hasHistory">
        <VAlert type="info" variant="tonal" density="compact" :text="t('plugin.updateHistoryEmpty')" />
      </VCardText>
      <VersionHistory v-else :history="resolvedHistory" />
      <template v-if="props.showUpdateAction">
        <VDivider />
        <VCardItem>
          <VAlert
            v-if="resolvedPlugin?.system_version_compatible === false"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-3"
            :text="resolvedPlugin?.system_version_message || t('plugin.incompatibleSystemVersion')"
          />
          <VBtn @click="handleUpdate" block :disabled="resolvedPlugin?.system_version_compatible === false">
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

<style scoped>
.plugin-version-history-dialog__loading {
  min-height: 12rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
