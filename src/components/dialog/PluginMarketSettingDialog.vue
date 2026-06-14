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
const syncingWiki = ref(false)

const emit = defineEmits(['save', 'close'])

const parsedTextRepos = computed(() => parseRepoInput(repoText.value))
const activeRepoCount = computed(() =>
  editorMode.value === 'text' ? parsedTextRepos.value.repos.length : repoList.value.length,
)
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
    const result: { [key: string]: any } = await api.get('system/setting/public/PLUGIN_MARKET')
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

/** 从 Wiki 同步公开插件仓库清单并写入配置。 */
async function syncWikiRepos() {
  try {
    syncingWiki.value = true
    const result: { [key: string]: any } = await api.post('system/setting/PLUGIN_MARKET/sync-wiki', {})

    if (result.success) {
      const repos = Array.isArray(result.data?.repos)
        ? result.data.repos
        : parseRepoInput(result.data?.value || '').repos
      repoList.value = repos
      syncTextFromList()
      $toast.success(
        t('dialog.pluginMarketSetting.syncSuccess', {
          added: result.data?.added_count ?? 0,
          total: result.data?.total_count ?? repos.length,
        }),
      )
    } else {
      $toast.error(t('dialog.pluginMarketSetting.syncFailed', { message: result?.message }))
    }
  } catch (error) {
    console.log(error)
    $toast.error(t('dialog.pluginMarketSetting.syncFailed', { message: error instanceof Error ? error.message : '' }))
  } finally {
    syncingWiki.value = false
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
function saveEdit(index = editingIndex.value) {
  if (index === null) return

  const url = editingUrl.value.trim()
  if (!validateRepoUrl(url, index)) return

  repoList.value[index] = url
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
      ['github.com', 'www.github.com', 'raw.githubusercontent.com'].includes(parsedUrl.hostname) &&
      pathSegments.length >= 2
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
      <VDivider />
      <VCardText class="plugin-market-dialog-body pt-4">
        <div class="plugin-market-toolbar">
          <div class="plugin-market-toolbar-hint">
            <VIcon icon="mdi-information-outline" size="18" />
            <span>{{ t('dialog.pluginMarketSetting.repoCountHint', { count: activeRepoCount }) }}</span>
          </div>
          <div class="plugin-market-mode-switch" role="tablist" :aria-label="t('dialog.pluginMarketSetting.title')">
            <VTooltip :text="t('dialog.pluginMarketSetting.listMode')" location="top">
              <template #activator="{ props }">
                <button
                  v-bind="props"
                  type="button"
                  class="plugin-market-mode-button"
                  :class="{ 'is-active': editorMode === 'list' }"
                  role="tab"
                  :aria-label="t('dialog.pluginMarketSetting.listMode')"
                  :aria-selected="editorMode === 'list'"
                  @click="switchEditorMode('list')"
                >
                  <VIcon icon="mdi-format-list-bulleted" size="20" />
                </button>
              </template>
            </VTooltip>
            <VTooltip :text="t('dialog.pluginMarketSetting.textMode')" location="top">
              <template #activator="{ props }">
                <button
                  v-bind="props"
                  type="button"
                  class="plugin-market-mode-button"
                  :class="{ 'is-active': editorMode === 'text' }"
                  role="tab"
                  :aria-label="t('dialog.pluginMarketSetting.textMode')"
                  :aria-selected="editorMode === 'text'"
                  @click="switchEditorMode('text')"
                >
                  <VIcon icon="mdi-text-box-edit-outline" size="20" />
                </button>
              </template>
            </VTooltip>
          </div>
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
                            <span class="plugin-market-repo-name" :title="repo">{{ formatRepoDisplay(repo) }}</span>
                          </div>
                        </VListItemTitle>
                        <VListItemSubtitle class="plugin-market-repo-url mt-1" :title="repo">
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
                        @keyup.enter="saveEdit(index)"
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
                          <VBtn
                            icon="mdi-check"
                            size="small"
                            variant="text"
                            color="success"
                            @click.stop="saveEdit(index)"
                          />
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
          <div class="plugin-market-textarea-field">
            <VIcon icon="mdi-text-box-edit-outline" class="plugin-market-textarea-icon" />
            <textarea
              v-model="repoText"
              class="plugin-market-textarea"
              :placeholder="t('dialog.pluginMarketSetting.textPlaceholder')"
            />
          </div>
          <div class="plugin-market-text-hint">
            {{ t('dialog.pluginMarketSetting.textHint') }}
          </div>

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

      <VCardActions class="app-dialog-actions">
        <VBtn
          color="success"
          variant="tonal"
          prepend-icon="mdi-cloud-sync-outline"
          :loading="syncingWiki"
          :disabled="syncingWiki"
          @click="syncWikiRepos"
        >
          {{ t('dialog.pluginMarketSetting.syncWiki') }}
        </VBtn>
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
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-block-size: 2.25rem;
}

.plugin-market-toolbar-hint {
  display: flex;
  align-items: center;
  border-radius: 0.375rem;
  background: rgba(var(--v-theme-info), 0.08);
  color: rgb(var(--v-theme-info));
  font-size: 0.875rem;
  gap: 0.5rem;
  min-inline-size: 0;
  padding-block: 0.5rem;
  padding-inline: 1rem;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.plugin-market-mode-switch {
  display: inline-flex;
  padding: 0.125rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 0.375rem;
  background: rgba(var(--v-theme-surface), 0.72);
  gap: 0.125rem;
}

.plugin-market-mode-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 0.375rem;
  background: transparent;
  block-size: 2.25rem;
  color: rgba(var(--v-theme-on-surface), 0.68);
  cursor: pointer;
  font: inherit;
  inline-size: 2.25rem;
  transition:
    background-color 0.16s ease,
    color 0.16s ease;

  &:hover {
    background: rgba(var(--v-theme-primary), 0.07);
    color: rgb(var(--v-theme-on-surface));
  }

  &:focus-visible {
    outline: 2px solid rgba(var(--v-theme-primary), 0.48);
    outline-offset: 2px;
  }

  &.is-active {
    background: rgba(var(--v-theme-primary), 0.12);
    color: rgb(var(--v-theme-primary));
  }
}

.plugin-market-list-panel,
.plugin-market-text-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.5rem;
  min-block-size: 0;
}

.plugin-market-input {
  flex-shrink: 0;
}

.plugin-market-list-wrap {
  flex: 1;
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

.plugin-market-repo-name,
.plugin-market-repo-url {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  line-break: anywhere;
  -webkit-line-clamp: 2;
  overflow-wrap: anywhere;
  white-space: normal;
  word-break: break-word;
}

.plugin-market-repo-url {
  line-height: 1.4;
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
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-block-size: 14rem;
}

.plugin-market-textarea-field {
  position: relative;
  display: flex;
  overflow: hidden;
  flex: 1;
  background: rgba(var(--v-theme-surface), 0.72);
  min-block-size: 0;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;

  &:focus-within {
    border-color: rgb(var(--v-theme-primary));
    box-shadow: 0 0 0 1px rgb(var(--v-theme-primary));
  }
}

.plugin-market-textarea-icon {
  position: absolute;
  z-index: 1;
  color: rgba(var(--v-theme-on-surface), 0.62);
  inset-block-start: 1.25rem;
  inset-inline-start: 1rem;
  pointer-events: none;
}

.plugin-market-textarea {
  flex: 1;
  border: 0;
  background: transparent;
  block-size: 100%;
  color: rgb(var(--v-theme-on-surface));
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 1rem;
  line-height: 1.6;
  min-block-size: 0;
  outline: none;
  overflow-y: auto;
  padding-block: 1rem;
  padding-inline: 3.25rem 1rem;
  resize: none;
  white-space: pre-wrap;
  word-break: break-word;
}

.plugin-market-text-hint {
  flex: 0 0 auto;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.8125rem;
  line-height: 1.4;
  padding-inline: 1rem;
}

.plugin-market-invalid-alert {
  :deep(.v-alert__content) {
    min-inline-size: 0;
  }
}

@media (width <= 600px) {
  .plugin-market-dialog-card {
    block-size: 100dvh;
  }

  .plugin-market-card-item {
    padding-block: 0.75rem 0.625rem;
    padding-inline: 1rem;
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
    padding-block: 0.75rem !important;
    padding-inline: 1rem !important;
  }

  .plugin-market-toolbar {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .plugin-market-mode-switch {
    flex: 0 0 auto;
  }

  .plugin-market-toolbar-hint {
    flex: 1 1 auto;
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
}
</style>
