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
const emit = defineEmits(['close'])

// 按钮点击
function onClose() {
  emit('close')
}
</script>

<template>
  <VCard variant="tonal">
    <DialogCloseBtn @click="onClose" />
    <VCardItem>
      <VTextField
        v-model="props.rule.id"
        variant="underlined"
        label="规则编码"
        class="me-20 text-high-emphasis font-weight-bold"
      />
      <span class="absolute top-3 right-12">
        <IconBtn>
          <VIcon class="cursor-move" icon="mdi-drag" />
        </IconBtn>
      </span>
    </VCardItem>
    <VCardText>
      <VForm>
        <VRow>
          <VCol cols="12">
            <VTextField v-model="props.rule.name" variant="underlined" label="规则名称" />
          </VCol>
          <VCol cols="12">
            <VTextField
              v-model="props.rule.include"
              variant="underlined"
              placeholder="关键字/正则表达式"
              label="包含"
            />
          </VCol>
          <VCol cols="12">
            <VTextField
              v-model="props.rule.exclude"
              variant="underlined"
              placeholder="关键字/正则表达式"
              label="排除"
            />
          </VCol>
          <VCol cols="6">
            <VTextField
              v-model="props.rule.size_range"
              variant="underlined"
              placeholder="0/1-10"
              label="大小范围（MB）"
            />
          </VCol>
          <VCol cols="6">
            <VTextField v-model="props.rule.size_range" variant="underlined" placeholder="0/1-10" label="做种人数" />
          </VCol>
          <VCol cols="6">
            <VTextField
              v-model="props.rule.publish_time"
              variant="underlined"
              placeholder="0"
              label="发布时间（分钟）"
            />
          </VCol>
        </VRow>
      </VForm>
    </VCardText>
  </VCard>
</template>
