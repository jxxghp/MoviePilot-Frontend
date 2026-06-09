<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import api from '@/api'
import { useI18n } from 'vue-i18n'

const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))

// 国际化
const { t } = useI18n()

// 提示框
const $toast = useToast()

// 集数定位规则
interface EpisodeFormatRule {
  _localId: string
  name: string
  enabled: boolean
  order: number
  pattern: string
  min_file_size_mb: number
}

const episodeFormatRules = ref<EpisodeFormatRule[]>([])

function createEpisodeRuleLocalId() {
  return `episode-rule-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

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

function normalizeEpisodeFormatRules(
  rules: Array<Partial<Omit<EpisodeFormatRule, '_localId'>> & { _localId?: string }> = [],
) {
  return rules.map(rule => createEpisodeRule(rule))
}

function buildEpisodeFormatRulePayload() {
  return episodeFormatRules.value.map((rule, index) => ({
    name: rule.name,
    enabled: rule.enabled,
    order: index + 1,
    pattern: rule.pattern,
    min_file_size_mb: Number(rule.min_file_size_mb) || 0,
  }))
}

// 添加集数定位规则
function addEpisodeRule() {
  episodeFormatRules.value.push(createEpisodeRule())
}

// 自定义识别词
const customIdentifiers = ref('')

// 自定义制作组
const customReleaseGroups = ref('')

// 自定义占位符
const customization = ref('')

// 文件整理屏蔽词
const transferExcludeWords = ref('')

// 查询已设置的识别词
async function queryCustomIdentifiers() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/CustomIdentifiers')
    if (result && result.data && result.data.value) customIdentifiers.value = result.data.value.join('\n')
  } catch (error) {
    console.log(error)
  }
}

// 查询已设置的制作组
async function queryCustomReleaseGroups() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/CustomReleaseGroups')
    if (result && result.data && result.data.value) customReleaseGroups.value = result.data.value.join('\n')
  } catch (error) {
    console.log(error)
  }
}

// 查询已设置的自定义占位符
async function queryCustomization() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/Customization')
    if (result && result.data && result.data.value) customization.value = result.data?.value.join('\n')
  } catch (error) {
    console.log(error)
  }
}

// 查询已设置的屏蔽词
async function queryTransferExcludeWords() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/TransferExcludeWords')
    if (result && result.data && result.data.value) transferExcludeWords.value = result.data?.value.join('\n')
  } catch (error) {
    console.log(error)
  }
}

// 保存用户设置的识别词
async function saveCustomIdentifiers() {
  try {
    const result: { [key: string]: any } = await api.post(
      'system/setting/CustomIdentifiers',
      customIdentifiers.value.split('\n'),
    )

    if (result.success) $toast.success(t('setting.words.identifierSaveSuccess'))
    else $toast.error(t('setting.words.identifierSaveFailed'))
  } catch (error) {
    console.log(error)
  }
}

// 保存自定义制作组
async function saveCustomReleaseGroups() {
  try {
    const result: { [key: string]: any } = await api.post(
      'system/setting/CustomReleaseGroups',
      customReleaseGroups.value.split('\n'),
    )

    if (result.success) $toast.success(t('setting.words.releaseGroupSaveSuccess'))
    else $toast.error(t('setting.words.releaseGroupSaveFailed'))
  } catch (error) {
    console.log(error)
  }
}

// 保存自定义占位符
async function saveCustomization() {
  try {
    const result: { [key: string]: any } = await api.post(
      'system/setting/Customization',
      customization.value.split('\n'),
    )

    if (result.success) $toast.success(t('setting.words.customizationSaveSuccess'))
    else $toast.error(t('setting.words.customizationSaveFailed'))
  } catch (error) {
    console.log(error)
  }
}

// 保存文件整理屏蔽词
async function saveTransferExcludeWords() {
  try {
    const result: { [key: string]: any } = await api.post(
      'system/setting/TransferExcludeWords',
      transferExcludeWords.value.split('\n'),
    )

    if (result.success) $toast.success(t('setting.words.excludeWordsSaveSuccess'))
    else $toast.error(t('setting.words.excludeWordsSaveFailed'))
  } catch (error) {
    console.log(error)
  }
}

// 查询集数定位规则
async function queryEpisodeFormatRules() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/public/EpisodeFormatRuleTable')
    if (result && result.data && result.data.value) {
      episodeFormatRules.value = normalizeEpisodeFormatRules(result.data.value)
    } else {
      episodeFormatRules.value = []
    }
  } catch (error) {
    console.log(error)
  }
}

// 保存集数定位规则
async function saveEpisodeFormatRules() {
  // 基础校验
  for (const rule of episodeFormatRules.value) {
    if (!rule.name || !rule.pattern) {
      $toast.error(t('setting.words.episodeFormatRuleEmptyError'))
      return
    }
  }

  try {
    const payload = buildEpisodeFormatRulePayload()
    episodeFormatRules.value.forEach((rule, index) => {
      rule.order = payload[index].order
      rule.min_file_size_mb = payload[index].min_file_size_mb
    })
    const result: { [key: string]: any } = await api.post('system/setting/EpisodeFormatRuleTable', payload)
    if (result.success) {
      $toast.success(t('setting.words.episodeFormatRuleSaveSuccess'))
      queryEpisodeFormatRules()
    } else {
      $toast.error(result.message || t('setting.words.episodeFormatRuleSaveFailed'))
    }
  } catch (error) {
    console.log(error)
    $toast.error(t('setting.words.episodeFormatRuleSaveFailed'))
  }
}

// 删除集数定位规则
function deleteEpisodeRule(index: number) {
  episodeFormatRules.value.splice(index, 1)
}

// 拖拽结束
function onEpisodeRuleDragEnd() {
  saveEpisodeFormatRules()
}

onMounted(() => {
  queryCustomIdentifiers()
  queryCustomReleaseGroups()
  queryCustomization()
  queryTransferExcludeWords()
  queryEpisodeFormatRules()
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.words.customIdentifiers') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.words.identifiersDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VTextarea
            v-model="customIdentifiers"
            :placeholder="t('setting.words.identifiersPlaceholder')"
            :hint="t('setting.words.identifiersHint')"
            persistent-hint
            prepend-inner-icon="mdi-tag-text"
          />
        </VCardText>
        <VCardText>
          <VAlert type="info" variant="tonal" :title="t('setting.words.formatTitle')">
            <div style="white-space: pre-line" v-html="t('setting.words.formatContent').split('\n').join('<br>')"></div>
          </VAlert>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveCustomIdentifiers" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.words.customReleaseGroups') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.words.releaseGroupsDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VTextarea
            v-model="customReleaseGroups"
            :placeholder="t('setting.words.releaseGroupsPlaceholder')"
            :hint="t('setting.words.releaseGroupsHint')"
            persistent-hint
            prepend-inner-icon="mdi-account-group"
          />
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveCustomReleaseGroups" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.words.customization') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.words.customizationDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VTextarea
            v-model="customization"
            :placeholder="t('setting.words.customizationPlaceholder')"
            :hint="t('setting.words.customizationHint')"
            persistent-hint
            prepend-inner-icon="mdi-code-braces"
          />
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveCustomization" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.words.transferExcludeWords') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.words.excludeWordsDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VTextarea
            v-model="transferExcludeWords"
            :placeholder="t('setting.words.excludeWordsPlaceholder')"
            :hint="t('setting.words.excludeWordsHint')"
            persistent-hint
            prepend-inner-icon="mdi-block-helper"
          />
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveTransferExcludeWords" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem class="episode-rule-section-header">
          <template #append>
            <VBtn color="success" class="episode-rule-add-btn" prepend-icon="mdi-plus" @click="addEpisodeRule">
              {{ t('setting.words.episodeFormatRuleAdd') }}
            </VBtn>
          </template>
          <VCardTitle>{{ t('setting.words.episodeFormatRule') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.words.episodeFormatRuleDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <Draggable
            v-model="episodeFormatRules"
            handle=".cursor-move"
            item-key="_localId"
            tag="div"
            :component-data="{ class: 'd-flex flex-column gap-3' }"
            @end="onEpisodeRuleDragEnd"
          >
            <template #item="{ element, index }">
              <VCard variant="outlined" class="episode-rule-card">
                <VCardText class="episode-rule-card-content">
                  <div class="episode-rule-row">
                    <div class="episode-rule-toolbar">
                      <IconBtn
                        icon="mdi-drag"
                        variant="text"
                        size="small"
                        class="episode-rule-drag cursor-move"
                      />
                      <VSwitch
                        v-model="element.enabled"
                        color="primary"
                        density="compact"
                        hide-details
                        class="episode-rule-enabled"
                      />
                    </div>
                    <div class="episode-rule-field episode-rule-name">
                      <VTextField
                        v-model="element.name"
                        :label="t('setting.words.episodeFormatRuleName')"
                        hide-details="auto"
                        density="comfortable"
                        required
                      />
                    </div>
                    <div class="episode-rule-field episode-rule-pattern">
                      <VTextField
                        v-model="element.pattern"
                        :label="t('setting.words.episodeFormatRulePattern')"
                        hide-details="auto"
                        density="comfortable"
                        required
                      />
                    </div>
                    <div class="episode-rule-field episode-rule-size">
                      <VTextField
                        v-model.number="element.min_file_size_mb"
                        :label="t('setting.words.episodeFormatRuleMinSize')"
                        type="number"
                        min="0"
                        hide-details="auto"
                        density="comfortable"
                        required
                      />
                    </div>
                    <IconBtn
                      variant="text"
                      size="small"
                      color="error"
                      class="episode-rule-delete"
                      @click.stop="deleteEpisodeRule(index)"
                    >
                      <VIcon icon="mdi-delete" />
                      <VTooltip activator="parent" location="top">{{ t('common.delete') }}</VTooltip>
                    </IconBtn>
                  </div>
                </VCardText>
              </VCard>
            </template>
          </Draggable>
        </VCardText>
        <VCardText>
          <VAlert type="info" variant="tonal" :title="t('setting.words.episodeFormatRuleGuideTitle')">
            <div style="white-space: pre-line" v-html="t('setting.words.episodeFormatRuleGuideContent')"></div>
          </VAlert>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveEpisodeFormatRules" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>

<style scoped>
.episode-rule-section-header {
  align-items: flex-start;
}

.episode-rule-add-btn {
  flex-shrink: 0;
}

.episode-rule-card {
  border-color: rgba(var(--v-border-color), var(--v-border-opacity));
}

.episode-rule-card-content {
  padding: 1rem;
}

.episode-rule-row {
  display: grid;
  grid-template-columns: max-content minmax(8rem, 0.9fr) minmax(18rem, 3fr) minmax(8rem, 0.7fr) max-content;
  align-items: center;
  gap: 0.75rem;
}

.episode-rule-toolbar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-inline-size: 4.75rem;
}

.episode-rule-drag,
.episode-rule-delete {
  flex: 0 0 auto;
}

.episode-rule-enabled {
  flex: 0 0 auto;
}

.episode-rule-enabled :deep(.v-label) {
  display: none;
}

.episode-rule-field {
  min-inline-size: 0;
}

.episode-rule-name {
  min-inline-size: 0;
}

.episode-rule-pattern {
  min-inline-size: 0;
}

.episode-rule-size {
  min-inline-size: 0;
}

@media (width <= 959px) {
  .episode-rule-section-header {
    display: grid;
    grid-template-areas:
      "content"
      "append";
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
  }

  .episode-rule-section-header :deep(.v-card-item__content) {
    grid-area: content;
  }

  .episode-rule-section-header :deep(.v-card-item__append) {
    grid-area: append;
    justify-self: stretch;
    margin-inline-start: 0;
  }

  .episode-rule-add-btn {
    inline-size: 100%;
  }

  .episode-rule-row {
    grid-template-columns: minmax(0, 1fr) minmax(7rem, 0.42fr) max-content;
    grid-template-areas:
      "toolbar toolbar delete"
      "name size size"
      "pattern pattern pattern";
    align-items: start;
    gap: 0.875rem;
  }

  .episode-rule-toolbar {
    grid-area: toolbar;
    min-block-size: 2.5rem;
    min-inline-size: 0;
  }

  .episode-rule-enabled {
    margin-inline-start: 0.125rem;
  }

  .episode-rule-enabled :deep(.v-label) {
    display: inline-flex;
    opacity: var(--v-medium-emphasis-opacity);
  }

  .episode-rule-delete {
    grid-area: delete;
    align-self: center;
  }

  .episode-rule-name {
    grid-area: name;
  }

  .episode-rule-size {
    grid-area: size;
  }

  .episode-rule-pattern {
    grid-area: pattern;
  }
}

@media (width <= 599px) {
  .episode-rule-card-content {
    padding: 0.875rem;
  }

  .episode-rule-row {
    grid-template-columns: minmax(0, 1fr) max-content;
    grid-template-areas:
      "toolbar delete"
      "name name"
      "pattern pattern"
      "size size";
    gap: 0.75rem;
  }

  .episode-rule-field :deep(.v-field__input) {
    min-block-size: 2.75rem;
  }
}
</style>
