<!-- eslint-disable sonarjs/no-duplicate-string -->
<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import { copyToClipboard } from '@/@core/utils/navigator'
import api from '@/api'
import {
  createCustomRule,
  createFilterRuleGroup,
  deleteCustomRule,
  deleteFilterRuleGroup,
  listCustomRules,
  listFilterRuleGroups,
  reorderCustomRules,
  reorderFilterRuleGroups,
  updateCustomRule,
  updateFilterRuleGroup,
  type CustomRuleUpdateInput,
  type FilterRuleGroupUpdateInput,
} from '@/api/rule'
import type { CustomRule, FilterRuleGroup } from '@/api/types'
import CustomerRuleCard from '@/components/cards/CustomRuleCard.vue'
import FilterRuleGroupCard from '@/components/cards/FilterRuleGroupCard.vue'
import { useI18n } from 'vue-i18n'
import { useSilentSettingRefresh } from '@/composables/useSilentSettingRefresh'
import { openSharedDialog } from '@/composables/useSharedDialog'

// 国际化
const { t } = useI18n()

const props = defineProps({
  active: {
    type: Boolean,
    default: true,
  },
})

// 拖拽库和导入弹窗只在规则编辑交互中需要，拆出设置页入口 chunk。
const Draggable = defineAsyncComponent(() => import('vuedraggable').then(module => module.default))
const ImportCodeDialog = defineAsyncComponent(() => import('@/components/dialog/ImportCodeDialog.vue'))

const originalCustomRuleId = Symbol('originalCustomRuleId')
const originalRuleGroupName = Symbol('originalRuleGroupName')

type CustomRuleDraft = CustomRule & { [originalCustomRuleId]?: string }
type FilterRuleGroupDraft = FilterRuleGroup & { [originalRuleGroupName]?: string }

// 自定义规则列表
const customRules = ref<CustomRuleDraft[]>([])
const customRuleBaseline = ref<CustomRule[]>([])
const savingCustomRules = ref(false)

// 所有规则组列表
const filterRuleGroups = ref<FilterRuleGroupDraft[]>([])
const filterRuleGroupBaseline = ref<FilterRuleGroup[]>([])
const savingFilterRuleGroups = ref(false)

// 种子优先规则
const selectedTorrentPriority = ref<string[]>(['seeder'])

// 二级分类策略
const mediaCategories = ref<{ [key: string]: any }>({})

// 提示框
const $toast = useToast()

// 种子优先规则下拉框
const TorrentPriorityItems = [
  { title: t('setting.rule.resourcePriority'), value: 'torrent' },
  { title: t('setting.rule.sitePriority'), value: 'site' },
  { title: t('setting.rule.siteUpload'), value: 'upload' },
  { title: t('setting.rule.resourceSeeder'), value: 'seeder' },
]

// 调用API查询自动分类配置
async function loadMediaCategories() {
  try {
    mediaCategories.value = await api.get('media/category')
  } catch (error) {
    console.log(error)
  }
}

/** 复制自定义规则的公开字段，排除页面草稿身份。 */
function copyCustomRule(rule: CustomRule): CustomRule {
  return {
    id: rule.id,
    name: rule.name,
    include: rule.include,
    exclude: rule.exclude,
    size_range: rule.size_range,
    seeders: rule.seeders,
    publish_time: rule.publish_time,
  }
}

/** 复制规则组的公开字段，排除页面草稿身份。 */
function copyFilterRuleGroup(group: FilterRuleGroup): FilterRuleGroup {
  return {
    name: group.name,
    rule_string: group.rule_string,
    media_type: group.media_type,
    category: group.category,
  }
}

/** 为服务端已有自定义规则附加不可序列化的原始身份。 */
function createCustomRuleDraft(rule: CustomRule, originalId?: string): CustomRuleDraft {
  const draft = copyCustomRule(rule) as CustomRuleDraft
  if (originalId) draft[originalCustomRuleId] = originalId
  return draft
}

/** 为服务端已有规则组附加不可序列化的原始身份。 */
function createFilterRuleGroupDraft(group: FilterRuleGroup, originalName?: string): FilterRuleGroupDraft {
  const draft = copyFilterRuleGroup(group) as FilterRuleGroupDraft
  if (originalName) draft[originalRuleGroupName] = originalName
  return draft
}

/** 比较可选文本字段，空值和缺省值视为同一状态。 */
function optionalTextChanged(current: string | undefined, baseline: string | undefined): boolean {
  return (current ?? '') !== (baseline ?? '')
}

/** 生成一条已有自定义规则的最小更新载荷。 */
function buildCustomRuleUpdate(draft: CustomRuleDraft, baseline: CustomRule): CustomRuleUpdateInput {
  const payload: CustomRuleUpdateInput = {}
  if (draft.id !== baseline.id) payload.new_rule_id = draft.id
  if (draft.name !== baseline.name) payload.name = draft.name
  if (optionalTextChanged(draft.include, baseline.include)) payload.include = draft.include ?? ''
  if (optionalTextChanged(draft.exclude, baseline.exclude)) payload.exclude = draft.exclude ?? ''
  if (optionalTextChanged(draft.size_range, baseline.size_range)) payload.size_range = draft.size_range ?? ''
  if (optionalTextChanged(draft.seeders, baseline.seeders)) payload.seeders = draft.seeders ?? ''
  if (optionalTextChanged(draft.publish_time, baseline.publish_time)) payload.publish_time = draft.publish_time ?? ''
  return payload
}

/** 生成一个已有规则组的最小更新载荷。 */
function buildFilterRuleGroupUpdate(
  draft: FilterRuleGroupDraft,
  baseline: FilterRuleGroup,
): FilterRuleGroupUpdateInput {
  const payload: FilterRuleGroupUpdateInput = {}
  if (draft.name !== baseline.name) payload.new_name = draft.name
  if (optionalTextChanged(draft.rule_string, baseline.rule_string)) payload.rule_string = draft.rule_string ?? ''
  if (optionalTextChanged(draft.media_type, baseline.media_type)) payload.media_type = draft.media_type ?? ''
  if (optionalTextChanged(draft.category, baseline.category)) payload.category = draft.category ?? ''
  return payload
}

/** 判断增量更新载荷是否包含实际变化。 */
function hasUpdates(payload: CustomRuleUpdateInput | FilterRuleGroupUpdateInput): boolean {
  return Object.keys(payload).length > 0
}

/** 在本地规则组草稿和基线中同步后端完成的规则 ID 改名。 */
function replaceCustomRuleReferences(previousId: string, currentId: string) {
  const escaped = previousId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'g')
  for (const groups of [filterRuleGroups.value, filterRuleGroupBaseline.value]) {
    for (const group of groups) {
      if (group.rule_string) group.rule_string = group.rule_string.replace(pattern, currentId)
    }
  }
}

/** 失败后重新读取规则与规则组，丢弃可能只完成一部分的页面草稿。 */
async function reloadRuleCollections() {
  await Promise.allSettled([queryCustomRules(), queryFilterRuleGroups()])
}

// 保存自定义规则
async function saveCustomRules() {
  // 检查是否存在空id规则
  if (customRules.value.some(item => !item.id)) {
    $toast.error(t('setting.rule.emptyIdError'))
    return
  }
  // 检查是否存在空的规则名称
  if (customRules.value.some(item => !item.name)) {
    $toast.error(t('setting.rule.emptyNameError'))
    return
  }
  // 获取所有规则ID和名称
  const ids = customRules.value.map(item => item.id)
  const names = customRules.value.map(item => item.name)
  // 检查是否存在重名的规则ID
  if (new Set(ids).size !== ids.length) {
    $toast.error(t('setting.rule.duplicateIdError'))
    return
  }
  // 检查是否存在重名规则名称
  if (new Set(names).size !== names.length) {
    $toast.error(t('setting.rule.duplicateNameError'))
    return
  }
  if (savingCustomRules.value) return
  savingCustomRules.value = true
  try {
    const baselineById = new Map(customRuleBaseline.value.map(rule => [rule.id, rule]))
    const retainedIds = new Set(
      customRules.value.map(rule => rule[originalCustomRuleId]).filter((id): id is string => Boolean(id)),
    )
    const expectedOrder = customRuleBaseline.value.map(rule => rule.id)

    for (const rule of customRuleBaseline.value) {
      if (retainedIds.has(rule.id)) continue
      await deleteCustomRule(rule.id)
      expectedOrder.splice(expectedOrder.indexOf(rule.id), 1)
    }

    for (const draft of customRules.value) {
      const originalId = draft[originalCustomRuleId]
      if (!originalId) continue
      const baseline = baselineById.get(originalId)
      if (!baseline) throw new Error(`Missing baseline for custom rule ${originalId}`)
      const payload = buildCustomRuleUpdate(draft, baseline)
      if (!hasUpdates(payload)) continue
      await updateCustomRule(originalId, payload)
      if (draft.id !== originalId) {
        const index = expectedOrder.indexOf(originalId)
        if (index !== -1) expectedOrder[index] = draft.id
        replaceCustomRuleReferences(originalId, draft.id)
      }
    }

    for (const draft of customRules.value) {
      if (draft[originalCustomRuleId]) continue
      await createCustomRule({
        rule_id: draft.id,
        name: draft.name,
        include: draft.include,
        exclude: draft.exclude,
        size_range: draft.size_range,
        seeders: draft.seeders,
        publish_time: draft.publish_time,
      })
      expectedOrder.push(draft.id)
    }

    const desiredOrder = customRules.value.map(rule => rule.id)
    if (desiredOrder.some((ruleId, index) => expectedOrder[index] !== ruleId)) {
      await reorderCustomRules(desiredOrder, expectedOrder)
    }
    await queryCustomRules()
    $toast.success(t('setting.rule.customRuleSaveSuccess'))
  } catch (error) {
    console.log(error)
    await reloadRuleCollections()
    $toast.error(t('setting.rule.customRuleSaveFailed'))
  } finally {
    savingCustomRules.value = false
  }
}

// 添加自定义规则
async function addCustomRule() {
  let id = `RULE${customRules.value.length + 1}`
  while (customRules.value.some(item => item.id === id)) {
    id = `RULE${parseInt(id.split('RULE')[1]) + 1}`
  }
  let name = `规则${customRules.value.length + 1}`
  while (customRules.value.some(item => item.name === name)) {
    name = `规则${parseInt(name.split('规则')[1]) + 1}`
  }
  customRules.value.push({
    id: id,
    name: name,
  })
}

// 移除自定义规则
function removeCustomRule(rule: CustomRuleDraft) {
  const index = customRules.value.indexOf(rule)
  if (index !== -1) customRules.value.splice(index, 1)
}

// 加载规则组
async function queryFilterRuleGroups() {
  try {
    const groups = await listFilterRuleGroups()
    filterRuleGroupBaseline.value = groups.map(copyFilterRuleGroup)
    filterRuleGroups.value = groups.map(group => createFilterRuleGroupDraft(group, group.name))
  } catch (error) {
    console.log(error)
  }
}

// 保存规则组
async function saveFilterRuleGroups() {
  // 检查是否存在空的规则组名称
  if (filterRuleGroups.value.some(item => !item.name)) {
    $toast.error(t('setting.rule.emptyGroupNameError'))
    return
  }
  // 检查是否存在重名规则组
  const names = filterRuleGroups.value.map(item => item.name)
  if (new Set(names).size !== names.length) {
    $toast.error(t('setting.rule.duplicateGroupNameError'))
    return
  }
  if (savingFilterRuleGroups.value) return
  savingFilterRuleGroups.value = true
  try {
    const baselineByName = new Map(filterRuleGroupBaseline.value.map(group => [group.name, group]))
    const retainedNames = new Set(
      filterRuleGroups.value.map(group => group[originalRuleGroupName]).filter((name): name is string => Boolean(name)),
    )
    const expectedOrder = filterRuleGroupBaseline.value.map(group => group.name)

    for (const group of filterRuleGroupBaseline.value) {
      if (retainedNames.has(group.name)) continue
      await deleteFilterRuleGroup(group.name)
      expectedOrder.splice(expectedOrder.indexOf(group.name), 1)
    }

    for (const draft of filterRuleGroups.value) {
      const originalName = draft[originalRuleGroupName]
      if (!originalName) continue
      const baseline = baselineByName.get(originalName)
      if (!baseline) throw new Error(`Missing baseline for rule group ${originalName}`)
      const payload = buildFilterRuleGroupUpdate(draft, baseline)
      if (!hasUpdates(payload)) continue
      await updateFilterRuleGroup(originalName, payload)
      if (draft.name !== originalName) {
        const index = expectedOrder.indexOf(originalName)
        if (index !== -1) expectedOrder[index] = draft.name
      }
    }

    for (const draft of filterRuleGroups.value) {
      if (draft[originalRuleGroupName]) continue
      await createFilterRuleGroup({
        name: draft.name,
        rule_string: draft.rule_string ?? '',
        media_type: draft.media_type,
        category: draft.category,
      })
      expectedOrder.push(draft.name)
    }

    const desiredOrder = filterRuleGroups.value.map(group => group.name)
    if (desiredOrder.some((name, index) => expectedOrder[index] !== name)) {
      await reorderFilterRuleGroups(desiredOrder, expectedOrder)
    }
    await queryFilterRuleGroups()
    $toast.success(t('setting.rule.ruleGroupSaveSuccess'))
  } catch (error) {
    console.log(error)
    await queryFilterRuleGroups()
    $toast.error(t('setting.rule.ruleGroupSaveFailed'))
  } finally {
    savingFilterRuleGroups.value = false
  }
}

// 添加规则组
function addFilterRuleGroup() {
  let name = `规则组${filterRuleGroups.value.length + 1}`
  while (filterRuleGroups.value.some(item => item.name === name)) {
    name = `规则组${parseInt(name.split('规则组')[1]) + 1}`
  }
  filterRuleGroups.value.push({
    name: name,
    media_type: '',
    category: '',
  })
}

// 分享规则
async function shareRules(rules: CustomRule[] | FilterRuleGroup[], type: string) {
  if (!rules || rules.length === 0) return

  // 将卡片规则接装为字符串
  const value = JSON.stringify(rules)

  // 复制到剪贴板
  try {
    const success = copyToClipboard(value)
    if (await success)
      $toast.success(
        type === 'custom' ? t('setting.rule.customRuleCopySuccess') : t('setting.rule.ruleGroupCopySuccess'),
      )
    else
      $toast.error(type === 'custom' ? t('setting.rule.customRuleCopyFailed') : t('setting.rule.ruleGroupCopyFailed'))
  } catch (e) {
    $toast.error(type === 'custom' ? t('setting.rule.customRuleCopyError') : t('setting.rule.ruleGroupCopyError'))
    console.error(e)
  }
}

// 打开弹窗
async function importRules(ruleType: string) {
  openSharedDialog(
    ImportCodeDialog,
    {
      title: ruleType === 'custom' ? t('setting.rule.importCustomRules') : t('setting.rule.importRuleGroups'),
      dataType: ruleType,
    },
    {
      save: saveCodeString,
    },
    { closeOn: ['close', 'save'] },
  )
}

// 保存导入的代码
function saveCodeString(type: string, codeString: any) {
  // codeString从子组件传递过来，从对象转换为JSON
  let parsedCode
  try {
    parsedCode = JSON.parse(codeString.value)
  } catch (e) {
    $toast.error(t('setting.rule.importFailed'))
    console.error(e)
    return
  }

  // 更新数据
  try {
    if (type === 'custom') {
      if (!checkValueValidity(parsedCode, type)) return false
      const newCustomRules = extractCustomRules(parsedCode) || []
      customRules.value = [...customRules.value, ...newCustomRules]
    } else if (type === 'group') {
      if (!checkValueValidity(parsedCode, type)) return false
      const newFilterRuleGroups = extractFilterRuleGroups(parsedCode) || []
      filterRuleGroups.value = [...filterRuleGroups.value, ...newFilterRuleGroups]
    } else {
      $toast.error(t('setting.rule.importUnknownType'))
    }
  } catch (e) {
    $toast.error(t('setting.rule.importFailed'))
    console.error(e)
  }
}

// 赋值自定义规则，避免存在多余的属性
function extractCustomRules(value: any) {
  try {
    return value.map((item: any) => {
      return {
        id: item.id,
        name: item.name,
        include: item.include,
        exclude: item.exclude,
        size_range: item.size_range,
        seeders: item.seeders,
        publish_time: item.publish_time,
      }
    })
  } catch (e) {
    console.error(e)
  }
}

// 赋值规则组，避免存在多余的属性
function extractFilterRuleGroups(value: any) {
  try {
    return value.map((item: any) => {
      return {
        name: item.name,
        rule_string: item.rule_string,
        media_type: item.media_type,
        category: item.category,
      }
    })
  } catch (e) {
    console.error(e)
  }
}

// 根据ID简单区分规则与规则组
function checkValueValidity(values: any, type: string): boolean {
  try {
    if (!values) return true
    if (!type) return false

    for (const value of values) {
      if (!isValidValue(value, type)) return false
    }
    return true
  } catch (e) {
    console.error(e)
    return false
  }
}

function isValidValue(value: any, type: string): boolean {
  const keys = Object.keys(value)
  const uniqueKeys = new Set(keys)
  const hasName = keys.includes('name')
  const hasId = keys.includes('id')
  const noDuplicates = keys.length === uniqueKeys.size

  if (type === 'custom') {
    return validateCustomRule(hasName, hasId, noDuplicates)
  } else if (type === 'group') {
    return validateGroupRule(hasName, hasId, noDuplicates)
  } else {
    console.error(`传入了不合法的类型！`)
    return false
  }
}

function validateCustomRule(hasName: boolean, hasId: boolean, noDuplicates: boolean): boolean {
  if (!hasName || !hasId || !noDuplicates) {
    if (!noDuplicates) $toast.warning(t('setting.rule.duplicateValue'))
    if (!hasId) $toast.error(t('setting.rule.importNoId'))
    return false
  }
  return true
}

function validateGroupRule(hasName: boolean, hasId: boolean, noDuplicates: boolean): boolean {
  if (!hasName || hasId || !noDuplicates) {
    if (!noDuplicates) $toast.warning(t('setting.rule.duplicateValue'))
    if (hasId) $toast.error(t('setting.rule.importHasId'))
    return false
  }
  return true
}

// 清空规则（组）
function deleteAllRules(dateType: string) {
  if (!dateType) return
  if (dateType === 'custom') {
    customRules.value = []
  } else if (dateType === 'group') {
    filterRuleGroups.value = []
  } else {
    console.error(`传入了不支持的类型！`)
  }
}

// 规则变化时赋值
function onRuleChange(rule: CustomRule, id: string) {
  const index = customRules.value.findIndex(item => item.id === id)
  if (index === -1) return
  const draft = createCustomRuleDraft(rule, customRules.value[index][originalCustomRuleId])
  customRules.value[index] = draft
}

// 移除规则组
function removeFilterRuleGroup(rule: FilterRuleGroupDraft) {
  const index = filterRuleGroups.value.indexOf(rule)
  if (index !== -1) filterRuleGroups.value.splice(index, 1)
}

// 规则组变化时赋值
function changeRuleGroup(group: FilterRuleGroup, name: string) {
  const index = filterRuleGroups.value.findIndex(item => item.name === name)
  if (index === -1) return
  const draft = createFilterRuleGroupDraft(group, filterRuleGroups.value[index][originalRuleGroupName])
  filterRuleGroups.value[index] = draft
}

// 查询种子优先规则
async function queryTorrentPriority() {
  try {
    const result = await api.get<{ value?: string[] }>('system/setting/TorrentsPriority')
    selectedTorrentPriority.value = result.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 查询自定义规则项
async function queryCustomRules() {
  try {
    const rules = await listCustomRules()
    customRuleBaseline.value = rules.map(copyCustomRule)
    customRules.value = rules.map(rule => createCustomRuleDraft(rule, rule.id))
  } catch (error) {
    console.log(error)
  }
}

// 保存种子优先规则
async function saveTorrentPriority() {
  try {
    await api.post('system/setting/TorrentsPriority', selectedTorrentPriority.value, { feedback: 'silent' })
    $toast.success('优先规则保存成功')
  } catch (error) {
    console.log(error)
    $toast.error('优先规则保存失败！')
  }
}

async function loadPageData() {
  await Promise.all([loadMediaCategories(), queryCustomRules(), queryFilterRuleGroups(), queryTorrentPriority()])
}

// 加载数据
onMounted(() => {
  loadPageData()
})

useSilentSettingRefresh(loadPageData, {
  active: computed(() => props.active),
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>{{ t('setting.rule.customRules') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.rule.customRulesDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <Draggable
            v-model="customRules"
            handle=".cursor-move"
            item-key="name"
            tag="div"
            :component-data="{ 'class': 'grid gap-3 grid-customrule-card' }"
          >
            <template #item="{ element }">
              <CustomerRuleCard
                :rule="element"
                :rules="customRules"
                @close="removeCustomRule(element)"
                @change="onRuleChange"
              />
            </template>
          </Draggable>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn
                type="submit"
                class="me-2"
                :loading="savingCustomRules"
                :disabled="savingCustomRules"
                @click="saveCustomRules"
                prepend-icon="mdi-content-save"
              >
                {{ t('common.save') }}
              </VBtn>
              <VBtnGroup density="comfortable">
                <VBtn color="success" variant="tonal" @click="addCustomRule">
                  <VIcon icon="mdi-plus" />
                </VBtn>
                <VBtn color="primary" variant="tonal" @click="importRules('custom')">
                  <VIcon icon="mdi-import" />
                </VBtn>
                <VBtn color="info" variant="tonal" @click="shareRules(customRules, 'custom')">
                  <VIcon icon="mdi-share" />
                </VBtn>
                <VBtn color="error" variant="tonal" @click="deleteAllRules('custom')">
                  <VIcon icon="mdi-delete-empty-outline" />
                </VBtn>
              </VBtnGroup>
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
          <VCardTitle>{{ t('setting.rule.priorityRuleGroups') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.rule.priorityRuleGroupsDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <Draggable
            v-model="filterRuleGroups"
            handle=".cursor-move"
            item-key="name"
            tag="div"
            :component-data="{ 'class': 'grid gap-3 grid-app-card' }"
          >
            <template #item="{ element }">
              <FilterRuleGroupCard
                :group="element"
                :groups="filterRuleGroups"
                :custom_rules="customRules"
                :categories="mediaCategories"
                @close="removeFilterRuleGroup(element)"
                @change="changeRuleGroup"
              />
            </template>
          </Draggable>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn
                type="submit"
                class="me-2"
                :loading="savingFilterRuleGroups"
                :disabled="savingFilterRuleGroups"
                @click="saveFilterRuleGroups"
                prepend-icon="mdi-content-save"
              >
                {{ t('common.save') }}
              </VBtn>
              <VBtnGroup density="comfortable">
                <VBtn color="success" variant="tonal" @click="addFilterRuleGroup">
                  <VIcon icon="mdi-plus" />
                </VBtn>
                <VBtn color="primary" variant="tonal" @click="importRules('group')">
                  <VIcon icon="mdi-import" />
                </VBtn>
                <VBtn color="info" variant="tonal" @click="shareRules(filterRuleGroups, 'group')">
                  <VIcon icon="mdi-share" />
                </VBtn>
                <VBtn color="error" variant="tonal" @click="deleteAllRules('group')">
                  <VIcon icon="mdi-delete-empty-outline" />
                </VBtn>
              </VBtnGroup>
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
          <VCardTitle>{{ t('setting.rule.downloadRules') }}</VCardTitle>
          <VCardSubtitle>{{ t('setting.rule.downloadRulesDesc') }}</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="selectedTorrentPriority"
                  :items="TorrentPriorityItems"
                  multiple
                  clearable
                  chips
                  :label="t('setting.rule.currentPriorityRules')"
                  :hint="t('setting.rule.currentPriorityRulesHint')"
                  persistent-hint
                  prepend-inner-icon="mdi-priority-high"
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardText>
          <VForm @submit.prevent="() => {}">
            <div class="d-flex flex-wrap gap-4 mt-4">
              <VBtn type="submit" @click="saveTorrentPriority" prepend-icon="mdi-content-save">
                {{ t('common.save') }}
              </VBtn>
            </div>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
