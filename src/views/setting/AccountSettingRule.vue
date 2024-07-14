<!-- eslint-disable sonarjs/no-duplicate-string -->
<script lang="ts" setup>
import { useToast } from 'vue-toast-notification'
import draggable from 'vuedraggable'
import { VRow } from 'vuetify/lib/components/index.mjs'
import api from '@/api'
import { CustomRule, FilterRuleGroup } from '@/api/types'
import CustomerRuleCard from '@/components/cards/CustomRuleCard.vue'
import FilterRuleGroupCard from '@/components/cards/FilterRuleGroupCard.vue'

// 自定义规则列表
const customRules = ref<CustomRule[]>([])

// 所有规则组列表
const filterRuleGroups = ref<FilterRuleGroup[]>([])

// 种子优先规则
const selectedTorrentPriority = ref<string>('seeder')

// 提示框
const $toast = useToast()

// 种子优先规则下拉框
const TorrentPriorityItems = [
  { title: '站点优先', value: 'site' },
  { title: '做种数优先', value: 'seeder' },
]

// 保存自定义规则
function saveCustomRules() {}

// 添加自定义规则
function addCustomRule() {}

// 保存规则组
function saveFilterRuleGroups() {}

// 添加规则组
function addFilterRuleGroup() {}

// 查询种子优先规则
async function queryTorrentPriority() {
  try {
    const result: { [key: string]: any } = await api.get('system/setting/TorrentsPriority')

    selectedTorrentPriority.value = result.data?.value
  } catch (error) {
    console.log(error)
  }
}

// 保存种子优先规则
async function saveTorrentPriority() {
  try {
    // 用户名密码
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

// 加载数据
onMounted(() => {
  queryTorrentPriority()
})
</script>

<template>
  <VRow>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>自定义规则</VCardTitle>
          <VCardSubtitle>自定义优先级规则项</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <draggable
            v-model="customRules"
            handle=".cursor-move"
            item-key="name"
            tag="div"
            :component-data="{ 'class': 'grid gap-3 grid-filterrule-card' }"
          >
            <template #item="{ element }">
              <CustomerRuleCard :rule="element" />
            </template>
          </draggable>
        </VCardText>
        <VCardText>
          <VBtn type="submit" class="me-2" @click="saveCustomRules"> 保存 </VBtn>
          <VBtn color="success" variant="tonal" @click="addCustomRule">
            <VIcon icon="mdi-plus" />
          </VBtn>
        </VCardText>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>优先级规则组</VCardTitle>
          <VCardSubtitle>预设优先级规则组，以便在搜索和订阅中使用。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <draggable
            v-model="filterRuleGroups"
            handle=".cursor-move"
            item-key="name"
            tag="div"
            :component-data="{ 'class': 'grid gap-3 grid-filterrule-card' }"
          >
            <template #item="{ element }">
              <FilterRuleGroupCard type="library" :filterrule="element" />
            </template>
          </draggable>
        </VCardText>
        <VCardText>
          <VBtn type="submit" class="me-2" @click="saveFilterRuleGroups"> 保存 </VBtn>
          <VBtn color="success" variant="tonal" @click="addFilterRuleGroup">
            <VIcon icon="mdi-plus" />
          </VBtn>
        </VCardText>
      </VCard>
    </VCol>
    <VCol cols="12">
      <VCard>
        <VCardItem>
          <VCardTitle>下载规则</VCardTitle>
          <VCardSubtitle>按站点或做种数量优先下载。</VCardSubtitle>
        </VCardItem>
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VSelect
                  v-model="selectedTorrentPriority"
                  :items="TorrentPriorityItems"
                  label="当前使用下载优先规则"
                  hint="同时命中多个站点的多个资源时下载的优先规则"
                  persistent-hint
                />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardText>
          <VBtn type="submit" @click="saveTorrentPriority"> 保存 </VBtn>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>
