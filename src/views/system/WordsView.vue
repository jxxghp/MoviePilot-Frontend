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
  name: string
  enabled: boolean
  order: number
  pattern: string
  min_file_size_mb: number
}

const episodeFormatRules = ref<EpisodeFormatRule[]>([])

// 添加集数定位规则
function addEpisodeRule() {
  episodeFormatRules.value.push({
    name: '',
    enabled: true,
    order: episodeFormatRules.value.length + 1,
    pattern: '',
    min_file_size_mb: 500,
  })
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
    const result: { [key: string]: any } = await api.get('system/setting/EpisodeFormatRuleTable')
    if (result && result.data && result.data.value) {
      episodeFormatRules.value = result.data.value
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
      $toast.error('名称和正则表达式不能为空')
      return
    }
  }

  try {
    episodeFormatRules.value.forEach((rule, index) => {
      rule.order = index + 1
      rule.min_file_size_mb = Number(rule.min_file_size_mb) || 0
    })
    const result: { [key: string]: any } = await api.post(
      'system/setting/EpisodeFormatRuleTable',
      episodeFormatRules.value,
    )
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
  if (confirm(t('setting.words.episodeFormatRuleDeleteConfirm'))) {
    episodeFormatRules.value.splice(index, 1)
  }
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
        <VCardItem>
          <template #append>
            <VBtn color="primary" @click="addEpisodeRule" prepend-icon="mdi-plus">
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
            item-key="name"
            tag="div"
            :component-data="{ class: 'd-flex flex-column gap-3' }"
            @end="onEpisodeRuleDragEnd"
          >
            <template #item="{ element, index }">
              <VCard variant="outlined" class="episode-rule-card">
                <VCardText class="py-4">
                  <div class="episode-rule-row d-flex align-center gap-2">
                    <IconBtn
                      icon="mdi-drag"
                      variant="text"
                      size="small"
                      class="episode-rule-control episode-rule-drag cursor-move flex-0-0"
                    />
                    <VCheckbox
                      v-model="element.enabled"
                      color="primary"
                      density="compact"
                      hide-details
                      class="episode-rule-control episode-rule-enabled flex-0-0"
                    />
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
                      class="episode-rule-control episode-rule-delete flex-0-0"
                      @click="deleteEpisodeRule(index)"
                    >
                      <VIcon icon="mdi-delete" />
                    </IconBtn>
                  </div>
                </VCardText>
              </VCard>
            </template>
          </Draggable>
        </VCardText>
        <VCardText>
          <VAlert type="info" variant="tonal" :title="t('setting.words.episodeFormatRuleGuideTitle')">
            <div
              style="white-space: pre-line"
              v-html="t('setting.words.episodeFormatRuleGuideContent').split('\n').join('<br>')"
            ></div>
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
.episode-rule-card {
  border-color: rgba(var(--v-border-color), var(--v-border-opacity));
}

.episode-rule-row {
  flex-wrap: nowrap;
}

.episode-rule-name {
  flex: 0.8 1 9rem;
  min-inline-size: 7rem;
}

.episode-rule-pattern {
  flex: 3.7 1 26rem;
  min-inline-size: 0;
}

.episode-rule-size {
  flex: 0 0 8rem;
  min-inline-size: 8rem;
}

@media (width <= 959px) {
  .episode-rule-row {
    flex-wrap: wrap;
    align-items: flex-start !important;
  }

  .episode-rule-drag {
    order: 1;
  }

  .episode-rule-enabled {
    order: 2;
  }

  .episode-rule-delete {
    order: 3;
    margin-inline-start: auto;
  }

  .episode-rule-name {
    flex: 1 1 calc(50% - 0.25rem);
    order: 4;
    min-inline-size: 0;
  }

  .episode-rule-size {
    flex: 1 1 calc(50% - 0.25rem);
    order: 5;
    min-inline-size: 0;
  }

  .episode-rule-pattern {
    flex: 1 1 100%;
    order: 6;
  }
}
</style>
