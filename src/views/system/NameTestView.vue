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
</template>
