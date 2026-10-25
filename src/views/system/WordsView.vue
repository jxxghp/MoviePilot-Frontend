<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import { useI18n } from 'vue-i18n'
import { useTheme } from 'vuetify'
import { configureAceEditorPadding } from '@/utils/aceEditor'
import type { Ace } from 'ace-builds'
import { listCustomIdentifiers, replaceCustomIdentifiers } from '@/api/customIdentifiers'

const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))

const { t } = useI18n()
const $toast = useToast()
const { global: globalTheme } = useTheme()

const WORDS_LINE_NUMBERS_STORAGE_KEY = 'MP_WORDS_SHOW_LINE_NUMBERS'
const WORDS_SYNTAX_HIGHLIGHTING_STORAGE_KEY = 'MP_WORDS_SYNTAX_HIGHLIGHTING'

type TextSectionKey = 'identifiers' | 'releaseGroups' | 'customization' | 'excludeWords'
type WordSectionKey = TextSectionKey | 'episodeRules'

/** 集数定位规则的编辑副本，本地标识不提交到后端。 */
interface EpisodeFormatRule {
  _localId: string
  name: string
  enabled: boolean
  order: number
  pattern: string
  min_file_size_mb: number
}

/** 词表分类在桌面侧栏与移动分段栏共用的展示定义。 */
interface WordSectionDefinition {
  color: string
  description: string
  icon: string
  key: WordSectionKey
  shortTitle: string
  title: string
}

/** 多行词表分类对应的保存接口和结果文案。 */
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
const showLineNumbers = ref(localStorage.getItem(WORDS_LINE_NUMBERS_STORAGE_KEY) === 'true')
const showSyntaxHighlighting = ref(localStorage.getItem(WORDS_SYNTAX_HIGHLIGHTING_STORAGE_KEY) === 'true')

/** 当前 Ace 会话的词表语法高亮配置。 */
interface WordListModeConfig {
  path: 'ace/mode/word_list'
  syntax: boolean
}

const aceEditor = shallowRef<Ace.Editor | null>(null)

/** 初始化词表编辑器并同步用户保存的语法高亮设置。 */
function onAceInit(editor: Ace.Editor) {
  aceEditor.value = editor
  configureAceEditorPadding(editor)
  applyWordListSyntax()
}

/** 切换当前 Ace 会话的词表语法模式，保留正在编辑的内容。 */
function applyWordListSyntax() {
  if (!aceEditor.value) return
  const mode: WordListModeConfig = {
    path: 'ace/mode/word_list',
    syntax: showSyntaxHighlighting.value,
  }
  aceEditor.value.session.setMode(mode as unknown as Ace.SyntaxMode)
}
const textEditorTheme = computed(() => (globalTheme.current.value.dark ? 'github_dark' : 'github_light_default'))
const textEditorOptions = computed(() => ({
  fontSize: 13.6,
  highlightActiveLine: false,
  scrollPastEnd: 0,
  showFoldWidgets: false,
  showGutter: showLineNumbers.value,
  showLineNumbers: showLineNumbers.value,
  showPrintMargin: false,
  tabSize: 2,
}))

watch(showLineNumbers, value => {
  localStorage.setItem(WORDS_LINE_NUMBERS_STORAGE_KEY, String(value))
})

watch(showSyntaxHighlighting, value => {
  localStorage.setItem(WORDS_SYNTAX_HIGHLIGHTING_STORAGE_KEY, String(value))
})

watch(showSyntaxHighlighting, applyWordListSyntax)

const savedTextValues = reactive<Record<TextSectionKey, string>>({
  identifiers: '',
  releaseGroups: '',
  customization: '',
  excludeWords: '',
})
const savedCustomIdentifierLines = ref<string[]>([])
const savedEpisodeRules = ref('[]')

const textSectionModels: Record<TextSectionKey, typeof customIdentifiers> = {
  identifiers: customIdentifiers,
  releaseGroups: customReleaseGroups,
  customization,
  excludeWords: transferExcludeWords,
}

const textSectionSettings = computed<Record<TextSectionKey, TextSectionSetting>>(() => ({
  identifiers: {
    endpoint: 'system/identifiers',
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
    const lines =
      section === 'identifiers'
        ? await listCustomIdentifiers()
        : await api
            .get<{ value?: unknown }>(textSectionSettings.value[section].endpoint)
            .then(result => (Array.isArray(result?.value) ? result.value.filter(item => typeof item === 'string') : []))
    const value = lines.join('\n')
    textSectionModels[section].value = value
    savedTextValues[section] = value
    if (section === 'identifiers') savedCustomIdentifierLines.value = [...lines]
  } catch (error) {
    console.log(error)
  }
}

/** 保存一个多行词表配置，并在成功后更新已保存快照。 */
async function saveTextSection(section: TextSectionKey) {
  const setting = textSectionSettings.value[section]

  try {
    const value = textSectionModels[section].value
    if (section === 'identifiers') {
      const savedLines = await replaceCustomIdentifiers(value.split('\n'), savedCustomIdentifierLines.value)
      const savedValue = savedLines.join('\n')
      customIdentifiers.value = savedValue
      savedCustomIdentifierLines.value = [...savedLines]
      savedTextValues[section] = savedValue
    } else {
      await api.post<null>(setting.endpoint, value.split('\n'), { feedback: 'silent' })
      savedTextValues[section] = value
    }
    $toast.success(setting.successMessage)
    return true
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
    episodeFormatRules.value = normalizeEpisodeFormatRules(result?.value ?? [])
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
    await api.post<null>('system/setting/EpisodeFormatRuleTable', payload, { feedback: 'silent' })
    episodeFormatRules.value.forEach((rule, index) => {
      rule.order = payload[index].order
      rule.min_file_size_mb = payload[index].min_file_size_mb
    })
    savedEpisodeRules.value = serializeEpisodeFormatRules()
    $toast.success(t('setting.words.episodeFormatRuleSaveSuccess'))
    return true
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
              <div class="words-field-actions">
                <span>{{ t('setting.words.entryCount', { count: activeSectionCount }) }}</span>
                <VSwitch
                  v-if="activeSection === 'identifiers'"
                  v-model="showLineNumbers"
                  class="words-editor-switch"
                  color="primary"
                  density="compact"
                  hide-details
                  :label="t('setting.words.lineNumbers')"
                  :mobile-layout="false"
                />
                <VSwitch
                  v-if="activeSection === 'identifiers'"
                  v-model="showSyntaxHighlighting"
                  class="words-editor-switch"
                  color="primary"
                  density="compact"
                  hide-details
                  :label="t('setting.words.syntaxHighlighting')"
                  :mobile-layout="false"
                />
              </div>
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
              @init="onAceInit"
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
            <VBtn color="primary" :loading="saving" prepend-icon="mdi-content-save" @click="saveActiveSection">
              {{ t('setting.words.saveChanges') }}
            </VBtn>
          </div>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* stylelint-disable selector-pseudo-class-no-unknown */

.words-view {
  --words-surface-background: transparent;
  --words-surface-filter: none;
  --words-surface-border: 0;
  --words-surface-radius: 0;
  --words-separator-color: rgba(var(--v-theme-on-surface), 0.12);
  --words-hover-background: rgba(var(--v-theme-on-surface), 0.04);
  --words-active-background: rgba(var(--v-theme-on-surface), 0.08);

  display: flex;
  flex-direction: column;
  background: transparent;
  inline-size: 100%;
  min-block-size: 0;
  /* 弹窗正文是横向 flex 容器，编辑器和标签的固有宽度不能反向撑大整张工作台。 */
  min-inline-size: 0;
}

.words-summary {
  align-items: center;
  border-block-end: 1px solid var(--words-separator-color);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
  min-block-size: 3rem;
  padding-block: 0.75rem;
  padding-inline: 1.25rem;
}

.words-workspace {
  display: grid;
  overflow: hidden;
  border: var(--words-surface-border);
  border-radius: var(--words-surface-radius);
  backdrop-filter: var(--words-surface-filter);
  background: var(--words-surface-background);
  block-size: min(40rem, calc(100dvh - 10rem));
  grid-template-columns: 19rem minmax(0, 1fr);
  min-block-size: 32rem;
  min-inline-size: 0;
}

.words-sidebar {
  flex-direction: column;
  border-inline-end: 1px solid var(--words-separator-color);
  min-block-size: 0;
}

.words-sidebar-item {
  display: grid;
  align-items: center;
  border: 0;
  background: transparent;
  border-block-end: 1px solid var(--words-separator-color);
  color: inherit;
  cursor: pointer;
  gap: 0.75rem;
  grid-template-columns: max-content minmax(0, 1fr) max-content;
  min-block-size: 6.25rem;
  padding-block: 0.875rem;
  padding-inline: 1rem;
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
  flex-direction: column;
  gap: 0.25rem;
  min-inline-size: 0;
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
  -webkit-box-orient: vertical;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  -webkit-line-clamp: 2;
  line-height: 1.45;
}

.words-sidebar-state {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  gap: 0.35rem;
}

.words-sidebar-state small {
  font-size: 0.72rem;
  white-space: nowrap;
}

.words-sidebar-hint {
  display: flex;
  align-items: center;
  padding: 1rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.75rem;
  gap: 0.5rem;
  margin-block-start: auto;
}

.words-editor {
  display: flex;
  overflow: hidden;
  flex: 1 1 auto;
  flex-direction: column;
  min-block-size: 0;
  min-inline-size: 0;
}

.words-editor-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding-block: 1.35rem 1rem;
  padding-inline: 1.5rem;
}

.words-editor-heading {
  min-inline-size: 0;
}

.words-editor-heading h2 {
  margin: 0;
  color: rgb(var(--v-theme-on-surface));
  font-size: 1.125rem;
  font-weight: 650;
  line-height: 1.35;
}

.words-editor-heading p {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
  line-height: 1.55;
  margin-block: 0.35rem 0;
  margin-inline: 0;
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
  flex: 1 1 auto;
  min-block-size: 0;
  padding-block: 0 1.25rem;
  padding-inline: 1.5rem;
}

.words-field-meta,
.words-rule-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.78rem;
  gap: 1rem;
  min-block-size: 2.5rem;
}

.words-field-meta strong {
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.85rem;
  font-weight: 600;
}

.words-field-actions {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.8rem;
}

.words-editor-switch {
  flex: 0 0 auto;
}

.words-editor-switch :deep(.v-label) {
  font-size: 0.78rem;
}

.words-textarea :deep(textarea) {
  font-family: SFMono-Regular, Consolas, 'Liberation Mono', monospace;
  font-size: 0.85rem;
  line-height: 1.65;
}

.words-textarea :deep(.v-field) {
  background: transparent;
}

.words-text-editor {
  --words-token-block: #af00db;
  --words-token-replaced: #001080;
  --words-token-replacement: #a31515;
  --words-token-parameter-syntax: #795e26;
  --words-token-parameter-key: #0451a5;
  --words-token-parameter-value: #098658;
  --words-token-front: #267f99;
  --words-token-back: #795e26;
  --words-token-offset: #098658;
  --words-token-comment: #008000;
  --words-token-operator: #000;

  overflow: hidden;
  border: 0;
  border-radius: 0.75rem;
  block-size: 18.8rem;
  contain: paint;
  overscroll-behavior: contain;
  transform: translateZ(0);
}

/* 中性编辑底板覆盖 Ace 与玻璃皮肤的默认填充，正文语法颜色继续由编辑器管理。 */
.words-view .words-text-editor {
  backdrop-filter: none;
  background: rgba(var(--v-theme-on-surface), 0.04) !important;
  box-shadow: none;
  color: rgb(var(--v-theme-on-surface));
}

.words-text-editor :deep(.ace_gutter) {
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

.words-text-editor.ace_focus {
  box-shadow: none;
  outline: 2px solid rgba(var(--v-theme-primary), 0.45);
  outline-offset: 1px;
}

.words-text-editor.ace-github-dark {
  --words-token-block: #c586c0;
  --words-token-replaced: #9cdcfe;
  --words-token-replacement: #ce9178;
  --words-token-parameter-syntax: #dcdcaa;
  --words-token-parameter-key: #9cdcfe;
  --words-token-parameter-value: #b5cea8;
  --words-token-front: #4ec9b0;
  --words-token-back: #dcdcaa;
  --words-token-offset: #b5cea8;
  --words-token-comment: #6a9955;
  --words-token-operator: #d4d4d4;
}

.words-text-editor :deep(.ace_scroller),
.words-text-editor :deep(.ace_content),
.words-text-editor :deep(.ace_text-layer) {
  transform: translateZ(0);
  will-change: transform;
}

.words-text-editor :deep(.ace_comment) {
  color: var(--words-token-comment) !important;
  font-style: normal;
}

.words-text-editor :deep(.ace_gutter-layer) {
  text-align: start;
}

.words-text-editor :deep(.ace_gutter-cell) {
  padding-inline: 0.35rem 0.25rem;
}

.words-text-editor :deep(.ace_word_list_block) {
  color: var(--words-token-block);
}

.words-text-editor :deep(.ace_word_list_replaced) {
  color: var(--words-token-replaced);
}

.words-text-editor :deep(.ace_word_list_replacement) {
  color: var(--words-token-replacement);
}

.words-text-editor :deep(.ace_word_list_parameter_syntax) {
  color: var(--words-token-parameter-syntax);
}

.words-text-editor :deep(.ace_word_list_parameter_key) {
  color: var(--words-token-parameter-key);
}

.words-text-editor :deep(.ace_word_list_parameter_value) {
  color: var(--words-token-parameter-value);
}

.words-text-editor :deep(.ace_invalid.ace_word-list) {
  background-color: transparent !important;
  color: #f44336 !important;
  text-decoration: underline wavy #f44336 !important;
  text-underline-offset: 0.12em;
}

.words-text-editor :deep(.ace_word_list_front) {
  color: var(--words-token-front);
}

.words-text-editor :deep(.ace_word_list_back) {
  color: var(--words-token-back);
}

.words-text-editor :deep(.ace_word_list_offset) {
  color: var(--words-token-offset);
}

.words-text-editor :deep(.ace_keyword.ace_operator.ace_word-list) {
  color: var(--words-token-operator);
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
  margin-block-start: 1rem;
  min-inline-size: 0;
}

.words-help-panels :deep(.v-expansion-panel) {
  overflow: hidden;
  border: 0;
  border-radius: 0 !important;
  backdrop-filter: none;
  background: transparent !important;
  background-image: none !important;
  border-block-start: 1px solid var(--words-separator-color);
  box-shadow: none !important;
}

.words-help-panels :deep(.v-expansion-panel-title) {
  min-block-size: 3.25rem;
  padding-inline: 0;
}

.words-help-panels :deep(.v-expansion-panel-text__wrapper) {
  padding-inline: 0;
}

.words-help-title {
  display: flex;
  align-items: center;
  color: rgb(var(--v-theme-on-surface));
  font-weight: 500;
  gap: 0.55rem;
}

.words-help-content {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.78rem;
  line-height: 1.7;
  min-inline-size: 0;
  overflow-wrap: anywhere;
  white-space: normal;
  word-break: break-word;
}

.words-editor-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  backdrop-filter: var(--words-surface-filter);
  background: var(--words-surface-background);
  border-block-start: 1px solid var(--words-separator-color);
  gap: 1rem;
  min-block-size: 4.5rem;
  padding-block: 0.75rem;
  padding-inline: 1.5rem;
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
  border: 0;
  border-radius: 0;
  background: transparent;
  border-block-end: 1px solid var(--words-separator-color);
  gap: 0.75rem;
  grid-template-areas:
    'toolbar name size delete'
    'pattern pattern pattern pattern';
  grid-template-columns: max-content minmax(10rem, 1fr) minmax(9rem, 11rem) max-content;
  padding-block: 0.85rem;
  padding-inline: 0;
}

.episode-rule-card-header {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  grid-area: toolbar;
  min-block-size: 3.5rem;
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
  place-self: center end;
  grid-area: delete;
}

.words-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  gap: 0.75rem;
  min-block-size: 10rem;
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
    flex-direction: column;
    border: 0;
    border-radius: 0;
    block-size: 100%;
    min-block-size: 0;
  }

  .words-mobile-tabs {
    display: flex;
    flex: 0 0 auto;
    padding: 0.25rem;
    border: 0;
    border-radius: 0.8rem;
    background: rgba(var(--v-theme-on-surface), 0.06);
    margin-block: 0.75rem 0;
    margin-inline: 1rem;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .words-mobile-tabs::-webkit-scrollbar {
    display: none;
  }

  .words-mobile-tab {
    position: relative;
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 0.6rem;
    background: transparent;
    color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
    cursor: pointer;
    font-size: 0.8125rem;
    gap: 0.45rem;
    line-height: 1.3;
    min-block-size: 2.75rem;
    min-inline-size: 0;
    overflow-wrap: anywhere;
    padding-block: 0.5rem;
    padding-inline: 0.2rem;
  }

  .words-mobile-tab--active {
    background: rgba(var(--v-theme-on-surface), 0.1);
    color: rgb(var(--v-theme-on-surface));
    font-weight: 600;
  }

  .words-mobile-tab-icon {
    position: absolute;
    display: inline-flex;
    inset-block-start: 0.4rem;
    inset-inline-end: 0.45rem;
  }

  .words-mobile-tab-icon > .v-icon {
    display: none;
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
    padding-block: 1.4rem 0.85rem;
    padding-inline: 1.25rem;
  }

  .words-editor-heading h2 {
    font-size: 1.125rem;
  }

  .words-editor-heading p {
    font-size: 0.85rem;
  }

  .words-save-state {
    display: none;
  }

  .words-editor-scroll {
    padding-block: 0 1.25rem;
    padding-inline: 1.25rem;
  }

  .words-field-meta {
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.75rem;
    min-block-size: 2.75rem;
  }

  .words-field-meta strong {
    min-inline-size: 0;
  }

  .words-field-actions {
    gap: 0.5rem;
    inline-size: 100%;
  }

  .words-textarea :deep(.v-field__input) {
    min-block-size: 18rem;
  }

  .words-text-editor {
    block-size: 18rem;
  }

  .words-rule-toolbar {
    flex-direction: column;
    align-items: stretch;
    margin-block-end: 1rem;
  }

  .words-rule-toolbar .v-btn {
    inline-size: 100%;
  }

  .episode-rule-card {
    padding: 0.95rem;
    gap: 0.75rem;
    grid-template-areas:
      'toolbar delete'
      'name name'
      'pattern pattern'
      'size size';
    grid-template-columns: minmax(0, 1fr) max-content;
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
    flex-wrap: wrap;
    min-block-size: calc(5.25rem + env(safe-area-inset-bottom));
    padding-block: 0.75rem calc(0.75rem + env(safe-area-inset-bottom));
    padding-inline: 1.25rem;
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
