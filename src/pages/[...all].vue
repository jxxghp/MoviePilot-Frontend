<script setup lang="ts">
import NoDataFound from '@/components/states/NoDataFound.vue'
import { useI18n } from 'vue-i18n'

// 国际化
const { t } = useI18n()
</script>

<template>
  <div class="pt-10">
    <NoDataFound error-code="404" :error-title="t('notFound.title')" :error-description="t('notFound.description')">
      <template #button>
        <VBtn to="/" class="mt-10" prepend-icon="mdi-home">
          {{ t('notFound.backButton') }}
        </VBtn>
      </template>
    </NoDataFound>
  </div>
</template>
