<script setup lang="ts">
import api from '@/api'
import { FilterRuleGroup } from '@/api/types'
import { Handle, Position } from '@vue-flow/core'
import { useI18n } from 'vue-i18n'
import { qualityOptions, resolutionOptions, effectOptions } from '@/api/constants'
import { useUserStore } from '@/stores'
import { buildUserPermissionContext, hasPermission } from '@/utils/permission'

const { t } = useI18n()
const userStore = useUserStore()
const canAdmin = computed(() =>
  hasPermission(buildUserPermissionContext(userStore.superUser, userStore.permissions), 'admin'),
)

defineProps({
  id: {
    type: String,
    required: true,
  },
  data: {
    type: Object,
    required: true,
  },
})

// 所有规则组列表
const filterRuleGroups = ref<FilterRuleGroup[]>([])

// 加载规则组
async function queryFilterRuleGroups() {
  if (!canAdmin.value) return

  try {
    const result: { [key: string]: any } = await api.get('system/setting/UserFilterRuleGroups')
    filterRuleGroups.value = result.data?.value ?? []
  } catch (error) {
    console.log(error)
  }
}

// 计算过滤规则组选择框数据
const ruleGroupsOptions = computed(() => {
  return filterRuleGroups.value.map(group => ({
    title: group.name,
    value: group.name,
  }))
})

onMounted(() => {
  queryFilterRuleGroups()
})
</script>
<template>
  <div>
    <VCard max-width="20rem">
      <Handle id="edge_in" type="target" :position="Position.Left" />
      <VCardItem>
        <template v-slot:prepend>
          <VAvatar>
            <VIcon icon="mdi-filter-multiple" size="x-large"></VIcon>
          </VAvatar>
        </template>
        <VCardTitle>{{ t('workflow.filterTorrents.title') }}</VCardTitle>
        <VCardSubtitle>{{ t('workflow.filterTorrents.subtitle') }}</VCardSubtitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <VRow>
          <VCol cols="6">
            <VSelect
              v-model="data.quality"
              :label="t('workflow.filterTorrents.quality')"
              :items="qualityOptions"
              outlined
              dense
            />
          </VCol>
          <VCol cols="6">
            <VSelect
              v-model="data.resolution"
              :label="t('workflow.filterTorrents.resolution')"
              :items="resolutionOptions"
              outlined
              dense
            />
          </VCol>
          <VCol cols="6">
            <VSelect
              v-model="data.effect"
              :label="t('workflow.filterTorrents.effect')"
              :items="effectOptions"
              outlined
              dense
            />
          </VCol>
          <VCol cols="6">
            <VTextField
              v-model="data.size"
              :label="t('workflow.filterTorrents.size')"
              placeholder="MB"
              outlined
              dense
            />
          </VCol>
          <VCol cols="12">
            <VTextField v-model="data.include" :label="t('workflow.filterTorrents.include')" outlined dense />
          </VCol>
          <VCol cols="12">
            <VTextField v-model="data.exclude" :label="t('workflow.filterTorrents.exclude')" outlined dense />
          </VCol>
          <VCol cols="12">
            <VSelect
              v-model="data.rule_groups"
              chips
              multiple
              :label="t('workflow.filterTorrents.ruleGroups')"
              :items="ruleGroupsOptions"
              outlined
              dense
            />
          </VCol>
        </VRow>
      </VCardText>
      <Handle id="edge_out" type="source" :position="Position.Right" />
    </VCard>
  </div>
</template>
