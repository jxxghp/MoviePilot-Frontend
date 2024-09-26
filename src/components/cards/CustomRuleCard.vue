<script lang="ts" setup>
import { CustomRule } from '@/api/types'
import { useToast } from 'vue-toast-notification'
import filter_svg from '@images/svg/filter.svg'

// 输入参数
const props = defineProps({
  // 单条规则
  rule: {
    type: Object as PropType<CustomRule>,
    required: true,
  },
  // 所有规则
  rules: {
    type: Array as PropType<CustomRule[]>,
    required: true,
  },
})

// 提示框
const $toast = useToast()

// 定义触发的自定义事件
const emit = defineEmits(['close', 'change', 'done'])

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

// 规则ID
const ruleId = ref('')

// 规则名称
const ruleName = ref('')

// 打开详情弹窗
function openRuleInfoDialog() {
  ruleInfo.value = props.rule
  ruleId.value = props.rule.id
  ruleName.value = props.rule.name
  ruleInfoDialog.value = true
}

// 保存详情数据
function saveRuleInfo() {
  // 有空值
  if (!ruleId.value && !ruleName.value) {
    if (!ruleId.value && ruleName.value) {
      $toast.error('规则ID不能为空')
    }
    if (ruleId.value && !ruleName.value) {
      $toast.error('规则名称不能为空')
    }
    if (!ruleId.value && !ruleName.value) {
      $toast.error('规则ID和规则名称不能为空')
    }
    return
  }
  // ID已存在
  if (ruleId.value !== props.rule.id && props.rules.find(rule => rule.id === ruleId.value)) {
    $toast.error(`规则ID【${ruleId.value}】已存在，请替换`)
    return
  }
  // 规则名称已存在
  if (ruleName.value !== props.rule.name && props.rules.find(rule => rule.name === ruleName.value)) {
    $toast.error(`规则名称【${ruleName.value}】已存在，请替换`)
    return
  }
  // 保存数据
  ruleInfoDialog.value = false
  ruleInfo.value.id = ruleId.value
  ruleInfo.value.name = ruleName.value
  emit('change', ruleInfo.value)
  emit('done')
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
        <VImg :src="filter_svg" cover class="mt-7" max-width="3rem" />
      </VCardText>
    </VCard>
    <VDialog v-model="ruleInfoDialog" scrollable max-width="40rem" persistent >
      <VCard :title="`${props.rule.id} - 配置`" class="rounded-t">
        <DialogCloseBtn v-model="ruleInfoDialog" />
        <VDivider />
        <VCardText>
          <VForm>
            <VRow>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="ruleId"
                  label="规则ID"
                  placeholder="必填；不可与其他规则ID重名"
                  hint="字符与数字组合，不能含空格"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12" md="6">
                <VTextField
                  v-model="ruleName"
                  label="规则名称"
                  placeholder="必填；不可与其他规则名称重名"
                  hint="使用别名便于区分规则"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12">
                <VTextField
                  v-model="ruleInfo.include"
                  placeholder="关键字/正则表达式"
                  label="包含"
                  hint="必须包含的关键字或正则表达式，多个值使用｜分隔"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="12">
                <VTextField
                  v-model="ruleInfo.exclude"
                  placeholder="关键字/正则表达式"
                  label="排除"
                  hint="不能包含的关键字或正则表达式，多个值使用｜分隔"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="6">
                <VTextField
                  v-model="ruleInfo.size_range"
                  placeholder="0/1-10"
                  label="资源体积（MB）"
                  hint="最小资源文件体积或文件体积范围"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="6">
                <VTextField
                  v-model="ruleInfo.seeders"
                  placeholder="0/1-10"
                  label="做种人数"
                  hint="最小做种人数或做种人数范围"
                  persistent-hint
                  active
                />
              </VCol>
              <VCol cols="6">
                <VTextField
                  v-model="ruleInfo.publish_time"
                  placeholder="0"
                  label="发布时间（分钟）"
                  hint="距离资源发布的最小时间间隔"
                  persistent-hint
                  active
                />
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
