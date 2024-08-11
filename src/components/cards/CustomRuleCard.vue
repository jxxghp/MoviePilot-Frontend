<script lang="ts" setup>
import { CustomRule } from '@/api/types'

// 输入参数
const props = defineProps({
  rule: {
    type: Object as PropType<CustomRule>,
    required: true,
  },
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'change'])

// 规则详情弹窗
const ruleInfoDialog = ref(false)

// 规则详情
const ruleInfo = ref<CustomRule>({
  id: '',
  name: '',
  include: '',
  exclude: '',
  size_range: '',
  seeders: '',
  publish_time: '',
})

// 规则名称
const ruleName = ref('')

// 打开详情弹窗
function openRuleInfoDialog() {
  ruleInfo.value = props.rule
  ruleName.value = props.rule.name
  ruleInfoDialog.value = true
}

// 保存详情数据
function saveRuleInfo() {
  ruleInfoDialog.value = false
  ruleInfo.value.name = ruleName.value
  emit('change', ruleInfo.value)
}

// 按钮点击
function onClose() {
  emit('close')
}
</script>

<template>
  <div>
    <VCard variant="tonal" @click="openRuleInfoDialog">
      <DialogCloseBtn @click="onClose" />
      <VCardText class="flex justify-space-between align-center gap-3">
        <div class="align-self-start">
          <h5 class="text-h6 mb-1">{{ props.rule.id }}</h5>
          <div class="text-body-1 mb-3">{{ props.rule.name }}</div>
        </div>
      </VCardText>
    </VCard>
    <VDialog v-model="ruleInfoDialog" scrollable max-width="40rem">
      <VCard :title="`${props.rule.id} - 配置`" class="rounded-t">
        <DialogCloseBtn v-model="ruleInfoDialog" />
        <VDivider />
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12">
                <VTextField v-model="ruleName" label="规则名称" />
              </VCol>
              <VCol cols="12">
                <VTextField v-model="ruleInfo.include" placeholder="关键字/正则表达式" label="包含" />
              </VCol>
              <VCol cols="12">
                <VTextField v-model="ruleInfo.exclude" placeholder="关键字/正则表达式" label="排除" />
              </VCol>
              <VCol cols="6">
                <VTextField v-model="ruleInfo.size_range" placeholder="0/1-10" label="大小范围（MB）" />
              </VCol>
              <VCol cols="6">
                <VTextField v-model="ruleInfo.seeders" placeholder="0/1-10" label="做种人数" />
              </VCol>
              <VCol cols="6">
                <VTextField v-model="ruleInfo.publish_time" placeholder="0" label="发布时间（分钟）" />
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
        <VCardActions class="pt-3">
          <VBtn @click="saveRuleInfo" variant="elevated" prepend-icon="mdi-content-save" class="px-5"> 确定 </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>
