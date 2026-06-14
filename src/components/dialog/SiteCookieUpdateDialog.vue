<script setup lang="ts">
import api from '@/api'
import { Site } from '@/api/types'
import { requiredValidator } from '@/@validators'
import { useToast } from 'vue-toastification'
import ProgressDialog from '../dialog/ProgressDialog.vue'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()

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
const progressText = ref(t('dialog.siteCookieUpdate.processing'))

// 调用API，更新站点Cookie UA
async function updateSiteCookie() {
  try {
    if (!userPwForm.value.username || !userPwForm.value.password) return

    // 更新按钮状态
    updateButtonDisable.value = true

    progressDialog.value = true
    progressText.value = t('dialog.siteCookieUpdate.updating', { site: cardProps.site?.name })

    const result: { [key: string]: any } = await api.post(`site/cookie/${cardProps.site?.id}`, {
      username: userPwForm.value.username,
      password: userPwForm.value.password,
      code: userPwForm.value.code,
    })

    if (result.success) {
      $toast.success(t('dialog.siteCookieUpdate.success', { site: cardProps.site?.name }))
      emit('done')
    } else {
      $toast.error(
        t('dialog.siteCookieUpdate.failed', {
          site: cardProps.site?.name,
          message: result.message || t('dialog.siteCookieUpdate.requestFailed'),
        }),
      )
    }
  } catch (error: any) {
    console.error(error)
    const detail = error?.response?.data?.detail
    const message =
      error?.response?.data?.message ||
      (typeof detail === 'string' ? detail : error?.message) ||
      t('dialog.siteCookieUpdate.requestFailed')
    $toast.error(t('dialog.siteCookieUpdate.failed', { site: cardProps.site?.name, message }))
  } finally {
    progressDialog.value = false
    updateButtonDisable.value = false
  }
}
</script>
<template>
  <VDialog max-width="30rem" scrollable>
    <!-- Dialog Content -->
    <VCard :title="t('dialog.siteCookieUpdate.title')">
      <VDialogCloseBtn @click="emit('close')" />
      <VDivider />
      <VCardText>
        <VForm @submit.prevent="() => {}">
          <VRow>
            <VCol cols="12">
              <VTextField v-model="userPwForm.username" :label="t('login.username')" :rules="[requiredValidator]" />
            </VCol>
            <VCol cols="12">
              <VTextField
                v-model="userPwForm.password"
                :label="t('login.password')"
                :type="isPasswordVisible ? 'text' : 'password'"
                :append-inner-icon="isPasswordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
                :rules="[requiredValidator]"
                @click:append-inner="isPasswordVisible = !isPasswordVisible"
                @keydown.enter="updateSiteCookie"
              />
            </VCol>
            <VCol cols="12">
              <VTextField v-model="userPwForm.code" :label="t('login.otpCode')" />
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
      <VCardActions class="app-dialog-actions">
        <VSpacer />
        <VBtn
          color="primary"
          variant="flat"
          @click="updateSiteCookie"
          :disabled="updateButtonDisable"
          :loading="updateButtonDisable"
          prepend-icon="mdi-refresh"
          class="px-5"
        >
          {{ t('dialog.siteCookieUpdate.updateButton') }}
        </VBtn>
      </VCardActions>
    </VCard>
    <!-- 进度框 -->
    <ProgressDialog v-if="progressDialog" v-model="progressDialog" :text="progressText" />
  </VDialog>
</template>
