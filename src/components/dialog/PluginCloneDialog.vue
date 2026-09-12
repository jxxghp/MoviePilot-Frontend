<script setup lang="ts">
import { getApiErrorMessage } from '@/api'
import { fetchPluginReleaseVersions, resolveTrustedReleaseRepoUrl } from '@/api/pluginRelease'
import { getPluginRestorableInstances, getPluginVersionOverview } from '@/api/pluginVersion'
import type { Plugin, PluginReleaseVersion, PluginRestorableInstance } from '@/api/types'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

// 多语言
const { t, locale } = useI18n()

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

// 插件分身表单的校验入口
const cloneFormRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)

// 插件分身表单
const cloneForm = ref({
  name: '',
  description: '',
  icon: '',
})

// 同后缀的上一个分身留下的可恢复残留；null 表示尚未探测或该后缀无残留
/**
 * 创建模式。
 *
 * 卸载只把启用位置假、那一行原样留着，所以「恢复一个卸载过的分身」和「建一个新
 * 分身」是两件事，用同一张表单去表达只会让人分不清自己在干什么。
 */
const mode = ref<'create' | 'restore'>('create')

const restorable = ref<PluginRestorableInstance[]>([])
const restorableLoading = ref(false)
const selectedRestorableId = ref('')

const selectedRestorable = computed(() =>
  restorable.value.find(item => item.instance_id === selectedRestorableId.value),
)

/** 拉取可恢复的已卸载分身；在册的分身由服务端排除，不会出现在这里。 */
async function loadRestorable() {
  if (!props.plugin?.id) return
  restorableLoading.value = true
  try {
    restorable.value = await getPluginRestorableInstances(props.plugin.id)
  } catch (error) {
    // 恢复是可选路径，拉不到不该挡住新建；静默降级为「没有可恢复的」
    restorable.value = []
    console.error(error)
  } finally {
    restorableLoading.value = false
  }
}

const followCurrentVersion = ref(true)
const selectedVersion = ref('')

const versionsLoading = ref(false)
const versionsError = ref('')
const releaseItems = ref<PluginReleaseVersion[]>([])
const releaseRepoUrl = ref('')
const installedVersions = ref<string[]>([])
const currentVersion = ref<string | null>(null)

/** 可锚定的版本列表：Release 历史与本地已装版本合并，已装的排在可选状态更明确的一侧。 */
const anchorableVersions = computed(() => {
  const seen = new Map<string, { version: string; publishedAt?: string; isLatest: boolean }>()
  releaseItems.value.forEach(item => {
    seen.set(item.version, {
      version: item.version,
      publishedAt: item.published_at,
      isLatest: Boolean(item.is_latest),
    })
  })
  installedVersions.value.forEach(version => {
    if (!seen.has(version)) seen.set(version, { version, isLatest: false })
  })
  return [...seen.values()].map(item => ({
    ...item,
    installed: installedVersions.value.includes(item.version),
    isCurrent: item.version === currentVersion.value,
  }))
})

// 没有任何可锚定版本时不给出「锚定版本」选项：选了也没有能选的版本
const canAnchorVersion = computed(() => anchorableVersions.value.length > 0)

const selectedVersionEntry = computed(() =>
  anchorableVersions.value.find(item => item.version === selectedVersion.value),
)

// 选中未安装版本时创建流程会先安装它，而安装会把插件当前版本改写为该版本
const willInstallSelectedVersion = computed(() =>
  Boolean(!followCurrentVersion.value && selectedVersionEntry.value && !selectedVersionEntry.value.installed),
)

const restoreSubmitDisabled = computed(() => !selectedRestorableId.value)

const submitDisabled = computed(
  // 后缀不再由用户填，唯一的必填约束只剩「锚定版本时必须选一个版本」
  () => !followCurrentVersion.value && !selectedVersion.value,
)

/** 初始化插件分身表单。 */
function initializeCloneForm() {
  cloneForm.value = {
    name: t('plugin.cloneDefaultName', { name: props.plugin?.plugin_name }),
    description: t('plugin.cloneDefaultDescription', { description: props.plugin?.plugin_desc }),
    icon: props.plugin?.plugin_icon || '',
  }
  followCurrentVersion.value = true
  selectedVersion.value = ''
  mode.value = 'create'
  selectedRestorableId.value = ''
}

/** 格式化 Release 发布日期。 */
function formatPublishedAt(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale.value)
}

/**
 * 读取可锚定版本：本地已装版本必须拿到，Release 历史拿不到时降级而不是整体失败。
 *
 * 已装版本决定了「锚定后能否直接启动」，Release 历史只是把尚未安装的版本也纳入
 * 可选范围；后者依赖可信来源与网络，不能让它的失败挡住前者。
 */
async function loadAnchorableVersions() {
  const pluginId = props.plugin?.id
  if (!pluginId) return

  versionsLoading.value = true
  versionsError.value = ''
  try {
    const overview = await getPluginVersionOverview(pluginId)
    installedVersions.value = overview.installed_versions.map(item => item.version)
    currentVersion.value = overview.current_version ?? null
  } catch (error) {
    versionsError.value = getApiErrorMessage(error) || t('plugin.cloneVersionsLoadFailed')
    console.error(error)
    versionsLoading.value = false
    return
  }

  try {
    const { repoUrl } = await resolveTrustedReleaseRepoUrl(pluginId)
    if (repoUrl) {
      releaseRepoUrl.value = repoUrl
      const detail = await fetchPluginReleaseVersions(pluginId, repoUrl)
      releaseItems.value = detail.items || []
    }
  } catch (error) {
    // Release 历史不可用只收窄可选范围，已装版本仍可锚定
    console.error(error)
  } finally {
    versionsLoading.value = false
  }
}

/** 提交插件分身表单。 */
async function submitClone() {
  if (mode.value === 'restore') {
    const target = selectedRestorable.value
    if (!target) return
    // 恢复时名称、描述、图标与锚定版本一律留空：服务端会沿用那一行上留存的设置，
    // 这里塞默认值反而会把用户当初配好的东西盖掉。
    emit('clone', {
      suffix: target.suffix,
      name: '',
      description: '',
      icon: '',
      pinned_version: null,
      install: null,
      restore_previous: true,
    })
    return
  }

  // 校验规则此前只负责标红：按钮只按后缀是否为空禁用，不合规的后缀照样能提交，
  // 要等后端 422 才被拦下。提交前先跑一次表单校验，把拦截落在输入侧。
  const validation = await cloneFormRef.value?.validate()
  if (validation && validation.valid === false) return
  if (!followCurrentVersion.value && !selectedVersion.value) return

  emit('clone', {
    ...cloneForm.value,
    // 后缀交给服务端自动分配：它只用于区分实例，用户对它无感
    suffix: null,
    pinned_version: followCurrentVersion.value ? null : selectedVersion.value,
    install: willInstallSelectedVersion.value
      ? { repo_url: releaseRepoUrl.value, release_version: selectedVersion.value }
      : null,
    // 全新创建：撞上同 ID 的已卸载分身时不沿用它的业务数据残留
    restore_previous: false,
  })
}

onMounted(() => {
  initializeCloneForm()
  void loadAnchorableVersions()
  void loadRestorable()
})
</script>

<template>
  <VDialog v-if="visible" v-model="visible" width="600" scrollable :fullscreen="!display.mdAndUp.value">
    <VCard>
      <VCardItem class="py-2">
        <template #prepend>
          <VIcon icon="mdi-content-copy" class="me-2" />
        </template>
        <VCardTitle>{{ mode === 'restore' ? t('plugin.cloneRestoreConfirm') : t('plugin.createClone') }}</VCardTitle>
        <VCardSubtitle>{{ t('plugin.cloneSubtitle', { name: props.plugin?.plugin_name }) }}</VCardSubtitle>
      </VCardItem>
      <VDialogCloseBtn v-model="visible" />
      <VDivider />
      <VCardText>
        <VBtnToggle
          v-if="restorable.length > 0"
          v-model="mode"
          mandatory
          density="compact"
          variant="outlined"
          divided
          class="mb-4"
        >
          <VBtn value="create" size="small" prepend-icon="mdi-plus" data-testid="clone-mode-create">
            {{ t('plugin.cloneModeCreate') }}
          </VBtn>
          <VBtn value="restore" size="small" prepend-icon="mdi-backup-restore" data-testid="clone-mode-restore">
            {{ t('plugin.cloneModeRestore', { count: restorable.length }) }}
          </VBtn>
        </VBtnToggle>

        <!-- 恢复：按 ID 挑一个已卸载的分身，把它连同留存的配置一起拿回来 -->
        <template v-if="mode === 'restore'">
          <VProgressLinear v-if="restorableLoading" indeterminate color="primary" height="2" class="mb-2" />
          <div class="text-caption text-medium-emphasis mb-3">{{ t('plugin.cloneRestoreHint') }}</div>
          <div class="plugin-clone-dialog__restorables">
            <VCard
              v-for="item in restorable"
              :key="item.instance_id"
              variant="outlined"
              class="plugin-clone-dialog__restorable"
              :class="{ 'plugin-clone-dialog__restorable--active': selectedRestorableId === item.instance_id }"
              :data-testid="`clone-restorable-${item.instance_id}`"
              @click="selectedRestorableId = item.instance_id"
            >
              <VCardText class="pa-3">
                <div class="d-flex align-center ga-2">
                  <VRadio
                    :model-value="selectedRestorableId === item.instance_id"
                    :value="true"
                    hide-details
                    readonly
                  />
                  <div class="flex-grow-1 min-width-0">
                    <div class="text-subtitle-2 text-truncate">
                      {{ item.plugin_name || item.instance_id }}
                    </div>
                    <div class="d-flex align-center ga-1 flex-wrap mt-1">
                      <VChip size="x-small" variant="tonal">{{ item.instance_id }}</VChip>
                      <VChip size="x-small" variant="tonal" :color="item.pinned_version ? 'info' : 'secondary'">
                        {{
                          item.pinned_version
                            ? t('plugin.versionPinned', { version: item.pinned_version })
                            : t('plugin.versionFollowCurrent')
                        }}
                      </VChip>
                      <VChip v-if="item.has_config" size="x-small" variant="tonal" color="success">
                        {{ t('plugin.cloneRestorableHasConfig') }}
                      </VChip>
                      <VChip v-if="item.has_data" size="x-small" variant="tonal" color="success">
                        {{ t('plugin.cloneRestorableHasData') }}
                      </VChip>
                    </div>
                  </div>
                </div>
              </VCardText>
            </VCard>
          </div>
        </template>

        <VForm v-show="mode === 'create'" ref="cloneFormRef">
          <VRow>
            <VCol cols="12">
              <VTextField
                v-model="cloneForm.name"
                :label="t('plugin.cloneName')"
                :placeholder="t('plugin.cloneNamePlaceholder')"
                :hint="t('plugin.cloneNameHint')"
                persistent-hint
                prepend-inner-icon="mdi-rename-box"
              />
            </VCol>

            <VCol cols="12">
              <VTextField
                v-model="cloneForm.description"
                :label="t('plugin.cloneDescriptionLabel')"
                :placeholder="t('plugin.cloneDescriptionPlaceholder')"
                :hint="t('plugin.cloneDescriptionHint')"
                persistent-hint
                prepend-inner-icon="mdi-text"
              />
            </VCol>

            <VCol cols="12">
              <VTextField
                v-model="cloneForm.icon"
                :label="t('plugin.cloneIcon')"
                :placeholder="t('plugin.cloneIconPlaceholder')"
                :hint="t('plugin.cloneIconHint')"
                persistent-hint
                prepend-inner-icon="mdi-image"
              />
            </VCol>

            <VCol cols="12">
              <div class="text-subtitle-2 mb-1">{{ t('plugin.cloneVersionStrategy') }} *</div>
              <VRadioGroup v-model="followCurrentVersion" density="compact" hide-details>
                <VRadio :label="t('plugin.cloneVersionFollow')" :value="true" data-testid="clone-version-follow" />
                <VRadio
                  :label="t('plugin.cloneVersionAnchor')"
                  :value="false"
                  :disabled="!canAnchorVersion"
                  data-testid="clone-version-anchor"
                />
              </VRadioGroup>
              <div v-if="!canAnchorVersion" class="text-caption text-medium-emphasis mt-1">
                {{ t('plugin.cloneVersionAnchorUnavailable') }}
              </div>

              <template v-if="!followCurrentVersion">
                <VProgressLinear v-if="versionsLoading" indeterminate color="primary" height="2" class="mt-2" />
                <VAlert
                  v-if="versionsError"
                  type="warning"
                  variant="tonal"
                  density="compact"
                  class="mt-2"
                  :text="versionsError"
                />
                <VList class="plugin-clone-dialog__versions mt-2" density="compact" lines="two">
                  <VListItem
                    v-for="item in anchorableVersions"
                    :key="item.version"
                    :active="selectedVersion === item.version"
                    :data-testid="`clone-version-${item.version}`"
                    @click="selectedVersion = item.version"
                  >
                    <template #prepend>
                      <VRadio :model-value="selectedVersion === item.version" :value="true" hide-details readonly />
                    </template>
                    <VListItemTitle class="d-flex align-center ga-2">
                      <code>v{{ item.version }}</code>
                      <VChip v-if="item.isLatest" size="x-small" color="primary" variant="tonal">
                        {{ t('plugin.latestVersion') }}
                      </VChip>
                      <VChip v-if="item.isCurrent" size="x-small" color="success" variant="tonal">
                        {{ t('plugin.currentVersion') }}
                      </VChip>
                      <VChip v-if="!item.installed" size="x-small" color="warning" variant="tonal">
                        {{ t('plugin.cloneVersionNotInstalled') }}
                      </VChip>
                    </VListItemTitle>
                    <VListItemSubtitle>
                      {{ item.installed ? t('plugin.cloneVersionInstalled') : t('plugin.cloneVersionWillInstall') }}
                      <span v-if="formatPublishedAt(item.publishedAt)">
                        · {{ formatPublishedAt(item.publishedAt) }}</span
                      >
                    </VListItemSubtitle>
                  </VListItem>
                </VList>

                <VAlert
                  v-if="willInstallSelectedVersion"
                  type="warning"
                  variant="tonal"
                  density="compact"
                  class="mt-2"
                  icon="mdi-alert-outline"
                  :text="t('plugin.cloneVersionInstallNotice', { version: selectedVersion })"
                />
              </template>
            </VCol>

            <VCol cols="12">
              <VAlert type="info" variant="tonal" density="compact" class="mt-2" icon="mdi-information-outline">
                <div class="text-body-2">
                  <strong>{{ t('common.notice') }}</strong
                  >：{{ t('plugin.cloneNotice') }}
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
          class="px-5"
          :prepend-icon="mode === 'restore' ? 'mdi-backup-restore' : 'mdi-content-copy'"
          :disabled="mode === 'restore' ? restoreSubmitDisabled : submitDisabled"
          :loading="props.loading"
          data-testid="clone-submit"
          @click="submitClone"
        >
          {{ mode === 'restore' ? t('plugin.cloneRestoreConfirm') : t('plugin.createClone') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped>
.plugin-clone-dialog__restorables {
  display: grid;
  gap: 0.5rem;
  max-block-size: 18rem;
  overflow-y: auto;
}

.plugin-clone-dialog__restorable {
  cursor: pointer;
}

.plugin-clone-dialog__restorable--active {
  border-color: rgb(var(--v-theme-primary));
}

.min-width-0 {
  min-inline-size: 0;
}

.plugin-clone-dialog__versions {
  max-block-size: 16rem;
  overflow-y: auto;
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 0.375rem;
}
</style>
