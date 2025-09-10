<script lang="ts" setup>
import { onMounted } from 'vue'
import SetupWizard from '@/views/setup/SetupWizard.vue'
import { useSetupWizard } from '@/composables/useSetupWizard'

const { initialize } = useSetupWizard()

// 初始化
onMounted(async () => {
  await initialize()
})
</script>

<template>
  <SetupWizard />
</template>