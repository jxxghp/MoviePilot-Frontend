<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    title?: string
  }>(),
  {
    modelValue: true,
    title: '',
  },
)

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'delete', deleteSrc: boolean, deleteDest: boolean): void
  (event: 'update:modelValue', value: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: value => {
    emit('update:modelValue', value)
    if (!value) emit('close')
  },
})

// 选择删除范围并通知历史列表执行实际删除。
function selectDeleteMode(deleteSrc: boolean, deleteDest: boolean) {
  emit('delete', deleteSrc, deleteDest)
}
</script>

<template>
  <VBottomSheet v-if="visible" v-model="visible" inset>
    <VCard class="text-center">
      <VDialogCloseBtn v-model="visible" />
      <VCardTitle class="pe-10">
        {{ props.title }}
      </VCardTitle>
      <div class="d-flex flex-column flex-lg-row justify-center my-3">
        <VBtn color="primary" class="mb-2 mx-2" @click="selectDeleteMode(false, false)">
          {{ $t('transferHistory.deleteRecordOnly') }}
        </VBtn>
        <VBtn color="warning" class="mb-2 mx-2" @click="selectDeleteMode(true, false)">
          {{ $t('transferHistory.deleteSourceOnly') }}
        </VBtn>
        <VBtn color="info" class="mb-2 mx-2" @click="selectDeleteMode(false, true)">
          {{ $t('transferHistory.deleteDestOnly') }}
        </VBtn>
        <VBtn color="error" class="mb-2 mx-2" @click="selectDeleteMode(true, true)">
          {{ $t('transferHistory.deleteAll') }}
        </VBtn>
      </div>
    </VCard>
  </VBottomSheet>
</template>
