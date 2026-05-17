<!-- eslint-disable sonarjs/no-duplicate-string -->
<script lang="ts" setup>
import { useToast } from 'vue-toastification'
import { copyToClipboard } from '@/@core/utils/navigator'
import api from '@/api'
import { CustomRule, FilterRuleGroup } from '@/api/types'
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

// 自定义规则列表
const customRules = ref<CustomRule[]>([])

// 所有规则组列表
const filterRuleGroups = ref<FilterRuleGroup[]>([])

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
  try {
    const result: { [key: string]: any } = await api.post('system/setting/CustomFilterRules', customRules.value)
    if (result.success) $toast.success(t('setting.rule.customRuleSaveSuccess'))
    else $toast.error(t('setting.rule.customRuleSaveFailed'))
  } catch (error) {
    console.log(error)
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
function removeCustomRule(rule: CustomRule) {
  const index = customRules.value.findIndex(item => item.id === rule.id)
  if (index !== -1) customRules.value.splice(index, 1)
}

// 加载规则组
async function queryFilterRuleGroups() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/UserFilterRuleGroups')
    filterRuleGroups.value = result.data?.value ?? []
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
  try {
    const result: { [key: string]: any } = await api.post('system/setting/UserFilterRuleGroups', filterRuleGroups.value)
    if (result.success) $toast.success(t('setting.rule.ruleGroupSaveSuccess'))
    else $toast.error(t('setting.rule.ruleGroupSaveFailed'))
  } catch (error) {
    console.log(error)
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
    let success
    success = copyToClipboard(value)
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
  if (index !== -1) customRules.value[index] = rule
}

// 移除规则组
function removeFilterRuleGroup(rule: FilterRuleGroup) {
  const index = filterRuleGroups.value.findIndex(item => item.name === rule.name)
  if (index !== -1) filterRuleGroups.value.splice(index, 1)
}

// 规则组变化时赋值
function changeRuleGroup(group: FilterRuleGroup, name: string) {
  const index = filterRuleGroups.value.findIndex(item => item.name === name)
  if (index !== -1) filterRuleGroups.value[index] = group
}

// 查询种子优先规则
async function queryTorrentPriority() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/TorrentsPriority')

    selectedTorrentPriority.value = result.data?.value
  } catch (error) {
    console.log(error)
  }
}

// 查询自定义规则项
async function queryCustomRules() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/CustomFilterRules')
    customRules.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 保存种子优先规则
async function saveTorrentPriority() {
  try {
    const result: { [key: string]: any } = await api.post(
      'system/setting/TorrentsPriority',
      selectedTorrentPriority.value,
    )
    if (result.success) $toast.success('优先规则保存成功')
    else $toast.error('优先规则保存失败！')
  } catch (error) {
    console.log(error)
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
              <VBtn type="submit" class="me-2" @click="saveCustomRules" prepend-icon="mdi-content-save">
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
              <VBtn type="submit" class="me-2" @click="saveFilterRuleGroups" prepend-icon="mdi-content-save">
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
