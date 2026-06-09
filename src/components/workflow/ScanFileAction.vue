<script setup lang="ts">
import api from '@/api'
import { StorageConf } from '@/api/types'
import { Handle, Position } from '@vue-flow/core'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps({
  id: {
    type: String,
    required: true,
  },
  data: {
    type: Object,
    required: true,
  },
})

// 所有存储
const storages = ref<StorageConf[]>([])

// 查询存储
async function loadStorages() {
  const result: { [key: string]: any } = await api.get('system/setting/public/Storages')
  storages.value = result.data?.value ?? []
}

// 存储字典
const storageOptions = computed(() => {
  return storages.value.map(item => ({
    title: item.name,
    value: item.type,
  }))
})

onMounted(() => {
  loadStorages()
})
</script>
<template>
  <div>
    <VCard max-width="20rem">
      <Handle id="edge_in" type="target" :position="Position.Left" />
      <VCardItem>
        <template v-slot:prepend>
          <VAvatar>
            <VIcon icon="mdi-folder-search" size="x-large"></VIcon>
          </VAvatar>
        </template>
        <VCardTitle>{{ t('workflow.scanFile.title') }}</VCardTitle>
        <VCardSubtitle>{{ t('workflow.scanFile.subtitle') }}</VCardSubtitle>
      </VCardItem>
      <VDivider />
      <VCardText>
        <VRow>
          <VCol cols="12">
            <VSelect
              v-model="data.storage"
              :label="t('workflow.scanFile.storage')"
              :items="storageOptions"
              outlined
              dense
            />
          </VCol>
          <VCol cols="12">
            <VPathField
              v-model="data.directory"
              :storage="data.storage"
              :label="t('workflow.scanFile.directory')"
              clearable
            />
          </VCol>
        </VRow>
      </VCardText>
      <Handle id="edge_out" type="source" :position="Position.Right" />
    </VCard>
  </div>
</template>
