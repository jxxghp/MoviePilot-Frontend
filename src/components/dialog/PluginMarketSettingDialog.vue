<script lang="ts" setup>
import api from '@/api'
import draggable from 'vuedraggable'
import { useToast } from 'vue-toastification'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'

const display = useDisplay()

const { t } = useI18n()
const $toast = useToast()

type EditorMode = 'list' | 'text'

interface RepoParseResult {
  repos: string[]
  invalidRepos: string[]
  duplicateRepos: string[]
}

const editorMode = ref<EditorMode>('list')
const repoList = ref<string[]>([])
const repoText = ref('')
const newRepoUrl = ref('')
const editingIndex = ref<number | null>(null)
const editingUrl = ref('')

const emit = defineEmits(['save', 'close'])

const parsedTextRepos = computed(() => parseRepoInput(repoText.value))
const activeRepoCount = computed(() => (editorMode.value === 'text' ? parsedTextRepos.value.repos.length : repoList.value.length))
const saveDisabled = computed(
  () => activeRepoCount.value === 0 || (editorMode.value === 'text' && parsedTextRepos.value.invalidRepos.length > 0),
)

/** 判断仓库地址是否为可保存的 HTTP URL。 */
function isValidRepoUrl(url: string) {
  return /^https?:\/\//i.test(url)
}

/** 将粘贴的仓库地址文本解析为有效、无效和重复地址列表。 */
function parseRepoInput(value: string): RepoParseResult {
  const repos: string[] = []
  const invalidRepos: string[] = []
  const duplicateRepos: string[] = []
  const seenRepos = new Set<string>()

  value
    .split(/[\n,，]+/)
    .map(repo => repo.trim())
    .filter(Boolean)
    .forEach(repo => {
      if (!isValidRepoUrl(repo)) {
        invalidRepos.push(repo)

        return
      }

      if (seenRepos.has(repo)) {
        duplicateRepos.push(repo)

        return
      }

      seenRepos.add(repo)
      repos.push(repo)
    })

  return {
    repos,
    invalidRepos,
    duplicateRepos: [...new Set(duplicateRepos)],
  }
}

/** 将列表模式中的仓库地址同步到文本模式。 */
function syncTextFromList() {
  repoText.value = repoList.value.join('\n')
}

/** 将文本模式中的仓库地址同步到列表模式，并忽略无法加入列表的无效地址。 */
function syncListFromText() {
  const result = parseRepoInput(repoText.value)

  repoList.value = result.repos
  syncTextFromList()

  if (result.invalidRepos.length > 0) {
    $toast.warning(t('dialog.pluginMarketSetting.invalidTextIgnored', { count: result.invalidRepos.length }))
  }
}

/** 切换仓库维护模式，并在切换时同步当前模式的编辑内容。 */
function switchEditorMode(mode: EditorMode | undefined) {
  if (!mode || mode === editorMode.value) return

  if (editorMode.value === 'text') {
    syncListFromText()
  }

  if (mode === 'text') {
    syncTextFromList()
  }

  editorMode.value = mode
}

/** 加载插件市场仓库配置。 */
async function queryMarketRepoSetting() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/PLUGIN_MARKET')
    if (result && result.data && result.data.value) {
      repoList.value = parseRepoInput(result.data.value).repos
      syncTextFromList()
    }
  } catch (error) {
    console.log(error)
  }
}

/** 保存插件市场仓库配置。 */
async function saveHandle() {
  try {
    const reposToSave = normalizeCurrentRepos()
    if (!reposToSave) return

    const repoStringToSave = reposToSave.join(',')
    const result: { [key: string]: any } = await api.post('system/setting/PLUGIN_MARKET', repoStringToSave)

    if (result.success) {
      $toast.success(t('dialog.pluginMarketSetting.saveSuccess'))
      emit('save')
    } else $toast.error(t('dialog.pluginMarketSetting.saveFailed', { message: result?.message }))
  } catch (error) {
    console.log(error)
  }
}

/** 获取当前维护模式下可保存的仓库地址。 */
function normalizeCurrentRepos() {
  if (editorMode.value === 'text') {
    const result = parseRepoInput(repoText.value)

    if (result.invalidRepos.length > 0) {
      $toast.error(t('dialog.pluginMarketSetting.invalidText', { count: result.invalidRepos.length }))

      return null
    }

    repoList.value = result.repos
    syncTextFromList()

    return result.repos
  }

  return repoList.value
}

/** 校验单个仓库地址是否可以加入或更新到列表。 */
function validateRepoUrl(url: string, editingRepoIndex: number | null = null) {
  if (!url) return false

  if (!isValidRepoUrl(url)) {
    $toast.error(t('dialog.pluginMarketSetting.invalidUrl'))

    return false
  }

  const duplicated = repoList.value.some((repo, index) => repo === url && index !== editingRepoIndex)
  if (duplicated) {
    $toast.error(t('dialog.pluginMarketSetting.duplicateUrl'))

    return false
  }

  return true
}

/** 添加一个仓库地址到列表。 */
function addRepo() {
  const url = newRepoUrl.value.trim()
  if (!validateRepoUrl(url)) return

  repoList.value.push(url)
  newRepoUrl.value = ''
  syncTextFromList()
}

/** 从列表中删除一个仓库地址。 */
function removeRepo(index: number) {
  repoList.value.splice(index, 1)
  syncTextFromList()
}

/** 进入指定仓库地址的行内编辑状态。 */
function startEdit(index: number) {
  editingIndex.value = index
  editingUrl.value = repoList.value[index]
}

/** 保存当前行内编辑的仓库地址。 */
function saveEdit() {
  if (editingIndex.value === null) return

  const url = editingUrl.value.trim()
  if (!validateRepoUrl(url, editingIndex.value)) return

  repoList.value[editingIndex.value] = url
  syncTextFromList()
  editingIndex.value = null
  editingUrl.value = ''
}

/** 取消当前行内编辑状态。 */
function cancelEdit() {
  editingIndex.value = null
  editingUrl.value = ''
}

/** 将仓库地址格式化为更易扫描的显示名称。 */
function formatRepoDisplay(url: string) {
  try {
    const parsedUrl = new URL(url)
    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean)

    if (
      ['github.com', 'www.github.com', 'raw.githubusercontent.com'].includes(parsedUrl.hostname)
      && pathSegments.length >= 2
    ) {
      return `${pathSegments[0]}/${pathSegments[1].replace(/\.git$/, '')}`
    }
  } catch {
    // Ignore malformed URLs and fall back to the original value.
  }

  return url
}

/** 返回拖拽列表项的稳定键。 */
function repoItemKey(repo: string) {
  return repo
}

onMounted(() => {
  queryMarketRepoSetting()
})
</script>

<template>
  <VDialog width="56rem" :fullscreen="!display.mdAndUp.value">
    <VCard class="plugin-market-dialog-card">
      <VCardItem class="plugin-market-card-item">
        <div class="plugin-market-header">
          <VCardTitle class="plugin-market-title d-flex align-center pa-0">
            <VIcon icon="mdi-store-cog" class="me-2" />
            {{ t('dialog.pluginMarketSetting.title') }}
          </VCardTitle>
        </div>
        <VDialogCloseBtn @click="emit('close')" />
      </VCardItem>

      <VCardText class="plugin-market-dialog-body pt-4">
        <div class="plugin-market-toolbar">
          <VBtnToggle
            :model-value="editorMode"
            mandatory
            color="primary"
            density="comfortable"
            variant="tonal"
            class="plugin-market-mode-toggle"
            @update:model-value="switchEditorMode"
          >
            <VBtn value="list" prepend-icon="mdi-format-list-bulleted">
              {{ t('dialog.pluginMarketSetting.listMode') }}
            </VBtn>
            <VBtn value="text" prepend-icon="mdi-text-box-edit-outline">
              {{ t('dialog.pluginMarketSetting.textMode') }}
            </VBtn>
          </VBtnToggle>
        </div>

        <div v-if="editorMode === 'list'" class="plugin-market-list-panel">
          <div class="plugin-market-input">
            <VTextField
              v-model="newRepoUrl"
              density="compact"
              :placeholder="t('dialog.pluginMarketSetting.urlPlaceholder')"
              prepend-inner-icon="mdi-link-plus"
              clearable
              hide-details
              @keyup.enter="addRepo"
            >
              <template #append>
                <VBtn
                  icon="mdi-plus"
                  variant="tonal"
                  color="primary"
                  :aria-label="t('dialog.pluginMarketSetting.addRepo')"
                  @click="addRepo"
                />
              </template>
            </VTextField>
          </div>

          <div class="plugin-market-list-wrap">
            <VList v-if="repoList.length > 0" class="plugin-market-repo-list px-0">
              <draggable
                v-model="repoList"
                :item-key="repoItemKey"
                handle=".drag-handle"
                animation="200"
                :disabled="editingIndex !== null"
                @end="syncTextFromList"
              >
                <template #item="{ element: repo, index }">
                  <div>
                    <VListItem class="plugin-market-repo-item py-3">
                      <template #prepend>
                        <VBtn
                          icon="mdi-drag-vertical"
                          size="small"
                          variant="text"
                          color="primary"
                          class="drag-handle me-2"
                          :disabled="editingIndex !== null"
                        />
                      </template>

                      <template v-if="editingIndex !== index">
                        <VListItemTitle>
                          <div class="plugin-market-repo-title">
                            <span class="plugin-market-repo-index">{{ index + 1 }}</span>
                            <span class="text-truncate" :title="repo">{{ formatRepoDisplay(repo) }}</span>
                          </div>
                        </VListItemTitle>
                        <VListItemSubtitle class="text-truncate mt-1" :title="repo">
                          {{ repo }}
                        </VListItemSubtitle>
                      </template>

                      <VTextField
                        v-else
                        v-model="editingUrl"
                        density="compact"
                        variant="outlined"
                        hide-details
                        autofocus
                        @keyup.enter="saveEdit"
                        @keyup.escape="cancelEdit"
                      />

                      <template #append v-if="editingIndex !== index">
                        <div class="d-flex align-center">
                          <IconBtn icon="mdi-pencil" size="small" variant="text" @click="startEdit(index)" />
                          <IconBtn
                            icon="mdi-delete"
                            size="small"
                            variant="text"
                            color="error"
                            @click="removeRepo(index)"
                          />
                        </div>
                      </template>

                      <template #append v-else>
                        <div class="d-flex align-center">
                          <IconBtn icon="mdi-check" size="small" variant="text" color="success" @click="saveEdit" />
                          <IconBtn icon="mdi-close" size="small" variant="text" @click="cancelEdit" />
                        </div>
                      </template>
                    </VListItem>
                    <VDivider v-if="index < repoList.length - 1" class="mx-4" />
                  </div>
                </template>
              </draggable>
            </VList>

            <div v-else class="plugin-market-empty text-center text-medium-emphasis">
              <VIcon icon="mdi-source-repository-multiple" size="48" class="mb-2" />
              <div>{{ t('dialog.pluginMarketSetting.noRepos') }}</div>
            </div>
          </div>
        </div>

        <div v-else class="plugin-market-text-panel">
          <VTextarea
            v-model="repoText"
            class="plugin-market-textarea"
            rows="8"
            variant="outlined"
            prepend-inner-icon="mdi-text-box-edit-outline"
            :placeholder="t('dialog.pluginMarketSetting.textPlaceholder')"
            :hint="t('dialog.pluginMarketSetting.textHint')"
            persistent-hint
          />

          <VAlert
            v-if="parsedTextRepos.invalidRepos.length > 0"
            type="error"
            variant="tonal"
            density="compact"
            class="plugin-market-invalid-alert"
          >
            <div>{{ t('dialog.pluginMarketSetting.invalidText', { count: parsedTextRepos.invalidRepos.length }) }}</div>
            <div class="text-truncate">
              {{ parsedTextRepos.invalidRepos.slice(0, 3).join(', ') }}
            </div>
          </VAlert>

          <VAlert
            v-else-if="parsedTextRepos.duplicateRepos.length > 0"
            type="warning"
            variant="tonal"
            density="compact"
          >
            {{ t('dialog.pluginMarketSetting.duplicateTextIgnored') }}
          </VAlert>
        </div>
      </VCardText>

      <VCardActions class="plugin-market-actions">
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          @click="saveHandle"
          prepend-icon="mdi-content-save-check"
          class="px-5"
          :disabled="saveDisabled"
        >
          {{ t('dialog.pluginMarketSetting.save') }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<style scoped lang="scss">
.plugin-market-dialog-card {
  display: flex;
  flex-direction: column;
  block-size: min(82vh, 50rem);
}

.plugin-market-card-item {
  flex: 0 0 auto;
  padding-block: 0.875rem;
}

.plugin-market-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-inline-end: 2rem;
}

.plugin-market-title {
  min-inline-size: 0;
}

.plugin-market-dialog-body {
  display: flex;
  overflow: hidden;
  flex: 1;
  flex-direction: column;
  gap: 0.875rem;
  min-block-size: 0;
  padding-block: 0.875rem !important;
}

.plugin-market-toolbar {
  display: flex;
  flex-shrink: 0;
}

.plugin-market-mode-toggle {
  inline-size: 100%;

  :deep(.v-btn) {
    flex: 1;
    min-inline-size: 0;
  }
}

.plugin-market-list-panel,
.plugin-market-text-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.75rem;
  min-block-size: 0;
}

.plugin-market-input {
  flex-shrink: 0;
}

.plugin-market-list-wrap {
  flex: 1;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  background: rgba(var(--v-theme-surface), 0.72);
  min-block-size: 0;
  overflow-y: auto;
}

.plugin-market-repo-list {
  background: transparent;
}

.plugin-market-repo-item {
  min-block-size: 4.5rem;
}

.plugin-market-repo-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-inline-size: 0;
}

.plugin-market-repo-index {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.48);
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
  inline-size: 1.75rem;
}

.plugin-market-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  min-block-size: 14rem;
}

.plugin-market-textarea {
  flex: 1;
  min-block-size: 0;

  :deep(.v-input__control),
  :deep(.v-field),
  :deep(.v-field__field) {
    block-size: 100%;
    min-block-size: 0;
  }

  :deep(.v-field__input) {
    align-items: stretch;
    block-size: 100%;
    min-block-size: 0;
  }

  :deep(textarea) {
    block-size: 100%;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    line-height: 1.6;
    overflow-y: auto;
  }
}

.plugin-market-invalid-alert {
  :deep(.v-alert__content) {
    min-inline-size: 0;
  }
}

.plugin-market-actions {
  flex: 0 0 auto;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem 1rem;
}

@media (max-width: 600px) {
  .plugin-market-dialog-card {
    block-size: 100dvh;
  }

  .plugin-market-card-item {
    padding: 0.75rem 1rem 0.625rem;
  }

  .plugin-market-header {
    align-items: center;
    gap: 0.5rem;
    padding-inline-end: 2.25rem;
  }

  .plugin-market-header :deep(.v-card-title) {
    font-size: 1.125rem;
    line-height: 1.35;
  }

  .plugin-market-dialog-body {
    gap: 0.625rem;
    padding: 0.75rem 1rem !important;
  }

  .plugin-market-mode-toggle {
    inline-size: 100%;

    :deep(.v-btn) {
      flex: 1;
      min-inline-size: 0;
    }
  }

  .plugin-market-list-panel,
  .plugin-market-text-panel {
    gap: 0.625rem;
  }

  .plugin-market-list-wrap {
    min-block-size: 0;
  }

  .plugin-market-empty {
    min-block-size: 10rem;
  }

  .plugin-market-actions {
    padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom));
  }
}
</style>
