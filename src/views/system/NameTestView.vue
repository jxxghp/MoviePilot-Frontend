<script setup lang="ts">
import { reactive, ref } from 'vue'
import { requiredValidator } from '@/@validators'
import api from '@/api'
import type { Context } from '@/api/types'

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
      <VCol>
        <div
          v-if="nameTestResult?.meta_info?.name"
          class="d-flex justify-space-between flex-wrap flex-md-nowrap flex-column flex-md-row"
        >
          <div
            v-if="nameTestResult?.media_info?.poster_path"
            class="ma-auto"
          >
            <VImg
              width="10rem"
              aspect-ratio="2/3"
              class="object-cover aspect-w-2 aspect-h-3 rounded ring-1 ring-gray-500 shadow"
              :src="nameTestResult?.media_info?.poster_path"
              cover
            />
          </div>

          <div>
            <VCardItem class="pb-1">
              <VCardTitle>
                {{ nameTestResult?.media_info?.title || nameTestResult?.meta_info?.name }}
                {{ nameTestResult?.meta_info?.season_episode }}
              </VCardTitle>
              <VCardSubtitle>
                {{ nameTestResult?.media_info?.year || nameTestResult?.meta_info?.year }}
              </VCardSubtitle>
            </VCardItem>

            <VCardText
              v-if="nameTestResult?.media_info?.overview"
              class="line-clamp-4 overflow-hidden text-ellipsis ..."
            >
              {{ nameTestResult?.media_info?.overview }}
            </VCardText>

            <VCardItem>
              <!-- 类型 -->
              <VChip
                v-if="nameTestResult?.media_info?.type || nameTestResult?.meta_info?.type"
                variant="elevated"
                class="me-1 mb-1 text-white bg-blue-500"
              >
                {{
                  nameTestResult?.media_info?.type || nameTestResult?.meta_info?.type
                }}
              </VChip>
              <!-- 二级分类 -->
              <VChip
                v-if="nameTestResult?.media_info?.category"
                variant="elevated"
                class="me-1 mb-1 text-white bg-blue-500"
              >
                {{ nameTestResult?.media_info?.category }}
              </VChip>
              <!-- TMDBID -->
              <VChip
                v-if="nameTestResult?.media_info?.tmdb_id"
                variant="elevated"
                color="success"
                class="me-1 mb-1"
              >
                {{ nameTestResult?.media_info?.tmdb_id }}
              </VChip>
              <!-- meta_info -->
              <VChip
                v-if="nameTestResult?.meta_info?.edition"
                variant="elevated"
                class="me-1 mb-1 text-white bg-red-500"
              >
                {{ nameTestResult?.meta_info?.edition }}
              </VChip>
              <VChip
                v-if="nameTestResult?.meta_info?.resource_pix"
                variant="elevated"
                class="me-1 mb-1 text-white bg-red-500"
              >
                {{ nameTestResult?.meta_info?.resource_pix }}
              </VChip>
              <VChip
                v-if="nameTestResult?.meta_info?.video_encode"
                variant="elevated"
                class="me-1 mb-1 text-white bg-orange-500"
              >
                {{ nameTestResult?.meta_info?.video_encode }}
              </VChip>
              <VChip
                v-if="nameTestResult?.meta_info?.audio_encode"
                variant="elevated"
                class="me-1 mb-1 text-white bg-orange-500"
              >
                {{ nameTestResult?.meta_info?.audio_encode }}
              </VChip>
              <VChip
                v-if="nameTestResult?.meta_info?.resource_team"
                variant="elevated"
                class="me-1 mb-1 text-white bg-cyan-500"
              >
                {{ nameTestResult?.meta_info?.resource_team }}
              </VChip>
            </VCardItem>
          </div>
        </div>
        <VAlert
          v-if="!nameTestResult?.meta_info?.name"
          icon="mdi-alert-circle-outline"
        >
          识别失败，无法识别到有效信息！
        </VAlert>
      </VCol>
    </div>
  </VExpandTransition>
</template>
