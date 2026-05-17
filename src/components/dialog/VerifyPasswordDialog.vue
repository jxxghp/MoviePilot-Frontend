<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    text?: string
    title?: string
  }>(),
  {
    modelValue: true,
    text: '',
    title: '',
  },
)

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'confirm', password: string): void
  (event: 'update:modelValue', value: boolean): void
}>()

const password = ref('')
const passwordVisible = ref(false)

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 提交当前输入的密码给调用方继续业务验证。
function submitPassword() {
  emit('confirm', password.value)
}
</script>

<template>
  <VDialog v-if="visible" v-model="visible" max-width="30rem">
    <VCard>
      <VCardTitle class="text-h5 text-center mt-4">{{ props.title }}</VCardTitle>
      <VCardText>
        <p class="mb-4">{{ props.text }}</p>
        <VForm @submit.prevent="submitPassword">
          <VTextField
            v-model="password"
            :type="passwordVisible ? 'text' : 'password'"
            :label="t('user.password')"
            :append-inner-icon="passwordVisible ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
            variant="outlined"
            prepend-inner-icon="mdi-lock"
            autocomplete="current-password"
            @click:append-inner="passwordVisible = !passwordVisible"
          />
          <div class="d-flex justify-end gap-4 mt-4">
            <VBtn variant="outlined" color="secondary" @click="visible = false">
              {{ t('common.cancel') }}
            </VBtn>
            <VBtn type="submit" color="primary">
              {{ t('common.confirm') }}
            </VBtn>
          </div>
        </VForm>
      </VCardText>
    </VCard>
  </VDialog>
</template>
