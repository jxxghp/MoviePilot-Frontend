<script setup lang="ts">
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import { getApiErrorMessage } from '@/api'
import type { PluginInstancePurgeRequest } from '@/api/types'
import { purgePluginInstance, uninstallPluginInstance } from '@/api/pluginVersion'

// 多语言
const { t } = useI18n()

// 提示框
const $toast = useToast()

const props = defineProps({
  modelValue: Boolean,
  instanceId: { type: String, required: true },
  instanceName: { type: String, default: '' },
  isHost: Boolean,
  /** 本体名下仍在册的分身名称；非空时卸载本体必须级联。 */
  cloneLabels: { type: Array as () => string[], default: () => [] },
})

const emit = defineEmits(['update:modelValue', 'close', 'uninstalled'])

const visible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

/**
 * 附带清除的范围，默认全不勾。
 *
 * 卸载本身只把实例摘出在册状态，配置与数据原样留着等恢复——这正是它与「彻底
 * 清理」的区别。默认勾上任何一项都会把「卸载」悄悄变成不可逆操作，而用户在这个
 * 对话框上看到的标题只写着卸载。
 */
const purge = reactive<PluginInstancePurgeRequest>({
  config: false,
  plugin_data: false,
  own_database: false,
  data_directory: false,
})

const submitting = ref(false)

const willPurge = computed(() => purge.config || purge.plugin_data || purge.own_database || purge.data_directory)

const label = computed(() => props.instanceName || props.instanceId)

const cascadeWarning = computed(() => props.isHost && props.cloneLabels.length > 0)

watch(visible, opened => {
  if (!opened) return
  purge.config = false
  purge.plugin_data = false
  purge.own_database = false
  purge.data_directory = false
  submitting.value = false
})

/**
 * 先卸载，再按勾选清除。
 *
 * 顺序不能反：清除要先停掉实例才能安全销毁自有库与目录，而卸载序列本身就包含
 * 停止。清除失败不回滚卸载——卸载已经生效且可恢复，把它撤回反而更难解释。
 */
async function submit() {
  if (submitting.value) return
  submitting.value = true
  try {
    await uninstallPluginInstance(props.instanceId, props.isHost)
    if (willPurge.value) {
      await purgePluginInstance(props.instanceId, { ...purge })
    }
    $toast.success(t('plugin.instanceUninstallSuccess', { name: label.value }))
    emit('uninstalled', { purged: willPurge.value })
    visible.value = false
    emit('close')
  } catch (error) {
    $toast.error(
      t('plugin.instanceUninstallFailed', {
        message: getApiErrorMessage(error) || t('common.serverConnectionFailed'),
      }),
    )
  } finally {
    submitting.value = false
  }
}

function cancel() {
  visible.value = false
  emit('close')
}
</script>

<template>
  <VDialog v-model="visible" max-width="34rem" scrollable>
    <VCard>
      <VCardItem>
        <template #prepend>
          <VIcon icon="mdi-trash-can-outline" color="warning" class="me-2" />
        </template>
        <VCardTitle>{{ t('plugin.instanceUninstallTitle', { name: label }) }}</VCardTitle>
      </VCardItem>
      <VDialogCloseBtn v-model="visible" />
      <VDivider />
      <VCardText>
        <VAlert
          type="info"
          variant="tonal"
          density="compact"
          class="mb-3"
          :text="props.isHost ? t('plugin.uninstallKeepsHostSettings') : t('plugin.uninstallKeepsCloneSettings')"
        />

        <VAlert
          v-if="cascadeWarning"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-3"
          :text="t('plugin.uninstallCascadeWarning', { clones: props.cloneLabels.join('、') })"
        />

        <div class="text-subtitle-2 mb-1">{{ t('plugin.uninstallAlsoPurgeTitle') }}</div>
        <div class="text-caption text-medium-emphasis mb-2">{{ t('plugin.uninstallAlsoPurgeHint') }}</div>

        <VCheckbox
          v-model="purge.config"
          density="compact"
          hide-details
          data-testid="uninstall-purge-config"
          :label="t('plugin.purgeScopeConfig')"
        />
        <VCheckbox
          v-model="purge.plugin_data"
          density="compact"
          hide-details
          data-testid="uninstall-purge-plugin-data"
          :label="t('plugin.purgeScopePluginData')"
        />
        <VCheckbox
          v-model="purge.own_database"
          density="compact"
          hide-details
          data-testid="uninstall-purge-own-database"
          :label="t('plugin.purgeScopeOwnDatabase')"
        />
        <VCheckbox
          v-model="purge.data_directory"
          density="compact"
          hide-details
          color="error"
          data-testid="uninstall-purge-data-directory"
          :label="t('plugin.purgeScopeDataDirectory', { id: props.instanceId })"
        />

        <VAlert
          v-if="willPurge"
          type="error"
          variant="tonal"
          density="compact"
          class="mt-3"
          :text="t('plugin.uninstallPurgeIrreversible')"
        />
      </VCardText>
      <VDivider />
      <VCardActions>
        <VSpacer />
        <VBtn variant="text" @click="cancel">{{ t('common.cancel') }}</VBtn>
        <VBtn
          :color="willPurge ? 'error' : 'warning'"
          variant="flat"
          :loading="submitting"
          data-testid="uninstall-submit"
          @click="submit"
        >
          {{ willPurge ? t('plugin.uninstallAndPurgeConfirm') : t('plugin.uninstallConfirm') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
