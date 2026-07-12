<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import { useI18n } from 'vue-i18n'
import { useTheme } from 'vuetify'

const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))

const { t } = useI18n()
const $toast = useToast()
const { global: globalTheme } = useTheme()

type TextSectionKey = 'identifiers' | 'releaseGroups' | 'customization' | 'excludeWords'
type WordSectionKey = TextSectionKey | 'episodeRules'

interface EpisodeFormatRule {
  _localId: string
  name: string
  enabled: boolean
  order: number
  pattern: string
  min_file_size_mb: number
}

interface WordSectionDefinition {
  color: string
  description: string
  icon: string
  key: WordSectionKey
  shortTitle: string
  title: string
}

interface TextSectionSetting {
  endpoint: string
  failedMessage: string
  successMessage: string
}

const customIdentifiers = ref('')
const customReleaseGroups = ref('')
const customization = ref('')
const transferExcludeWords = ref('')
const episodeFormatRules = ref<EpisodeFormatRule[]>([])
const activeSection = ref<WordSectionKey>('identifiers')
const expandedHelp = ref<string | null>(null)
const saving = ref(false)

const textEditorTheme = computed(() => (globalTheme.current.value.dark ? 'github_dark' : 'github_light_default'))
const textEditorOptions = {
  fontSize: 13.6,
  highlightActiveLine: false,
  scrollPastEnd: 0,
  showGutter: false,
  showPrintMargin: false,
  tabSize: 2,
}

const savedTextValues = reactive<Record<TextSectionKey, string>>({
  identifiers: '',
  releaseGroups: '',
  customization: '',
  excludeWords: '',
})
const savedEpisodeRules = ref('[]')

const textSectionModels: Record<TextSectionKey, typeof customIdentifiers> = {
  identifiers: customIdentifiers,
  releaseGroups: customReleaseGroups,
  customization,
  excludeWords: transferExcludeWords,
}

const textSectionSettings = computed<Record<TextSectionKey, TextSectionSetting>>(() => ({
  identifiers: {
    endpoint: 'system/setting/CustomIdentifiers',
    failedMessage: t('setting.words.identifierSaveFailed'),
    successMessage: t('setting.words.identifierSaveSuccess'),
  },
  releaseGroups: {
    endpoint: 'system/setting/CustomReleaseGroups',
    failedMessage: t('setting.words.releaseGroupSaveFailed'),
    successMessage: t('setting.words.releaseGroupSaveSuccess'),
  },
  customization: {
    endpoint: 'system/setting/Customization',
    failedMessage: t('setting.words.customizationSaveFailed'),
    successMessage: t('setting.words.customizationSaveSuccess'),
  },
  excludeWords: {
    endpoint: 'system/setting/TransferExcludeWords',
    failedMessage: t('setting.words.excludeWordsSaveFailed'),
    successMessage: t('setting.words.excludeWordsSaveSuccess'),
  },
}))

const wordSections = computed<WordSectionDefinition[]>(() => [
  {
    color: 'primary',
    description: t('setting.words.identifiersDesc'),
    icon: 'mdi-tag-outline',
    key: 'identifiers',
    shortTitle: t('setting.words.identifiersShort'),
    title: t('setting.words.customIdentifiers'),
  },
  {
    color: 'secondary',
    description: t('setting.words.releaseGroupsDesc'),
    icon: 'mdi-account-group-outline',
    key: 'releaseGroups',
    shortTitle: t('setting.words.releaseGroupsShort'),
    title: t('setting.words.customReleaseGroups'),
  },
  {
    color: 'info',
    description: t('setting.words.customizationDesc'),
    icon: 'mdi-code-braces',
    key: 'customization',
    shortTitle: t('setting.words.customizationShort'),
    title: t('setting.words.customization'),
  },
  {
    color: 'success',
    description: t('setting.words.excludeWordsDesc'),
    icon: 'mdi-shield-off-outline',
    key: 'excludeWords',
    shortTitle: t('setting.words.excludeWordsShort'),
    title: t('setting.words.transferExcludeWords'),
  },
  {
    color: 'primary',
    description: t('setting.words.episodeFormatRuleDesc'),
    icon: 'mdi-format-list-numbered',
    key: 'episodeRules',
    shortTitle: t('setting.words.episodeFormatRuleShort'),
    title: t('setting.words.episodeFormatRule'),
  },
])

const activeSectionDefinition = computed(
  () => wordSections.value.find(section => section.key === activeSection.value) ?? wordSections.value[0],
)

const isTextSection = computed(() => activeSection.value !== 'episodeRules')

const activeTextValue = computed({
  get: () => (isTextSection.value ? textSectionModels[activeSection.value as TextSectionKey].value : ''),
  set: value => {
    if (isTextSection.value) textSectionModels[activeSection.value as TextSectionKey].value = value
  },
})

const activeTextPlaceholder = computed(() => {
  switch (activeSection.value) {
    case 'identifiers':
      return t('setting.words.identifiersPlaceholder')
    case 'releaseGroups':
      return t('setting.words.releaseGroupsPlaceholder')
    case 'customization':
      return t('setting.words.customizationPlaceholder')
    case 'excludeWords':
      return t('setting.words.excludeWordsPlaceholder')
    default:
      return ''
  }
})

const activeTextHint = computed(() => {
  switch (activeSection.value) {
    case 'identifiers':
      return t('setting.words.identifiersHint')
    case 'releaseGroups':
      return t('setting.words.releaseGroupsHint')
    case 'customization':
      return t('setting.words.customizationHint')
    case 'excludeWords':
      return t('setting.words.excludeWordsHint')
    default:
      return ''
  }
})

const activeGuideTitle = computed(() =>
  activeSection.value === 'identifiers'
    ? t('setting.words.formatTitle')
    : activeSection.value === 'episodeRules'
      ? t('setting.words.episodeFormatRuleGuideTitle')
      : t('setting.words.guideTitle'),
)

const activeGuideContent = computed(() => {
  if (activeSection.value === 'identifiers') return t('setting.words.formatContent')
  if (activeSection.value === 'episodeRules') return t('setting.words.episodeFormatRuleGuideContent')
  return activeTextHint.value
})

// 仅在提示内容能补充行内说明时展示折叠面板，避免捷径弹窗内重复出现相同文案。
const shouldShowGuidePanel = computed(
  () => activeSection.value === 'identifiers' || activeSection.value === 'episodeRules',
)

/** 生成仅供前端拖拽列表使用的稳定规则标识。 */
function createEpisodeRuleLocalId() {
  return `episode-rule-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** 将后端规则或空白模板转换为带本地标识的可编辑规则。 */
function createEpisodeRule(rule?: Partial<Omit<EpisodeFormatRule, '_localId'>>): EpisodeFormatRule {
  return {
    _localId: createEpisodeRuleLocalId(),
    name: rule?.name ?? '',
    enabled: rule?.enabled ?? true,
    order: rule?.order ?? episodeFormatRules.value.length + 1,
    pattern: rule?.pattern ?? '',
    min_file_size_mb: rule?.min_file_size_mb ?? 500,
  }
}

/** 规范化后端返回的集数定位规则列表。 */
function normalizeEpisodeFormatRules(
  rules: Array<Partial<Omit<EpisodeFormatRule, '_localId'>> & { _localId?: string }> = [],
) {
  return rules.map(rule => createEpisodeRule(rule))
}

/** 构建后端保存集数定位规则所需的有序载荷。 */
function buildEpisodeFormatRulePayload() {
  return episodeFormatRules.value.map((rule, index) => ({
    name: rule.name,
    enabled: rule.enabled,
    order: index + 1,
    pattern: rule.pattern,
    min_file_size_mb: Number(rule.min_file_size_mb) || 0,
  }))
}

/** 将集数定位规则序列化，用于判断当前内容是否有未保存修改。 */
function serializeEpisodeFormatRules() {
  return JSON.stringify(buildEpisodeFormatRulePayload())
}

/** 统计多行词表中非空配置的数量。 */
function countConfiguredLines(value: string) {
  return value.split('\n').filter(line => line.trim().length > 0).length
}

/** 返回指定词表分类当前配置条目数。 */
function getSectionCount(section: WordSectionKey) {
  return section === 'episodeRules'
    ? episodeFormatRules.value.length
    : countConfiguredLines(textSectionModels[section].value)
}

/** 判断指定词表分类是否存在未保存修改。 */
function isSectionDirty(section: WordSectionKey) {
  return section === 'episodeRules'
    ? serializeEpisodeFormatRules() !== savedEpisodeRules.value
    : textSectionModels[section].value !== savedTextValues[section]
}

const activeSectionDirty = computed(() => isSectionDirty(activeSection.value))
const activeSectionCount = computed(() => getSectionCount(activeSection.value))
const totalConfiguredEntries = computed(() =>
  wordSections.value.reduce((total, section) => total + getSectionCount(section.key), 0),
)

/** 切换当前正在编辑的词表分类，并收起帮助内容。 */
function selectSection(section: WordSectionKey) {
  activeSection.value = section
  expandedHelp.value = null
}

/** 新增一条空白集数定位规则并滚动到规则编辑分类。 */
function addEpisodeRule() {
  episodeFormatRules.value.push(createEpisodeRule())
  activeSection.value = 'episodeRules'
}

/** 删除指定位置的集数定位规则。 */
function deleteEpisodeRule(index: number) {
  episodeFormatRules.value.splice(index, 1)
}

/** 查询一个多行词表配置，并同步其已保存快照。 */
async function queryTextSection(section: TextSectionKey) {
  try {
    const result: { [key: string]: any } = await api.get(textSectionSettings.value[section].endpoint)
    const value = Array.isArray(result?.data?.value) ? result.data.value.join('\n') : ''
    textSectionModels[section].value = value
    savedTextValues[section] = value
  } catch (error) {
    console.log(error)
  }
}

/** 保存一个多行词表配置，并在成功后更新已保存快照。 */
async function saveTextSection(section: TextSectionKey) {
  const setting = textSectionSettings.value[section]

  try {
    const value = textSectionModels[section].value
    const result: { [key: string]: any } = await api.post(setting.endpoint, value.split('\n'))

    if (result.success) {
      savedTextValues[section] = value
      $toast.success(setting.successMessage)
      return true
    }

    $toast.error(setting.failedMessage)
  } catch (error) {
    console.log(error)
    $toast.error(setting.failedMessage)
  }

  return false
}

/** 查询集数定位规则，并同步其已保存快照。 */
async function queryEpisodeFormatRules() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/public/EpisodeFormatRuleTable')
    episodeFormatRules.value = normalizeEpisodeFormatRules(result?.data?.value ?? [])
    savedEpisodeRules.value = serializeEpisodeFormatRules()
  } catch (error) {
    console.log(error)
  }
}

/** 校验并保存集数定位规则。 */
async function saveEpisodeFormatRules() {
  for (const rule of episodeFormatRules.value) {
    if (!rule.name || !rule.pattern) {
      $toast.error(t('setting.words.episodeFormatRuleEmptyError'))
      return false
    }
  }

  try {
    const payload = buildEpisodeFormatRulePayload()
    const result: { [key: string]: any } = await api.post('system/setting/EpisodeFormatRuleTable', payload)

    if (result.success) {
      episodeFormatRules.value.forEach((rule, index) => {
        rule.order = payload[index].order
        rule.min_file_size_mb = payload[index].min_file_size_mb
      })
      savedEpisodeRules.value = serializeEpisodeFormatRules()
      $toast.success(t('setting.words.episodeFormatRuleSaveSuccess'))
      return true
    }

    $toast.error(result.message || t('setting.words.episodeFormatRuleSaveFailed'))
  } catch (error) {
    console.log(error)
    $toast.error(t('setting.words.episodeFormatRuleSaveFailed'))
  }

  return false
}

/** 保存当前正在编辑的词表分类。 */
async function saveActiveSection() {
  if (saving.value) return

  saving.value = true
  try {
    if (activeSection.value === 'episodeRules') await saveEpisodeFormatRules()
    else await saveTextSection(activeSection.value)
  } finally {
    saving.value = false
  }
}

/** 将当前分类恢复为最近一次成功加载或保存的内容。 */
function resetActiveSection() {
  if (activeSection.value === 'episodeRules') {
    const savedRules = JSON.parse(savedEpisodeRules.value) as Array<Omit<EpisodeFormatRule, '_localId'>>
    episodeFormatRules.value = normalizeEpisodeFormatRules(savedRules)
    return
  }

  textSectionModels[activeSection.value].value = savedTextValues[activeSection.value]
}

/** 拖拽调整规则顺序后沿用原有行为立即保存。 */
async function onEpisodeRuleDragEnd() {
  if (saving.value) return

  saving.value = true
  try {
    await saveEpisodeFormatRules()
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  Promise.all([
    queryTextSection('identifiers'),
    queryTextSection('releaseGroups'),
    queryTextSection('customization'),
    queryTextSection('excludeWords'),
    queryEpisodeFormatRules(),
  ])
})
</script>

<template>
  <div class="words-view">
    <header class="words-summary d-none d-md-flex">
      <span>{{ t('setting.words.summary', { sections: wordSections.length, entries: totalConfiguredEntries }) }}</span>
    </header>

    <div class="words-workspace">
      <nav class="words-sidebar d-none d-md-flex" :aria-label="t('setting.words.sectionListLabel')">
        <button
          v-for="section in wordSections"
          :key="section.key"
          type="button"
          class="words-sidebar-item"
          :class="{ 'words-sidebar-item--active': activeSection === section.key }"
          :aria-current="activeSection === section.key ? 'page' : undefined"
          @click="selectSection(section.key)"
        >
          <VAvatar :color="section.color" variant="tonal" rounded="lg" size="44" class="words-section-icon">
            <VIcon :icon="section.icon" size="24" />
          </VAvatar>

          <span class="words-sidebar-copy">
            <strong>{{ section.title }}</strong>
            <small>{{ section.description }}</small>
          </span>

          <span class="words-sidebar-state">
            <small>{{ t('setting.words.entryCount', { count: getSectionCount(section.key) }) }}</small>
            <VIcon
              :icon="isSectionDirty(section.key) ? 'mdi-circle-medium' : 'mdi-check'"
              :color="isSectionDirty(section.key) ? 'warning' : 'success'"
              size="18"
            />
          </span>
        </button>

        <div class="words-sidebar-hint">
          <VIcon icon="mdi-information-outline" size="18" />
          <span>{{ t('setting.words.switchHint') }}</span>
        </div>
      </nav>

      <nav class="words-mobile-tabs d-md-none" :aria-label="t('setting.words.sectionListLabel')">
        <button
          v-for="section in wordSections"
          :key="section.key"
          type="button"
          class="words-mobile-tab"
          :class="{ 'words-mobile-tab--active': activeSection === section.key }"
          :aria-current="activeSection === section.key ? 'page' : undefined"
          @click="selectSection(section.key)"
        >
          <span class="words-mobile-tab-icon">
            <VIcon :icon="section.icon" size="23" />
            <span v-if="isSectionDirty(section.key)" class="words-dirty-dot" />
          </span>
          <span>{{ section.shortTitle }}</span>
        </button>
      </nav>

      <section class="words-editor">
        <header class="words-editor-header">
          <div class="words-editor-heading">
            <h2>{{ activeSectionDefinition.title }}</h2>
            <p>{{ activeSectionDefinition.description }}</p>
          </div>

          <div class="words-save-state" :class="{ 'words-save-state--dirty': activeSectionDirty }">
            <VIcon :icon="activeSectionDirty ? 'mdi-circle-medium' : 'mdi-check-circle-outline'" size="18" />
            <span>{{ activeSectionDirty ? t('setting.words.unsaved') : t('setting.words.saved') }}</span>
          </div>
        </header>

        <div class="words-editor-scroll">
          <template v-if="isTextSection">
            <div class="words-field-meta">
              <strong>{{ t('setting.words.listLabel') }}</strong>
              <span>{{ t('setting.words.entryCount', { count: activeSectionCount }) }}</span>
            </div>

            <VAceEditor
              v-if="activeSection === 'identifiers'"
              v-model:value="activeTextValue"
              lang="word_list"
              :theme="textEditorTheme"
              :options="textEditorOptions"
              :placeholder="activeTextPlaceholder"
              :print-margin="false"
              wrap
              class="words-text-editor"
            />
            <VTextarea
              v-else
              v-model="activeTextValue"
              class="words-textarea"
              :placeholder="activeTextPlaceholder"
              variant="outlined"
              rows="11"
              hide-details
              no-resize
              spellcheck="false"
            />

            <div class="words-inline-hint">
              <VIcon icon="mdi-information-outline" size="17" />
              <span>{{ activeTextHint }}</span>
            </div>
          </template>

          <template v-else>
            <div class="words-rule-toolbar">
              <span>{{ t('setting.words.ruleCount', { count: activeSectionCount }) }}</span>
              <VBtn variant="outlined" prepend-icon="mdi-plus" @click="addEpisodeRule">
                {{ t('setting.words.episodeFormatRuleAdd') }}
              </VBtn>
            </div>

            <Draggable
              v-model="episodeFormatRules"
              handle=".episode-rule-drag"
              item-key="_localId"
              tag="div"
              :component-data="{ class: 'episode-rule-list' }"
              @end="onEpisodeRuleDragEnd"
            >
              <template #item="{ element, index }">
                <article class="episode-rule-card">
                  <div class="episode-rule-card-header">
                    <IconBtn
                      icon="mdi-drag-vertical"
                      variant="text"
                      class="episode-rule-drag cursor-move"
                      :aria-label="t('setting.words.dragToSort')"
                    />
                    <VSwitch
                      v-model="element.enabled"
                      color="primary"
                      density="compact"
                      hide-details
                      :label="t('common.enable')"
                      class="episode-rule-enabled"
                    />
                  </div>

                  <VTextField
                    v-model="element.name"
                    :label="t('setting.words.episodeFormatRuleName')"
                    hide-details="auto"
                    density="comfortable"
                    required
                    class="episode-rule-name"
                  />
                  <VTextField
                    v-model="element.pattern"
                    :label="t('setting.words.episodeFormatRulePattern')"
                    hide-details="auto"
                    density="comfortable"
                    required
                    class="episode-rule-pattern"
                  />
                  <VTextField
                    v-model.number="element.min_file_size_mb"
                    :label="t('setting.words.episodeFormatRuleMinSize')"
                    type="number"
                    min="0"
                    hide-details="auto"
                    density="comfortable"
                    required
                    class="episode-rule-size"
                  />
                  <IconBtn
                    variant="text"
                    color="error"
                    class="episode-rule-delete"
                    :aria-label="t('common.delete')"
                    @click.stop="deleteEpisodeRule(index)"
                  >
                    <VIcon icon="mdi-delete-outline" />
                    <VTooltip activator="parent" location="top">{{ t('common.delete') }}</VTooltip>
                  </IconBtn>
                </article>
              </template>
            </Draggable>

            <div v-if="episodeFormatRules.length === 0" class="words-empty-state">
              <VIcon icon="mdi-format-list-numbered" size="36" />
              <span>{{ t('setting.words.noRules') }}</span>
            </div>
          </template>

          <VExpansionPanels
            v-if="shouldShowGuidePanel"
            v-model="expandedHelp"
            class="words-help-panels"
            variant="accordion"
          >
            <VExpansionPanel value="guide" elevation="0">
              <VExpansionPanelTitle>
                <template #default>
                  <span class="words-help-title">
                    <VIcon icon="mdi-information-outline" color="primary" size="21" />
                    {{ activeGuideTitle }}
                  </span>
                </template>
              </VExpansionPanelTitle>
              <VExpansionPanelText>
                <div class="words-help-content" v-html="activeGuideContent.split('\n').join('<br>')" />
              </VExpansionPanelText>
            </VExpansionPanel>
          </VExpansionPanels>
        </div>

        <footer class="words-editor-footer">
          <div class="words-footer-state" :class="{ 'words-footer-state--dirty': activeSectionDirty }">
            <VIcon :icon="activeSectionDirty ? 'mdi-circle-medium' : 'mdi-check-circle-outline'" size="18" />
            <span>{{ activeSectionDirty ? t('setting.words.unsaved') : t('setting.words.saved') }}</span>
          </div>

          <div class="words-footer-actions">
            <VBtn
              variant="text"
              :disabled="!activeSectionDirty || saving"
              prepend-icon="mdi-restore"
              @click="resetActiveSection"
            >
              {{ t('common.reset') }}
            </VBtn>
            <VBtn
              color="primary"
              :loading="saving"
              prepend-icon="mdi-content-save"
              @click="saveActiveSection"
            >
              {{ t('setting.words.saveChanges') }}
            </VBtn>
          </div>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.words-view {
  --words-surface-background: var(--app-grouped-list-background);
  --words-surface-filter: var(--app-grouped-list-backdrop-filter);
  --words-surface-border: var(--app-grouped-list-border);
  --words-surface-radius: var(--app-grouped-list-radius);
  --words-separator-color: var(--app-grouped-list-separator-color);
  --words-hover-background: var(--app-grouped-list-hover-background);
  --words-active-background: var(--app-grouped-list-active-background);

  display: flex;
  min-block-size: 0;
  flex-direction: column;
  background: transparent;
}

.words-summary {
  align-items: center;
  min-block-size: 3rem;
  padding: 0.75rem 1.25rem;
  border-block-end: 1px solid var(--words-separator-color);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
}

.words-workspace {
  display: grid;
  overflow: hidden;
  min-block-size: 32rem;
  block-size: min(40rem, calc(100dvh - 10rem));
  border: var(--words-surface-border);
  border-radius: var(--words-surface-radius);
  backdrop-filter: var(--words-surface-filter);
  background: var(--words-surface-background);
  grid-template-columns: 19rem minmax(0, 1fr);
}

.words-sidebar {
  min-block-size: 0;
  border-inline-end: 1px solid var(--words-separator-color);
  flex-direction: column;
}

.words-sidebar-item {
  display: grid;
  min-block-size: 6.25rem;
  align-items: center;
  border: 0;
  border-block-end: 1px solid var(--words-separator-color);
  background: transparent;
  color: inherit;
  cursor: pointer;
  gap: 0.75rem;
  grid-template-columns: max-content minmax(0, 1fr) max-content;
  padding: 0.875rem 1rem;
  text-align: start;
  transition: background-color 0.18s ease;
}

.words-sidebar-item:hover,
.words-sidebar-item:focus-visible {
  background: var(--words-hover-background);
  outline: none;
}

.words-sidebar-item--active {
  position: relative;
  background: var(--words-active-background);
  color: rgb(var(--v-theme-primary));
}

.words-sidebar-item--active::before {
  position: absolute;
  background: rgb(var(--v-theme-primary));
  content: '';
  inline-size: 3px;
  inset-block: 0;
  inset-inline-start: 0;
}

.words-section-icon {
  flex: 0 0 auto;
}

.words-sidebar-copy {
  display: flex;
  min-inline-size: 0;
  flex-direction: column;
  gap: 0.25rem;
}

.words-sidebar-copy strong {
  overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.9375rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.words-sidebar-copy small {
  display: -webkit-box;
  overflow: hidden;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.words-sidebar-state {
  display: flex;
  align-items: flex-end;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  flex-direction: column;
  gap: 0.35rem;
}

.words-sidebar-state small {
  font-size: 0.72rem;
  white-space: nowrap;
}

.words-sidebar-hint {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-block-start: auto;
  padding: 1rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
}

.words-editor {
  display: flex;
  overflow: hidden;
  min-block-size: 0;
  flex: 1 1 auto;
  flex-direction: column;
}

.words-editor-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.35rem 1.5rem 1rem;
}

.words-editor-heading {
  min-inline-size: 0;
}

.words-editor-heading h2 {
  margin: 0;
  color: rgb(var(--v-theme-on-surface));
  font-size: 1.25rem;
  font-weight: 650;
  line-height: 1.35;
}

.words-editor-heading p {
  margin: 0.35rem 0 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
  line-height: 1.55;
}

.words-save-state,
.words-footer-state {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  color: rgb(var(--v-theme-success));
  font-size: 0.78rem;
  gap: 0.3rem;
  white-space: nowrap;
}

.words-save-state--dirty,
.words-footer-state--dirty {
  color: rgb(var(--v-theme-warning));
}

.words-editor-scroll {
  overflow: auto;
  min-block-size: 0;
  flex: 1 1 auto;
  padding: 0 1.5rem 1.25rem;
}

.words-field-meta,
.words-rule-toolbar {
  display: flex;
  min-block-size: 2.5rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.78rem;
}

.words-field-meta strong {
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.85rem;
  font-weight: 600;
}

.words-textarea :deep(textarea) {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 0.85rem;
  line-height: 1.65;
}

.words-textarea :deep(.v-field) {
  background: transparent;
}

.words-text-editor {
  overflow: hidden;
  block-size: 15.8rem;
  border: 1px solid rgba(var(--v-theme-on-surface), var(--v-border-opacity));
  border-radius: var(--app-surface-radius);
  contain: paint;
  overscroll-behavior: contain;
  transform: translateZ(0);
}

.words-text-editor :deep(.ace_scroller),
.words-text-editor :deep(.ace_content),
.words-text-editor :deep(.ace_text-layer) {
  transform: translateZ(0);
  will-change: transform;
}

.words-text-editor :deep(.ace_comment) {
  color: rgb(var(--v-theme-success)) !important;
  font-style: normal;
}

.words-inline-hint {
  display: flex;
  align-items: flex-start;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  gap: 0.4rem;
  line-height: 1.5;
  margin-block-start: 0.65rem;
}

.words-help-panels {
  min-inline-size: 0;
  margin-block-start: 1rem;
}

.words-help-panels :deep(.v-expansion-panel) {
  overflow: hidden;
  border: var(--words-surface-border);
  border-radius: var(--app-surface-radius) !important;
  background: var(--words-hover-background);
}

.words-help-panels :deep(.v-expansion-panel-title) {
  min-block-size: 3.25rem;
}

.words-help-title {
  display: flex;
  align-items: center;
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
  gap: 0.55rem;
}

.words-help-content {
  min-inline-size: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.78rem;
  line-height: 1.7;
  overflow-wrap: anywhere;
  white-space: normal;
  word-break: break-word;
}

.words-editor-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  min-block-size: 4.5rem;
  border-block-start: 1px solid var(--words-separator-color);
  backdrop-filter: var(--words-surface-filter);
  background: var(--words-surface-background);
  gap: 1rem;
  padding: 0.75rem 1.5rem;
}

.words-footer-state {
  display: none;
}

.words-footer-actions {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin-inline-start: auto;
}

.episode-rule-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.episode-rule-card {
  display: grid;
  align-items: start;
  border: 1px solid var(--words-separator-color);
  border-radius: var(--app-surface-radius);
  background: transparent;
  gap: 0.75rem;
  grid-template-areas:
    'toolbar name size delete'
    'pattern pattern pattern pattern';
  grid-template-columns: max-content minmax(10rem, 1fr) minmax(9rem, 11rem) max-content;
  padding: 0.85rem;
}

.episode-rule-card-header {
  display: flex;
  min-block-size: 3.5rem;
  align-items: center;
  gap: 0.3rem;
  grid-area: toolbar;
}

.episode-rule-enabled {
  flex: 0 0 auto;
}

.episode-rule-enabled :deep(.v-label) {
  display: none;
}

.episode-rule-name {
  grid-area: name;
}

.episode-rule-pattern {
  grid-area: pattern;
}

.episode-rule-size {
  grid-area: size;
}

.episode-rule-delete {
  align-self: center;
  grid-area: delete;
  justify-self: end;
}

.words-empty-state {
  display: flex;
  min-block-size: 10rem;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--words-separator-color);
  border-radius: var(--app-surface-radius);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  flex-direction: column;
  gap: 0.75rem;
}

@media (width <= 959.98px) {
  .words-view {
    flex: 1 1 auto;
    block-size: 100%;
    min-block-size: 0;
  }

  .words-workspace {
    display: flex;
    overflow: hidden;
    min-block-size: 0;
    block-size: 100%;
    border: 0;
    border-radius: 0;
    flex-direction: column;
  }

  .words-mobile-tabs {
    display: flex;
    overflow-x: auto;
    flex: 0 0 auto;
    border-block-end: 1px solid var(--words-separator-color);
    background: var(--words-surface-background);
    scrollbar-width: none;
  }

  .words-mobile-tabs::-webkit-scrollbar {
    display: none;
  }

  .words-mobile-tab {
    position: relative;
    display: flex;
    min-inline-size: 5.2rem;
    min-block-size: 5.4rem;
    align-items: center;
    justify-content: center;
    border: 0;
    background: transparent;
    color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
    cursor: pointer;
    flex: 1 0 auto;
    flex-direction: column;
    font-size: 0.78rem;
    gap: 0.45rem;
    padding: 0.75rem 0.6rem 0.6rem;
  }

  .words-mobile-tab::after {
    position: absolute;
    background: transparent;
    block-size: 3px;
    content: '';
    inset-block-end: 0;
    inset-inline: 0.65rem;
  }

  .words-mobile-tab--active {
    color: rgb(var(--v-theme-primary));
  }

  .words-mobile-tab--active::after {
    background: rgb(var(--v-theme-primary));
  }

  .words-mobile-tab-icon {
    position: relative;
    display: inline-flex;
  }

  .words-dirty-dot {
    position: absolute;
    border: 2px solid var(--words-surface-background);
    border-radius: 50%;
    background: rgb(var(--v-theme-warning));
    block-size: 0.55rem;
    inline-size: 0.55rem;
    inset-block-start: -0.18rem;
    inset-inline-end: -0.3rem;
  }

  .words-editor-header {
    padding: 1.4rem 1.25rem 0.85rem;
  }

  .words-editor-heading h2 {
    font-size: 1.45rem;
  }

  .words-editor-heading p {
    font-size: 0.85rem;
  }

  .words-save-state {
    display: none;
  }

  .words-editor-scroll {
    padding: 0 1.25rem 1.25rem;
  }

  .words-field-meta {
    min-block-size: 2.75rem;
  }

  .words-textarea :deep(.v-field__input) {
    min-block-size: 18rem;
  }

  .words-text-editor {
    block-size: 18rem;
  }

  .words-rule-toolbar {
    align-items: stretch;
    flex-direction: column;
    margin-block-end: 1rem;
  }

  .words-rule-toolbar .v-btn {
    inline-size: 100%;
  }

  .episode-rule-card {
    grid-template-areas:
      'toolbar delete'
      'name name'
      'pattern pattern'
      'size size';
    grid-template-columns: minmax(0, 1fr) max-content;
    gap: 0.75rem;
    padding: 0.95rem;
  }

  .episode-rule-card-header {
    justify-content: flex-start;
  }

  .episode-rule-delete {
    margin-inline-start: 0;
  }

  .episode-rule-enabled :deep(.v-label) {
    display: inline-flex;
  }

  .words-editor-footer {
    position: relative;
    min-block-size: calc(5.25rem + env(safe-area-inset-bottom));
    padding: 0.75rem 1.25rem calc(0.75rem + env(safe-area-inset-bottom));
  }

  .words-footer-state {
    display: flex;
    font-size: 0.8rem;
  }

  .words-footer-actions {
    gap: 0.35rem;
  }

  .words-footer-actions .v-btn {
    min-inline-size: 0;
  }
}

@media (width <= 420px) {
  .words-mobile-tab {
    min-inline-size: 4.85rem;
  }

  .words-editor-header {
    padding-inline: 1rem;
  }

  .words-editor-scroll {
    padding-inline: 1rem;
  }

  .words-editor-footer {
    padding-inline: 1rem;
  }

}
</style>
