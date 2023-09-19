<script setup lang="ts">
import { reactive, ref } from 'vue'
import { requiredValidator } from '@/@validators'
import api from '@/api'

// 识别结果
const ruleTestResult = ref('')

// 名称识别表单
const ruleTestForm = reactive({
  title: '',
  subtitle: '',
  ruletype: '1',
})

// 识别按钮状态
const ruleTestLoading = ref(false)

// 识别按钮文本
const ruleTestText = ref('测试')

// 是否显示结果
const showResult = ref(false)

// 调用API识别
async function ruleTest() {
  if (!ruleTestForm.title)
    return

  try {
    ruleTestLoading.value = true
    ruleTestText.value = '正在测试...'
    showResult.value = false
    const result: { [key: string]: any } = await api.get('system/ruletest', {
      params: {
        title: ruleTestForm.title,
        subtitle: ruleTestForm.subtitle,
        ruletype: ruleTestForm.ruletype,
      },
    })
    if (result.success)
      ruleTestResult.value = `优先级：${result.data.priority}`

    else
      ruleTestResult.value = '未命中任何优先级规则！'

    ruleTestLoading.value = false
    ruleTestText.value = '重新测试'
    showResult.value = true
  }
  catch (error) {
    console.error(error)
  }
}
</script>

<template>
  <VForm @submit.prevent="() => {}">
    <VRow class="pt-2">
      <VCol cols="12" md="8">
        <VTextField
          v-model="ruleTestForm.title"
          label="标题"
          :rules="[requiredValidator]"
        />
      </VCol>
      <VCol cols="12" md="4">
        <VSelect
          v-model="ruleTestForm.ruletype"
          label="规则类型"
          :items="[{
            title: '订阅优先级',
            value: '1',
          }, {
            title: '洗版优先级',
            value: '2',
          }, {
            title: '搜索优先级',
            value: '3',
          }]"
        />
      </VCol>
      <VCol cols="12">
        <VTextarea
          v-model="ruleTestForm.subtitle"
          label="副标题"
          rows="2"
          auto-grow
        />
      </VCol>
    </VRow>
    <VRow>
      <VCol
        cols="12"
        class="text-center"
      >
        <VBtn
          :disabled="ruleTestLoading"
          @click="ruleTest"
        >
          <template #prepend>
            <VIcon icon="mdi-filter-check-outline" />
          </template>
          {{ ruleTestText }}
        </VBtn>
      </VCol>
    </VRow>
  </VForm>
  <VExpandTransition>
    <div v-show="showResult">
      <VCol>
        <VAlert
          icon="mdi-alert-circle-outline"
        >
          {{ ruleTestResult }}
        </VAlert>
      </VCol>
    </div>
  </VExpandTransition>
</template>
