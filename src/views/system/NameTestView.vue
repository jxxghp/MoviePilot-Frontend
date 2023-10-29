<script setup lang="ts">
import { reactive, ref } from 'vue'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import type { Context } from '@/api/types'
import MediaInfoCard from '@/components/cards/MediaInfoCard.vue'

// 识别结果
const nameTestResult = ref<Context>()

// 名称识别表单
const nameTestForm = reactive({
  title: '',
  subtitle: '',
})

// 识别按钮状态
const nameTestLoading = ref(false)

// 识别按钮文本
const nameTestText = ref('识别')

// 是否显示结果
const showResult = ref(false)

// 调用API识别
async function nameTest() {
  if (!nameTestForm.title)
    return

  try {
    nameTestLoading.value = true
    nameTestText.value = '识别中...'
    showResult.value = false
    nameTestResult.value = await api.get('media/recognize', {
      params: {
        title: nameTestForm.title,
        subtitle: nameTestForm.subtitle,
      },
    })
    nameTestLoading.value = false
    nameTestText.value = '重新识别'
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
      <VCol cols="12">
        <VTextField
          v-model="nameTestForm.title"
          label="标题"
          :rules="[requiredValidator]"
        />
      </VCol>
      <VCol cols="12">
        <VTextarea
          v-model="nameTestForm.subtitle"
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
          :disabled="nameTestLoading"
          @click="nameTest"
        >
          <template #prepend>
            <VIcon icon="mdi-text-recognition" />
          </template>
          {{ nameTestText }}
        </VBtn>
      </VCol>
    </VRow>
  </VForm>
  <VExpandTransition>
    <div v-show="showResult">
      <MediaInfoCard :context="nameTestResult" />
    </div>
  </VExpandTransition>
  <VExpansionPanels
    v-show="showResult && nameTestResult.meta_info.title !== nameTestResult.meta_info.org_string"
  >
    <VExpansionPanel>
      <VExpansionPanelTitle>
        <div class="text-h6">
          识别词应用详情
        </div>
      </VExpansionPanelTitle>
      <VExpansionPanelText>
        <VChip
          variant="elevated"
          class="me-1 mb-1 text-white bg-orange-500"
        >
          {{ nameTestResult.meta_info.org_string }}
        </VChip>
        <VChip
          v-for="(val, key) in nameTestResult.meta_info.apply_words" :key="key" :val="val"
          variant="elevated"
          class="me-1 mb-1 text-white bg-cyan-500"
        >
          {{ val }}
        </VChip>
      </VExpansionPanelText>
    </VExpansionPanel>
  </VExpansionPanels>
</template>
