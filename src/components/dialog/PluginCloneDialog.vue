<script setup lang="ts">
import {
  CLONE_SUFFIX_MAX_LENGTH,
  CLONE_SUFFIX_PATTERN,
  getPluginRestorableInstances,
  type PluginCloneSubmission,
} from '@/api/pluginClone'
import type { Plugin, PluginRestorableInstance } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 多语言
const { t } = useI18n()

// 显示器宽度
const display = useDisplay()

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
  loading: {
    type: Boolean,
    default: false,
  },
  // 服务端 422 返回的字段级校验结论，由发起提交的一方回填
  fieldErrors: {
    type: Object as PropType<Record<string, string[]>>,
    default: () => ({}),
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['update:modelValue', 'close', 'clone'])

// 弹窗显示状态
const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 表单上真实存在的输入框，服务端结论落在这几个字段上才画得回去
const FORM_FIELDS = ['suffix', 'name', 'description', 'icon']

// 插件分身表单
const cloneForm = ref({
  suffix: '',
  name: '',
  description: '',
  icon: '',
})

// 该后缀名下有已停用分身时，是否沿用它留存的业务参数；与服务端默认值保持一致
const restorePrevious = ref(true)

const restorable = ref<PluginRestorableInstance[]>([])
const restorableLoading = ref(false)
const restorableLoadFailed = ref(false)

// 服务端字段级校验结论的本地副本：用户重新编辑该字段后它就过期了，必须能就地清掉
const serverFieldErrors = ref<Record<string, string[]>>({})

/**
 * 分身不能再建分身。
 *
 * 服务端会拒绝并在 message 里指出该用哪个源插件 ID；与其让用户白提交一次，不如在
 * 这里就把结论和出口一起给出来。
 */
const isCloneOfClone = computed(() => Boolean(props.plugin?.is_instance))

// 分身卡片上能拿到的源插件 ID，用于指引用户回到正确的插件
const sourcePluginId = computed(() => props.plugin?.source_plugin_id || '')

const normalizedSuffix = computed(() => cloneForm.value.suffix.trim())

// 不填后缀即请求服务端自动分配一个未被占用的号
const willAutoAssign = computed(() => normalizedSuffix.value === '')

/**
 * 当前后缀命中的可恢复分身。
 *
 * 实例 ID 的大小写在各处登记里未必一致，后缀比对同样不区分大小写。
 */
const matchedRestorable = computed(() =>
  willAutoAssign.value
    ? undefined
    : restorable.value.find(item => item.suffix.toLowerCase() === normalizedSuffix.value.toLowerCase()),
)

// 命中可恢复清单即是恢复那一行，而不是新建——两者走的是同一个端点
const isRestoring = computed(() => Boolean(matchedRestorable.value))

/**
 * 后缀的即时校验。
 *
 * 只在填了后缀时校验：留空是合法的自动分配请求。这里放行不代表一定能建成，
 * 号是否已被占用只有服务端知道。
 */
const suffixErrors = computed(() => {
  const messages = [...(serverFieldErrors.value.suffix ?? [])]
  const suffix = normalizedSuffix.value
  if (suffix && !CLONE_SUFFIX_PATTERN.test(suffix)) messages.push(t('plugin.suffixFormatError'))
  if (suffix.length > CLONE_SUFFIX_MAX_LENGTH) messages.push(t('plugin.suffixLengthError'))
  return messages
})

const submitDisabled = computed(() => isCloneOfClone.value || suffixErrors.value.length > 0)

/** 取某个输入框对应的服务端校验结论。 */
function serverErrorsFor(field: string): string[] {
  return serverFieldErrors.value[field] ?? []
}

/**
 * 对不上任何输入框的服务端校验结论。
 *
 * 服务端可以把结论落在任意字段上，甚至落在整个请求体上。落不到输入框的那些若不
 * 单独列出来就等于被悄悄丢掉，用户只会看到提交失败却找不到哪里不对。
 */
const unmappedServerErrors = computed(() =>
  Object.entries(serverFieldErrors.value)
    .filter(([field]) => !FORM_FIELDS.includes(field))
    .flatMap(([, messages]) => messages),
)

/** 初始化插件分身表单。 */
function initializeCloneForm() {
  cloneForm.value = {
    suffix: '',
    name: t('plugin.cloneDefaultName', { name: props.plugin?.plugin_name }),
    description: t('plugin.cloneDefaultDescription', { description: props.plugin?.plugin_desc }),
    icon: props.plugin?.plugin_icon || '',
  }
  restorePrevious.value = true
}

/**
 * 读取可恢复的已停用分身清单。
 *
 * 只认源插件 ID，且分身不能再建分身，因此分身卡片上不发这次请求。恢复是可选路径，
 * 拉不到清单不该挡住新建，但要明说：判断不出填写的后缀名下是否留有旧配置。
 */
async function loadRestorable() {
  const pluginId = props.plugin?.id
  if (!pluginId || isCloneOfClone.value) return

  restorableLoading.value = true
  restorableLoadFailed.value = false
  try {
    restorable.value = await getPluginRestorableInstances(pluginId)
  } catch (error) {
    console.error(error)
    restorable.value = []
    restorableLoadFailed.value = true
  } finally {
    restorableLoading.value = false
  }
}

/** 选中一条可恢复分身，即把它的后缀填进输入框。 */
function selectRestorable(item: PluginRestorableInstance) {
  cloneForm.value = { ...cloneForm.value, suffix: item.suffix }
  serverFieldErrors.value = {}
}

/** 编辑某个字段后，服务端针对它的旧结论即刻作废；别的字段的结论仍然成立。 */
function onFieldInput(field: string) {
  if (!serverFieldErrors.value[field]?.length) return
  const remaining = { ...serverFieldErrors.value }
  delete remaining[field]
  serverFieldErrors.value = remaining
}

/** 提交插件分身表单。 */
function submitClone() {
  if (submitDisabled.value) return

  const submission: PluginCloneSubmission = {
    request: {
      // 留空送 null，交由服务端自动分配；这里不替它猜一个号
      suffix: willAutoAssign.value ? null : normalizedSuffix.value,
      name: cloneForm.value.name.trim(),
      description: cloneForm.value.description.trim(),
      icon: cloneForm.value.icon.trim(),
      // 清单读不到时保持服务端默认值，宁可沿用旧配置也不悄悄把它丢掉
      restore_previous: matchedRestorable.value ? restorePrevious.value : true,
    },
    restoring: isRestoring.value,
  }
  emit('clone', submission)
}

/**
 * 后缀命中可恢复分身的那一刻，清空名称、描述与图标。
 *
 * 留空才表示沿用这个分身停用前登记的那份，而表单里此刻放的是新建用的默认值，照原样
 * 提交会把用户当初配好的展示信息盖掉。点选清单行与手填出同一个后缀都会走到这里，
 * 两条路因而等效。
 *
 * 只在「命中的是哪一行」变化时清一次，而不是每次输入都清：命中之后用户主动填写的
 * 覆盖值必须留住，否则他继续敲后缀就会把刚填的名字冲掉。
 */
watch(
  () => matchedRestorable.value?.instance_id,
  instanceId => {
    if (instanceId) cloneForm.value = { ...cloneForm.value, name: '', description: '', icon: '' }
  },
)

watch(
  () => props.fieldErrors,
  value => {
    serverFieldErrors.value = value ?? {}
  },
  { deep: true },
)

onMounted(() => {
  initializeCloneForm()
  void loadRestorable()
})
</script>

<template>
  <VDialog v-if="visible" v-model="visible" width="600" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard class="plugin-clone-dialog">
      <VCardItem class="py-2">
        <template #prepend>
          <VIcon :icon="isRestoring ? 'mdi-backup-restore' : 'mdi-content-copy'" class="me-2" />
        </template>
        <VCardTitle>{{ isRestoring ? t('plugin.cloneRestoreTitle') : t('plugin.cloneTitle') }}</VCardTitle>
        <VCardSubtitle>{{ t('plugin.cloneSubtitle', { name: props.plugin?.plugin_name }) }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn v-model="visible" />
      <VDivider />
      <VCardText>
        <VAlert
          v-if="isCloneOfClone"
          type="warning"
          variant="tonal"
          density="compact"
          data-testid="clone-of-clone-notice"
          :text="
            sourcePluginId
              ? t('plugin.cloneOfCloneNotice', { id: sourcePluginId })
              : t('plugin.cloneOfCloneNoticeGeneral')
          "
        />

        <VForm v-else>
          <VRow>
            <VCol cols="12">
              <VTextField
                v-model="cloneForm.suffix"
                :label="t('plugin.suffix')"
                :placeholder="t('plugin.suffixAutoPlaceholder')"
                :hint="t('plugin.suffixHint')"
                :error-messages="suffixErrors"
                persistent-hint
                prepend-inner-icon="mdi-tag"
                @update:model-value="onFieldInput('suffix')"
              />
            </VCol>

            <VCol cols="12">
              <!-- 后缀留空与填写是两条不同的路，各自会发生什么必须当场说清楚 -->
              <div v-if="willAutoAssign" class="plugin-clone-dialog__facts" data-testid="clone-auto-suffix-facts">
                <div>{{ t('plugin.suffixAutoHint') }}</div>
                <div class="text-medium-emphasis">{{ t('plugin.suffixAutoNumbering') }}</div>
                <div class="text-medium-emphasis">{{ t('plugin.suffixAutoNeverRestores') }}</div>
              </div>
              <div v-else class="plugin-clone-dialog__facts">
                <div class="text-medium-emphasis">{{ t('plugin.suffixServerAuthority') }}</div>
              </div>
            </VCol>

            <VCol v-if="matchedRestorable" cols="12">
              <VAlert
                type="info"
                variant="tonal"
                density="compact"
                data-testid="clone-restore-hit"
                :text="
                  t('plugin.suffixMatchesRestorable', {
                    name: matchedRestorable.plugin_name || matchedRestorable.instance_id,
                  })
                "
              />
              <VSwitch
                v-model="restorePrevious"
                color="primary"
                density="compact"
                :label="t('plugin.cloneRestorePrevious')"
                :hint="restorePrevious ? t('plugin.cloneRestorePreviousOn') : t('plugin.cloneRestorePreviousOff')"
                persistent-hint
                data-testid="clone-restore-previous"
                class="mt-2"
              />
            </VCol>

            <VCol cols="12">
              <div class="plugin-clone-dialog__section-title">{{ t('plugin.cloneRestorableTitle') }}</div>
              <div class="plugin-clone-dialog__facts mb-2">
                <div class="text-medium-emphasis">{{ t('plugin.cloneRestorableOnlyDisabled') }}</div>
                <div class="text-medium-emphasis">{{ t('plugin.cloneRestorableSameEndpoint') }}</div>
              </div>
              <LoadingBanner v-if="restorableLoading" class="my-3" />
              <VAlert
                v-else-if="restorableLoadFailed"
                type="warning"
                variant="tonal"
                density="compact"
                :text="t('plugin.cloneRestorableLoadFailed')"
              />
              <div
                v-else-if="restorable.length === 0"
                class="text-body-2 text-medium-emphasis"
                data-testid="clone-restorable-empty"
              >
                {{ t('plugin.cloneRestorableEmpty') }}
              </div>
              <VList
                v-else
                bg-color="transparent"
                lines="two"
                class="plugin-clone-dialog__restorables"
                density="compact"
              >
                <VListItem
                  v-for="item in restorable"
                  :key="item.instance_id"
                  :active="matchedRestorable?.instance_id === item.instance_id"
                  :data-testid="`clone-restorable-${item.instance_id}`"
                  @click="selectRestorable(item)"
                >
                  <template #prepend>
                    <VIcon
                      :icon="
                        matchedRestorable?.instance_id === item.instance_id
                          ? 'mdi-radiobox-marked'
                          : 'mdi-radiobox-blank'
                      "
                    />
                  </template>
                  <VListItemTitle class="plugin-clone-dialog__restorable">
                    <span>{{ item.plugin_name || item.instance_id }}</span>
                    <VChip size="x-small" variant="tonal">{{ item.suffix }}</VChip>
                    <VChip size="x-small" variant="tonal" :color="item.has_config ? 'info' : undefined">
                      {{ item.has_config ? t('plugin.cloneRestorableHasConfig') : t('plugin.cloneRestorableNoConfig') }}
                    </VChip>
                  </VListItemTitle>
                  <VListItemSubtitle class="plugin-clone-dialog__restorable">
                    <code>{{ item.instance_id }}</code>
                    <span v-if="item.plugin_desc">· {{ item.plugin_desc }}</span>
                  </VListItemSubtitle>
                </VListItem>
              </VList>
            </VCol>

            <VCol cols="12">
              <VDivider />
            </VCol>

            <VCol cols="12">
              <VTextField
                v-model="cloneForm.name"
                :label="t('plugin.cloneName')"
                :placeholder="t('plugin.cloneNamePlaceholder')"
                :error-messages="serverErrorsFor('name')"
                prepend-inner-icon="mdi-rename-box"
                @update:model-value="onFieldInput('name')"
              />
            </VCol>

            <VCol cols="12">
              <VTextField
                v-model="cloneForm.description"
                :label="t('plugin.cloneDescriptionLabel')"
                :placeholder="t('plugin.cloneDescriptionPlaceholder')"
                :error-messages="serverErrorsFor('description')"
                prepend-inner-icon="mdi-text"
                @update:model-value="onFieldInput('description')"
              />
            </VCol>

            <VCol cols="12">
              <VTextField
                v-model="cloneForm.icon"
                :label="t('plugin.cloneIcon')"
                :placeholder="t('plugin.cloneIconPlaceholder')"
                :error-messages="serverErrorsFor('icon')"
                prepend-inner-icon="mdi-image"
                @update:model-value="onFieldInput('icon')"
              />
            </VCol>

            <VCol cols="12">
              <!-- 展示信息留空的语义在恢复与新建两条路上完全不同，不能只写一句「可选」 -->
              <div class="plugin-clone-dialog__facts" data-testid="clone-display-blank-meaning">
                {{ isRestoring ? t('plugin.cloneDisplayBlankRestore') : t('plugin.cloneDisplayBlankCreate') }}
              </div>
            </VCol>

            <VCol v-if="unmappedServerErrors.length > 0" cols="12">
              <!-- 落不到任何输入框的服务端结论，单独列出来才不会被悄悄丢掉 -->
              <VAlert type="error" variant="tonal" density="compact" data-testid="clone-form-errors">
                <div v-for="message in unmappedServerErrors" :key="message" class="text-body-2">{{ message }}</div>
              </VAlert>
            </VCol>

            <VCol cols="12">
              <VAlert
                type="warning"
                variant="tonal"
                density="compact"
                icon="mdi-alert-circle-outline"
                data-testid="clone-notice"
              >
                <div class="text-body-2">
                  <strong>{{ t('common.notice') }}</strong
                  >：{{ isRestoring ? t('plugin.cloneRestoreNotice') : t('plugin.cloneNotice') }}
                </div>
              </VAlert>
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          @click="submitClone"
          :prepend-icon="isRestoring ? 'mdi-backup-restore' : 'mdi-content-copy'"
          class="px-5"
          :disabled="submitDisabled"
          :loading="props.loading"
        >
          {{ isRestoring ? t('plugin.restoreClone') : t('plugin.createClone') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.plugin-clone-dialog__facts {
  display: grid;
  font-size: 0.8125rem;
  gap: 0.25rem;
  line-height: 1.5;
}

.plugin-clone-dialog__section-title {
  font-size: 0.875rem;
  font-weight: 500;
  margin-block-end: 0.25rem;
}

.plugin-clone-dialog__restorables {
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 0.5rem;
  max-block-size: 16rem;
  overflow-y: auto;
}

.plugin-clone-dialog__restorable {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
}
</style>
