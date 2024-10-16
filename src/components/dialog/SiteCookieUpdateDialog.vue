<script setup lang="ts">
import api from '@/api'
import { Site } from '@/api/types'
import { requiredValidator } from '@/@validators'
import { useToast } from 'vue-toast-notification'
import ProgressDialog from '../dialog/ProgressDialog.vue'

// 输入参数
const cardProps = defineProps({
  site: Object as PropType<Site>,
})

// 定义触发的自定义事件
const emit = defineEmits(['close', 'done'])

// 提示框
const $toast = useToast()

// 用户名密码表单
const userPwForm = ref({
  username: '',
  password: '',
  code: '',
})

// 密码输入
const isPasswordVisible = ref(false)

// 更新按钮可用性
const updateButtonDisable = ref(false)

// 进度条
const progressDialog = ref(false)

// 进度文本
const progressText = ref('请稍候 ...')

// 调用API，更新站点Cookie UA
async function updateSiteCookie() {
  try {
    if (!userPwForm.value.username || !userPwForm.value.password) return

    // 更新按钮状态
    updateButtonDisable.value = true

    progressDialog.value = true
    progressText.value = `正在更新 ${cardProps.site?.name} Cookie & UA ...`

    const result: { [key: string]: any } = await api.get(`site/cookie/${cardProps.site?.id}`, {
      params: {
        username: userPwForm.value.username,
        password: userPwForm.value.password,
        code: userPwForm.value.code,
      },
    })

    if (result.success) {
      $toast.success(`${cardProps.site?.name} 更新Cookie & UA 成功！`)
      emit('done')
    } else $toast.error(`${cardProps.site?.name} 更新失败：${result.message}`)

    progressDialog.value = false
    updateButtonDisable.value = false
  } catch (error) {
    console.error(error)
  }
}
</script>
<template>
  <VDialog max-width="50rem">
    <!-- Dialog Content -->
    <VCard title="更新站点Cookie & UA">
      <DialogCloseBtn @click="emit('close')" />
      <VCardText>
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12" md="4">
              <VTextField v-model="userPwForm.username" label="用户名" :rules="[requiredValidator]" />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField
                v-model="userPwForm.password"
                label="密码"
                :type="isPasswordVisible ? 'text' : 'password'"
                :append-inner-icon="isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                :rules="[requiredValidator]"
                @click:append-inner="isPasswordVisible = !isPasswordVisible"
                @keydown.enter="updateSiteCookie"
              />
            </VCol>
            <VCol cols="12" md="4">
              <VTextField v-model="userPwForm.code" label="两步验证" />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>

      <VCardActions>
        <VSpacer />
        <VBtn
          variant="elevated"
          @click="updateSiteCookie"
          :disabled="updateButtonDisable"
          prepend-icon="mdi-refresh"
          class="px-5"
        >
          开始更新
        </VBtn>
      </VCardActions>
    </VCard>
    <!-- 进度框 -->
    <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="progressText" />
  </VDialog>
</template>
